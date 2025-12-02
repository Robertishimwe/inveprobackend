// src/modules/returns/return.service.ts
import httpStatus from 'http-status';
import {
    Prisma, Return, ReturnItem, ReturnStatus, ReturnItemCondition, Order, OrderItem, Payment,
    PaymentStatus, InventoryTransactionType, PosTransactionType, PaymentMethod, Location, Customer, User, Product, OrderStatus // Import necessary types/enums
} from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { CreateReturnDto } from './dto'; // DTOs for create/update
// Assuming inventory service helper exists and is correctly imported/defined
// import { inventoryService } from '@/modules/inventory/inventory.service'; // Use the separated helper
import { purchaseOrderService } from '../purchase-order/purchase-order.service';

// Define log context type if not already defined globally
type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; returnId?: string | null; orderId?: string | null; data?: any; error?: any;[key: string]: any; };

// Type helper for detailed return response
export type ReturnWithDetails = Return & {
    originalOrder: Pick<Order, 'id' | 'orderNumber'>;
    location: Pick<Location, 'id' | 'name'>;
    customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'email'> | null;
    processedByUser: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
    items: (ReturnItem & {
        product: Pick<Product, 'id' | 'sku' | 'name'>;
        originalOrderItem?: Pick<OrderItem, 'id' | 'unitPrice' | 'quantity'> | null;
    })[];
    refundPayments: Payment[];
    exchangeOrder?: Pick<Order, 'id' | 'orderNumber'> | null;
};

// Helper: Generate Return Number
async function generateReturnNumber(tenantId: string, tx: Prisma.TransactionClient): Promise<string> {
    const prefix = "RTN-";
    // WARNING: Use DB sequence in production.
    const count = await tx.return.count({ where: { tenantId } });
    const nextNum = count + 1;
    const returnNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;
    const exists = await tx.return.count({ where: { tenantId, returnNumber } });
    if (exists > 0) throw new Error(`Generated Return Number ${returnNumber} collision.`);
    return returnNumber;
}


