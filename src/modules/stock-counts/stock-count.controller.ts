// src/modules/stock-counts/stock-count.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { stockCountService } from './stock-count.service'; // Import the service
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
import { Prisma, StockCountStatus, StockCountType } from '@prisma/client'; // Import Prisma types and enums

/** Controller to initiate a new stock count */
const initiateStockCount = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id; // User initiating
    // req.body validated by middleware against InitiateStockCountDto
    const stockCount = await stockCountService.initiateStockCount(req.body, tenantId, userId);
    res.status(httpStatus.CREATED).send(stockCount);
});

/** Controller to enter counted quantities for items in a stock count */
const enterCountData = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id; // User entering counts
    const { stockCountId } = req.params;
    // req.body validated by middleware against EnterCountsDto
    const result = await stockCountService.enterCountData(stockCountId, req.body, tenantId, userId);
    res.status(httpStatus.OK).send(result); // Send back { updatedItems: number }
});

/** Controller to review counted items (approve, request recount, skip) */
const reviewStockCount = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id; // User performing the review
    const { stockCountId } = req.params;
    // req.body validated by middleware against ReviewCountDto
    const result = await stockCountService.reviewStockCount(stockCountId, req.body, tenantId, userId);
    res.status(httpStatus.OK).send(result); // Send back { success: boolean }
});

/** Controller to post approved stock count adjustments */
const postStockCountAdjustments = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id; // User posting the adjustments
    const { stockCountId } = req.params;
    // No body needed, action is based on the count's state
    const result = await stockCountService.postStockCountAdjustments(stockCountId, tenantId, userId);
    res.status(httpStatus.OK).send(result); // Send back { success: boolean, adjustmentsCreated: number }
});

/** Controller to query stock counts */
const getStockCounts = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // Define filters
    const filterParams = pick(req.query, ['locationId', 'status', 'type', 'userId', 'dateFrom', 'dateTo']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    const filter: Prisma.StockCountWhereInput = { tenantId };
    if (filterParams.locationId) filter.locationId = filterParams.locationId as string;
    if (filterParams.userId) filter.initiatedByUserId = filterParams.userId as string; // Filter by initiator
    // Validate enums
    if (filterParams.status && Object.values(StockCountStatus).includes(filterParams.status as StockCountStatus)) {
        filter.status = filterParams.status as StockCountStatus;
    } else if (filterParams.status) { throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status value.`); }
    if (filterParams.type && Object.values(StockCountType).includes(filterParams.type as StockCountType)) {
        filter.type = filterParams.type as StockCountType;
    } else if (filterParams.type) { throw new ApiError(httpStatus.BAD_REQUEST, `Invalid type value.`); }
    // Date filtering (on initiatedAt for example)
     if (filterParams.dateFrom || filterParams.dateTo) {
        filter.initiatedAt = {};
         try {
            if (filterParams.dateFrom) filter.initiatedAt.gte = new Date(filterParams.dateFrom as string);
            if (filterParams.dateTo) filter.initiatedAt.lte = new Date(filterParams.dateTo as string);
        } catch (e) { /* throw bad date format error */ }
    }

    // Build OrderBy
    const orderBy: Prisma.StockCountOrderByWithRelationInput[] = [];
     if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['initiatedAt', 'completedAt', 'status', 'type', 'createdAt'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) { orderBy.push({ initiatedAt: 'desc' }); }

    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    const result = await stockCountService.queryStockCounts(filter, orderBy, limit, page);
    res.status(httpStatus.OK).send({
        results: result.stockCounts,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});

/** Controller to get a single stock count by ID */
const getStockCount = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const stockCount = await stockCountService.getStockCountById(req.params.stockCountId, tenantId);
    if (!stockCount) { throw new ApiError(httpStatus.NOT_FOUND, 'Stock count not found'); }
    res.status(httpStatus.OK).send(stockCount);
});

// Export controller methods
export const stockCountController = {
    initiateStockCount,
    enterCountData,
    reviewStockCount,
    postStockCountAdjustments,
    getStockCounts,
    getStockCount,
};
