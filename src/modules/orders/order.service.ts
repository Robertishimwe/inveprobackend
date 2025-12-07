// src/modules/orders/order.service.ts
import httpStatus from 'http-status';
import {
    Prisma, Order, Product, Customer, Location, User, OrderItem,
    OrderStatus, InventoryTransactionType, Return, Payment, OrderType // Import all needed types
} from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
// import { CreateOrderDto, UpdateOrderDto } from './dto'; // Assuming DTOs are correct and imported
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

// --- FIX: Import the stock movement helper ---
// This assumes it's exported from inventory.service.ts. Adjust the path if necessary.
// Ensure _recordStockMovement handles Prisma.Decimal correctly internally.
import { inventoryService } from '@/modules/inventory/inventory.service'; // Assuming service export
// If _recordStockMovement is exported directly: import { _recordStockMovement } from '@/modules/inventory/inventory.service';
// If it's internal, you might need to call a public inventory service method instead.
// For this example, let's assume inventoryService has a public method recordMovement (or similar)
// that wraps _recordStockMovement OR _recordStockMovement is directly exported.
// Let's proceed assuming direct export for now:
// import { _recordStockMovement } from '@/modules/inventory/inventory.service';
// --------------------------------------------


// Define log context type if not global
type LogContext = { function?: string; tenantId?: string | null; orderId?: string | null; userId?: string | null; data?: any; error?: any;[key: string]: any; };

// Type helpers for responses
// Define explicitly which relations and fields are included for clarity
export type OrderWithDetails = Order & {
    customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'email'> | null; // Select specific customer fields
    location: Pick<Location, 'id' | 'name'>;
    user: Pick<User, 'id' | 'firstName' | 'lastName'> | null; // Salesperson
    items: (OrderItem & { product: Pick<Product, 'id' | 'sku' | 'name'> })[];
    payments?: Payment[]; // Optional include
    returns?: Return[]; // Optional include based on fix below
    // inventoryTransactions?: InventoryTransaction[]; // Optional include
};


// --- Helper: Generate Order Number ---
async function generateOrderNumber(tenantId: string): Promise<string> {
    const prefix = "SO-";
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Find the highest existing order number for this tenant
        const lastOrder = await prisma.order.findFirst({
            where: {
                tenantId,
                orderNumber: { startsWith: prefix }
            },
            orderBy: { orderNumber: 'desc' },
            select: { orderNumber: true }
        });

        let nextNum: number;
        if (lastOrder?.orderNumber) {
            // Extract the numeric part from "SO-000040" -> 40, then add 1
            const numericPart = parseInt(lastOrder.orderNumber.replace(prefix, ''), 10);
            nextNum = isNaN(numericPart) ? 1 : numericPart + 1;
        } else {
            nextNum = 1;
        }

        const orderNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;

        // Check if this number already exists (race condition check)
        const exists = await prisma.order.count({
            where: { tenantId, orderNumber }
        });

        if (exists === 0) {
            return orderNumber;
        }

        // If exists, increment and retry
        logger.warn(`Order number ${orderNumber} already exists, retrying (attempt ${attempt + 1}/${maxAttempts})`);
    }

    // If all retries fail, generate with timestamp to guarantee uniqueness
    const timestamp = Date.now().toString(36).toUpperCase();
    const fallbackNumber = `${prefix}${timestamp}`;
    logger.warn(`Falling back to timestamp-based order number: ${fallbackNumber}`);
    return fallbackNumber;
}

/**
 * Create a new order, calculate totals, and allocate inventory.
 */
