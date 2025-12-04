// src/modules/products/product.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { productService } from './product.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
import { Prisma } from '@prisma/client';

const createProduct = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // req.body is validated CreateProductDto
    const product = await productService.createProduct(req.body, tenantId);
    res.status(httpStatus.CREATED).send(product);
});

const getProducts = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);

    // Define allowed filters from query parameters
    const filterParams = pick(req.query, [
        'sku', 'name', 'brand', 'productType', 'isActive', 'isStockTracked',
        'requiresSerialNumber', 'requiresLotTracking', 'requiresExpiryDate', 'taxable'
        // Add more filterable fields as needed, e.g., categoryId (would require joining/filtering)
    ]);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput object, always including tenantId
    const filter: Prisma.ProductWhereInput = { tenantId };

    if (filterParams.sku) filter.sku = { contains: filterParams.sku as string, mode: 'insensitive' };
    if (filterParams.name) filter.name = { contains: filterParams.name as string, mode: 'insensitive' };
    if (filterParams.brand) filter.brand = { contains: filterParams.brand as string, mode: 'insensitive' };
    if (filterParams.productType) filter.productType = { equals: filterParams.productType as any }; // Cast to any if using Prisma enum type directly
    // Boolean filters
    if (filterParams.isActive !== undefined) filter.isActive = filterParams.isActive === 'true';
    if (filterParams.isStockTracked !== undefined) filter.isStockTracked = filterParams.isStockTracked === 'true';
    if (filterParams.requiresSerialNumber !== undefined) filter.requiresSerialNumber = filterParams.requiresSerialNumber === 'true';
    if (filterParams.requiresLotTracking !== undefined) filter.requiresLotTracking = filterParams.requiresLotTracking === 'true';
    if (filterParams.requiresExpiryDate !== undefined) filter.requiresExpiryDate = filterParams.requiresExpiryDate === 'true';
    if (filterParams.taxable !== undefined) filter.taxable = filterParams.taxable === 'true';
    // Add range filters for price/cost if needed (e.g., price_gte, price_lte)

    // Build Prisma OrderBy array
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add more valid sort keys
                if (['sku', 'name', 'brand', 'productType', 'basePrice', 'costPrice', 'createdAt', 'updatedAt', 'isActive'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ name: 'asc' }); // Default sort by name
    }

    // Parse pagination options
    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    // Call the service with constructed filters and options
    const allowedLocationIds = req.user?.allowedLocationIds || [];
    const result = await productService.queryProducts(filter, orderBy, limit, page, allowedLocationIds);

    // Format and send the paginated response
    res.status(httpStatus.OK).send({
        results: result.products,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.totalResults / limit),
        totalResults: result.totalResults,
    });
});

const getProduct = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const productId = req.params.productId;

    const product = await productService.getProductById(productId, tenantId);
    if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    }
    res.status(httpStatus.OK).send(product);
});

const updateProduct = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const productId = req.params.productId;
    // req.body is validated UpdateProductDto

    // Add permission checks here if needed (e.g., user can update products)
    // Middleware `checkPermissions(['product:update'])` handles the basic check

    const product = await productService.updateProductById(productId, req.body, tenantId);
    res.status(httpStatus.OK).send(product);
});

const deleteProduct = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const productId = req.params.productId;

    // Add permission checks here if needed
    // Middleware `checkPermissions(['product:delete'])` handles the basic check

    await productService.deleteProductById(productId, tenantId);
    // Send 204 No Content on successful deletion
    res.status(httpStatus.NO_CONTENT).send();
});


export const productController = {
    createProduct,
    getProducts,
    getProduct,
    updateProduct,
    deleteProduct,
};
