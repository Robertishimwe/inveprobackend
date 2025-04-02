// src/modules/purchase-orders/purchase-order.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { purchaseOrderService } from './purchase-order.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick'; // Utility for filtering/pagination query params
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get tenantId
import { Prisma, PurchaseOrderStatus } from '@prisma/client'; // Import Prisma types and enums

/**
 * Controller to handle Purchase Order creation.
 */
const createPurchaseOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id; // Assumes authMiddleware ensures user exists
    // req.body is validated CreatePurchaseOrderDto by middleware
    const purchaseOrder = await purchaseOrderService.createPurchaseOrder(req.body, tenantId, userId);
    res.status(httpStatus.CREATED).send(purchaseOrder);
});

/**
 * Controller to handle querying Purchase Orders with filters and pagination.
 */
const getPurchaseOrders = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);

    // Define allowed filters from query parameters
    const filterParams = pick(req.query, [
        'supplierId',   // Filter by supplier
        'locationId',   // Filter by delivery location
        'status',       // Filter by exact PO status
        'userId',       // Filter by user who created it
        'poNumber',     // Filter by PO number (contains)
        'dateFrom',     // Filter by order date >= dateFrom
        'dateTo',       // Filter by order date <= dateTo
        'expectedDateFrom', // Filter by expected delivery date
        'expectedDateTo'
    ]);
    // Define allowed options for sorting and pagination
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput object, always including the tenantId
    const filter: Prisma.PurchaseOrderWhereInput = { tenantId }; // Automatically scope by tenant

    if (filterParams.supplierId) filter.supplierId = filterParams.supplierId as string;
    if (filterParams.locationId) filter.locationId = filterParams.locationId as string;
    // Validate status against enum values
    if (filterParams.status && Object.values(PurchaseOrderStatus).includes(filterParams.status as PurchaseOrderStatus)) {
         filter.status = { equals: filterParams.status as PurchaseOrderStatus };
    } else if (filterParams.status) {
         throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status value. Must be one of: ${Object.values(PurchaseOrderStatus).join(', ')}`);
    }
    if (filterParams.userId) filter.createdByUserId = filterParams.userId as string;
    if (filterParams.poNumber) filter.poNumber = { contains: filterParams.poNumber as string, mode: 'insensitive' };

    // Date filtering for orderDate
     if (filterParams.dateFrom || filterParams.dateTo) {
        filter.orderDate = {};
         try {
            if (filterParams.dateFrom) filter.orderDate.gte = new Date(filterParams.dateFrom as string);
            if (filterParams.dateTo) filter.orderDate.lte = new Date(filterParams.dateTo as string);
        } catch (e) {
             throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format for order date filters. Use ISO 8601 format.');
        }
    }
    // Date filtering for expectedDeliveryDate
    if (filterParams.expectedDateFrom || filterParams.expectedDateTo) {
        filter.expectedDeliveryDate = {};
         try {
            if (filterParams.expectedDateFrom) filter.expectedDeliveryDate.gte = new Date(filterParams.expectedDateFrom as string);
            if (filterParams.expectedDateTo) filter.expectedDeliveryDate.lte = new Date(filterParams.expectedDateTo as string);
        } catch (e) {
             throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format for expected date filters. Use ISO 8601 format.');
        }
    }

    // Build Prisma OrderBy array
    const orderBy: Prisma.PurchaseOrderOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add valid sortable fields for PurchaseOrder model
                if (['poNumber', 'orderDate', 'expectedDeliveryDate', 'status', 'totalAmount', 'createdAt', 'updatedAt'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
                // Example sorting by related field name
                else if (key === 'supplierName') { orderBy.push({ supplier: { name: order } }); }
                else if (key === 'locationName') { orderBy.push({ location: { name: order } }); }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ orderDate: 'desc' }); // Default sort by most recent order date
    }

    // Parse pagination options
    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    // Call the service with constructed filters and options
    const result = await purchaseOrderService.queryPurchaseOrders(filter, orderBy, limit, page);

    // Format and send the paginated response
    res.status(httpStatus.OK).send({
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
const getPurchaseOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const poId = req.params.poId; // PO ID from URL parameter

    // Permission check ('po:read') handled by middleware

    const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(poId, tenantId);
    if (!purchaseOrder) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Purchase Order not found');
    }
    res.status(httpStatus.OK).send(purchaseOrder);
});

/**
 * Controller to handle updating basic PO details (notes, expected date, potentially shipping cost in DRAFT).
 */
const updatePurchaseOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const poId = req.params.poId;
    const userId = req.user!.id; // User performing the update
    // req.body is validated UpdatePurchaseOrderDto by middleware

    // Permission check ('po:update') handled by middleware

    const purchaseOrder = await purchaseOrderService.updatePurchaseOrder(poId, req.body, tenantId, userId);
    res.status(httpStatus.OK).send(purchaseOrder);
});

// --- PO Action Controllers ---

/** Controller to submit a PO for approval */
const submitPurchaseOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const poId = req.params.poId;
    const userId = req.user!.id;
    // req.body is validated POActionDto (optional notes)
    const purchaseOrder = await purchaseOrderService.submitPurchaseOrder(poId, tenantId, userId, req.body);
    res.status(httpStatus.OK).send(purchaseOrder);
});

/** Controller to approve a PO */
const approvePurchaseOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const poId = req.params.poId;
    const userId = req.user!.id; // User approving
    // req.body is validated POActionDto (optional notes)
    const purchaseOrder = await purchaseOrderService.approvePurchaseOrder(poId, tenantId, userId, req.body);
    res.status(httpStatus.OK).send(purchaseOrder);
});

/** Controller to mark a PO as sent */
const sendPurchaseOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const poId = req.params.poId;
    const userId = req.user!.id;
    // req.body is validated POActionDto (optional notes)
    const purchaseOrder = await purchaseOrderService.sendPurchaseOrder(poId, tenantId, userId, req.body);
    res.status(httpStatus.OK).send(purchaseOrder);
});

/** Controller to cancel a PO */
const cancelPurchaseOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const poId = req.params.poId;
    const userId = req.user!.id;
    // req.body is validated POActionDto (optional reason/notes)
    const purchaseOrder = await purchaseOrderService.cancelPurchaseOrder(poId, tenantId, userId, req.body);
    res.status(httpStatus.OK).send(purchaseOrder); // Send back the cancelled PO
});

/** Controller to receive items against a PO */
const receiveItems = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const poId = req.params.poId;
    const userId = req.user!.id; // User receiving
    // req.body is validated ReceivePurchaseOrderDto by middleware

    const result = await purchaseOrderService.receivePurchaseOrderItems(poId, req.body, tenantId, userId);
    res.status(httpStatus.OK).send(result); // Send back { success: true, updatedStatus: ... }
});

// Note: A 'deletePurchaseOrder' controller/service could be added,
// but likely restricted only to POs in DRAFT status for safety.


// Export all controller methods
export const purchaseOrderController = {
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