"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productService = void 0;
// src/modules/products/product.service.ts
const http_status_1 = __importDefault(require("http-status"));
// Import Prisma namespace for Input types etc.
const client_1 = require("@prisma/client");
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
// import pick from '@/utils/pick';
// Cache configuration
const CACHE_KEY_PREFIX = `tenant:${config_1.env.NODE_ENV}:product:`; // Include tenant/env in prefix
const CACHE_TTL_SECONDS = 3 * 60; // 3 minutes cache for individual products
const CACHE_LIST_PREFIX = `tenant:${config_1.env.NODE_ENV}:products_list:`;
const CACHE_LIST_TTL_SECONDS = 1 * 60; // Shorter cache for lists
// --- Helper Functions (Cache Keys, Invalidation) ---
const generateProductCacheKey = (tenantId, productId) => `${CACHE_KEY_PREFIX}${tenantId}:${productId}`;
const generateProductListCacheKey = (tenantId, queryParams) => {
    const sortedKeys = Object.keys(queryParams).sort();
    // Stringify values to handle objects/arrays in keys consistently
    const queryString = sortedKeys.map(key => `${key}=${JSON.stringify(queryParams[key])}`).join('&');
    const keySuffix = queryString || 'all'; // Use 'all' if no params
    // Consider hashing the keySuffix if it might become very long
    return `${CACHE_LIST_PREFIX}${tenantId}:${keySuffix}`;
};
const invalidateProductCache = async (tenantId, productId, sku) => {
    const singleKey = generateProductCacheKey(tenantId, productId);
    logger_1.default.debug(`Invalidating product cache key: ${singleKey}`, { tenantId, productId });
    try {
        const listPattern = `${CACHE_LIST_PREFIX}${tenantId}:*`;
        const keys = await config_1.redisClient.keys(listPattern);
        const pipeline = config_1.redisClient.pipeline();
        pipeline.del(singleKey); // Queue single item cache deletion
        if (keys.length > 0) {
            logger_1.default.debug(`Invalidating ${keys.length} list caches matching pattern ${listPattern}`, { tenantId });
            pipeline.del(keys); // Queue list cache deletions
        }
        const results = await pipeline.exec();
        // Optional: Check results for errors
        results?.forEach(([err, _], index) => {
            if (err)
                logger_1.default.error(`Error during pipelined cache invalidation (Command ${index})`, { error: err });
        });
    }
    catch (cacheError) {
        logger_1.default.error(`Error during cache invalidation process for product ${productId}`, { tenantId, error: cacheError });
    }
};
// --- Service Methods ---
/**
 * Create a new product.
 */
const createProduct = async (productData, tenantId) => {
    const logContext = { function: 'createProduct', sku: productData.sku, tenantId };
    // 1. Check for existing SKU within the tenant
    const existingProduct = await config_1.prisma.product.findUnique({
        where: { tenantId_sku: { tenantId, sku: productData.sku } }, // Uses the composite unique key
        select: { id: true },
    });
    if (existingProduct) {
        logger_1.default.warn(`Product creation failed: SKU already exists`, logContext);
        throw new ApiError_1.default(http_status_1.default.CONFLICT, `Product with SKU '${productData.sku}' already exists.`);
    }
    // 2. Prepare data, parse JSON, handle dimensions
    let parsedCustomAttributes = undefined;
    if (productData.customAttributes) {
        try {
            parsedCustomAttributes = JSON.parse(productData.customAttributes);
        }
        catch (e) {
            logContext.error = e;
            logger_1.default.warn(`Product creation failed: Invalid JSON for customAttributes`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid JSON format for customAttributes.');
        }
    }
    if (productData.dimensions && (productData.dimensions.length || productData.dimensions.width || productData.dimensions.height) && !productData.dimensions.unit) {
        logger_1.default.warn(`Product creation failed: Dimension unit missing`, logContext);
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Dimension unit is required if length, width, or height is provided.');
    }
    const dimensionsJson = productData.dimensions
        ? productData.dimensions // Cast DTO (assuming structure matches)
        : undefined;
    // 3. Create in database
    try {
        const data = {
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
            customAttributes: parsedCustomAttributes ?? client_1.Prisma.JsonNull, // Use JsonNull if undefined after parsing attempt
            tenant: { connect: { id: tenantId } }
        };
        const newProduct = await config_1.prisma.product.create({ data });
        logContext.productId = newProduct.id;
        logger_1.default.info(`Product created successfully`, logContext);
        // Invalidate potentially affected list caches
        await invalidateProductCache(tenantId, newProduct.id, newProduct.sku);
        return newProduct; // Product model is already safe
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error creating product in database`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Product with SKU '${productData.sku}' already exists.`);
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to create product.');
    }
};
/**
 * Query for products with pagination, filtering, sorting, and caching.
 */
