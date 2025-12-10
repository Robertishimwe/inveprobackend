// src/modules/products/product.service.ts
import httpStatus from 'http-status';
// Import Prisma namespace for Input types etc.
import { Prisma, Product } from '@prisma/client';
import { prisma, redisClient, env } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
// import pick from '@/utils/pick';

// Cache configuration
const CACHE_KEY_PREFIX = `tenant:${env.NODE_ENV}:product:`; // Include tenant/env in prefix
const CACHE_TTL_SECONDS = 3 * 60; // 3 minutes cache for individual products
const CACHE_LIST_PREFIX = `tenant:${env.NODE_ENV}:products_list:`;
const CACHE_LIST_TTL_SECONDS = 1 * 60; // Shorter cache for lists

// Helper type for safe product response
export type SafeProduct = Omit<Product, ''>; // Currently Product model has no sensitive fields

// Define log context type if not already defined globally
type LogContext = {
    function?: string;
    productId?: string | null;
    sku?: string | null;
    tenantId?: string | null | undefined;
    updateData?: any;
    filter?: any;
    orderBy?: any;
    limit?: number;
    page?: number;
    error?: any;
    [key: string]: any;
};

// --- Helper Functions (Cache Keys, Invalidation) ---
const generateProductCacheKey = (tenantId: string, productId: string): string =>
    `${CACHE_KEY_PREFIX}${tenantId}:${productId}`;

const generateProductListCacheKey = (tenantId: string, queryParams: Record<string, any>): string => {
    const sortedKeys = Object.keys(queryParams).sort();
    // Stringify values to handle objects/arrays in keys consistently
    const queryString = sortedKeys.map(key => `${key}=${JSON.stringify(queryParams[key])}`).join('&');
    const keySuffix = queryString || 'all'; // Use 'all' if no params
    // Consider hashing the keySuffix if it might become very long
    return `${CACHE_LIST_PREFIX}${tenantId}:${keySuffix}`;
};

const invalidateProductCache = async (tenantId: string, productId: string, sku?: string | null) => {
    const singleKey = generateProductCacheKey(tenantId, productId);
    logger.debug(`Invalidating product cache key: ${singleKey}`, { tenantId, productId });
    try {
        const listPattern = `${CACHE_LIST_PREFIX}${tenantId}:*`;
        const keys = await redisClient.keys(listPattern);

        const pipeline = redisClient.pipeline();
        pipeline.del(singleKey); // Queue single item cache deletion
        if (keys.length > 0) {
            logger.debug(`Invalidating ${keys.length} list caches matching pattern ${listPattern}`, { tenantId });
            pipeline.del(keys); // Queue list cache deletions
        }
        const results = await pipeline.exec();
        // Optional: Check results for errors
        results?.forEach(([err, _], index) => {
            if (err) logger.error(`Error during pipelined cache invalidation (Command ${index})`, { error: err });
        });

    } catch (cacheError) {
        logger.error(`Error during cache invalidation process for product ${productId}`, { tenantId, error: cacheError });
    }
};


// --- Service Methods ---

/**
 * Create a new product.
 */
