// src/modules/orders/order.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { orderService } from './order.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick'; // For filtering/pagination query params
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get tenantId
import { Prisma, OrderStatus } from '@prisma/client'; // Import Prisma types and enums

/**
 * Controller to handle order creation.
 */
const createOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req); // Ensures tenantId is present from auth context
    const userId = req.user!.id; // Assumes authMiddleware ensures user exists
    // req.body is validated CreateOrderDto by validateRequest middleware
    const order = await orderService.createOrder(req.body, tenantId, userId);
    // Send back the newly created order details
    res.status(httpStatus.CREATED).send(order);
});

/**
 * Controller to handle querying multiple orders with filters and pagination.
 */
const getOrders = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);

    // Define allowed filters from query parameters
    const filterParams = pick(req.query, [
        'customerId',   // Filter by customer ID
        'locationId',   // Filter by location ID
        'userId',       // Filter by user (salesperson) ID
        'status',       // Filter by exact order status
        'orderType',    // Filter by order type
        'orderNumber',  // Filter by order number (contains)
        'dateFrom',     // Filter by order date >= dateFrom
        'dateTo',       // Filter by order date <= dateTo
        'isBackordered' // Filter by backorder status ('true' or 'false')
    ]);
    // Define allowed options for sorting and pagination
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    // Build Prisma WhereInput object, always including the tenantId
    const filter: Prisma.OrderWhereInput = { tenantId }; // Automatically scope by tenant

    if (filterParams.customerId) filter.customerId = filterParams.customerId as string;
    if (filterParams.locationId) filter.locationId = filterParams.locationId as string;
    if (filterParams.userId) filter.userId = filterParams.userId as string;
    // Validate status against enum values
    if (filterParams.status && Object.values(OrderStatus).includes(filterParams.status as OrderStatus)) {
         filter.status = { equals: filterParams.status as OrderStatus };
    } else if (filterParams.status) {
         throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status value. Must be one of: ${Object.values(OrderStatus).join(', ')}`);
    }
    if (filterParams.orderType) filter.orderType = { equals: filterParams.orderType as any }; // Cast if needed for enum
    if (filterParams.orderNumber) filter.orderNumber = { contains: filterParams.orderNumber as string, mode: 'insensitive' };
    if (filterParams.isBackordered !== undefined) filter.isBackordered = filterParams.isBackordered === 'true';

    // Date filtering for orderDate
     if (filterParams.dateFrom || filterParams.dateTo) {
        filter.orderDate = {};
         try {
            if (filterParams.dateFrom) filter.orderDate.gte = new Date(filterParams.dateFrom as string);
            if (filterParams.dateTo) filter.orderDate.lte = new Date(filterParams.dateTo as string);
        } catch (e) {
             throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format for dateFrom or dateTo. Use ISO 8601 format.');
        }
    }

    // Build Prisma OrderBy array
    const orderBy: Prisma.OrderOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
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
    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    // Call the service with constructed filters and options
    const result = await orderService.queryOrders(filter, orderBy, limit, page);

    // Format and send the paginated response
    res.status(httpStatus.OK).send({
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
const getOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const orderId = req.params.orderId; // Order ID from URL parameter

    // Optional: Permission checks
    // Middleware `checkPermissions(['order:read'])` handles basic check

    const order = await orderService.getOrderById(orderId, tenantId);
    if (!order) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }
    res.status(httpStatus.OK).send(order);
});

/**
 * Controller to handle updating an order by ID (e.g., status, tracking).
 */
const updateOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const orderId = req.params.orderId;
    const userId = req.user!.id; // User performing the update
    // req.body is validated UpdateOrderDto by middleware

    // Optional: Permission checks
    // Middleware `checkPermissions(['order:update'])` handles basic check

    const order = await orderService.updateOrderById(orderId, req.body, tenantId, userId);
    res.status(httpStatus.OK).send(order);
});

/**
 * Controller to handle cancelling an order by ID.
 */
const cancelOrder = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const orderId = req.params.orderId;
    const userId = req.user!.id;
    // Optional: Get cancellation reason from request body if needed
    const reason = req.body?.reason || "Cancelled by user request";

    // Optional: Permission checks
    // Middleware `checkPermissions(['order:cancel'])` handles basic check

    // Service layer performs validation and stock reversal
    const cancelledOrder = await orderService.cancelOrderById(orderId, tenantId, userId, reason);

    // Send back the cancelled order details
    res.status(httpStatus.OK).send(cancelledOrder);
});


// Export all controller methods
export const orderController = {
    createOrder,
    getOrders,
    getOrder,
    updateOrder,
    cancelOrder, // Changed from deleteOrder to reflect action
};
