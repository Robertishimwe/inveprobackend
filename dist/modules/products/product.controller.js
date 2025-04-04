"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const product_service_1 = require("./product.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick"));
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const createProduct = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // req.body is validated CreateProductDto
    const product = await product_service_1.productService.createProduct(req.body, tenantId);
    res.status(http_status_1.default.CREATED).send(product);
});
const getProducts = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Define allowed filters from query parameters
    const filterParams = (0, pick_1.default)(req.query, [
        'sku', 'name', 'brand', 'productType', 'isActive', 'isStockTracked',
        'requiresSerialNumber', 'requiresLotTracking', 'requiresExpiryDate', 'taxable'
        // Add more filterable fields as needed, e.g., categoryId (would require joining/filtering)
    ]);
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    // Build Prisma WhereInput object, always including tenantId
    const filter = { tenantId };
    if (filterParams.sku)
        filter.sku = { contains: filterParams.sku, mode: 'insensitive' };
    if (filterParams.name)
        filter.name = { contains: filterParams.name, mode: 'insensitive' };
    if (filterParams.brand)
        filter.brand = { contains: filterParams.brand, mode: 'insensitive' };
    if (filterParams.productType)
        filter.productType = { equals: filterParams.productType }; // Cast to any if using Prisma enum type directly
    // Boolean filters
    if (filterParams.isActive !== undefined)
        filter.isActive = filterParams.isActive === 'true';
    if (filterParams.isStockTracked !== undefined)
        filter.isStockTracked = filterParams.isStockTracked === 'true';
    if (filterParams.requiresSerialNumber !== undefined)
        filter.requiresSerialNumber = filterParams.requiresSerialNumber === 'true';
    if (filterParams.requiresLotTracking !== undefined)
        filter.requiresLotTracking = filterParams.requiresLotTracking === 'true';
    if (filterParams.requiresExpiryDate !== undefined)
        filter.requiresExpiryDate = filterParams.requiresExpiryDate === 'true';
    if (filterParams.taxable !== undefined)
        filter.taxable = filterParams.taxable === 'true';
    // Add range filters for price/cost if needed (e.g., price_gte, price_lte)
    // Build Prisma OrderBy array
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => {
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
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    // Call the service with constructed filters and options
    const result = await product_service_1.productService.queryProducts(filter, orderBy, limit, page);
    // Format and send the paginated response
    res.status(http_status_1.default.OK).send({
        results: result.products,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.totalResults / limit),
        totalResults: result.totalResults,
    });
});
const getProduct = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const productId = req.params.productId;
    const product = await product_service_1.productService.getProductById(productId, tenantId);
    if (!product) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Product not found');
    }
    res.status(http_status_1.default.OK).send(product);
});
const updateProduct = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const productId = req.params.productId;
    // req.body is validated UpdateProductDto
    // Add permission checks here if needed (e.g., user can update products)
    // Middleware `checkPermissions(['product:update'])` handles the basic check
    const product = await product_service_1.productService.updateProductById(productId, req.body, tenantId);
    res.status(http_status_1.default.OK).send(product);
});
const deleteProduct = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const productId = req.params.productId;
    // Add permission checks here if needed
    // Middleware `checkPermissions(['product:delete'])` handles the basic check
    await product_service_1.productService.deleteProductById(productId, tenantId);
    // Send 204 No Content on successful deletion
    res.status(http_status_1.default.NO_CONTENT).send();
});
exports.productController = {
    createProduct,
    getProducts,
    getProduct,
    updateProduct,
    deleteProduct,
};
//# sourceMappingURL=product.controller.js.map