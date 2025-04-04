"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchaseOrderController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const purchase_order_service_1 = require("./purchase-order.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick")); // Utility for filtering/pagination query params
const tenant_middleware_1 = require("@/middleware/tenant.middleware"); // Helper to get tenantId
const client_1 = require("@prisma/client"); // Import Prisma types and enums
/**
 * Controller to handle Purchase Order creation.
 */
const createPurchaseOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const userId = req.user.id; // Assumes authMiddleware ensures user exists
    // req.body is validated CreatePurchaseOrderDto by middleware
    const purchaseOrder = await purchase_order_service_1.purchaseOrderService.createPurchaseOrder(req.body, tenantId, userId);
    res.status(http_status_1.default.CREATED).send(purchaseOrder);
});
/**
 * Controller to handle querying Purchase Orders with filters and pagination.
 */
const getPurchaseOrders = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Define allowed filters from query parameters
    const filterParams = (0, pick_1.default)(req.query, [
        'supplierId', // Filter by supplier
        'locationId', // Filter by delivery location
        'status', // Filter by exact PO status
        'userId', // Filter by user who created it
        'poNumber', // Filter by PO number (contains)
        'dateFrom', // Filter by order date >= dateFrom
        'dateTo', // Filter by order date <= dateTo
        'expectedDateFrom', // Filter by expected delivery date
        'expectedDateTo'
    ]);
    // Define allowed options for sorting and pagination
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    // Build Prisma WhereInput object, always including the tenantId
    const filter = { tenantId }; // Automatically scope by tenant
    if (filterParams.supplierId)
        filter.supplierId = filterParams.supplierId;
    if (filterParams.locationId)
        filter.locationId = filterParams.locationId;
    // Validate status against enum values
    if (filterParams.status && Object.values(client_1.PurchaseOrderStatus).includes(filterParams.status)) {
        filter.status = { equals: filterParams.status };
    }
    else if (filterParams.status) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Invalid status value. Must be one of: ${Object.values(client_1.PurchaseOrderStatus).join(', ')}`);
    }
    if (filterParams.userId)
        filter.createdByUserId = filterParams.userId;
    if (filterParams.poNumber)
        filter.poNumber = { contains: filterParams.poNumber, mode: 'insensitive' };
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
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid date format for order date filters. Use ISO 8601 format.');
        }
    }
    // Date filtering for expectedDeliveryDate
    if (filterParams.expectedDateFrom || filterParams.expectedDateTo) {
        filter.expectedDeliveryDate = {};
        try {
            if (filterParams.expectedDateFrom)
                filter.expectedDeliveryDate.gte = new Date(filterParams.expectedDateFrom);
            if (filterParams.expectedDateTo)
                filter.expectedDeliveryDate.lte = new Date(filterParams.expectedDateTo);
        }
        catch (e) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid date format for expected date filters. Use ISO 8601 format.');
        }
    }
    // Build Prisma OrderBy array
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add valid sortable fields for PurchaseOrder model
                if (['poNumber', 'orderDate', 'expectedDeliveryDate', 'status', 'totalAmount', 'createdAt', 'updatedAt'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
                // Example sorting by related field name
                else if (key === 'supplierName') {
                    orderBy.push({ supplier: { name: order } });
                }
                else if (key === 'locationName') {
                    orderBy.push({ location: { name: order } });
                }
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
    const result = await purchase_order_service_1.purchaseOrderService.queryPurchaseOrders(filter, orderBy, limit, page);
    // Format and send the paginated response
    res.status(http_status_1.default.OK).send({
        results: result.pos,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.totalResults / limit),
        totalResults: result.totalResults,
    });
});
/**
 * Controller to handle fetching a single Purchase Order by ID.
 */
const getPurchaseOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const poId = req.params.poId; // PO ID from URL parameter
    // Permission check ('po:read') handled by middleware
    const purchaseOrder = await purchase_order_service_1.purchaseOrderService.getPurchaseOrderById(poId, tenantId);
    if (!purchaseOrder) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Purchase Order not found');
    }
    res.status(http_status_1.default.OK).send(purchaseOrder);
});
/**
 * Controller to handle updating basic PO details (notes, expected date, potentially shipping cost in DRAFT).
 */
const updatePurchaseOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const poId = req.params.poId;
    const userId = req.user.id; // User performing the update
    // req.body is validated UpdatePurchaseOrderDto by middleware
    // Permission check ('po:update') handled by middleware
    const purchaseOrder = await purchase_order_service_1.purchaseOrderService.updatePurchaseOrder(poId, req.body, tenantId, userId);
    res.status(http_status_1.default.OK).send(purchaseOrder);
});
// --- PO Action Controllers ---
/** Controller to submit a PO for approval */
const submitPurchaseOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const poId = req.params.poId;
    const userId = req.user.id;
    // req.body is validated POActionDto (optional notes)
    const purchaseOrder = await purchase_order_service_1.purchaseOrderService.submitPurchaseOrder(poId, tenantId, userId, req.body);
    res.status(http_status_1.default.OK).send(purchaseOrder);
});
/** Controller to approve a PO */
const approvePurchaseOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const poId = req.params.poId;
    const userId = req.user.id; // User approving
    // req.body is validated POActionDto (optional notes)
    const purchaseOrder = await purchase_order_service_1.purchaseOrderService.approvePurchaseOrder(poId, tenantId, userId, req.body);
    res.status(http_status_1.default.OK).send(purchaseOrder);
});
/** Controller to mark a PO as sent */
const sendPurchaseOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const poId = req.params.poId;
    const userId = req.user.id;
    // req.body is validated POActionDto (optional notes)
    const purchaseOrder = await purchase_order_service_1.purchaseOrderService.sendPurchaseOrder(poId, tenantId, userId, req.body);
    res.status(http_status_1.default.OK).send(purchaseOrder);
});
/** Controller to cancel a PO */
const cancelPurchaseOrder = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const poId = req.params.poId;
    const userId = req.user.id;
    // req.body is validated POActionDto (optional reason/notes)
    const purchaseOrder = await purchase_order_service_1.purchaseOrderService.cancelPurchaseOrder(poId, tenantId, userId, req.body);
    res.status(http_status_1.default.OK).send(purchaseOrder); // Send back the cancelled PO
});
/** Controller to receive items against a PO */
const receiveItems = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const poId = req.params.poId;
    const userId = req.user.id; // User receiving
    // req.body is validated ReceivePurchaseOrderDto by middleware
    const result = await purchase_order_service_1.purchaseOrderService.receivePurchaseOrderItems(poId, req.body, tenantId, userId);
    res.status(http_status_1.default.OK).send(result); // Send back { success: true, updatedStatus: ... }
});
// Note: A 'deletePurchaseOrder' controller/service could be added,
// but likely restricted only to POs in DRAFT status for safety.
// Export all controller methods
exports.purchaseOrderController = {
    createPurchaseOrder,
    getPurchaseOrders,
    getPurchaseOrder,
    updatePurchaseOrder, // Basic updates
    // Actions
    submitPurchaseOrder,
    approvePurchaseOrder,
    sendPurchaseOrder,
    cancelPurchaseOrder,
    receiveItems,
};
//# sourceMappingURL=purchase-order.controller.js.map