/** Create a new Return record and associated items/refunds. */
const createReturn = async (
    data: CreateReturnDto,
    tenantId: string,
    userId: string
): Promise<ReturnWithDetails> => {
    const logContext: LogContext = { function: 'createReturn', tenantId, userId, orderId: data.originalOrderId, data };

    // --- Pre-computation & Validation ---
    const originalOrder = await prisma.order.findFirst({
        where: { id: data.originalOrderId, tenantId },
        include: { items: true } // Include items for validation
    });
    if (!originalOrder) throw new ApiError(httpStatus.NOT_FOUND, `Original order ${data.originalOrderId} not found.`);

    // --- FIX 1: Use explicit status checks ---
    const forbiddenReturnStatuses: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT];
    if (forbiddenReturnStatuses.includes(originalOrder.status)) {
        // ---------------------------------------
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot return items from an order with status ${originalOrder.status}.`);
    }

    const location = await prisma.location.findFirst({ where: { id: data.locationId, tenantId, isActive: true }, select: { id: true } });
    if (!location) throw new ApiError(httpStatus.BAD_REQUEST, `Return processing location ${data.locationId} not found or inactive.`);

    if (data.customerId && data.customerId !== originalOrder.customerId) { /* Optional warning */ }
    const finalCustomerId = data.customerId ?? originalOrder.customerId;

    if (data.posSessionId) { /* Validate session */ }

    let calculatedRefundSubtotal = new Prisma.Decimal(0);
    // --- FIX 2: Use correct input type ---
    const returnItemsCreateInput: Prisma.ReturnItemCreateWithoutReturnRequestInput[] = [];
    // ----------------------------------
    const stockAdjustments: { productId: string, locationId: string, quantityChange: Prisma.Decimal, unitCost: Prisma.Decimal | null, lot?: string | null, serial?: string | null, condition: ReturnItemCondition, returnItemId?: string }[] = [];

    // Map original items for easier lookup during validation
    const originalItemsMap = new Map(originalOrder.items.map(item => [item.id, item]));

    for (const itemDto of data.items) {
        let originalItem: OrderItem | undefined;
        if (itemDto.originalOrderItemId) {
            originalItem = originalItemsMap.get(itemDto.originalOrderItemId);
            // Extra check: Ensure the product ID matches if originalOrderItemId is provided
            if (originalItem && originalItem.productId !== itemDto.productId) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Product ID ${itemDto.productId} does not match the original order item ${itemDto.originalOrderItemId}.`);
            }
        } else {
            // If no original ID, try to find *an* item for that product on the order (less precise)
            originalItem = originalOrder.items.find(oi => oi.productId === itemDto.productId);
        }

        if (!originalItem) { throw new ApiError(httpStatus.BAD_REQUEST, `Item with Product ID ${itemDto.productId} (or Order Item ID ${itemDto.originalOrderItemId}) not found on the original order.`); }

        const quantityToReturn = new Prisma.Decimal(itemDto.quantity);
        if (quantityToReturn.lessThanOrEqualTo(0)) continue;

        // Calculate remaining quantity available to return for this specific line item
        const alreadyReturnedResult = await prisma.returnItem.aggregate({ _sum: { quantity: true }, where: { originalOrderItemId: originalItem.id } });
        const quantityAlreadyReturned = alreadyReturnedResult._sum.quantity ?? new Prisma.Decimal(0);
        const maxReturnable = originalItem.quantity.minus(quantityAlreadyReturned);

        if (quantityToReturn.greaterThan(maxReturnable)) { throw new ApiError(httpStatus.BAD_REQUEST, `Cannot return quantity ${quantityToReturn} for Product ${itemDto.productId} (Order Item ${originalItem.id}). Max returnable: ${maxReturnable}.`); }

        const unitRefundAmount = itemDto.unitRefundAmount !== undefined ? new Prisma.Decimal(itemDto.unitRefundAmount) : originalItem.unitPrice;
        const lineRefundAmount = unitRefundAmount.times(quantityToReturn);
        calculatedRefundSubtotal = calculatedRefundSubtotal.plus(lineRefundAmount);

        // --- FIX 2: Use correct nested create syntax ---
        returnItemsCreateInput.push({
            tenantId,
            product: { connect: { id: itemDto.productId } }, // Connect product
            originalOrderItem: itemDto.originalOrderItemId ? { connect: { id: itemDto.originalOrderItemId } } : undefined, // Connect original item if ID provided
            quantity: quantityToReturn, unitRefundAmount: unitRefundAmount, lineRefundAmount: lineRefundAmount,
            condition: itemDto.condition, lotNumber: itemDto.lotNumber, serialNumber: itemDto.serialNumber,
            restock: itemDto.condition === ReturnItemCondition.SELLABLE,
        });
        // ------------------------------------------

        // Prepare Stock Adjustment info
        if (itemDto.condition === ReturnItemCondition.SELLABLE) {
            stockAdjustments.push({ productId: itemDto.productId, locationId: data.locationId, quantityChange: quantityToReturn, unitCost: null, lot: itemDto.lotNumber, serial: itemDto.serialNumber, condition: itemDto.condition });
        } else { logger.info(`Item ${itemDto.productId} returned non-sellable (${itemDto.condition}), not restocking.`, logContext); }
    }

    if (returnItemsCreateInput.length === 0) { throw new ApiError(httpStatus.BAD_REQUEST, "No valid items provided for return."); }

    // Validate Refund Payments Total
    const totalRefundPayment = data.refundPayments?.reduce((sum, p) => sum.plus(new Prisma.Decimal(p.amount)), new Prisma.Decimal(0)) ?? new Prisma.Decimal(0);
    if (!totalRefundPayment.equals(calculatedRefundSubtotal)) {
        logger.warn(
            `Refund payment total (${totalRefundPayment}) does not match calculated item refund subtotal (${calculatedRefundSubtotal}) for original order ${data.originalOrderId}. Proceeding with provided payment amount.`,
            logContext // Pass the existing context
        );
        // NOTE: Depending on business rules, you might want to:
        // 1. Throw an ApiError(httpStatus.BAD_REQUEST, 'Refund payment total does not match...') instead of just warning.
        // 2. Adjust the refund logic (e.g., only process up to calculatedSubtotal, handle difference).
        // Current implementation allows processing the provided payment amounts even if they differ.
    }
    const finalTotalRefundAmount = totalRefundPayment;


    // --- Transactional Operations ---
    try {
        const createdReturnWithDetails = await prisma.$transaction(async (tx) => {
            // 1. Generate Return Number
            const returnNumber = await generateReturnNumber(tenantId, tx);
            logContext.returnNumber = returnNumber;

            // 2. Create Return Header and nested Items
            const returnHeader = await tx.return.create({

                data: { // ALL direct fields go here
                    tenantId,
                    returnNumber,
                    originalOrderId: data.originalOrderId,
                    locationId: data.locationId,
                    customerId: finalCustomerId,
                    returnDate: new Date(),
                    reason: data.reason,
                    processedByUserId: userId,
                    totalRefundAmount: finalTotalRefundAmount,
                    status: ReturnStatus.COMPLETED,
                    // notes: data.notes, // <<< Correctly placed here
                    // Nested write for the relation
                    items: { create: returnItemsCreateInput }
                },
                // data: {
                //     tenantId, returnNumber, originalOrderId: data.originalOrderId,
                //     locationId: data.locationId, customerId: finalCustomerId,
                //     returnDate: new Date(), reason: data.reason, processedByUserId: userId,
                //     totalRefundAmount: finalTotalRefundAmount, status: ReturnStatus.COMPLETED, // Assume immediate completion for POS/simple returns
                //     // --- FIX 3: Add notes here ---
                //     notes: data.notes,
                //     // ----------------------------
                //     items: { create: returnItemsCreateInput } // Use corrected nested create input
                // },
                // --- FIX 4: Include items here with ID to link stock adjustments ---
                include: { items: { select: { id: true, productId: true, lotNumber: true, serialNumber: true } } }
                // ----------------------------------------------------------------
            });
            logContext.returnId = returnHeader.id;

            // --- FIX 4: Create map from *created* return items ---
            //  const createdReturnItemMap = new Map(returnHeader.items.map(item => [`${item.productId}-${item.lotNumber ?? ''}-${item.serialNumber ?? ''}`, item.id])); // Create a composite key for lookup if needed, or just product ID if unique per return
            const createdReturnItemMapByProdId = new Map(returnHeader.items.map(item => [item.productId, item.id])); // Simpler map if one line per product
            // ------------------------------------------------------

            // 3. Create Refund Payment Records
            if (data.refundPayments && data.refundPayments.length > 0) {
                const refundPaymentsData: Prisma.PaymentCreateManyInput[] = data.refundPayments.map(p => ({ // <<< FIX 5: Use PaymentCreateManyInput
                    tenantId,
                    orderId: data.originalOrderId, // Link to original order
                    returnId: returnHeader.id,     // Link payment *to this return*
                    paymentMethod: p.paymentMethod,
                    amount: new Prisma.Decimal(p.amount), // Store positive amount for refund payment record
                    currencyCode: originalOrder.currencyCode,
                    status: PaymentStatus.COMPLETED, // Assume refund processed
                    transactionReference: p.transactionReference,
                    paymentDate: new Date(),
                    processedByUserId: userId,
                    notes: `Refund for Return ${returnNumber}`
                }));
                await tx.payment.createMany({ data: refundPaymentsData });
            }

            // 4. Log CASH Refund(s) to POS Session Transaction log
            const cashRefunds = data.refundPayments?.filter(p => p.paymentMethod === PaymentMethod.CASH) ?? [];
            for (const cashRefund of cashRefunds) { // <<< FIX 6: Use cashRefund variable
                if (data.posSessionId) {
                    await tx.posSessionTransaction.create({
                        data: {
                            tenantId, posSessionId: data.posSessionId,
                            transactionType: PosTransactionType.CASH_REFUND,
                            amount: new Prisma.Decimal(cashRefund.amount), // <<< FIX 6: Use cashRefund.amount
                            relatedOrderId: data.originalOrderId,
                            notes: `Cash refund for Return ${returnNumber}`
                        }
                    });
                } else { logger.warn(`Cash refund processed for return ${returnHeader.id} but no POS session provided.`, logContext); }
            }

            // 5. Perform Stock Adjustments
            const inventoryTransactionDataBatch: Prisma.InventoryTransactionCreateManyInput[] = [];
            for (const adj of stockAdjustments) {
                // --- FIX 4: Find created return item ID to link transaction ---
                // Use the map created earlier. This assumes one return line per product for simplicity. Refine if needed.
                const createdReturnItemId = createdReturnItemMapByProdId.get(adj.productId);
                // -------------------------------------------------------------
                if (!createdReturnItemId) {
                    logger.error(`Consistency error: Could not find created return item for stock adjustment`, { ...logContext, productId: adj.productId });
                    continue;
                }

                if (adj.condition === ReturnItemCondition.SELLABLE) {
                    await purchaseOrderService._updateInventoryItemQuantity(tx, tenantId, adj.productId, adj.locationId, adj.quantityChange); // Restock item
                    inventoryTransactionDataBatch.push({
                        tenantId, userId, productId: adj.productId, locationId: adj.locationId,
                        quantityChange: adj.quantityChange, // Positive for restock
                        transactionType: InventoryTransactionType.RETURN_RESTOCK,
                        unitCost: adj.unitCost, // Likely null or estimated
                        relatedReturnItemId: createdReturnItemId, // Link transaction to return item
                        notes: `Restock from Return ${returnNumber} (Condition: ${adj.condition})`,
                        lotNumber: adj.lot, serialNumber: adj.serial,
                    });
                } else { /* Handle disposal logging/transaction if needed */ }
            }
            // Batch create inventory transactions
            if (inventoryTransactionDataBatch.length > 0) {
                await tx.inventoryTransaction.createMany({ data: inventoryTransactionDataBatch });
                logger.debug(`Created ${inventoryTransactionDataBatch.length} stock adjustment transactions for return ${returnHeader.id}`, logContext);
            }


            // 6. Fetch final return details for response (using the ID from the created header)
            const finalReturn = await tx.return.findUniqueOrThrow({
                where: { id: returnHeader.id },
                include: { // Consistent includes for response type ReturnWithDetails
                    originalOrder: { select: { id: true, orderNumber: true } }, location: { select: { id: true, name: true } },
                    customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    processedByUser: { select: { id: true, firstName: true, lastName: true } },
                    items: { include: { product: { select: { id: true, sku: true, name: true } }, originalOrderItem: { select: { id: true, unitPrice: true, quantity: true } } } },
                    refundPayments: true, exchangeOrder: { select: { id: true, orderNumber: true } },
                }
            });

            return finalReturn;
        });

        logger.info(`Return ${createdReturnWithDetails.returnNumber} created successfully`, logContext);
        return createdReturnWithDetails as ReturnWithDetails;

    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        logContext.error = error;
        logger.error(`Error creating return transaction`, logContext);
        // Ensure error is always thrown from catch block
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to process return.');
    }
};

