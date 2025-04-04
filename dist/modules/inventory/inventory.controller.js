"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const inventory_service_1 = require("./inventory.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick")); // Utility for filtering/pagination query params
const tenant_middleware_1 = require("@/middleware/tenant.middleware"); // Helper to get tenantId
const client_1 = require("@prisma/client"); // Import Prisma types and enums
// --- Adjustment Controllers ---
const createAdjustment = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const userId = req.user.id; // Assumes authMiddleware ensures user exists
    // req.body is validated CreateAdjustmentDto by middleware
    const result = await inventory_service_1.inventoryService.createAdjustment(req.body, tenantId, userId);
    res.status(http_status_1.default.CREATED).send(result);
});
const getAdjustments = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Define allowed filters from query parameters
    const filterParams = (0, pick_1.default)(req.query, [
        'locationId', // Filter by location ID
        'reasonCode', // Filter by reason code (contains)
        'userId', // Filter by user who created it
        'dateFrom', // Filter by adjustment date >= dateFrom
        'dateTo' // Filter by adjustment date <= dateTo
    ]);
    // Define allowed options for sorting and pagination
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    // Build Prisma WhereInput object, always including the tenantId
    const filter = { tenantId };
    if (filterParams.locationId)
        filter.locationId = filterParams.locationId;
    if (filterParams.reasonCode)
        filter.reasonCode = { contains: filterParams.reasonCode, mode: 'insensitive' };
    if (filterParams.userId)
        filter.createdByUserId = filterParams.userId;
    // Date filtering
    if (filterParams.dateFrom || filterParams.dateTo) {
        filter.adjustmentDate = {};
        try {
            if (filterParams.dateFrom)
                filter.adjustmentDate.gte = new Date(filterParams.dateFrom);
            if (filterParams.dateTo)
                filter.adjustmentDate.lte = new Date(filterParams.dateTo);
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
                // Add valid sortable fields
                if (['adjustmentDate', 'createdAt', 'reasonCode'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ createdAt: 'desc' });
    } // Default sort
    // Parse pagination options
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    // Call the service
    const result = await inventory_service_1.inventoryService.queryAdjustments(filter, orderBy, limit, page);
    // Format and send the paginated response
    res.status(http_status_1.default.OK).send({
        results: result.adjustments,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});
const getAdjustment = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const adjustment = await inventory_service_1.inventoryService.getAdjustmentById(req.params.adjustmentId, tenantId);
    if (!adjustment) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Adjustment not found');
    }
    res.status(http_status_1.default.OK).send(adjustment);
});
// --- Transfer Controllers ---
const createTransfer = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const userId = req.user.id;
    // req.body is validated CreateTransferDto by middleware
    const result = await inventory_service_1.inventoryService.createTransfer(req.body, tenantId, userId);
    res.status(http_status_1.default.CREATED).send(result);
});
const shipTransfer = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const userId = req.user.id;
    const { transferId } = req.params;
    // Optional: req.body could contain details about specific items/lots/serials being shipped
    const result = await inventory_service_1.inventoryService.shipTransfer(transferId, tenantId, userId);
    res.status(http_status_1.default.OK).send(result);
});
const receiveTransfer = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const userId = req.user.id;
    const { transferId } = req.params;
    // req.body is validated ReceiveTransferDto by middleware
    const result = await inventory_service_1.inventoryService.receiveTransfer(transferId, req.body, tenantId, userId);
    res.status(http_status_1.default.OK).send(result);
});
const getTransfers = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Define allowed filters
    const filterParams = (0, pick_1.default)(req.query, [
        'sourceLocationId', 'destinationLocationId', 'status', 'userId', 'dateFrom', 'dateTo'
    ]);
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    // Build Prisma WhereInput
    const filter = { tenantId };
    if (filterParams.sourceLocationId)
        filter.sourceLocationId = filterParams.sourceLocationId;
    if (filterParams.destinationLocationId)
        filter.destinationLocationId = filterParams.destinationLocationId;
    // Validate status against enum values
    if (filterParams.status && Object.values(client_1.TransferStatus).includes(filterParams.status)) {
        filter.status = { equals: filterParams.status };
    }
    else if (filterParams.status) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Invalid status value. Must be one of: ${Object.values(client_1.TransferStatus).join(', ')}`);
    }
    if (filterParams.userId)
        filter.createdByUserId = filterParams.userId;
    // Date filtering for transferDate
    if (filterParams.dateFrom || filterParams.dateTo) {
        filter.transferDate = {};
        try {
            if (filterParams.dateFrom)
                filter.transferDate.gte = new Date(filterParams.dateFrom);
            if (filterParams.dateTo)
                filter.transferDate.lte = new Date(filterParams.dateTo);
        }
        catch (e) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid date format for dateFrom or dateTo. Use ISO 8601 format.');
        }
    }
    // Build Prisma OrderBy
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['transferDate', 'createdAt', 'status', 'updatedAt'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ createdAt: 'desc' });
    } // Default sort
    // Pagination
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    // Call service
    const result = await inventory_service_1.inventoryService.queryTransfers(filter, orderBy, limit, page);
    res.status(http_status_1.default.OK).send({
        results: result.transfers,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});
const getTransfer = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const transfer = await inventory_service_1.inventoryService.getTransferById(req.params.transferId, tenantId);
    if (!transfer) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Transfer not found');
    }
    res.status(http_status_1.default.OK).send(transfer);
});
// --- Inventory Item / Stock Level Controllers ---
const getInventoryItems = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Define allowed filters
    const filterParams = (0, pick_1.default)(req.query, ['productId', 'locationId', 'quantityLte', 'quantityGte']);
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    // Build Prisma WhereInput
    const filter = { tenantId };
    if (filterParams.productId)
        filter.productId = filterParams.productId;
    if (filterParams.locationId)
        filter.locationId = filterParams.locationId;
    // Build quantityOnHand filter progressively
    // Initialize quantityFilter as an empty object to avoid spread error
    let quantityFilter = {};
    let hasQuantityFilter = false; // Flag to track if we added any quantity filters
    if (filterParams.quantityLte !== undefined) {
        try {
            const lteValue = new client_1.Prisma.Decimal(filterParams.quantityLte);
            // Add or update the 'lte' property
            quantityFilter.lte = lteValue;
            hasQuantityFilter = true;
        }
        catch {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid number format for quantityLte.');
        }
    }
    if (filterParams.quantityGte !== undefined) {
        try {
            const gteValue = new client_1.Prisma.Decimal(filterParams.quantityGte);
            // Add or update the 'gte' property
            quantityFilter.gte = gteValue;
            hasQuantityFilter = true;
        }
        catch {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid number format for quantityGte.');
        }
    }
    // Assign the constructed filter object only if filters were added
    if (hasQuantityFilter) {
        filter.quantityOnHand = quantityFilter;
    }
    // Add 'lowStock' filter logic here if needed
    // Build Prisma OrderBy
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Define sortable fields
                if (['quantityOnHand', 'quantityAllocated', 'quantityIncoming', 'updatedAt', 'averageCost'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
                else if (key === 'productName') {
                    orderBy.push({ product: { name: order } });
                }
                else if (key === 'productSku') {
                    orderBy.push({ product: { sku: order } });
                }
                else if (key === 'locationName') {
                    orderBy.push({ location: { name: order } });
                }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ product: { name: 'asc' } }, { location: { name: 'asc' } });
    } // Default sort
    // Pagination
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    // Call service
    const result = await inventory_service_1.inventoryService.queryInventoryItems(filter, orderBy, limit, page);
    res.status(http_status_1.default.OK).send({
        results: result.items,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});
const getInventoryItem = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const item = await inventory_service_1.inventoryService.getInventoryItemById(req.params.itemId, tenantId);
    if (!item) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Inventory item record not found');
    }
    res.status(http_status_1.default.OK).send(item);
});
// Export all controller methods
exports.inventoryController = {
    // Adjustments
    createAdjustment,
    getAdjustments,
    getAdjustment,
    // Transfers
    createTransfer,
    shipTransfer,
    receiveTransfer,
    getTransfers,
    getTransfer,
    // Stock Levels
    getInventoryItems,
    getInventoryItem,
};
//# sourceMappingURL=inventory.controller.js.map