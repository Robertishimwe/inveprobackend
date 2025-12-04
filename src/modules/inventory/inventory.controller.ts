// src/modules/inventory/inventory.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { inventoryService } from './inventory.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick'; // Utility for filtering/pagination query params
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get tenantId
import { Prisma, TransferStatus } from '@prisma/client'; // Import Prisma types and enums

// --- Adjustment Controllers ---

const createAdjustment = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id; // Assumes authMiddleware ensures user exists
    // req.body is validated CreateAdjustmentDto by middleware
    const result = await inventoryService.createAdjustment(req.body, tenantId, userId);
    res.status(httpStatus.CREATED).send(result);
});

const getAdjustments = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // Define allowed filters from query parameters
    const filterParams = pick(req.query, [
        'locationId',   // Filter by location ID
        'reasonCode',   // Filter by reason code (contains)
        'userId',       // Filter by user who created it
        'dateFrom',     // Filter by adjustment date >= dateFrom
        'dateTo'        // Filter by adjustment date <= dateTo
    ]);
    // Define allowed options for sorting and pagination
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput object, always including the tenantId
    const filter: Prisma.InventoryAdjustmentWhereInput = { tenantId };

    if (filterParams.locationId) filter.locationId = filterParams.locationId as string;
    if (filterParams.reasonCode) filter.reasonCode = { contains: filterParams.reasonCode as string, mode: 'insensitive' };
    if (filterParams.userId) filter.createdByUserId = filterParams.userId as string;
    // Date filtering
    if (filterParams.dateFrom || filterParams.dateTo) {
        filter.adjustmentDate = {};
        try {
            if (filterParams.dateFrom) filter.adjustmentDate.gte = new Date(filterParams.dateFrom as string);
            if (filterParams.dateTo) filter.adjustmentDate.lte = new Date(filterParams.dateTo as string);
        } catch (e) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format for dateFrom or dateTo. Use ISO 8601 format.');
        }
    }

    // Build Prisma OrderBy array
    const orderBy: Prisma.InventoryAdjustmentOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add valid sortable fields
                if (['adjustmentDate', 'createdAt', 'reasonCode'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) { orderBy.push({ createdAt: 'desc' }); } // Default sort

    // Parse pagination options
    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    // Call the service
    const allowedLocationIds = req.user?.allowedLocationIds || [];
    const result = await inventoryService.queryAdjustments(filter, orderBy, limit, page, allowedLocationIds);

    // Format and send the paginated response
    res.status(httpStatus.OK).send({
        results: result.adjustments,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});

const getAdjustment = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const adjustment = await inventoryService.getAdjustmentById(req.params.adjustmentId, tenantId);
    if (!adjustment) { throw new ApiError(httpStatus.NOT_FOUND, 'Adjustment not found'); }
    res.status(httpStatus.OK).send(adjustment);
});


// --- Transfer Controllers ---

const createTransfer = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id;
    // req.body is validated CreateTransferDto by middleware
    const result = await inventoryService.createTransfer(req.body, tenantId, userId);
    res.status(httpStatus.CREATED).send(result);
});

const shipTransfer = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id;
    const { transferId } = req.params;
    // Optional: req.body could contain details about specific items/lots/serials being shipped
    const result = await inventoryService.shipTransfer(transferId, tenantId, userId);
    res.status(httpStatus.OK).send(result);
});

const receiveTransfer = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id;
    const { transferId } = req.params;
    // req.body is validated ReceiveTransferDto by middleware
    const result = await inventoryService.receiveTransfer(transferId, req.body, tenantId, userId);
    res.status(httpStatus.OK).send(result);
});