/** Query Returns */
const queryReturns = async (filter: Prisma.ReturnWhereInput, orderBy: Prisma.ReturnOrderByWithRelationInput[], limit: number, page: number): Promise<{ returns: any[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'queryReturns', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }
    try {
        const [returns, totalResults] = await prisma.$transaction([
            prisma.return.findMany({ where: filter, orderBy, skip, take: limit, include: { /* Add necessary summary includes */ originalOrder: { select: { orderNumber: true } }, customer: { select: { firstName: true, lastName: true } }, location: { select: { name: true } } } }),
            prisma.return.count({ where: filter }),
        ]);
        logger.debug(`Return query successful, found ${returns.length} of ${totalResults}`, logContext);
        return { returns, totalResults };
    } catch (error: any) {
        logContext.error = error; logger.error(`Error querying returns`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve returns.');
    }
};

/** Get Return By ID */
const getReturnById = async (returnId: string, tenantId: string): Promise<ReturnWithDetails | null> => {
    const logContext: LogContext = { function: 'getReturnById', returnId, tenantId };
    try {
        const returnData = await prisma.return.findFirst({
            where: { id: returnId, tenantId },
            include: { // Consistent includes for ReturnWithDetails
                originalOrder: { select: { id: true, orderNumber: true } }, location: { select: { id: true, name: true } },
                customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                processedByUser: { select: { id: true, firstName: true, lastName: true } },
                items: { include: { product: { select: { id: true, sku: true, name: true } }, originalOrderItem: { select: { id: true, unitPrice: true, quantity: true } } } },
                refundPayments: true, exchangeOrder: { select: { id: true, orderNumber: true } },
            }
        });
        if (!returnData) { logger.warn(`Return not found or tenant mismatch`, logContext); return null; }
        logger.debug(`Return found successfully`, logContext);
        return returnData as ReturnWithDetails;
    } catch (error: any) {
        logContext.error = error; logger.error(`Error fetching return by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve return.');
    }
};

/** Update Return Status */
const updateReturnStatus = async (returnId: string, status: ReturnStatus, tenantId: string, userId: string, notes?: string): Promise<Return> => {
    const logContext: LogContext = { function: 'updateReturnStatus', returnId, tenantId, userId, status, notes };
    const existingReturn = await prisma.return.findFirst({ where: { id: returnId, tenantId } });
    if (!existingReturn) throw new ApiError(httpStatus.NOT_FOUND, 'Return not found.');

    if (existingReturn.status === status) {
        logger.info(`Return status is already ${status}. No update needed.`, logContext);
        // Check if notes are being updated. If so, proceed to update.
        if (notes) {
            // Proceed to update (fall through)
        } else {
            return existingReturn;
        }
    }

    // --- FIX 6: Remove CANCELLED from allowed transitions (or add to enum if needed) ---
    const allowedTransitions: Partial<Record<ReturnStatus, ReturnStatus[]>> = {
        [ReturnStatus.PENDING]: [ReturnStatus.APPROVED, ReturnStatus.REJECTED], // Example: Allow cancelling PENDING? Add CANCELLED here if needed
        [ReturnStatus.APPROVED]: [ReturnStatus.COMPLETED /*, ReturnStatus.CANCELLED? */], // Allow completing or maybe cancelling approved
    };
    // ---------------------------------------------------------------------------
    if (existingReturn.status !== status && !allowedTransitions[existingReturn.status]?.includes(status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot transition return status from ${existingReturn.status} to ${status}.`);
    }

    try {
        const updatedReturn = await prisma.return.update({
            where: { id: returnId },
            data: { status: status, reason: notes ? `${existingReturn.reason ?? ''}\n[${status} by User ${userId}]: ${notes}`.trim() : existingReturn.reason, updatedAt: new Date() }
        });
        logger.info(`Return ${returnId} status updated to ${status}`, logContext);
        return updatedReturn;
    } catch (error: any) {
        logContext.error = error; logger.error(`Error updating return status`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { /* handle not found */ }
        // --- FIX 3: Ensure error thrown ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update return status.');
    }
};


export const returnService = {
    createReturn,
    queryReturns,
    getReturnById,
    updateReturnStatus,
};

// Helper function (ensure definition exists)
// async function _updateInventoryItemQuantity(/* ... */): Promise<InventoryItem> { /* ... implementation ... */ }











// // src/modules/returns/return.service.ts
// import httpStatus from 'http-status';
// import {
//     Prisma, Return, ReturnItem, ReturnStatus, ReturnItemCondition, Order, OrderItem, Payment,
//     PaymentStatus, InventoryTransactionType, PosTransactionType, PaymentMethod, Location, Product, User, Customer, OrderStatus, PosSessionStatus
//     // Import necessary types/enums
// } from '@prisma/client';
// import { prisma } from '@/config';
// import ApiError from '@/utils/ApiError';
// import logger from '@/utils/logger';
// import { CreateReturnDto } from './dto'; // DTOs for create/update
// // Assuming inventory service helper exists and is correctly imported
// import { inventoryService } from '@/modules/inventory/inventory.service';

// type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; returnId?: string | null; orderId?: string | null; data?: any; error?: any; [key: string]: any; };

// // Type helper for detailed return response
// export type ReturnWithDetails = Return & {
//     originalOrder: Pick<Order, 'id' | 'orderNumber'>; // Basic original order info
//     location: Pick<Location, 'id' | 'name'>;
//     customer: Pick<Customer, 'id' | 'firstName' | 'lastName' | 'email'> | null;
//     processedByUser: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
//     items: (ReturnItem & {
//         product: Pick<Product, 'id' | 'sku' | 'name'>;
//         originalOrderItem?: Pick<OrderItem, 'id' | 'unitPrice' | 'quantity'> | null; // Optional link details
//     })[];
//     refundPayments: Payment[]; // Include associated refund payments
//     exchangeOrder?: Pick<Order, 'id' | 'orderNumber'> | null; // Info about the exchange order, if any
// };

// // --- Helper: Generate Return Number (Similar to Order/PO) ---
// async function generateReturnNumber(tenantId: string, tx: Prisma.TransactionClient): Promise<string> {
//     const prefix = "RTN-";
//     // WARNING: Race condition prone. Use DB sequence in production.
//     const count = await tx.return.count({ where: { tenantId } });
//     const nextNum = count + 1;
//     const returnNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;
//     // Check uniqueness within transaction (mitigation)
//     const exists = await tx.return.count({ where: { tenantId, returnNumber } });
//     if (exists > 0) throw new Error(`Generated Return Number ${returnNumber} collision.`);
//     return returnNumber;
// }
// /**
//  * Create a new Return record and associated items/refunds.
//  * Handles stock adjustments for returned items.
//  */
// const createReturn = async (
//     data: CreateReturnDto,
//     tenantId: string,
//     userId: string // User processing the return
// ): Promise<ReturnWithDetails> => {
//     const logContext: LogContext = { function: 'createReturn', tenantId, userId, orderId: data.originalOrderId, data };

//     // --- Pre-computation & Validation (Outside Transaction where possible) ---
//     // 1. Validate Original Order, Location, Customer(optional), Session(optional)
//     const originalOrder = await prisma.order.findFirst({
//         where: { id: data.originalOrderId, tenantId },
//         include: { items: true } // Include items to validate return quantities
//     });
//     if (!originalOrder) throw new ApiError(httpStatus.NOT_FOUND, `Original order ${data.originalOrderId} not found.`);
//     // Check if order status allows returns (e.g., must be COMPLETED or SHIPPED?)
//     if ([OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT].includes(originalOrder.status)) {
//         throw new ApiError(httpStatus.BAD_REQUEST, `Cannot return items from an order with status ${originalOrder.status}.`);
//     }

//     const location = await prisma.location.findFirst({ where: { id: data.locationId, tenantId, isActive: true }, select: { id: true } });
//     if (!location) throw new ApiError(httpStatus.BAD_REQUEST, `Return processing location ${data.locationId} not found or inactive.`);

//     if (data.customerId && data.customerId !== originalOrder.customerId) {
//         logger.warn(`Customer ID mismatch between return request (${data.customerId}) and original order (${originalOrder.customerId})`, logContext);
//         // Decide whether to throw error or just log based on policy
//         // throw new ApiError(httpStatus.BAD_REQUEST, 'Customer ID on return does not match the original order.');
//     }
//     const finalCustomerId = data.customerId ?? originalOrder.customerId; // Prefer customerId from request if provided

//     // Validate POS Session if provided
//     if (data.posSessionId) {
//         const session = await prisma.posSession.count({ where: { id: data.posSessionId, tenantId, status: PosSessionStatus.OPEN, userId, locationId: data.locationId } });
//         if (!session) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or inactive POS session provided for this user/location.');
//     }

//     // 2. Validate Return Items against Original Order Items
//     let calculatedRefundSubtotal = new Prisma.Decimal(0);
//     const returnItemsInput: Prisma.ReturnItemCreateNestedManyWithoutReturnRequestInput = { create: [] };
//     const stockAdjustments: { productId: string, locationId: string, quantityChange: Prisma.Decimal, unitCost: Prisma.Decimal | null, lot?: string | null, serial?: string | null, condition: ReturnItemCondition }[] = [];

//     for (const itemDto of data.items) {
//         const originalItem = originalOrder.items.find(oi =>
//             // Match primarily by originalOrderItemId if provided, otherwise by productId (less reliable)
//             (itemDto.originalOrderItemId && oi.id === itemDto.originalOrderItemId) ||
//             (!itemDto.originalOrderItemId && oi.productId === itemDto.productId)
//         );

//         if (!originalItem) {
//             throw new ApiError(httpStatus.BAD_REQUEST, `Item with Product ID ${itemDto.productId} (or Order Item ID ${itemDto.originalOrderItemId}) not found on the original order.`);
//         }

//         const quantityToReturn = new Prisma.Decimal(itemDto.quantity);
//         if (quantityToReturn.lessThanOrEqualTo(0)) continue; // Skip zero quantity

//         // Calculate remaining quantity available to return for this line item
//         const alreadyReturned = await prisma.returnItem.aggregate({
//             _sum: { quantity: true },
//             where: { originalOrderItemId: originalItem.id }
//         });
//         const quantityAlreadyReturned = alreadyReturned._sum.quantity ?? new Prisma.Decimal(0);
//         const maxReturnable = originalItem.quantity.minus(quantityAlreadyReturned);

//         if (quantityToReturn.greaterThan(maxReturnable)) {
//             throw new ApiError(httpStatus.BAD_REQUEST, `Cannot return quantity ${quantityToReturn} for Product ${itemDto.productId}. Max returnable: ${maxReturnable}.`);
//         }

//         // Determine refund amount per unit (use provided or fallback to original price)
//         const unitRefundAmount = itemDto.unitRefundAmount !== undefined
//             ? new Prisma.Decimal(itemDto.unitRefundAmount)
//             : originalItem.unitPrice; // Use price paid on original order item

//         const lineRefundAmount = unitRefundAmount.times(quantityToReturn);
//         calculatedRefundSubtotal = calculatedRefundSubtotal.plus(lineRefundAmount);

//         // Prepare ReturnItem data
//         (returnItemsInput.create as Prisma.ReturnItemCreateWithoutReturnRequestInput[]).push({
//             tenantId,
//             productId: itemDto.productId,
//             originalOrderItem: itemDto.originalOrderItemId ? { connect: { id: itemDto.originalOrderItemId } } : undefined,
//             quantity: quantityToReturn,
//             unitRefundAmount: unitRefundAmount,
//             lineRefundAmount: lineRefundAmount, // Store calculated line refund
//             condition: itemDto.condition,
//             lotNumber: itemDto.lotNumber,
//             serialNumber: itemDto.serialNumber,
//             restock: itemDto.condition === ReturnItemCondition.SELLABLE, // Determine if restocking
//             // restockLocationId will be set later if restocked
//         });

//         // Prepare Stock Adjustment info (only if item is sellable)
//         if (itemDto.condition === ReturnItemCondition.SELLABLE) {
//              // Find original cost from inventory transaction if needed, or estimate
//              // For now, using null cost for restock. Proper COGS requires fetching original sale transaction cost.
//             stockAdjustments.push({
//                 productId: itemDto.productId,
//                 locationId: data.locationId, // Restock at the location where return is processed
//                 quantityChange: quantityToReturn, // Positive change
//                 unitCost: null, // Cost for restock is complex, depends on accounting method
//                 lot: itemDto.lotNumber,
//                 serial: itemDto.serialNumber,
//                 condition: itemDto.condition,
//             });
//         } else {
//              // Optionally log disposal movement (negative adjustment maybe?)
//              // Or handle disposals outside standard stock system
//              logger.info(`Item ${itemDto.productId} returned in non-sellable condition (${itemDto.condition}), not restocking.`, logContext)
//              // Could add stock movement for disposal if needed:
//             // stockAdjustments.push({ productId: itemDto.productId, locationId: data.locationId, quantityChange: quantityToReturn.negated(), unitCost: null, condition: itemDto.condition });
//         }
//     }

//     if ((returnItemsInput.create as any[]).length === 0) {
//         throw new ApiError(httpStatus.BAD_REQUEST, "No valid items provided for return.");
//     }

//     // 3. Validate Refund Payments Total against Calculated Refund Subtotal
//     // Note: This is a simple check. Real world might involve tax recalculations, restocking fees, etc.
//     const totalRefundPayment = data.refundPayments?.reduce((sum, p) => sum.plus(new Prisma.Decimal(p.amount)), new Prisma.Decimal(0)) ?? new Prisma.Decimal(0);
//     if (!totalRefundPayment.equals(calculatedRefundSubtotal)) {
//          logger.warn(`Refund payment total (${totalRefundPayment}) does not match calculated item refund subtotal (${calculatedRefundSubtotal}).`, logContext);
//          // Decide: Throw error or allow partial refund? Let's allow partial/differing refunds for now.
//          // throw new ApiError(httpStatus.BAD_REQUEST, `Refund payment total (${totalRefundPayment}) does not match calculated item refund total (${calculatedRefundSubtotal}).`);
//     }
//     const finalTotalRefundAmount = totalRefundPayment; // Use the actual payment amount processed


//     // --- Transactional Operations ---
//     try {
//         const createdReturn = await prisma.$transaction(async (tx) => {
//             // 1. Generate Return Number
//             const returnNumber = await generateReturnNumber(tenantId, tx);
//             logContext.returnNumber = returnNumber;

//             // 2. Create Return Header
//             const returnHeader = await tx.return.create({
//                 data: {
//                     tenantId,
//                     returnNumber,
//                     originalOrderId: data.originalOrderId,
//                     locationId: data.locationId,
//                     customerId: finalCustomerId,
//                     returnDate: new Date(),
//                     reason: data.reason,
//                     processedByUserId: userId,
//                     totalRefundAmount: finalTotalRefundAmount, // Store actual refunded amount
//                     status: ReturnStatus.COMPLETED, // Assume POS returns are completed immediately
//                     notes: data.notes,
//                     items: returnItemsInput // Nested create for items
//                 },
//                 // Include items for linking stock/POS transactions
//                  include: { items: { select: { id: true, productId: true, lotNumber: true, serialNumber: true, quantity: true, condition: true, restock: true }}}
//             });
//             logContext.returnId = returnHeader.id;

//             // 3. Create Refund Payment Records (if any provided)
//             if (data.refundPayments && data.refundPayments.length > 0) {
//                  const refundPaymentsData = data.refundPayments.map(p => ({
//                      tenantId,
//                      orderId: data.originalOrderId, // Link refund back to original order for reference
//                      returnId: returnHeader.id,     // Link payment *to this return*
//                      paymentMethod: p.paymentMethod,
//                      amount: new Prisma.Decimal(p.amount).negated(), // Store refunds as negative amounts? Or use a separate type? Let's use negative. Check Payment model implications. **Correction: Storing refund amount as positive, linked to Return.**
//                      currencyCode: originalOrder.currencyCode, // Use original order currency
//                      status: PaymentStatus.COMPLETED, // Assume refund processed
//                      transactionReference: p.transactionReference,
//                      paymentDate: new Date(),
//                      processedByUserId: userId,
//                      notes: `Refund for Return ${returnNumber}`
//                  }));
//                  await tx.payment.createMany({ data: refundPaymentsData }); // Use createMany
//                  logger.debug(`Created ${refundPaymentsData.length} refund payment records for return ${returnHeader.id}`, logContext);
//             }

//             // 4. Log CASH Refund(s) to POS Session Transaction log (if applicable)
//             const cashRefunds = data.refundPayments?.filter(p => p.paymentMethod === PaymentMethod.CASH) ?? [];
//             for (const cashRefund of cashRefunds) {
//                  if (data.posSessionId) { // Only log if linked to a session
//                       await tx.posSessionTransaction.create({
//                           data: {
//                               tenantId, posSessionId: data.posSessionId,
//                               transactionType: PosTransactionType.CASH_REFUND,
//                               amount: new Prisma.Decimal(cashRefund.amount), // Amount taken out of drawer
//                               relatedOrderId: data.originalOrderId, // Link to original order
//                               notes: `Cash refund for Return ${returnNumber}`
//                           }
//                       });
//                       logger.debug(`Logged CASH_REFUND of ${cashRefund.amount} to POS session ${data.posSessionId}`, logContext);
//                  } else {
//                       logger.warn(`Cash refund processed for return ${returnHeader.id} but no POS session provided.`, logContext);
//                  }
//             }

//             // 5. Perform Stock Adjustments (Restock or Dispose)
//             for (const adj of stockAdjustments) {
//                  // Find the corresponding ReturnItem to link the transaction
//                  const returnItem = returnHeader.items.find(ri => ri.productId === adj.productId /* && check lot/serial if needed */);
//                  if (!returnItem) {
//                      logger.error(`Consistency error: Could not find return item for stock adjustment during return ${returnHeader.id}`, { ...logContext, productId: adj.productId });
//                      continue; // Skip adjustment if link fails? Or throw?
//                  }

//                  // Determine transaction type based on condition
//                  const txType = adj.condition === ReturnItemCondition.SELLABLE
//                     ? InventoryTransactionType.RETURN_RESTOCK
//                     : InventoryTransactionType.RETURN_DISPOSE; // Use dispose type

//                  // Record the stock movement (+ for restock, could be - for dispose if tracked)
//                  // For dispose, often no stock movement is needed, just log the event maybe.
//                  // Let's only record movement for RESTOCK.
//                  if (txType === InventoryTransactionType.RETURN_RESTOCK) {
//                     await inventoryService._recordStockMovement(
//                          tx, tenantId, userId, adj.productId, adj.locationId,
//                          adj.quantityChange, // Positive quantity for restock
//                          txType,
//                          null, // Cost determination is complex
//                          { returnItemId: returnItem.id }, // Link transaction to return item
//                          `Restock from Return ${returnNumber} (Condition: ${adj.condition})`,
//                          adj.lot, adj.serial
//                     );
//                  } else {
//                      // Optionally record a zero-quantity transaction or specific DISPOSE transaction type if needed for audit
//                       logger.info(`Item ${adj.productId} disposed for return ${returnNumber}`, logContext);
//                       // Maybe create an audit log entry instead of inventory transaction?
//                  }
//             }

//             // 6. Fetch final return details for response
//              const finalReturn = await tx.return.findUniqueOrThrow({
//                  where: { id: returnHeader.id },
//                  include: { // Consistent includes for response type
//                      originalOrder: { select: { id: true, orderNumber: true } },
//                      location: { select: { id: true, name: true } },
//                      customer: { select: { id: true, firstName: true, lastName: true, email: true } },
//                      processedByUser: { select: { id: true, firstName: true, lastName: true } },
//                      items: { include: { product: { select: { id: true, sku: true, name: true } }, originalOrderItem: { select: { id: true, unitPrice: true, quantity: true }} } },
//                      refundPayments: true,
//                      exchangeOrder: { select: { id: true, orderNumber: true } },
//                  }
//              });

//             return finalReturn;
//         });

//         logger.info(`Return ${createdReturn.returnNumber} created successfully`, logContext);
//         return createdReturn as ReturnWithDetails;

//     } catch (error: any) {
//          if (error instanceof ApiError) throw error;
//          logContext.error = error;
//          logger.error(`Error creating return transaction`, logContext);
//          throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to process return.');
//     }
// };

// // --- Query/Update/Delete Methods for Returns --- (Placeholders - Implement similarly to other modules)

// /** Query Returns */
// const queryReturns = async (
//     filter: Prisma.ReturnWhereInput,
//     orderBy: Prisma.ReturnOrderByWithRelationInput[],
//     limit: number, page: number
// ): Promise<{ returns: any[], totalResults: number }> => { // Define specific ReturnSummary type
//     const skip = (page - 1) * limit;
//     const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
//     const logContext: LogContext = { function: 'queryReturns', tenantId: tenantIdForLog, limit, page };
//     if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }
//     try {
//         const [returns, totalResults] = await prisma.$transaction([
//             prisma.return.findMany({ where: filter, orderBy, skip, take: limit, include: { /* summary includes */ } }),
//             prisma.return.count({ where: filter }),
//         ]);
//          logger.debug(`Return query successful, found ${returns.length} of ${totalResults}`, logContext);
//          return { returns, totalResults };
//     } catch (error: any) { logger.error(`Error querying returns`, logContext); throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve returns.'); }
// };

// /** Get Return By ID */
// const getReturnById = async (returnId: string, tenantId: string): Promise<ReturnWithDetails | null> => {
//      const logContext: LogContext = { function: 'getReturnById', returnId, tenantId };
//     try {
//         const returnData = await prisma.return.findFirst({
//             where: { id: returnId, tenantId },
//             include: { // Include full details consistent with ReturnWithDetails
//                 originalOrder: { select: { id: true, orderNumber: true } }, location: { select: { id: true, name: true } },
//                 customer: { select: { id: true, firstName: true, lastName: true, email: true } },
//                 processedByUser: { select: { id: true, firstName: true, lastName: true } },
//                 items: { include: { product: { select: { id: true, sku: true, name: true } }, originalOrderItem: { select: { id: true, unitPrice: true, quantity: true }} } },
//                 refundPayments: true, exchangeOrder: { select: { id: true, orderNumber: true } },
//              }
//         });
//         if (!returnData) { logger.warn(`Return not found or tenant mismatch`, logContext); return null; }
//         logger.debug(`Return found successfully`, logContext);
//         return returnData as ReturnWithDetails;
//     } catch (error: any) { logger.error(`Error fetching return by ID`, logContext); throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve return.'); }
// };

// /** Update Return Status (e.g., Admin/Manager approving a pending return) */
// const updateReturnStatus = async (returnId: string, status: ReturnStatus, tenantId: string, userId: string, notes?: string): Promise<Return> => {
//      const logContext: LogContext = { function: 'updateReturnStatus', returnId, tenantId, userId, status, notes };
//      // TODO: Fetch return, validate current status allows transition to new status, update status and add notes
//      logger.warn("updateReturnStatus not fully implemented", logContext);
//      throw new ApiError(httpStatus.NOT_IMPLEMENTED, "Return status update not implemented.");
// };


// export const returnService = {
//     createReturn,
//     queryReturns,
//     getReturnById,
//     updateReturnStatus, // Example for status updates
// };
