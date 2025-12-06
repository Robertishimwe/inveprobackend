// src/modules/returns/return.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { returnService } from './return.service'; // Import the return service
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick'; // Utility for filtering/pagination query params
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get tenantId
import { Prisma, ReturnStatus } from '@prisma/client'; // Import Prisma types and enums for filtering/sorting

/**
 * Controller to handle initiating/creating a new return.
 */
const createReturn = catchAsync(async (req: Request, res: Response) => {

    const tenantId = getTenantIdFromRequest(req); // Tenant scope from auth
    const userId = req.user!.id; // User processing the return (from auth)
    // req.body validated against CreateReturnDto by middleware
    const returnRecord = await returnService.createReturn(req.body, tenantId, userId);
    res.status(httpStatus.CREATED).send(returnRecord);
});

/**
 * Controller to handle querying multiple returns with filters and pagination.
 */
const getReturns = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);

    // Define allowed filters from query parameters
    const filterParams = pick(req.query, [
        'originalOrderId', // Filter by original order ID
        'customerId',      // Filter by customer ID
        'locationId',      // Filter by location where return was processed
        'userId',          // Filter by user who processed it
        'status',          // Filter by exact return status
        'returnNumber',    // Filter by return number (contains)
        'dateFrom',        // Filter by return date >= dateFrom
        'dateTo',          // Filter by return date <= dateTo
    ]);
    // Define allowed options for sorting and pagination
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput object, always including the tenantId
    const filter: Prisma.ReturnWhereInput = { tenantId }; // Automatically scope by tenant

    if (filterParams.originalOrderId) filter.originalOrderId = filterParams.originalOrderId as string;
    if (filterParams.customerId) filter.customerId = filterParams.customerId as string;
    if (filterParams.locationId) filter.locationId = filterParams.locationId as string;
    if (filterParams.userId) filter.processedByUserId = filterParams.userId as string;
    if (filterParams.returnNumber) filter.returnNumber = { contains: filterParams.returnNumber as string, mode: 'insensitive' };
    // Validate status against enum values
    if (filterParams.status && Object.values(ReturnStatus).includes(filterParams.status as ReturnStatus)) {
        filter.status = filterParams.status as ReturnStatus;
    } else if (filterParams.status) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status value. Must be one of: ${Object.values(ReturnStatus).join(', ')}`);
    }

    // Date filtering for returnDate
    if (filterParams.dateFrom || filterParams.dateTo) {
        filter.returnDate = {};
        try {
            if (filterParams.dateFrom) filter.returnDate.gte = new Date(filterParams.dateFrom as string);
            if (filterParams.dateTo) filter.returnDate.lte = new Date(filterParams.dateTo as string);
        } catch (e) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format for return date filters. Use ISO 8601 format.');
        }
    }

    // Build Prisma OrderBy array
    const orderBy: Prisma.ReturnOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add valid sortable fields for Return model
                if (['returnNumber', 'returnDate', 'status', 'totalRefundAmount', 'createdAt', 'updatedAt'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
                // Example sorting by related field name
                // else if (key === 'customerName') { orderBy.push({ customer: { lastName: order } }, { customer: { firstName: order } }); }
                // else if (key === 'locationName') { orderBy.push({ location: { name: order } }); }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ returnDate: 'desc' }); // Default sort by most recent return date
    }

    // Parse pagination options
    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    // Call the service with constructed filters and options
    const result = await returnService.queryReturns(filter, orderBy, limit, page);

    // Format and send the paginated response
    res.status(httpStatus.OK).send({
        results: result.returns,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.totalResults / limit),
        totalResults: result.totalResults,
    });
});

/**
 * Controller to handle fetching a single return by ID.
 */
const getReturn = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const returnId = req.params.returnId; // Return ID from URL parameter

    // Permission check ('order:manage:returns' or 'return:read') handled by middleware

    const returnRecord = await returnService.getReturnById(returnId, tenantId);
    if (!returnRecord) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Return not found');
    }
    res.status(httpStatus.OK).send(returnRecord);
});

/**
 * Controller to handle updating a return's status or notes.
 */
const updateReturn = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const returnId = req.params.returnId;
    const userId = req.user!.id; // User performing the update
    // req.body is validated UpdateReturnDto by middleware
    const { status, notes } = req.body; // Extract validated data

    // Ensure at least status or notes is provided for update
    if (status === undefined && notes === undefined) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'At least status or notes must be provided for update.');
    }

    // Permission check ('order:manage:returns' or 'return:update') handled by middleware

    // Service function handles status transition validation
    const returnRecord = await returnService.updateReturnStatus(returnId, status!, tenantId, userId, notes); // Pass validated status and optional notes
    res.status(httpStatus.OK).send(returnRecord);
});


// Export all controller methods for returns
export const returnController = {
    createReturn,
    getReturns,
    getReturn,
    updateReturn, // Primarily for status updates/notes
    // Add controllers for specific actions like approveReturn, rejectReturn, completeReturn if needed
};
