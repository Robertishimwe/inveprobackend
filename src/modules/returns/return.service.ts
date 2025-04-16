// src/modules/returns/return.service.ts
import httpStatus from 'http-status';
import {
    Prisma, Order, Return, ReturnItem, ReturnStatus, ReturnItemCondition, Product, PaymentMethod, PaymentStatus,
    InventoryTransactionType, PosTransactionType, OrderStatus, Customer, Location, User, Payment, OrderItem// Ensure all used types are imported
} from '@prisma/client';
import { prisma } from '@/config'; // Centralized Prisma client
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { CreateReturnDto } from './dto'; // Import DTOs
// import {_updateInventoryItemQuantity } from '@/modules/inventory/inventory.service'; // Assuming these helpers exist and are exported correctly
import { purchaseOrderService } from '../purchase-order/purchase-order.service';
// import { OrderWithDetails } from '@/modules/orders/order.service'; // For type consistency if needed

// Define log context type if not already defined globally
type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; returnId?: string | null; orderId?: string | null; posSessionId?: string | null; data?: any; error?: any; [key: string]: any; };
type PartialProductForReturn = Pick<Product, 'id' | 'basePrice' | 'name' | 'sku' | 'isStockTracked'>;

// Define Return type with included details for response consistency
export type ReturnWithDetails = Return & {
    location: Pick<Location, 'id'|'name'>;
    processedByUser: Pick<User, 'id'|'firstName'|'lastName'> | null;
    customer: Pick<Customer, 'id'|'firstName'|'lastName'|'email'> | null;
    originalOrder?: Pick<Order, 'id'|'orderNumber'> | null;
    items: (ReturnItem & { product: Pick<Product, 'id'|'sku'|'name'> })[];
    refundPayments: Payment[];
};


// --- Helper: Generate Return Number ---
async function generateReturnNumber(tenantId: string, tx: Prisma.TransactionClient): Promise<string> {
    const prefix = "RTN-";
    const sequenceName = "GlobalReturnNumberSeq"; // RECOMMEND: Create a dedicated DB sequence
    // Fallback count (NOT production safe)
    // const count = await tx.return.count({ where: { tenantId } });
    // const nextNum = count + 1;
    // const returnNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;
    try {
        const result = await tx.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('"${sequenceName}"')`);
        if (!result || result.length === 0 || typeof result[0]?.nextval !== 'bigint') { throw new Error('Failed to get next value from Return sequence.'); }
        const nextNum = result[0].nextval;
        const returnNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;
        // Uniqueness check less critical with sequence, but can keep as safeguard if paranoid
        // const exists = await tx.return.count({ where: { tenantId, returnOrderNumber: returnNumber }});
        // if (exists > 0) throw new Error("Return number collision detected.");
        return returnNumber;
    } catch (seqError: any) {
        logger.error(`Error fetching Return number from sequence ${sequenceName}`, { tenantId, error: seqError });
         if (seqError?.code === '42P01') { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `DB sequence "${sequenceName}" not found.`); }
         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Could not generate Return number.`);
    }
}


/**
 * Process a Customer Return and associated refunds/inventory updates.
 */