const createProduct = async (productData: CreateProductDto, tenantId: string): Promise<SafeProduct> => {
    const logContext: LogContext = { function: 'createProduct', sku: productData.sku, tenantId };

    // 1. Check for existing SKU within the tenant
    const existingProduct = await prisma.product.findUnique({
        where: { tenantId_sku: { tenantId, sku: productData.sku } }, // Uses the composite unique key
        select: { id: true },
    });
    if (existingProduct) {
        logger.warn(`Product creation failed: SKU already exists`, logContext);
        throw new ApiError(httpStatus.CONFLICT, `Product with SKU '${productData.sku}' already exists.`);
    }

    // 2. Validate Category IDs if provided
    let categoryConnectOrCreate: Prisma.ProductCategoryCreateNestedManyWithoutProductInput | undefined = undefined;
    if (productData.categoryIds && productData.categoryIds.length > 0) {
        const validCategories = await prisma.category.findMany({
            where: { id: { in: productData.categoryIds }, tenantId: tenantId }, // Ensure categories belong to tenant
            select: { id: true }
        });
        if (validCategories.length !== productData.categoryIds.length) {
            const invalidIds = productData.categoryIds.filter(id => !validCategories.some(vc => vc.id === id));
            throw new ApiError(httpStatus.BAD_REQUEST, `Invalid or non-existent category IDs provided: ${invalidIds.join(', ')}`);
        }
        // Prepare connect operation for valid categories
        categoryConnectOrCreate = {
            create: productData.categoryIds.map(catId => ({
                // tenantId? // Not needed on join table itself usually
                category: { connect: { id: catId } }
            }))
        };
        logContext.categoriesAssigned = productData.categoryIds;
    }

    // 2. Prepare data, parse JSON, handle dimensions
    let parsedCustomAttributes: Prisma.InputJsonValue | undefined = undefined;
    if (productData.customAttributes) {
        try {
            parsedCustomAttributes = JSON.parse(productData.customAttributes);
        } catch (e) {
            logContext.error = e;
            logger.warn(`Product creation failed: Invalid JSON for customAttributes`, logContext);
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON format for customAttributes.');
        }
    }

    if (productData.dimensions && (productData.dimensions.length || productData.dimensions.width || productData.dimensions.height) && !productData.dimensions.unit) {
        logger.warn(`Product creation failed: Dimension unit missing`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, 'Dimension unit is required if length, width, or height is provided.');
    }
    const dimensionsJson: Prisma.JsonObject | undefined = productData.dimensions
        ? productData.dimensions as Prisma.JsonObject // Cast DTO (assuming structure matches)
        : undefined;

    // 3. Create in database
    try {
        const data: Prisma.ProductCreateInput = {
            sku: productData.sku,
            name: productData.name,
            description: productData.description,
            productType: productData.productType,
            unitOfMeasure: productData.unitOfMeasure,
            brand: productData.brand,
            isActive: productData.isActive,
            isStockTracked: productData.isStockTracked,
            requiresSerialNumber: productData.requiresSerialNumber,
            requiresLotTracking: productData.requiresLotTracking,
            requiresExpiryDate: productData.requiresExpiryDate,
            basePrice: productData.basePrice,
            costPrice: productData.costPrice,
            taxable: productData.taxable,
            weight: productData.weight,
            weightUnit: productData.weightUnit,

            dimensions: dimensionsJson,
            imageUrl: productData.imageUrl,
            categories: categoryConnectOrCreate,
            customAttributes: parsedCustomAttributes ?? Prisma.JsonNull, // Use JsonNull if undefined after parsing attempt
            tenant: { connect: { id: tenantId } }
        };

        const newProduct = await prisma.product.create({
            data,
            include: {
                categories: {
                    include: {
                        category: true
                    }
                }
            }
        });

        logContext.productId = newProduct.id;
        logger.info(`Product created successfully`, logContext);

        // Invalidate potentially affected list caches
        await invalidateProductCache(tenantId, newProduct.id, newProduct.sku);

        return newProduct; // Product model is already safe

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error creating product in database`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError(httpStatus.CONFLICT, `Product with SKU '${productData.sku}' already exists.`);
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create product.');
    }
};

/**
 * Query products with filtering and pagination.
 */
const queryProducts = async (
    filter: any,
    orderBy: any,
    limit: number,
    page: number,
    allowedLocationIds: string[] = []
): Promise<{ products: SafeProduct[]; totalResults: number }> => {
    const tenantId = filter.tenantId;
    const skip = (page - 1) * limit;
    const cacheKey = generateProductListCacheKey(tenantId, { ...filter, ...orderBy, limit, page, allowedLocationIds });
    const logContext: LogContext = { function: 'queryProducts', tenantId, filter, orderBy, limit, page, allowedLocationIds };

    // 1. Try cache
    try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            logger.debug(`Cache HIT for product list`, logContext);
            const parsedData = JSON.parse(cachedData);
            if (parsedData && typeof parsedData.totalResults === 'number' && Array.isArray(parsedData.products)) {
                return parsedData as { products: SafeProduct[]; totalResults: number };
            } else {
                logger.warn(`Invalid data structure found in product list cache key ${cacheKey}`, logContext);
            }
        } else {
            logger.debug(`Cache MISS for product list`, logContext);
        }
    } catch (cacheError) {
        logContext.error = cacheError;
        logger.error(`Redis GET error for product list cache`, logContext);
    }


    // 2. Fetch from database if cache miss or error
    try {
        const [products, totalResults] = await prisma.$transaction([
            prisma.product.findMany({
                where: filter,
                orderBy,
                skip,
                take: limit,
                include: {
                    categories: {
                        include: {
                            category: true
                        }
                    },
                    inventoryItems: {
                        where: allowedLocationIds.includes('*') ? undefined : { locationId: { in: allowedLocationIds } },
                        select: {
                            locationId: true,
                            quantityOnHand: true,
                            quantityAllocated: true,
                            quantityIncoming: true
                        }
                    }
                }
            }),
            prisma.product.count({ where: filter }),
        ]);
        const result = { products: products as SafeProduct[], totalResults };

        // 3. Store result in cache
        try {
            await redisClient.set(cacheKey, JSON.stringify(result), 'EX', CACHE_LIST_TTL_SECONDS);
            logger.debug(`Stored product list result in cache`, logContext);
        } catch (cacheError) {
            logContext.error = cacheError;
            logger.error(`Redis SET error for product list cache`, logContext);
        }
        logger.debug(`Product query successful from DB`, { ...logContext, count: products.length, total: totalResults });
        return result;

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying products from DB`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve products.');
    }
};


