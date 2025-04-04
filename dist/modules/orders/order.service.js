"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderService = void 0;
// src/modules/orders/order.service.ts
const http_status_1 = __importDefault(require("http-status"));
const client_1 = require("@prisma/client");
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
// --- FIX: Import the stock movement helper ---
// This assumes it's exported from inventory.service.ts. Adjust the path if necessary.
// Ensure _recordStockMovement handles Prisma.Decimal correctly internally.
const inventory_service_1 = require("@/modules/inventory/inventory.service"); // Assuming service export
// --- Helper: Generate Order Number ---
async function generateOrderNumber(tenantId) {
    const prefix = "SO-";
    // WARNING: Prone to race conditions. Use DB sequence or dedicated service in production.
    const count = await config_1.prisma.order.count({ where: { tenantId } });
    const nextNum = count + 1;
    return `${prefix}${nextNum.toString().padStart(6, '0')}`;
}
/**
 * Create a new order, calculate totals, and allocate inventory.
 */
const createOrder = async (data, tenantId, userId) => {
    const logContext = { function: 'createOrder', tenantId, userId, customerId: data.customerId, locationId: data.locationId };
    // 1. Validate Location
    const location = await config_1.prisma.location.findFirst({ where: { id: data.locationId, tenantId }, select: { id: true, name: true } });
    if (!location)
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Location with ID ${data.locationId} not found.`);
    // 2. Validate Customer (if provided)
    let customer = null;
    if (data.customerId) {
        customer = await config_1.prisma.customer.findFirst({
            where: { id: data.customerId, tenantId },
            select: { id: true, firstName: true, lastName: true, email: true }
        });
        if (!customer)
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Customer with ID ${data.customerId} not found.`);
    }
    // 3. Fetch Product Details & Check Stock Availability
    const productIds = data.items.map(item => item.productId);
    const products = await config_1.prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
        include: { inventoryItems: { where: { locationId: data.locationId } } }
    });
    if (products.length !== productIds.length) {
        const missingIds = productIds.filter(id => !products.some(p => p.id === id));
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Product IDs not found: ${missingIds.join(', ')}`);
    }
    let calculatedSubtotal = new client_1.Prisma.Decimal(0);
    const orderItemsData = [];
    const stockChecks = [];
    let needsBackorder = false;
    for (const itemDto of data.items) {
        const product = products.find(p => p.id === itemDto.productId);
        if (!product)
            continue;
        const requestedQuantity = new client_1.Prisma.Decimal(itemDto.quantity);
        if (requestedQuantity.lessThanOrEqualTo(0)) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Quantity for product ${product.sku} must be positive.`);
        }
        const unitPrice = itemDto.unitPrice !== undefined
            ? new client_1.Prisma.Decimal(itemDto.unitPrice)
            : product.basePrice ?? new client_1.Prisma.Decimal(0);
        if (unitPrice.lessThan(0)) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Unit price for product ${product.sku} cannot be negative.`);
        }
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
            const availableQuantity = inventory ? inventory.quantityOnHand.minus(inventory.quantityAllocated) : new client_1.Prisma.Decimal(0);
            stockChecks.push({ productId: product.id, requested: requestedQuantity, available: availableQuantity, isTracked: true, sku: product.sku });
            if (availableQuantity.lessThan(requestedQuantity)) {
                const allowBackorder = false; // TODO: Get from config
                if (!allowBackorder) {
                    throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Insufficient stock for product ${product.sku}. Available: ${availableQuantity}, Requested: ${requestedQuantity}`);
                }
                else {
                    logContext.backorderedProduct = product.sku;
                    logger_1.default.warn(`Product ${product.sku} is backordered`, logContext);
                    needsBackorder = true;
                }
            }
        }
        else {
            stockChecks.push({ productId: product.id, requested: requestedQuantity, available: new client_1.Prisma.Decimal(Infinity), isTracked: false, sku: product.sku });
        }
    }
    // 4. Calculate Totals
    const discountTotal = new client_1.Prisma.Decimal(data.discountAmount ?? 0);
    const shippingTotal = new client_1.Prisma.Decimal(data.shippingCost ?? 0);
    const taxTotal = new client_1.Prisma.Decimal(0); // TODO: Implement Tax Calculation
    const calculatedTotal = calculatedSubtotal.minus(discountTotal).plus(shippingTotal).plus(taxTotal);
    const orderNumber = await generateOrderNumber(tenantId);
    // 5. Create Order and Allocate Stock within a Transaction
    try {
        const createdOrder = await config_1.prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    tenantId, orderNumber, customerId: data.customerId, locationId: data.locationId,
                    posTerminalId: data.posTerminalId, userId: userId,
                    orderType: data.orderType ?? client_1.OrderType.POS,
                    status: data.status ?? client_1.OrderStatus.PROCESSING,
                    orderDate: new Date(), subtotal: calculatedSubtotal, discountAmount: discountTotal,
                    taxAmount: taxTotal, shippingCost: shippingTotal, totalAmount: calculatedTotal,
                    currencyCode: 'USD', // TODO: Get from settings
                    notes: data.notes,
                    shippingAddress: data.shippingAddress ?? client_1.Prisma.JsonNull,
                    shippingMethod: data.shippingMethod,
                    isBackordered: needsBackorder,
                    items: { createMany: { data: orderItemsData } }
                },
                include: {
                    customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    location: { select: { id: true, name: true } },
                    user: { select: { id: true, firstName: true, lastName: true } },
                    items: { include: { product: { select: { id: true, sku: true, name: true } } } }
                }
            });
            logContext.orderId = order.id;
            logContext.orderNumber = order.orderNumber;
            // Allocate Stock if order is in a state that requires it
            if (order.status === client_1.OrderStatus.PROCESSING) {
                for (const stockCheck of stockChecks) {
                    if (stockCheck.isTracked && stockCheck.requested.greaterThan(0)) {
                        const orderItem = order.items.find(oi => oi.productId === stockCheck.productId);
                        if (!orderItem) {
                            throw new Error(`Consistency Error: Order item not found for product ${stockCheck.productId}`);
                        }
                        // Use the imported/available stock movement function
                        await inventory_service_1.inventoryService._recordStockMovement(tx, tenantId, userId, stockCheck.productId, data.locationId, stockCheck.requested.negated(), // Decrease stock
                        client_1.InventoryTransactionType.SALE, null, // COGS calculated later
                        { orderId: order.id, orderItemId: orderItem.id }, `Order ${order.orderNumber}`, orderItem.lotNumber, orderItem.serialNumber);
                    }
                }
                logger_1.default.info(`Stock allocated/recorded for order ${order.orderNumber}`, logContext);
            }
            else {
                logger_1.default.info(`Order created with status ${order.status}. Stock allocation skipped.`, logContext);
            }
            return order;
        });
        logger_1.default.info(`Order created successfully`, logContext);
        // Add necessary includes again if $transaction doesn't preserve them for the final return type
        // Or fetch again after transaction (less ideal)
        const finalOrder = await getOrderById(createdOrder.id, tenantId); // Fetch again with full details
        if (!finalOrder)
            throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve created order details.');
        return finalOrder; // Return the fully detailed order
    }
    catch (error) {
        if (error instanceof ApiError_1.default)
            throw error;
        logContext.error = error;
        logger_1.default.error(`Error creating order transaction`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to create order.');
    }
};
/** Query Orders */
const queryOrders = async (filter, orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    const tenantIdForLog = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext = { function: 'queryOrders', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Tenant context missing.');
    }
    try {
        const [orders, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.order.findMany({
                where: filter,
                include: {
                    customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    location: { select: { id: true, name: true } },
                    user: { select: { id: true, firstName: true, lastName: true } },
                    items: { take: 5, select: { id: true, productId: true, quantity: true, product: { select: { sku: true, name: true } } } }
                    // Note: Payments/Returns usually not included in list view for performance
                },
                orderBy, skip, take: limit,
            }),
            config_1.prisma.order.count({ where: filter }),
        ]);
        logger_1.default.debug(`Order query successful, found ${orders.length} of ${totalResults}`, logContext);
        // Cast is needed here as the include shape might differ slightly from OrderWithDetails definition
        return { orders: orders, totalResults };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying orders`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve orders.');
    }
};
/** Get Order By ID */
const getOrderById = async (orderId, tenantId) => {
    const logContext = { function: 'getOrderById', orderId, tenantId };
    try {
        const order = await config_1.prisma.order.findFirst({
            where: { id: orderId, tenantId },
            include: {
                customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                location: { select: { id: true, name: true } },
                user: { select: { id: true, firstName: true, lastName: true } },
                items: { include: { product: { select: { id: true, sku: true, name: true } } } },
                payments: true, // Include payments
                // --- FIX: Filter returns correctly using foreign key ---
                returns: { where: { originalOrderId: orderId } }
                // ------------------------------------------------------
            }
        });
        if (!order) {
            logger_1.default.warn(`Order not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Order found successfully`, logContext);
        return order; // Assert type
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching order by ID`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve order.');
    }
};
/** Update Order Status or Details */
const updateOrderById = async (orderId, updateData, tenantId, userId) => {
    const logContext = { function: 'updateOrderById', orderId, tenantId, userId, data: updateData };
    // 1. Get current order state
    const existingOrder = await config_1.prisma.order.findFirst({
        where: { id: orderId, tenantId },
        select: { id: true, status: true, notes: true, orderNumber: true } // Fetch fields needed for logic/logging
    });
    if (!existingOrder) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Order not found.');
    }
    // Basic state transition validation
    if (updateData.status && (existingOrder.status === client_1.OrderStatus.COMPLETED || existingOrder.status === client_1.OrderStatus.CANCELLED)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot update status of a ${existingOrder.status} order.`);
    }
    // 2. Prepare update payload
    const dataToUpdate = {};
    if (updateData.status !== undefined)
        dataToUpdate.status = updateData.status;
    if (updateData.shippingMethod !== undefined)
        dataToUpdate.shippingMethod = updateData.shippingMethod;
    if (updateData.trackingNumber !== undefined)
        dataToUpdate.trackingNumber = updateData.trackingNumber;
    if (updateData.notes !== undefined)
        dataToUpdate.notes = updateData.notes;
    if (updateData.shippingAddress !== undefined) {
        dataToUpdate.shippingAddress = updateData.shippingAddress ?? client_1.Prisma.JsonNull;
    }
    if (Object.keys(dataToUpdate).length === 0) {
        logger_1.default.info(`Order update skipped: No changes provided`, logContext);
        const currentOrder = await getOrderById(orderId, tenantId); // Re-fetch full details
        if (!currentOrder)
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Order not found after update check.');
        return currentOrder;
    }
    // 3. Perform Update
    try {
        const updatedOrder = await config_1.prisma.order.update({
            where: { id: orderId }, // Tenant verified by initial fetch
            data: dataToUpdate,
            include: {
                customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                location: { select: { id: true, name: true } },
                user: { select: { id: true, firstName: true, lastName: true } },
                items: { include: { product: { select: { id: true, sku: true, name: true } } } },
                payments: true,
                returns: { where: { originalOrderId: orderId } }
            }
        });
        logger_1.default.info(`Order ${existingOrder.orderNumber} updated successfully (New Status: ${updatedOrder.status})`, logContext);
        // TODO: Trigger side effects based on status change
        return updatedOrder;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error updating order`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Order not found during update attempt.');
        }
        // --- FIX: Ensure error is always thrown ---
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to update order.');
    }
    // Unreachable
};
/** Cancel an Order (Soft Delete) */
const cancelOrderById = async (orderId, tenantId, userId, reason = "Cancelled by user") => {
    const logContext = { function: 'cancelOrderById', orderId, tenantId, userId, reason };
    // 1. Get current order state
    const existingOrder = await config_1.prisma.order.findFirst({
        where: { id: orderId, tenantId },
        select: { id: true, status: true, orderNumber: true, notes: true }
    });
    if (!existingOrder) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Order not found.');
    }
    // 2. Check if cancellable
    // --- FIX: Use correct array includes check ---
    const nonCancellableStatuses = [client_1.OrderStatus.SHIPPED, client_1.OrderStatus.COMPLETED, client_1.OrderStatus.CANCELLED, client_1.OrderStatus.RETURNED];
    if (nonCancellableStatuses.includes(existingOrder.status)) {
        // ---------------------------------------------
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot cancel an order with status ${existingOrder.status}.`);
    }
    // 3. Use Transaction to update status and reverse stock allocation
    try {
        const cancelledOrder = await config_1.prisma.$transaction(async (tx) => {
            const updatedOrder = await tx.order.update({
                where: { id: orderId },
                data: {
                    status: client_1.OrderStatus.CANCELLED,
                    notes: `${existingOrder.notes ? existingOrder.notes + '\n' : ''}Cancelled: ${reason}`
                },
                include: {
                    customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    location: { select: { id: true, name: true } },
                    user: { select: { id: true, firstName: true, lastName: true } },
                    items: { include: { product: { select: { id: true, sku: true, name: true } } } }
                }
            });
            // Reverse stock movements only if allocation likely happened
            const allocatedStatuses = [client_1.OrderStatus.PROCESSING /* Add others like PARTIALLY_SHIPPED? */];
            if (allocatedStatuses.includes(existingOrder.status)) {
                const saleTransactions = await tx.inventoryTransaction.findMany({
                    where: { relatedOrderId: orderId, transactionType: client_1.InventoryTransactionType.SALE }
                });
                if (saleTransactions.length > 0) {
                    for (const saleTx of saleTransactions) {
                        await inventory_service_1.inventoryService._recordStockMovement(tx, tenantId, userId, saleTx.productId, saleTx.locationId, saleTx.quantityChange.negated(), // Reverse the change
                        client_1.InventoryTransactionType.RETURN_RESTOCK, null, { orderId: orderId, orderItemId: saleTx.relatedOrderItemId }, `Stock returned from cancelled order ${existingOrder.orderNumber}`, saleTx.lotNumber, saleTx.serialNumber);
                    }
                    logger_1.default.info(`Reversed ${saleTransactions.length} stock allocation(s) for cancelled order ${existingOrder.orderNumber}`, logContext);
                }
                else {
                    logger_1.default.warn(`Order ${existingOrder.orderNumber} was in state ${existingOrder.status} but no SALE transactions found to reverse.`, logContext);
                }
            }
            else {
                logger_1.default.info(`Order ${existingOrder.orderNumber} cancelled from status ${existingOrder.status}, stock reversal not applicable.`, logContext);
            }
            return updatedOrder;
        });
        logger_1.default.info(`Order ${existingOrder.orderNumber} cancelled successfully`, logContext);
        // Fetch again with full includes if transaction doesn't return everything needed for OrderWithDetails
        const finalOrder = await getOrderById(cancelledOrder.id, tenantId);
        if (!finalOrder)
            throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve cancelled order details.');
        return finalOrder;
    }
    catch (error) {
        if (error instanceof ApiError_1.default)
            throw error;
        logContext.error = error;
        logger_1.default.error(`Error cancelling order`, logContext);
        // --- FIX: Ensure error is always thrown ---
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to cancel order.');
    }
    // Unreachable
};
exports.orderService = {
    createOrder,
    queryOrders,
    getOrderById,
    updateOrderById,
    cancelOrderById,
    generateOrderNumber
};
//# sourceMappingURL=order.service.js.map