const processReturn = async (
    data: CreateReturnDto,
    tenantId: string,
    userId: string,
    locationId: string,
    posSessionId?: string | null
): Promise<ReturnWithDetails> => {

    const logContext: LogContext = { function: 'processReturn', tenantId, userId, locationId, posSessionId, originalOrderId: data.originalOrderId, customerId: data.customerId };
    const startTime = Date.now();
    logger.info("Starting return process", logContext);

    // --- Pre-computation and Validation (outside transaction) ---

    // 1. Validate Location
    const location = await prisma.location.findFirst({ where: { id: locationId, tenantId, isActive: true }, select: { id: true } });
    if (!location) throw new ApiError(httpStatus.BAD_REQUEST, `Active processing location ID ${locationId} not found.`);

    // 2. Fetch Original Order (if ID provided) and validate items against it
    let originalOrder: Order & { items: OrderItem[] } | null = null;
    const originalOrderItemsMap = new Map<string, OrderItem>(); // Map OrderItem ID -> OrderItem
    if (data.originalOrderId) {
        originalOrder = await prisma.order.findUnique({
            where: { id: data.originalOrderId, tenantId: tenantId },
            include: { items: true }
        });
        if (!originalOrder) throw new ApiError(httpStatus.BAD_REQUEST, `Original order ID ${data.originalOrderId} not found.`);
        // if ([OrderStatus.CANCELLED, OrderStatus.RETURNED].includes(originalOrder.status)) {
        //     throw new ApiError(httpStatus.BAD_REQUEST, `Original order has status ${originalOrder.status} and cannot be returned against.`);
        // }
        if (originalOrder.status === OrderStatus.CANCELLED || originalOrder.status === OrderStatus.RETURNED) {
            logger.warn(`Return failed: Original order status is ${originalOrder.status}`, logContext);
            throw new ApiError(httpStatus.BAD_REQUEST, `Original order has status ${originalOrder.status} and cannot be returned against.`);
       }
        // Ensure customer matches if both are provided
        if (data.customerId && originalOrder.customerId !== data.customerId) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Customer ID ${data.customerId} does not match original order.`);
        }
        // Use customer from original order if none provided in DTO
        data.customerId = data.customerId ?? originalOrder.customerId;
        logContext.customerId = data.customerId; // Update context
        // Populate map for easy lookup
        originalOrder.items.forEach(item => originalOrderItemsMap.set(item.id, item));
    } else {
        // Blind return validation
        logger.warn(`Processing blind return`, logContext);
        if (data.customerId) {
            const customerExists = await prisma.customer.count({ where: { id: data.customerId, tenantId }});
            if (!customerExists) throw new ApiError(httpStatus.BAD_REQUEST, `Customer ID ${data.customerId} not found.`);
        }
        // Check if all items in a blind return have an originalOrderItemId (which they shouldn't)
        if (data.items.some(item => item.originalOrderItemId)) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Original Order Item ID should not be provided for blind returns.');
        }
    }

    // 3. Fetch Products and Prepare Item Data / Validate Quantities
    const productIds = data.items.map(item => item.productId);
    if (productIds.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Return must include at least one item.');
    // const productsMap = new Map<string, Product>(); // Map Product ID -> Product
    const productsMap = new Map<string, PartialProductForReturn>();
    const products = await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId }, // Don't strictly need isActive check here, can return inactive items
        select: { id: true, basePrice: true, name: true, sku: true, isStockTracked: true }
    });
    if (products.length !== productIds.length) {
        const foundIds = products.map(p => p.id);
        const missingIds = productIds.filter(id => !foundIds.includes(id));
        throw new ApiError(httpStatus.BAD_REQUEST, `Invalid Product IDs found: ${missingIds.join(', ')}`);
    }
    products.forEach(p => productsMap.set(p.id, p)); // Populate map

    // --- Prepare data structures needed inside transaction ---
    let calculatedRefundSubtotal = new Prisma.Decimal(0);
    // const returnItemsData: Prisma.ReturnItemCreateManyReturnInput[] = [];
    const returnItemsData: Prisma.ReturnItemCreateManyInput[] = [];
    // const returnItemsInputData: Prisma.ReturnItemCreateManyReturnInput[] = [];
    const inventoryUpdateTasks: {
      productId: string;
      quantity: Prisma.Decimal;
      condition: ReturnItemCondition;
      restock: boolean;
      sku: string;
      lot?: string | null;
      serial?: string | null;
      returnItemId?: string /* To be added later */;
      originalOrderItemId?: string | null;
    }[] = [];
    const orderItemUpdateTasks: { id: string; quantity: Prisma.Decimal }[] = [];

    // 4. Process and Validate each Return Item DTO
    for (const itemDto of data.items) {
        const product = productsMap.get(itemDto.productId);
        if (!product) continue; // Should have been caught already

        const returnQuantity = new Prisma.Decimal(itemDto.quantity);
        if (returnQuantity.lessThanOrEqualTo(0)) throw new ApiError(httpStatus.BAD_REQUEST, `Return quantity for product ${product.sku} must be positive.`);

        let unitRefundPrice: Prisma.Decimal;
        let originalOrderItemIdForRecord: string | null = null;

        if (originalOrder) { // Linked return validation
            if (!itemDto.originalOrderItemId) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Original Order Item ID is required for product ${product.sku} when returning against order ${originalOrder.orderNumber}.`);
            }
            const originalItem = originalOrderItemsMap.get(itemDto.originalOrderItemId);
            if (!originalItem || originalItem.productId !== itemDto.productId) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Original order item ID ${itemDto.originalOrderItemId} not found on order ${originalOrder.orderNumber} or product mismatch.`);
            }
            originalOrderItemIdForRecord = originalItem.id;

            const maxReturnable = originalItem.quantity.minus(originalItem.quantityReturned);
            if (returnQuantity.greaterThan(maxReturnable)) {
                 throw new ApiError(httpStatus.BAD_REQUEST, `Cannot return quantity ${returnQuantity} for ${product.sku} from order item ${originalItem.id}. Max returnable: ${maxReturnable}.`);
            }
            // Use original price paid unless overridden and allowed
            unitRefundPrice = itemDto.unitRefundPrice !== undefined
                ? new Prisma.Decimal(itemDto.unitRefundPrice) // TODO: Add permission check for price override?
                : originalItem.unitPrice;

            // Queue original order item update
            orderItemUpdateTasks.push({ id: originalOrderItemIdForRecord, quantity: returnQuantity });

        } else { // Blind return validation
            originalOrderItemIdForRecord = null;
            if (itemDto.unitRefundPrice !== undefined) {
                 unitRefundPrice = new Prisma.Decimal(itemDto.unitRefundPrice); // Use provided price
            } else {
                 // TODO: Configurable blind return pricing logic
                 unitRefundPrice = product.basePrice ?? new Prisma.Decimal(0); // Default: current base price
            }
            // TODO: Add manager override/approval logic for blind returns if needed
        }

        if (unitRefundPrice.lessThan(0)) throw new ApiError(httpStatus.BAD_REQUEST, `Refund price for product ${product.sku} cannot be negative.`);

        const lineRefundAmount = unitRefundPrice.times(returnQuantity);
        calculatedRefundSubtotal = calculatedRefundSubtotal.plus(lineRefundAmount);

        const shouldRestock = itemDto.restock ?? (itemDto.condition === ReturnItemCondition.SELLABLE);

        // Prepare ReturnItem data for nested createMany
        returnItemsData.push({
            tenantId, // Required if model has tenantId
            returnId: '', // Placeholder, will be filled in transaction
            originalOrderItemId: originalOrderItemIdForRecord,
            productId: product.id,
            quantity: returnQuantity,
            unitRefundAmount: unitRefundPrice,
            lineRefundAmount: lineRefundAmount,
            condition: itemDto.condition,
            restock: shouldRestock,
        });

        // Prepare inventory update task if tracked
        if (product.isStockTracked && returnQuantity.greaterThan(0)) {
             inventoryUpdateTasks.push({
                productId: product.id, quantity: returnQuantity, condition: itemDto.condition,
                restock: shouldRestock, sku: product.sku,
                lot: itemDto.lotNumber, serial: itemDto.serialNumber
            });
        }
    } // End item processing loop

    // 5. Validate Refund Payment Totals
    const totalRefundPayment = data.refundPayments.reduce((sum, p) => {
        const amount = new Prisma.Decimal(p.amount);
        if(amount.lessThanOrEqualTo(0)) throw new ApiError(httpStatus.BAD_REQUEST, `Refund payment amount must be positive for method ${p.paymentMethod}.`);
        return sum.plus(amount);
    }, new Prisma.Decimal(0));

    // TODO: Calculate total refunded tax if applicable
    const calculatedTotalRefund = calculatedRefundSubtotal; // Add tax refund here
    if (!totalRefundPayment.equals(calculatedTotalRefund)) {
         throw new ApiError(httpStatus.BAD_REQUEST, `Refund payment total (${totalRefundPayment}) does not match calculated return items total (${calculatedTotalRefund}).`);
    }

    // --- Transactional Operations ---
    const transactionStartTime = Date.now();
    logger.debug("Starting return processing transaction", logContext);
    try {
        const createdReturnWithDetails = await prisma.$transaction(async (tx) => {
            // 1. Generate Return Number
            const returnNumber = await generateReturnNumber(tenantId, tx);
            logContext.returnNumber = returnNumber;

            // 2. Create Return Header and nested ReturnItems
            const returnHeader = await tx.return.create({
                data: {
                    tenantId, originalOrderId: data.originalOrderId ?? '', 
                    // returnOrderNumber: returnNumber,
                    returnDate: new Date(), 
                    reason: data.reason, 
                    // notes: data.notes,
                    processedByUserId: userId, totalRefundAmount: calculatedTotalRefund,
                    status: ReturnStatus.COMPLETED, // Assume completed immediately
                    locationId: locationId, 
                    // posSessionId: posSessionId, customerId: data.customerId,
                    items: { createMany: { data: returnItemsData } } // Create items via relation
                },
                 // Include items to get their generated IDs for linking inventory tx
                 include: { items: { select: { id: true, productId: true, originalOrderItemId: true, quantity: true }}}
            });
            logContext.returnId = returnHeader.id;

            // Map created return item IDs for linking inventory tx
            const returnItemMap = new Map(returnHeader.items.map(ri => [`${ri.productId}-${ri.originalOrderItemId ?? 'blind'}`, ri.id]));

            // 3. Create Refund Payment Records linked to the Return
            const refundPaymentsData: Prisma.PaymentCreateManyInput[] = data.refundPayments.map(p => ({
                tenantId, paymentMethod: p.paymentMethod, amount: new Prisma.Decimal(p.amount),
                currencyCode: 'USD', status: PaymentStatus.COMPLETED, // TODO: Use tenant/order currency
                transactionReference: p.transactionReference, paymentDate: new Date(),
                processedByUserId: userId, isRefund: true,
                returnId: returnHeader.id, // Link payment to the return
                orderId: data.originalOrderId ?? '' // Provide a default value if undefined
            }));
            if (refundPaymentsData.length > 0) {
                await tx.payment.createMany({ data: refundPaymentsData });
                logger.debug(`Created ${refundPaymentsData.length} refund payment records`, logContext);
            }

            // 4. Log CASH refund to POS Session Transaction log
            const cashRefund = data.refundPayments.find(p => p.paymentMethod === PaymentMethod.CASH);
            if (cashRefund && posSessionId) {
                 await tx.posSessionTransaction.create({
                     data: {
                         tenantId, posSessionId: posSessionId,
                         transactionType: PosTransactionType.CASH_REFUND,
                         amount: new Prisma.Decimal(cashRefund.amount), // Amount refunded
                         relatedOrderId: returnHeader.id,
                         notes: `Cash refund for Return ${returnNumber}`
                     }
                 });
                 logger.debug(`Logged CASH_REFUND to POS session ${posSessionId}`, logContext);
            }

            // 5. Update Inventory & Original Order Item quantities
            const inventoryTxDataBatch: Prisma.InventoryTransactionCreateManyInput[] = [];
            for (const invUpdate of inventoryUpdateTasks) {
                 // Find the ID of the just-created return item
                 const returnItemId = returnItemMap.get(`${invUpdate.productId}-${orderItemUpdateTasks.find(o => o.id === invUpdate.originalOrderItemId)?.id ?? 'blind'}`); // Crude mapping, improve if needed

                 let txType: InventoryTransactionType;
                 let invQuantityChange = new Prisma.Decimal(0);

                 if (invUpdate.restock && invUpdate.condition === ReturnItemCondition.SELLABLE) {
                     txType = InventoryTransactionType.RETURN_RESTOCK; invQuantityChange = invUpdate.quantity;
                 } else {
                     txType = InventoryTransactionType.RETURN_DISPOSE; invQuantityChange = invUpdate.quantity.negated();
                 }

                 // Update stock level using helper
                 await purchaseOrderService._updateInventoryItemQuantity(tx, tenantId, invUpdate.productId, locationId, invQuantityChange);

                 // Prepare transaction log data
                 inventoryTxDataBatch.push({
                     tenantId, productId: invUpdate.productId, locationId: locationId,
                     transactionType: txType, quantityChange: invQuantityChange,
                     unitCost: null, // Cost adjustment is complex
                     relatedReturnItemId: returnItemId, // Link to return item
                     notes: `Return ${returnNumber} (${invUpdate.condition})`,
                     lotNumber: invUpdate.lot, serialNumber: invUpdate.serial, userId,
                     expiryDate: undefined // Add if needed
                 });
            }
            // Batch create inventory transactions
            if (inventoryTxDataBatch.length > 0) {
                 await tx.inventoryTransaction.createMany({ data: inventoryTxDataBatch });
                 logContext.inventoryTxCreated = inventoryTxDataBatch.length;
                 logger.debug(`Batch created ${inventoryTxDataBatch.length} inventory transactions for return`, logContext);
            }

            // Update original order item returned quantities
            for (const orderItemUpdate of orderItemUpdateTasks) {
                 await tx.orderItem.update({
                     where: { id: orderItemUpdate.id },
                     data: { quantityReturned: { increment: orderItemUpdate.quantity } }
                 });
            }

            // 6. Update original order status (if linked)
            if (originalOrder) {
                 const updatedOrderItems = await tx.orderItem.findMany({ where: { orderId: originalOrder.id }, select: { quantity: true, quantityReturned: true }});
                 const totalOrderedQty = updatedOrderItems.reduce((sum, i) => sum.plus(i.quantity), new Prisma.Decimal(0));
                 const totalReturnedQty = updatedOrderItems.reduce((sum, i) => sum.plus(i.quantityReturned), new Prisma.Decimal(0));
                 let newOrderStatus = originalOrder.status;
                 const tolerance = new Prisma.Decimal('0.00001');

                 if (totalReturnedQty.greaterThan(0)) {
                     if (totalReturnedQty.plus(tolerance).greaterThanOrEqualTo(totalOrderedQty)) { newOrderStatus = OrderStatus.RETURNED; }
                     else { newOrderStatus = OrderStatus.PARTIALLY_RETURNED; }
                 }
                 if (newOrderStatus !== originalOrder.status && originalOrder.status !== OrderStatus.RETURNED) {
                     await tx.order.update({ where: { id: originalOrder.id }, data: { status: newOrderStatus }});
                     logContext.originalOrderStatusUpdated = newOrderStatus;
                 }
            }

            // 7. Fetch final return details for response
            const finalReturn = await tx.return.findUniqueOrThrow({
                where: { id: returnHeader.id },
                 include: { // Match ReturnWithDetails type
                    // location: { select: { id: true, name: true } },
                    processedByUser: { select: { id: true, firstName: true, lastName: true } },
                    // customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    originalOrder: { select: { id: true, orderNumber: true }},
                    items: { include: { product: { select: { id: true, sku: true, name: true } } }, orderBy: { id: 'asc' } },
                    // refundPayments: true
                 }
            });
            return finalReturn;
        }, { timeout: 60000 }); // Increased timeout for potentially complex return logic

        const transactionEndTime = Date.now();
        logContext.durationMs = transactionEndTime - startTime;
        logContext.txDurationMs = transactionEndTime - transactionStartTime;
        logger.info(`Return processed successfully`, logContext);
        return createdReturnWithDetails as ReturnWithDetails;

    } catch (error: any) {
        const errorEndTime = Date.now();
        logContext.durationMs = errorEndTime - startTime;
        logContext.txDurationMs = transactionStartTime ? errorEndTime - transactionStartTime : undefined;
        if (error instanceof ApiError) {
             logContext.apiError = { statusCode: error.statusCode, message: error.message };
             logger.warn(`Return processing failed: ${error.message}`, logContext);
            throw error;
        }
        logContext.error = error;
        logger.error(`Error processing return transaction`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
             throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Return process conflict or timed out. Please try again.');
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to process return: ${error.message || 'Internal Server Error'}`);
    }
};