/**
 * Get a single product by ID, ensuring tenant isolation, with caching.
 */
const getProductById = async (productId: string, tenantId: string): Promise<SafeProduct | null> => {
    const cacheKey = generateProductCacheKey(tenantId, productId);
    const logContext: LogContext = { function: 'getProductById', productId, tenantId, cacheKey };

    // 1. Try cache
    try {
        const cachedProduct = await redisClient.get(cacheKey);
        if (cachedProduct) {
            logger.debug(`Cache HIT for product`, logContext);
            return JSON.parse(cachedProduct) as SafeProduct;
        }
        logger.debug(`Cache MISS for product`, logContext);
    } catch (cacheError) {
        logContext.error = cacheError;
        logger.error(`Redis GET error for product cache`, logContext);
    }

    // 2. Fetch from DB using unique ID
    try {
        const product = await prisma.product.findUnique({
            where: { id: productId }, // Find by primary key
            include: {
                categories: {
                    include: {
                        category: true
                    }
                }
            }
        });

        // 3. Verify Tenant ID *after* fetching
        if (!product || product.tenantId !== tenantId) {
            logger.warn(`Product not found or tenant mismatch`, logContext);
            return null; // Return null if ID found but tenant doesn't match
        }

        // 4. Store in cache if found and correct tenant
        try {
            await redisClient.set(cacheKey, JSON.stringify(product), 'EX', CACHE_TTL_SECONDS);
            logger.debug(`Stored product in cache`, logContext);
        } catch (cacheError) {
            logContext.error = cacheError;
            logger.error(`Redis SET error for product cache`, logContext);
        }
        logger.debug(`Product found successfully in DB`, logContext);
        return product;

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching product by ID from DB`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve product.');
    }
};


/**
 * Update product details by ID.
 */
const updateProductById = async (
    productId: string,
    updateData: UpdateProductDto,
    tenantId: string
): Promise<SafeProduct> => {
    const logContext: LogContext = { function: 'updateProductById', productId, tenantId, updateData: { ...updateData } };

    // 1. Verify product exists within the tenant first using findFirst
    const existingProductCheck = await prisma.product.findFirst({
        where: { id: productId, tenantId: tenantId },
        select: { id: true } // Just check existence
    });
    if (!existingProductCheck) {
        logger.warn(`Update failed: Product not found or tenant mismatch`, logContext);
        throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
    }

    const dataToUpdate: Prisma.ProductUpdateInput = {};
    Object.keys(updateData).forEach((key) => {
        const typedKey = key as keyof UpdateProductDto;
        // Exclude categoryIds and complex fields handled separately
        if (typedKey !== 'dimensions' && typedKey !== 'customAttributes' && typedKey !== 'categoryIds' && updateData[typedKey] !== undefined) {
            (dataToUpdate as any)[typedKey] = updateData[typedKey];
        }
    });

    if (updateData.dimensions !== undefined) {
        if ((updateData.dimensions.length || updateData.dimensions.width || updateData.dimensions.height) && !updateData.dimensions.unit) {
            logger.warn(`Product update failed: Dimension unit missing`, logContext);
            throw new ApiError(httpStatus.BAD_REQUEST, 'Dimension unit is required if length, width, or height is provided.');
        }
        dataToUpdate.dimensions = updateData.dimensions as Prisma.JsonObject ?? Prisma.JsonNull;
    }

    if (updateData.customAttributes !== undefined) {
        if (updateData.customAttributes === null) {
            dataToUpdate.customAttributes = Prisma.JsonNull;
        } else {
            try {
                // Ensure updateData.customAttributes is treated as string before parsing
                if (typeof updateData.customAttributes === 'string') {
                    dataToUpdate.customAttributes = JSON.parse(updateData.customAttributes);
                } else {
                    // Handle case where it might already be an object (e.g., internal call)
                    // This depends on how your DTO/validation handles it
                    logger.warn(`Custom attributes received as non-string for update`, logContext);
                    // If needed, stringify then parse, or handle object directly if Prisma allows
                    dataToUpdate.customAttributes = updateData.customAttributes as Prisma.InputJsonValue;
                }
            } catch (e) {
                logContext.error = e;
                logger.warn(`Product update failed: Invalid JSON for customAttributes`, logContext);
                throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON format for customAttributes.');
            }
        }
    }

    // Handle category updates using transaction with deleteMany + createMany
    // (Prisma's 'set' operation doesn't work well with composite primary keys on explicit join tables)
    let categoryUpdateRequired = false;
    let newCategoryIds: string[] = [];

    if (updateData.categoryIds !== undefined) { // Check if categoryIds array was provided
        categoryUpdateRequired = true;
        if (updateData.categoryIds === null || updateData.categoryIds.length === 0) {
            // Remove all category associations
            newCategoryIds = [];
            logContext.categoriesSet = [];
        } else {
            // Validate the provided category IDs belong to the tenant
            const validCategories = await prisma.category.findMany({
                where: { id: { in: updateData.categoryIds }, tenantId: tenantId },
                select: { id: true }
            });
            if (validCategories.length !== updateData.categoryIds.length) {
                const invalidIds = updateData.categoryIds.filter(id => !validCategories.some(vc => vc.id === id));
                throw new ApiError(httpStatus.BAD_REQUEST, `Invalid or non-existent category IDs provided: ${invalidIds.join(', ')}`);
            }
            newCategoryIds = updateData.categoryIds;
            logContext.categoriesSet = updateData.categoryIds;
        }
    }
    // ---------------------------------------------------------

    // Check if there's actually anything to update (product fields OR categories)
    if (Object.keys(dataToUpdate).length === 0 && !categoryUpdateRequired) {
        logger.info(`Product update skipped: No valid data provided`, logContext);
        const currentProduct = await getProductById(productId, tenantId);
        if (!currentProduct) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
        return currentProduct;
    }

    // 3. Perform the update using a transaction to handle product + categories
    try {
        const updatedProduct = await prisma.$transaction(async (tx) => {
            // Update product fields if there are any
            if (Object.keys(dataToUpdate).length > 0) {
                await tx.product.update({
                    where: { id: productId },
                    data: dataToUpdate,
                });
            }

            // Handle category updates with deleteMany + createMany
            if (categoryUpdateRequired) {
                // First, remove all existing category associations for this product
                await tx.productCategory.deleteMany({
                    where: { productId: productId }
                });

                // Then, create new associations if there are any categories to add
                if (newCategoryIds.length > 0) {
                    await tx.productCategory.createMany({
                        data: newCategoryIds.map(catId => ({
                            productId: productId,
                            categoryId: catId
                        }))
                    });
                }
            }

            // Fetch the updated product with categories included
            return await tx.product.findUnique({
                where: { id: productId },
                include: {
                    categories: { select: { category: { select: { id: true, name: true } } } }
                }
            });
        });

        if (!updatedProduct) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Product not found after update.');
        }

        logger.info(`Product updated successfully`, logContext);
        await invalidateProductCache(tenantId, productId, updatedProduct.sku);
        return updatedProduct as SafeProduct;

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating product`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            // Error P2025: Record to update not found.
            throw new ApiError(httpStatus.NOT_FOUND, 'Product not found during update attempt.');
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update product.');
    }
};