const getTransfers = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // Define allowed filters
    const filterParams = pick(req.query, [
        'sourceLocationId', 'destinationLocationId', 'status', 'userId', 'dateFrom', 'dateTo'
    ]);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput
    const filter: Prisma.InventoryTransferWhereInput = { tenantId };
    if (filterParams.sourceLocationId) filter.sourceLocationId = filterParams.sourceLocationId as string;
    if (filterParams.destinationLocationId) filter.destinationLocationId = filterParams.destinationLocationId as string;
    // Validate status against enum values
    if (filterParams.status && Object.values(TransferStatus).includes(filterParams.status as TransferStatus)) {
        filter.status = { equals: filterParams.status as TransferStatus };
    } else if (filterParams.status) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status value. Must be one of: ${Object.values(TransferStatus).join(', ')}`);
    }
    if (filterParams.userId) filter.createdByUserId = filterParams.userId as string;
    // Date filtering for transferDate
    if (filterParams.dateFrom || filterParams.dateTo) {
        filter.transferDate = {};
        try {
            if (filterParams.dateFrom) filter.transferDate.gte = new Date(filterParams.dateFrom as string);
            if (filterParams.dateTo) filter.transferDate.lte = new Date(filterParams.dateTo as string);
        } catch (e) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format for dateFrom or dateTo. Use ISO 8601 format.');
        }
    }

    // Build Prisma OrderBy
    const orderBy: Prisma.InventoryTransferOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['transferDate', 'createdAt', 'status', 'updatedAt'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) { orderBy.push({ createdAt: 'desc' }); } // Default sort

    // Pagination
    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    // Call service
    const allowedLocationIds = req.user?.allowedLocationIds || [];
    const result = await inventoryService.queryTransfers(filter, orderBy, limit, page, allowedLocationIds);
    res.status(httpStatus.OK).send({
        results: result.transfers,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});

const getTransfer = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const transfer = await inventoryService.getTransferById(req.params.transferId, tenantId);
    if (!transfer) { throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found'); }
    res.status(httpStatus.OK).send(transfer);
});

// --- Inventory Item / Stock Level Controllers ---

const getInventoryItems = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // Define allowed filters
    const filterParams = pick(req.query, ['productId', 'locationId', 'quantityLte', 'quantityGte']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput
    const filter: Prisma.InventoryItemWhereInput = { tenantId };
    if (filterParams.productId) filter.productId = filterParams.productId as string;
    if (filterParams.locationId) filter.locationId = filterParams.locationId as string;

    // Build quantityOnHand filter progressively
    // Initialize quantityFilter as an empty object to avoid spread error
    let quantityFilter: Prisma.DecimalFilter<'InventoryItem'> = {};
    let hasQuantityFilter = false; // Flag to track if we added any quantity filters

    if (filterParams.quantityLte !== undefined) {
        try {
            const lteValue = new Prisma.Decimal(filterParams.quantityLte as string);
            // Add or update the 'lte' property
            quantityFilter.lte = lteValue;
            hasQuantityFilter = true;
        } catch {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid number format for quantityLte.');
        }
    }
    if (filterParams.quantityGte !== undefined) {
        try {
            const gteValue = new Prisma.Decimal(filterParams.quantityGte as string);
            // Add or update the 'gte' property
            quantityFilter.gte = gteValue;
            hasQuantityFilter = true;
        } catch {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid number format for quantityGte.');
        }
    }

    // Assign the constructed filter object only if filters were added
    if (hasQuantityFilter) {
        filter.quantityOnHand = quantityFilter;
    }
    // Add 'lowStock' filter logic here if needed

    // Build Prisma OrderBy
    const orderBy: Prisma.InventoryItemOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Define sortable fields
                if (['quantityOnHand', 'quantityAllocated', 'quantityIncoming', 'updatedAt', 'averageCost'].includes(key)) {
                    orderBy.push({ [key]: order });
                } else if (key === 'productName') {
                    orderBy.push({ product: { name: order } });
                } else if (key === 'productSku') {
                    orderBy.push({ product: { sku: order } });
                } else if (key === 'locationName') {
                    orderBy.push({ location: { name: order } });
                }
            }
        });
    }
    if (orderBy.length === 0) { orderBy.push({ product: { name: 'asc' } }, { location: { name: 'asc' } }); } // Default sort

    // Pagination
    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    // Call service
    const allowedLocationIds = req.user?.allowedLocationIds || [];
    const result = await inventoryService.queryInventoryItems(filter, orderBy, limit, page, allowedLocationIds);
    res.status(httpStatus.OK).send({
        results: result.items,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});

const getInventoryItem = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const item = await inventoryService.getInventoryItemById(req.params.itemId, tenantId);
    if (!item) { throw new ApiError(httpStatus.NOT_FOUND, 'Inventory item record not found'); }
    res.status(httpStatus.OK).send(item);
});


// Export all controller methods
export const inventoryController = {
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