/** Query Returns */
const queryReturns = async (
    filter: Prisma.ReturnWhereInput,
    orderBy: Prisma.ReturnOrderByWithRelationInput[],
    limit: number,
    page: number
): Promise<{ returns: Return[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'queryReturns', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }

    try {
        const [returns, totalResults] = await prisma.$transaction([
            prisma.return.findMany({
                where: filter,
                include: { // Include minimal related data for list view
                    // location: { select: { id: true, name: true } },
                    processedByUser: { select: { id: true, firstName: true, lastName: true } },
                    // customer: { select: { id: true, firstName: true, lastName: true } },
                    originalOrder: { select: { id: true, orderNumber: true }},
                    _count: { select: { items: true } }
                },
                orderBy, skip, take: limit,
            }),
            prisma.return.count({ where: filter }),
        ]);
        logger.debug(`Return query successful, found ${returns.length} of ${totalResults}`, logContext);
        return { returns, totalResults };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying returns`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve returns.');
    }
};

/** Get details of a specific Return by ID */
const getReturnById = async (returnId: string, tenantId: string): Promise<ReturnWithDetails | null> => {
    const logContext: LogContext = { function: 'getReturnById', returnId, tenantId };
    try {
        const returnRecord = await prisma.return.findFirst({
            where: { id: returnId, tenantId },
            include: { // Include full details matching ReturnWithDetails type
                location: { select: { id: true, name: true } },
                processedByUser: { select: { id: true, firstName: true, lastName: true } },
                customer: { select: { id: true, firstName: true, lastName: true, email: true } }, // Ensure 'customer' relation exists in Prisma schema
                originalOrder: { select: { id: true, orderNumber: true }},
                items: {
                    include: { product: { select: { id: true, sku: true, name: true } } },
                    orderBy: { id: 'asc' }
                },
                refundPayments: true
            }
        });
        if (!returnRecord) {
            logger.warn(`Return not found or tenant mismatch`, logContext);
            return null;
        }
        logger.debug(`Return found successfully`, logContext);
        return returnRecord as ReturnWithDetails;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching return by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve return.');
    }
};


// Export the relevant service methods
export const returnService = {
    processReturn,
    queryReturns,
    getReturnById,
};