"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const order_service_1 = require("./order.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick")); // For filtering/pagination query params
const tenant_middleware_1 = require("@/middleware/tenant.middleware"); // Helper to get tenantId
const client_1 = require("@prisma/client"); // Import Prisma types and enums
/**
 * Controller to handle order creation.
 */
const createOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req); // Ensures tenantId is present from auth context
    const userId = req.user.id; // Assumes authMiddleware ensures user exists
    // req.body is validated CreateOrderDto by validateRequest middleware
    const order = await order_service_1.orderService.createOrder(req.body, tenantId, userId);
    // Send back the newly created order details
    res.status(http_status_1.default.CREATED).send(order);
});
/**
 * Controller to handle querying multiple orders with filters and pagination.
 */
const getOrders = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Define allowed filters from query parameters
    const filterParams = (0, pick_1.default)(req.query, [
        'customerId', // Filter by customer ID
        'locationId', // Filter by location ID
        'userId', // Filter by user (salesperson) ID
        'status', // Filter by exact order status
        'orderType', // Filter by order type
        'orderNumber', // Filter by order number (contains)
        'dateFrom', // Filter by order date >= dateFrom
        'dateTo', // Filter by order date <= dateTo
        'isBackordered' // Filter by backorder status ('true' or 'false')
    ]);
    // Define allowed options for sorting and pagination
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    // Build Prisma WhereInput object, always including the tenantId
    const filter = { tenantId }; // Automatically scope by tenant
    if (filterParams.customerId)
        filter.customerId = filterParams.customerId;
    if (filterParams.locationId)
        filter.locationId = filterParams.locationId;
    if (filterParams.userId)
        filter.userId = filterParams.userId;
    // Validate status against enum values
    if (filterParams.status && Object.values(client_1.OrderStatus).includes(filterParams.status)) {
        filter.status = { equals: filterParams.status };
    }
    else if (filterParams.status) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Invalid status value. Must be one of: ${Object.values(client_1.OrderStatus).join(', ')}`);
    }
    if (filterParams.orderType)
        filter.orderType = { equals: filterParams.orderType }; // Cast if needed for enum
    if (filterParams.orderNumber)
        filter.orderNumber = { contains: filterParams.orderNumber, mode: 'insensitive' };
    if (filterParams.isBackordered !== undefined)
        filter.isBackordered = filterParams.isBackordered === 'true';
    // Date filtering for orderDate
    if (filterParams.dateFrom || filterParams.dateTo) {
        filter.orderDate = {};
        try {
            if (filterParams.dateFrom)
                filter.orderDate.gte = new Date(filterParams.dateFrom);
            if (filterParams.dateTo)
                filter.orderDate.lte = new Date(filterParams.dateTo);
        }
        catch (e) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid date format for dateFrom or dateTo. Use ISO 8601 format.');
        }
    }
    // Build Prisma OrderBy array
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add valid sortable fields for Order model
                if (['orderNumber', 'orderDate', 'status', 'totalAmount', 'createdAt', 'updatedAt'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
                // Example sorting by related field name (use with caution on performance)
                // else if (key === 'customerName') { orderBy.push({ customer: { lastName: order } }, { customer: { firstName: order } }); }
                // else if (key === 'locationName') { orderBy.push({ location: { name: order } }); }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ orderDate: 'desc' }); // Default sort by most recent order date
    }
    // Parse pagination options
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    // Call the service with constructed filters and options
    const result = await order_service_1.orderService.queryOrders(filter, orderBy, limit, page);
    // Format and send the paginated response
    res.status(http_status_1.default.OK).send({
        results: result.orders,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.totalResults / limit),
        totalResults: result.totalResults,
    });
});
/**
 * Controller to handle fetching a single order by ID.
 */
const getOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const orderId = req.params.orderId; // Order ID from URL parameter
    // Optional: Permission checks
    // Middleware `checkPermissions(['order:read'])` handles basic check
    const order = await order_service_1.orderService.getOrderById(orderId, tenantId);
    if (!order) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    }
    res.status(http_status_1.default.OK).send(order);
});
/**
 * Controller to handle updating an order by ID (e.g., status, tracking).
 */
const updateOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const orderId = req.params.orderId;
    const userId = req.user.id; // User performing the update
    // req.body is validated UpdateOrderDto by middleware
    // Optional: Permission checks
    // Middleware `checkPermissions(['order:update'])` handles basic check
    const order = await order_service_1.orderService.updateOrderById(orderId, req.body, tenantId, userId);
    res.status(http_status_1.default.OK).send(order);
});
/**
 * Controller to handle cancelling an order by ID.
 */
const cancelOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const orderId = req.params.orderId;
    const userId = req.user.id;
    // Optional: Get cancellation reason from request body if needed
    const reason = req.body?.reason || "Cancelled by user request";
    // Optional: Permission checks
    // Middleware `checkPermissions(['order:cancel'])` handles basic check
    // Service layer performs validation and stock reversal
    const cancelledOrder = await order_service_1.orderService.cancelOrderById(orderId, tenantId, userId, reason);
    // Send back the cancelled order details
    res.status(http_status_1.default.OK).send(cancelledOrder);
});
// Export all controller methods
exports.orderController = {
    createOrder,
    getOrders,
    getOrder,
    updateOrder,
    cancelOrder, // Changed from deleteOrder to reflect action
};
//# sourceMappingURL=order.controller.js.map