const createOrder = async (data: CreateOrderDto, tenantId: string, userId: string): Promise<OrderWithDetails> => {
    const logContext: LogContext = { function: 'createOrder', tenantId, userId, customerId: data.customerId, locationId: data.locationId };

    // 1. Validate Location
    const location = await prisma.location.findFirst({ where: { id: data.locationId, tenantId }, select: { id: true, name: true } });
    if (!location) throw new ApiError(httpStatus.BAD_REQUEST, `Location with ID ${data.locationId} not found.`);

    // 2. Validate Customer (if provided)
    let customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'email'> | null = null;
    if (data.customerId) {
        customer = await prisma.customer.findFirst({
            where: { id: data.customerId, tenantId },
            select: { id: true, firstName: true, lastName: true, email: true }
        });
        if (!customer) throw new ApiError(httpStatus.BAD_REQUEST, `Customer with ID ${data.customerId} not found.`);
    }

    // 3. Fetch Product Details & Check Stock Availability
    const productIds = data.items.map(item => item.productId);
    const products = await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
        include: { inventoryItems: { where: { locationId: data.locationId } } }
    });
    if (products.length !== productIds.length) {
        const missingIds = productIds.filter(id => !products.some(p => p.id === id));
        throw new ApiError(httpStatus.BAD_REQUEST, `Product IDs not found: ${missingIds.join(', ')}`);
    }

    let calculatedSubtotal = new Prisma.Decimal(0);
    const orderItemsData: Prisma.OrderItemCreateManyOrderInput[] = [];
    const stockChecks: { productId: string, requested: Prisma.Decimal, available: Prisma.Decimal, isTracked: boolean, sku: string }[] = [];
    let needsBackorder = false;

    for (const itemDto of data.items) {
        const product = products.find(p => p.id === itemDto.productId);
        if (!product) continue;

        const requestedQuantity = new Prisma.Decimal(itemDto.quantity);
        if (requestedQuantity.lessThanOrEqualTo(0)) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Quantity for product ${product.sku} must be positive.`);
        }

        const unitPrice = itemDto.unitPrice !== undefined
            ? new Prisma.Decimal(itemDto.unitPrice)
            : product.basePrice ?? new Prisma.Decimal(0);

        if (unitPrice.lessThan(0)) { throw new ApiError(httpStatus.BAD_REQUEST, `Unit price for product ${product.sku} cannot be negative.`); }

        const lineTotal = unitPrice.times(requestedQuantity);
        calculatedSubtotal = calculatedSubtotal.plus(lineTotal);

        orderItemsData.push({
            tenantId, // Include if needed by schema
            productId: product.id,
            productSnapshot: { sku: product.sku, name: product.name, price: unitPrice.toNumber() },
            quantity: requestedQuantity,
            unitPrice: unitPrice,
            originalUnitPrice: product.basePrice,
            taxAmount: 0, taxRate: 0, // TODO: Calculate tax
            lineTotal: lineTotal,
            lotNumber: itemDto.lotNumber, serialNumber: itemDto.serialNumber, notes: itemDto.notes,
        });

        if (product.isStockTracked) {
            const inventory = product.inventoryItems[0];
            const availableQuantity = inventory ? inventory.quantityOnHand.minus(inventory.quantityAllocated) : new Prisma.Decimal(0);
            stockChecks.push({ productId: product.id, requested: requestedQuantity, available: availableQuantity, isTracked: true, sku: product.sku });

            if (availableQuantity.lessThan(requestedQuantity)) {
                const allowBackorder = false; // TODO: Get from config
                if (!allowBackorder) {
                    throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock for product ${product.sku}. Available: ${availableQuantity}, Requested: ${requestedQuantity}`);
                } else {
                    logContext.backorderedProduct = product.sku;
                    logger.warn(`Product ${product.sku} is backordered`, logContext);
                    needsBackorder = true;
                }
            }
        } else {
            stockChecks.push({ productId: product.id, requested: requestedQuantity, available: new Prisma.Decimal(Infinity), isTracked: false, sku: product.sku });
        }
    }

    // 4. Calculate Totals
    const discountTotal = new Prisma.Decimal(data.discountAmount ?? 0);
    const shippingTotal = new Prisma.Decimal(data.shippingCost ?? 0);
    const taxTotal = new Prisma.Decimal(0); // TODO: Implement Tax Calculation
    const calculatedTotal = calculatedSubtotal.minus(discountTotal).plus(shippingTotal).plus(taxTotal);
    const orderNumber = await generateOrderNumber(tenantId);

    // 5. Create Order and Allocate Stock within a Transaction
    try {
        const createdOrder = await prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    tenantId, orderNumber, customerId: data.customerId, locationId: data.locationId,
                    posTerminalId: data.posTerminalId, userId: userId,
                    orderType: data.orderType ?? OrderType.POS,
                    status: data.status ?? OrderStatus.PROCESSING,
                    orderDate: new Date(), subtotal: calculatedSubtotal, discountAmount: discountTotal,
                    taxAmount: taxTotal, shippingCost: shippingTotal, totalAmount: calculatedTotal,
                    currencyCode: 'USD', // TODO: Get from settings
                    notes: data.notes,
                    shippingAddress: data.shippingAddress as Prisma.JsonObject ?? Prisma.JsonNull,
                    shippingMethod: data.shippingMethod,
                    isBackordered: needsBackorder,
                    items: { createMany: { data: orderItemsData } }
                },
                include: { // Include relations needed for the response and stock allocation
                    customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    location: { select: { id: true, name: true } },
                    user: { select: { id: true, firstName: true, lastName: true } },
                    items: { include: { product: { select: { id: true, sku: true, name: true } } } }
                }
            });
            logContext.orderId = order.id; logContext.orderNumber = order.orderNumber;

            // Allocate Stock if order is in a state that requires it
            if (order.status === OrderStatus.PROCESSING) {
                for (const stockCheck of stockChecks) {
                    if (stockCheck.isTracked && stockCheck.requested.greaterThan(0)) {
                        const orderItem = order.items.find(oi => oi.productId === stockCheck.productId);
                        if (!orderItem) { throw new Error(`Consistency Error: Order item not found for product ${stockCheck.productId}`); }

                        // Use the imported/available stock movement function
                        await inventoryService._recordStockMovement(
                            tx, tenantId, userId, stockCheck.productId, data.locationId,
                            stockCheck.requested.negated(), // Decrease stock
                            InventoryTransactionType.SALE,
                            null, // COGS calculated later
                            { orderId: order.id, orderItemId: orderItem.id },
                            `Order ${order.orderNumber}`,
                            orderItem.lotNumber, orderItem.serialNumber
                        );
                    }
                }
                logger.info(`Stock allocated/recorded for order ${order.orderNumber}`, logContext);
            } else { logger.info(`Order created with status ${order.status}. Stock allocation skipped.`, logContext); }

            return order;
        });

        logger.info(`Order created successfully`, logContext);
        // Add necessary includes again if $transaction doesn't preserve them for the final return type
        // Or fetch again after transaction (less ideal)
        const finalOrder = await getOrderById(createdOrder.id, tenantId); // Fetch again with full details
        if (!finalOrder) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve created order details.');

        return finalOrder; // Return the fully detailed order

    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        logContext.error = error;
        logger.error(`Error creating order transaction`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create order.');
    }
};