const queryProducts = async (filter, orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    const tenantId = filter.tenantId; // Assume tenantId is always present from controller
    const queryParams = { filter, orderBy, limit, page }; // Use full objects for key generation
    const cacheKey = generateProductListCacheKey(tenantId, queryParams);
    const logContext = { function: 'queryProducts', cacheKey, tenantId, limit, page };
    // 1. Try cache first
    try {
        const cachedData = await config_1.redisClient.get(cacheKey);
        if (cachedData) {
            logger_1.default.debug(`Cache HIT for product list`, logContext);
            const parsedData = JSON.parse(cachedData);
            if (parsedData && typeof parsedData.totalResults === 'number' && Array.isArray(parsedData.products)) {
                return parsedData;
            }
            else {
                logger_1.default.warn(`Invalid data structure found in product list cache key ${cacheKey}`, logContext);
            }
        }
        else {
            logger_1.default.debug(`Cache MISS for product list`, logContext);
        }
    }
    catch (cacheError) {
        logContext.error = cacheError;
        logger_1.default.error(`Redis GET error for product list cache`, logContext);
    }
    // 2. Fetch from database if cache miss or error
    try {
        const [products, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.product.findMany({ where: filter, orderBy, skip, take: limit }),
            config_1.prisma.product.count({ where: filter }),
        ]);
        const result = { products: products, totalResults };
        // 3. Store result in cache
        try {
            await config_1.redisClient.set(cacheKey, JSON.stringify(result), 'EX', CACHE_LIST_TTL_SECONDS);
            logger_1.default.debug(`Stored product list result in cache`, logContext);
        }
        catch (cacheError) {
            logContext.error = cacheError;
            logger_1.default.error(`Redis SET error for product list cache`, logContext);
        }
        logger_1.default.debug(`Product query successful from DB`, { ...logContext, count: products.length, total: totalResults });
        return result;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying products from DB`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve products.');
    }
};
/**
 * Get a single product by ID, ensuring tenant isolation, with caching.
 */
const getProductById = async (productId, tenantId) => {
    const cacheKey = generateProductCacheKey(tenantId, productId);
    const logContext = { function: 'getProductById', productId, tenantId, cacheKey };
    // 1. Try cache
    try {
        const cachedProduct = await config_1.redisClient.get(cacheKey);
        if (cachedProduct) {
            logger_1.default.debug(`Cache HIT for product`, logContext);
            return JSON.parse(cachedProduct);
        }
        logger_1.default.debug(`Cache MISS for product`, logContext);
    }
    catch (cacheError) {
        logContext.error = cacheError;
        logger_1.default.error(`Redis GET error for product cache`, logContext);
    }
    // 2. Fetch from DB using unique ID
    try {
        const product = await config_1.prisma.product.findUnique({
            where: { id: productId }, // Find by primary key
        });
        // 3. Verify Tenant ID *after* fetching
        if (!product || product.tenantId !== tenantId) {
            logger_1.default.warn(`Product not found or tenant mismatch`, logContext);
            return null; // Return null if ID found but tenant doesn't match
        }
        // 4. Store in cache if found and correct tenant
        try {
            await config_1.redisClient.set(cacheKey, JSON.stringify(product), 'EX', CACHE_TTL_SECONDS);
            logger_1.default.debug(`Stored product in cache`, logContext);
        }
        catch (cacheError) {
            logContext.error = cacheError;
            logger_1.default.error(`Redis SET error for product cache`, logContext);
        }
        logger_1.default.debug(`Product found successfully in DB`, logContext);
        return product;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching product by ID from DB`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve product.');
    }
};
/**
 * Update product details by ID.
 */
