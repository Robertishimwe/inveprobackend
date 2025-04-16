// src/modules/returns/return.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { returnService } from './return.service'; // Import the return service
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick'; // For filtering/pagination query params
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get tenantId
import { Prisma, ReturnStatus } from '@prisma/client'; // Import Prisma types and enums

/**
 * Controller to handle processing a new return (linked or blind).
 */
const processReturn = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user!.id; // Assumes authMiddleware ensures user exists

    // Get Location ID and optional Session ID from request context (e.g., headers)
    // These identify the physical point where the return is happening.
    const locationId = req.header('X-Location-Id');
    const posSessionId = req.header('X-Session-Id'); // May be null/undefined if not a POS return

    if (!locationId) {
        // Location is crucial for knowing where stock should be adjusted (if restocked)
        throw new ApiError(httpStatus.BAD_REQUEST, 'X-Location-Id header is required for processing returns.');
    }
    // TODO: Add validation here or in middleware to ensure the provided locationId is valid for the tenant.

    // req.body is validated CreateReturnDto by middleware
    const returnRecord = await returnService.processReturn(
        req.body,
        tenantId,
        userId,
        locationId, // Pass the location where return is happening
        posSessionId ?? null // Pass session ID if available
    );

    // Return the details of the processed return
    res.status(httpStatus.CREATED).send(returnRecord);
});

/**
 * Controller to handle querying multiple returns with filters and pagination.
 */
const getReturns = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);

    // Define allowed filters from query parameters
    const filterParams = pick(req.query, [
        'originalOrderId', // Filter by the original sales order ID
        'customerId',      // Filter by customer ID
        'locationId',      // Filter by location where return was processed
        'userId',          // Filter by user who processed the return (processedByUserId)
        'status',          // Filter by exact return status
        'returnOrderNumber',// Filter by return number (contains)
        'dateFrom',        // Filter by return date >= dateFrom
        'dateTo'           // Filter by return date <= dateTo
    ]);
    // Define allowed options for sorting and pagination
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput object, always including the tenantId
    const filter: Prisma.ReturnWhereInput = { tenantId }; // Automatically scope by tenant

    if (filterParams.originalOrderId) filter.originalOrderId = filterParams.originalOrderId as string;
    if (filterParams.customerId) filter.customerId = filterParams.customerId as string;
    if (filterParams.locationId) filter.locationId = filterParams.locationId as string;
    if (filterParams.userId) filter.processedByUserId = filterParams.userId as string;
    // Validate status against enum values
    if (filterParams.status && Object.values(ReturnStatus).includes(filterParams.status as ReturnStatus)) {
         filter.status = filterParams.status as ReturnStatus;
    } else if (filterParams.status) {
         throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status value. Must be one of: ${Object.values(ReturnStatus).join(', ')}`);
    }
    if (filterParams.returnOrderNumber) filter.returnOrderId = { contains: filterParams.returnOrderNumber as string, mode: 'insensitive' };

    // Date filtering for returnDate
     if (filterParams.dateFrom || filterParams.dateTo) {
        filter.returnDate = {};
         try {
            if (filterParams.dateFrom) filter.returnDate.gte = new Date(filterParams.dateFrom as string);
            if (filterParams.dateTo) filter.returnDate.lte = new Date(filterParams.dateTo as string);
        } catch (e) {
             throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format for date filters. Use ISO 8601 format.');
        }
    }

    // Build Prisma OrderBy array
    const orderBy: Prisma.ReturnOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add valid sortable fields for Return model
                if (['returnOrderNumber', 'returnDate', 'status', 'totalRefundAmount', 'createdAt'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
                // Add sorting by related fields if needed
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
 * Controller to handle fetching a single return by its ID.
 */
const getReturn = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const returnId = req.params.returnId; // Return ID from URL parameter

    // Optional: Permission checks
    // Middleware `checkPermissions(['order:read:any'])` or specific 'return:read' handles basic check

    const returnRecord = await returnService.getReturnById(returnId, tenantId);
    if (!returnRecord) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Return not found');
    }
    res.status(httpStatus.OK).send(returnRecord);
});


// Export all controller methods
export const returnController = {
    processReturn,
    getReturns,
    getReturn,
};