/** Query Orders */
const queryOrders = async (
    filter: Prisma.OrderWhereInput,
    orderBy: Prisma.OrderOrderByWithRelationInput[],
    limit: number,
    page: number,
    allowedLocationIds: string[] = []
): Promise<{ orders: OrderWithDetails[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'queryOrders', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }

    const locationFilter = allowedLocationIds.includes('*') ? {} : { locationId: { in: allowedLocationIds } };

    try {
        const [orders, totalResults] = await prisma.$transaction([
            prisma.order.findMany({
                where: { ...filter, ...locationFilter },
                include: { // Include necessary details for the list view (matches OrderWithDetails partially)
                    customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    location: { select: { id: true, name: true } },
                    user: { select: { id: true, firstName: true, lastName: true } },
                    items: { take: 5, select: { id: true, productId: true, quantity: true, product: { select: { sku: true, name: true } } } }
                    // Note: Payments/Returns usually not included in list view for performance
                },
                orderBy, skip, take: limit,
            }),
            prisma.order.count({ where: { ...filter, ...locationFilter } }),
        ]);
        logger.debug(`Order query successful, found ${orders.length} of ${totalResults}`, logContext);
        // Cast is needed here as the include shape might differ slightly from OrderWithDetails definition
        return { orders: orders as OrderWithDetails[], totalResults };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying orders`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve orders.');
    }
};

/** Get Order By ID */
const getOrderById = async (orderId: string, tenantId: string): Promise<OrderWithDetails | null> => {
    const logContext: LogContext = { function: 'getOrderById', orderId, tenantId };
    try {
        const order = await prisma.order.findFirst({
            where: { id: orderId, tenantId },
            include: {
                customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                location: { select: { id: true, name: true } },
                user: { select: { id: true, firstName: true, lastName: true } },
                items: { include: { product: { select: { id: true, sku: true, name: true } } } },
                payments: true, // Include payments
                // --- FIX: Filter returns correctly using foreign key ---
                initiatedReturns: { where: { originalOrderId: orderId } }
                // ------------------------------------------------------
            }
        });
        if (!order) { logger.warn(`Order not found or tenant mismatch`, logContext); return null; }
        logger.debug(`Order found successfully`, logContext);
        return order as OrderWithDetails; // Assert type
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching order by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve order.');
    }
};

/** Update Order Status or Details */
const updateOrderById = async (orderId: string, updateData: UpdateOrderDto, tenantId: string, userId: string): Promise<OrderWithDetails> => {
    const logContext: LogContext = { function: 'updateOrderById', orderId, tenantId, userId, data: updateData };

    // 1. Get current order state
    const existingOrder = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        select: { id: true, status: true, notes: true, orderNumber: true } // Fetch fields needed for logic/logging
    });
    if (!existingOrder) { throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.'); }

    // Basic state transition validation
    if (updateData.status && (existingOrder.status === OrderStatus.COMPLETED || existingOrder.status === OrderStatus.CANCELLED)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot update status of a ${existingOrder.status} order.`);
    }

    // 2. Prepare update payload
    const dataToUpdate: Prisma.OrderUpdateInput = {};
    if (updateData.status !== undefined) dataToUpdate.status = updateData.status;
    if (updateData.shippingMethod !== undefined) dataToUpdate.shippingMethod = updateData.shippingMethod;
    if (updateData.trackingNumber !== undefined) dataToUpdate.trackingNumber = updateData.trackingNumber;
    if (updateData.notes !== undefined) dataToUpdate.notes = updateData.notes;
    if (updateData.shippingAddress !== undefined) {
        dataToUpdate.shippingAddress = updateData.shippingAddress as Prisma.JsonObject ?? Prisma.JsonNull;
    }

    if (Object.keys(dataToUpdate).length === 0) {
        logger.info(`Order update skipped: No changes provided`, logContext);
        const currentOrder = await getOrderById(orderId, tenantId); // Re-fetch full details
        if (!currentOrder) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found after update check.');
        return currentOrder;
    }

    // 3. Perform Update
    try {
        const updatedOrder = await prisma.order.update({
            where: { id: orderId }, // Tenant verified by initial fetch
            data: dataToUpdate,
            include: { // Include full details for response consistent with OrderWithDetails
                customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                location: { select: { id: true, name: true } },
                user: { select: { id: true, firstName: true, lastName: true } },
                items: { include: { product: { select: { id: true, sku: true, name: true } } } },
                payments: true,
                initiatedReturns: { where: { originalOrderId: orderId } }
            }
        });
        logger.info(`Order ${existingOrder.orderNumber} updated successfully (New Status: ${updatedOrder.status})`, logContext);
        // TODO: Trigger side effects based on status change
        return updatedOrder as OrderWithDetails;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating order`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError(httpStatus.NOT_FOUND, 'Order not found during update attempt.');
        }
        // --- FIX: Ensure error is always thrown ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update order.');
    }
    // Unreachable
};

/** Cancel an Order (Soft Delete) */
const cancelOrderById = async (orderId: string, tenantId: string, userId: string, reason: string = "Cancelled by user"): Promise<OrderWithDetails> => {
    const logContext: LogContext = { function: 'cancelOrderById', orderId, tenantId, userId, reason };

    // 1. Get current order state
    const existingOrder = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        select: { id: true, status: true, orderNumber: true, notes: true }
    });
    if (!existingOrder) { throw new ApiError(httpStatus.NOT_FOUND, 'Order not found.'); }

    // 2. Check if cancellable
    // --- FIX: Use correct array includes check ---
    const nonCancellableStatuses: OrderStatus[] = [OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.RETURNED];
    if (nonCancellableStatuses.includes(existingOrder.status)) {
        // ---------------------------------------------
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot cancel an order with status ${existingOrder.status}.`);
    }

    // 3. Use Transaction to update status and reverse stock allocation
    try {
        const cancelledOrder = await prisma.$transaction(async (tx) => {
            const updatedOrder = await tx.order.update({
                where: { id: orderId },
                data: {
                    status: OrderStatus.CANCELLED,
                    notes: `${existingOrder.notes ? existingOrder.notes + '\n' : ''}Cancelled: ${reason}`
                },
                include: { // Include details for response
                    customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    location: { select: { id: true, name: true } },
                    user: { select: { id: true, firstName: true, lastName: true } },
                    items: { include: { product: { select: { id: true, sku: true, name: true } } } }
                }
            });

            // Reverse stock movements only if allocation likely happened
            const allocatedStatuses: OrderStatus[] = [OrderStatus.PROCESSING /* Add others like PARTIALLY_SHIPPED? */];
            if (allocatedStatuses.includes(existingOrder.status)) {
                const saleTransactions = await tx.inventoryTransaction.findMany({
                    where: { relatedOrderId: orderId, transactionType: InventoryTransactionType.SALE }
                });

                if (saleTransactions.length > 0) {
                    for (const saleTx of saleTransactions) {
                        await inventoryService._recordStockMovement(
                            tx, tenantId, userId, saleTx.productId, saleTx.locationId,
                            saleTx.quantityChange.negated(), // Reverse the change
                            InventoryTransactionType.RETURN_RESTOCK,
                            null,
                            { orderId: orderId, orderItemId: saleTx.relatedOrderItemId },
                            `Stock returned from cancelled order ${existingOrder.orderNumber}`,
                            saleTx.lotNumber,
                            saleTx.serialNumber
                        );
                    }
                    logger.info(`Reversed ${saleTransactions.length} stock allocation(s) for cancelled order ${existingOrder.orderNumber}`, logContext);
                } else {
                    logger.warn(`Order ${existingOrder.orderNumber} was in state ${existingOrder.status} but no SALE transactions found to reverse.`, logContext);
                }
            } else {
                logger.info(`Order ${existingOrder.orderNumber} cancelled from status ${existingOrder.status}, stock reversal not applicable.`, logContext);
            }

            return updatedOrder;
        });
        logger.info(`Order ${existingOrder.orderNumber} cancelled successfully`, logContext);
        // Fetch again with full includes if transaction doesn't return everything needed for OrderWithDetails
        const finalOrder = await getOrderById(cancelledOrder.id, tenantId);
        if (!finalOrder) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve cancelled order details.');
        return finalOrder;
    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        logContext.error = error;
        logger.error(`Error cancelling order`, logContext);
        // --- FIX: Ensure error is always thrown ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to cancel order.');
    }
    // Unreachable
};


export const orderService = {
    createOrder,
    queryOrders,
    getOrderById,
    updateOrderById,
    cancelOrderById,
    generateOrderNumber
};