const updateProductById = async (productId, updateData, tenantId) => {
    const logContext = { function: 'updateProductById', productId, tenantId, updateData: { ...updateData } };
    // 1. Verify product exists within the tenant first using findFirst
    const existingProductCheck = await config_1.prisma.product.findFirst({
        where: { id: productId, tenantId: tenantId },
        select: { id: true } // Just check existence
    });
    if (!existingProductCheck) {
        logger_1.default.warn(`Update failed: Product not found or tenant mismatch`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Product not found.');
    }
    // 2. Prepare data for Prisma update
    const dataToUpdate = {};
    Object.keys(updateData).forEach((key) => {
        const typedKey = key;
        if (typedKey !== 'dimensions' && typedKey !== 'customAttributes' && updateData[typedKey] !== undefined) {
            dataToUpdate[typedKey] = updateData[typedKey];
        }
    });
    if (updateData.dimensions !== undefined) {
        if ((updateData.dimensions.length || updateData.dimensions.width || updateData.dimensions.height) && !updateData.dimensions.unit) {
            logger_1.default.warn(`Product update failed: Dimension unit missing`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Dimension unit is required if length, width, or height is provided.');
        }
        dataToUpdate.dimensions = updateData.dimensions ?? client_1.Prisma.JsonNull;
    }
    if (updateData.customAttributes !== undefined) {
        if (updateData.customAttributes === null) {
            dataToUpdate.customAttributes = client_1.Prisma.JsonNull;
        }
        else {
            try {
                // Ensure updateData.customAttributes is treated as string before parsing
                if (typeof updateData.customAttributes === 'string') {
                    dataToUpdate.customAttributes = JSON.parse(updateData.customAttributes);
                }
                else {
                    // Handle case where it might already be an object (e.g., internal call)
                    // This depends on how your DTO/validation handles it
                    logger_1.default.warn(`Custom attributes received as non-string for update`, logContext);
                    // If needed, stringify then parse, or handle object directly if Prisma allows
                    dataToUpdate.customAttributes = updateData.customAttributes;
                }
            }
            catch (e) {
                logContext.error = e;
                logger_1.default.warn(`Product update failed: Invalid JSON for customAttributes`, logContext);
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid JSON format for customAttributes.');
            }
        }
    }
    if (Object.keys(dataToUpdate).length === 0) {
        logger_1.default.info(`Product update skipped: No valid data provided`, logContext);
        const currentProduct = await getProductById(productId, tenantId); // Re-fetch current data
        if (!currentProduct)
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Product not found.');
        return currentProduct;
    }
    // 3. Perform the update using the unique ID
    try {
        const updatedProduct = await config_1.prisma.product.update({
            where: { id: productId }, // Update by primary key ID
            data: dataToUpdate,
        });
        logger_1.default.info(`Product updated successfully`, logContext);
        // 4. Invalidate cache
        await invalidateProductCache(tenantId, productId, updatedProduct.sku);
        return updatedProduct;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error updating product`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            // Error P2025: Record to update not found.
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Product not found during update attempt.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to update product.');
    }
};
/**
 * Delete a product by ID, ensuring tenant isolation and checking dependencies.
 */
const deleteProductById = async (productId, tenantId) => {
    const logContext = { function: 'deleteProductById', productId, tenantId };
    // 1. Check if product exists within tenant & get SKU using findFirst
    const product = await config_1.prisma.product.findFirst({
        where: { id: productId, tenantId: tenantId },
        select: { id: true, sku: true }
    });
    if (!product) {
        logger_1.default.warn(`Delete failed: Product not found or tenant mismatch`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Product not found.');
    }
    // 2. Check for dependencies (enhance these checks as needed)
    const hasInventory = await config_1.prisma.inventoryItem.findFirst({ where: { productId: productId, quantityOnHand: { not: 0 } }, select: { id: true } });
    const hasOrders = await config_1.prisma.orderItem.findFirst({ where: { productId: productId }, select: { id: true } });
    const hasPOs = await config_1.prisma.purchaseOrderItem.findFirst({ where: { productId: productId }, select: { id: true } });
    const isComponent = await config_1.prisma.productComponent.findFirst({ where: { childProductId: productId }, select: { id: true } });
    // Add checks for transfers, adjustments etc. if necessary
    if (hasInventory || hasOrders || hasPOs || isComponent) {
        const reasons = [
            hasInventory ? 'existing stock' : null,
            hasOrders ? 'linked orders' : null,
            hasPOs ? 'linked purchase orders' : null,
            isComponent ? 'used as component' : null,
        ].filter(Boolean).join(', ');
        logger_1.default.warn(`Delete failed: Product has dependencies (${reasons})`, logContext);
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot delete product with dependencies (${reasons}). Consider deactivating instead.`);
    }
    // 3. If clear, perform deletion using the unique ID
    try {
        await config_1.prisma.product.delete({
            where: { id: productId }, // Delete by primary key ID
            // Tenant check was performed above
        });
        logger_1.default.info(`Product deleted successfully`, logContext);
        // 4. Invalidate cache
        await invalidateProductCache(tenantId, productId, product.sku);
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error deleting product`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Product not found during delete attempt.');
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2003') { // Foreign Key violation
            logger_1.default.warn(`Delete failed: Foreign key constraint violation`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Cannot delete product because it is still referenced by other records.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to delete product.');
    }
};
// Export the service methods
exports.productService = {
    createProduct,
    queryProducts,
    getProductById,
    updateProductById,
    deleteProductById,
};
//# sourceMappingURL=product.service.js.map