const deleteProductById = async (productId: string, tenantId: string): Promise<void> => {
    const logContext: LogContext = { function: 'deleteProductById', productId, tenantId };

    // 1. Verify product exists within the tenant
    const product = await prisma.product.findFirst({
        where: { id: productId, tenantId: tenantId },
        select: { id: true, sku: true }
    });

    if (!product) {
        logger.warn(`Delete failed: Product not found or tenant mismatch`, logContext);
        throw new ApiError(httpStatus.NOT_FOUND, 'Product not found.');
    }

    // 2. Check for dependencies (enhance these checks as needed)
    const hasInventory = await prisma.inventoryItem.findFirst({ where: { productId: productId, quantityOnHand: { not: 0 } }, select: { id: true } });
    const hasOrders = await prisma.orderItem.findFirst({ where: { productId: productId }, select: { id: true } });
    const hasPOs = await prisma.purchaseOrderItem.findFirst({ where: { productId: productId }, select: { id: true } });
    const isComponent = await prisma.productComponent.findFirst({ where: { childProductId: productId }, select: { id: true } });
    // Add checks for transfers, adjustments etc. if necessary

    if (hasInventory || hasOrders || hasPOs || isComponent) {
        const reasons = [
            hasInventory ? 'existing stock' : null,
            hasOrders ? 'linked orders' : null,
            hasPOs ? 'linked purchase orders' : null,
            isComponent ? 'used as component' : null,
        ].filter(Boolean).join(', ');
        logger.warn(`Delete failed: Product has dependencies (${reasons})`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot delete product with dependencies (${reasons}). Consider deactivating instead.`);
    }

    // 3. If clear, perform deletion using the unique ID
    try {
        await prisma.product.delete({
            where: { id: productId }, // Delete by primary key ID
            // Tenant check was performed above
        });

        logger.info(`Product deleted successfully`, logContext);

        // 4. Invalidate cache
        await invalidateProductCache(tenantId, productId, product.sku);

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error deleting product`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError(httpStatus.NOT_FOUND, 'Product not found during delete attempt.');
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { // Foreign Key violation
            logger.warn(`Delete failed: Foreign key constraint violation`, logContext);
            throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete product because it is still referenced by other records.');
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete product.');
    }
};


// Export the service methods
export const productService = {
    createProduct,
    queryProducts,
    getProductById,
    updateProductById,
    deleteProductById,
    invalidateProductCache, // Exported for POS/inventory to bust cache after stock changes
};
