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
    let attempts = 0;
    while (attempts < 5) {
        // Use a random 6-digit number to avoid collisions and global constraint issues
        const randomPart = Math.floor(Math.random() * 1000000);
        const returnNumber = `${prefix}${randomPart.toString().padStart(6, '0')}`;

        // Check GLOBAL uniqueness (not just tenant-scoped) because schema enforces @unique globally
        const exists = await tx.return.count({ where: { returnNumber } });
        if (exists === 0) return returnNumber;
        attempts++;
    }
    throw new Error(`Failed to generate unique Return Number after multiple attempts.`);
}


/** Create a new Return record and associated items/refunds. */
const createReturn = async (
    data: CreateReturnDto,
    tenantId: string,
    userId: string
): Promise<ReturnWithDetails> => {
    const logContext: LogContext = { function: 'createReturn', tenantId, userId, orderId: data.originalOrderId, data };


    try {
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
        }
        const finalTotalRefundAmount = totalRefundPayment;

        // --- Transactional Operations ---
        const createdReturnWithDetails = await prisma.$transaction(async (tx) => {
            // 1. Generate Return Number
            const returnNumber = await generateReturnNumber(tenantId, tx);
            logContext.returnNumber = returnNumber;

            // 2. Create Return Header and nested Items
            const returnHeader = await tx.return.create({
                data: {
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
                    items: { create: returnItemsCreateInput }
                },
                include: { items: { select: { id: true, productId: true, lotNumber: true, serialNumber: true } } }
            });
            logContext.returnId = returnHeader.id;

            // --- FIX 4: Create map from *created* return items ---
            const createdReturnItemMapByProdId = new Map(returnHeader.items.map(item => [item.productId, item.id]));
            // ------------------------------------------------------

            // 3. Create Refund Payment Records
            if (data.refundPayments && data.refundPayments.length > 0) {
                const refundPaymentsData: Prisma.PaymentCreateManyInput[] = data.refundPayments.map(p => ({
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
            for (const cashRefund of cashRefunds) {
                if (data.posSessionId) {
                    await tx.posSessionTransaction.create({
                        data: {
                            tenantId, posSessionId: data.posSessionId,
                            transactionType: PosTransactionType.CASH_REFUND,
                            amount: new Prisma.Decimal(cashRefund.amount),
                            relatedOrderId: data.originalOrderId,
                            notes: `Cash refund for Return ${returnNumber}`
                        }
                    });
                } else { logger.warn(`Cash refund processed for return ${returnHeader.id} but no POS session provided.`, logContext); }
            }

            // 5. Perform Stock Adjustments
            const inventoryTransactionDataBatch: Prisma.InventoryTransactionCreateManyInput[] = [];
            for (const adj of stockAdjustments) {
                const createdReturnItemId = createdReturnItemMapByProdId.get(adj.productId);
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

        logger.error(`Error creating return transaction: ${error.message}`, { ...logContext, stack: error.stack });
        // Ensure error is always thrown from catch block
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to process return: ${error.message}`);
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
