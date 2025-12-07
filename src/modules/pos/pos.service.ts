import httpStatus from 'http-status';
import {
    Prisma, PosSession, PosSessionStatus, PosTransactionType, OrderType, PaymentMethod, PaymentStatus, // Added PaymentStatus
    OrderStatus, InventoryTransactionType, PosSessionTransaction, PosAuditAction // Added PosAuditAction for audit logging
} from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { sseManager } from '@/utils/sseManager';

import { StartSessionDto } from './dto/start-session.dto';
import { EndSessionDto } from './dto/end-session.dto';
import { CashTransactionDto } from './dto/cash-transaction.dto';
import { PosCheckoutDto } from './dto/pos-checkout.dto';
// import { StartSessionDto, EndSessionDto, CashTransactionDto, PosCheckoutDto } from './dto';
// Assuming these are correctly typed and exported
import { OrderWithDetails } from '@/modules/orders/order.service';
import { purchaseOrderService } from '../purchase-order/purchase-order.service';
import { orderService } from '@/modules/orders/order.service';
import { productService } from '@/modules/products/product.service';
// import { inventoryService } from '@/modules/inventory/inventory.service';


type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; sessionId?: string | null; terminalId?: string | null; locationId?: string | null; error?: any;[key: string]: any; };

export interface EndSessionResult extends PosSession {
    paymentSummary: Record<string, number>;
}

// --- Session Management ---

/** Get current open session for user/terminal/location */
const getCurrentSession = async (userId: string, posTerminalId: string, locationId: string, tenantId: string): Promise<PosSession | null> => {
    const logContext: LogContext = { function: 'getCurrentSession', userId, posTerminalId, locationId, tenantId };
    try {
        const session = await prisma.posSession.findFirst({
            where: { userId, posTerminalId, locationId, tenantId, status: PosSessionStatus.OPEN }
        });
        logger.debug(`Current session lookup result: ${session ? 'Found' : 'Not Found'}`, logContext);
        return session;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching current POS session`, logContext);
        // --- FIX: Throw from catch ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve current session.');
        // ---------------------------
    }
};

/** Start a new POS Session */
const startSession = async (data: StartSessionDto, userId: string, posTerminalId: string, locationId: string, tenantId: string): Promise<PosSession> => {
    const logContext: LogContext = { function: 'startSession', userId, posTerminalId, locationId, tenantId, startingCash: data.startingCash };

    const existingOpenSession = await getCurrentSession(userId, posTerminalId, locationId, tenantId);
    if (existingOpenSession) {
        logger.warn(`Start session failed: Session already open`, { ...logContext, sessionId: existingOpenSession.id });
        throw new ApiError(httpStatus.CONFLICT, 'An active session already exists for this user/terminal/location.');
    }

    try {
        const startingCashDecimal = new Prisma.Decimal(data.startingCash);

        const session = await prisma.$transaction(async (tx) => {
            const newSession = await tx.posSession.create({
                data: {
                    tenantId, locationId, userId, posTerminalId,
                    startTime: new Date(),
                    startingCash: startingCashDecimal,
                    status: PosSessionStatus.OPEN,
                }
            });

            if (startingCashDecimal.greaterThan(0)) {
                await tx.posSessionTransaction.create({
                    data: {
                        tenantId, posSessionId: newSession.id,
                        transactionType: PosTransactionType.PAY_IN,
                        amount: startingCashDecimal, notes: 'Starting float'
                    }
                });
            }
            return newSession;
        });

        logContext.sessionId = session.id;
        logger.info(`POS session started successfully`, logContext);
        return session;

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error starting POS session`, logContext);
        // --- FIX: Throw from catch ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to start session.');
        // ---------------------------
    }
};

/** End a POS Session */
// const endSession = async (sessionId: string, data: EndSessionDto, userId: string, posTerminalId: string, locationId: string, tenantId: string): Promise<PosSession> => {
//     const logContext: LogContext = { function: 'endSession', sessionId, userId, posTerminalId, locationId, tenantId, endingCash: data.endingCash };

//     try {
//         const endedSession = await prisma.$transaction(async (tx) => {
//             const session = await tx.posSession.findFirst({
//                 where: { id: sessionId, tenantId, userId, posTerminalId, locationId, status: PosSessionStatus.OPEN }
//             });
//             if (!session) {
//                 throw new ApiError(httpStatus.NOT_FOUND, 'Active session not found for this user/terminal/location, or session ID is incorrect.');
//             }

//             const transactions = await tx.posSessionTransaction.findMany({ where: { posSessionId: sessionId } });
//             let calculatedCash = session.startingCash;
//             transactions.forEach(t => {
//                 if ([PosTransactionType.PAY_IN, PosTransactionType.CASH_SALE].includes(t.transactionType)) {
//                     calculatedCash = calculatedCash.plus(t.amount);
//                 } else if ([PosTransactionType.PAY_OUT, PosTransactionType.CASH_REFUND].includes(t.transactionType)) {
//                     calculatedCash = calculatedCash.minus(t.amount);
//                 }
//             });

//             const endingCashDecimal = new Prisma.Decimal(data.endingCash);
//             const difference = endingCashDecimal.minus(calculatedCash);
//             logContext.calculatedCash = calculatedCash.toNumber();
//             logContext.difference = difference.toNumber();

//             const updatedSession = await tx.posSession.update({
//                 where: { id: sessionId },
//                 data: {
//                     endTime: new Date(),
//                     endingCash: endingCashDecimal,
//                     calculatedCash: calculatedCash,
//                     difference: difference,
//                     status: PosSessionStatus.CLOSED,
//                     notes: data.notes ? `${session.notes ?? ''}\nEnd Note: ${data.notes}`.trim() : session.notes
//                 }
//             });
//             return updatedSession;
//         });

//         logger.info(`POS session ended successfully`, logContext);
//         // --- FIX: Add null check for difference ---
//         if (endedSession.difference && !endedSession.difference.isZero()) {
//              logger.warn(`POS session ended with cash difference: ${endedSession.difference}`, logContext);
//         }
//         // ------------------------------------------
//         return endedSession;

//     } catch (error: any) {
//         if (error instanceof ApiError) throw error; // Re-throw ApiErrors
//         logContext.error = error;
//         logger.error(`Error ending POS session`, logContext);
//          // --- FIX: Throw from catch ---
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to end session.');
//         // ---------------------------
//     }
// };


// Helper to calculate session financials
const calculateSessionFinancials = async (tx: any, sessionId: string, startingCash: Prisma.Decimal) => {
    const transactions = await tx.posSessionTransaction.findMany({
        where: { posSessionId: sessionId }
    });
    let calculatedCash = startingCash; // Start with float
    const paymentSummary: Record<string, number> = {};

    transactions.forEach((t: any) => {
        const amt = t.amount.toNumber();
        paymentSummary[t.transactionType] = (paymentSummary[t.transactionType] || 0) + amt;

        // Skip the starting float transaction if we are already starting with session.startingCash
        if (t.transactionType === PosTransactionType.PAY_IN && t.notes === 'Starting float') {
            return;
        }
        switch (t.transactionType) {
            case PosTransactionType.PAY_IN:
            case PosTransactionType.CASH_SALE:
                calculatedCash = calculatedCash.plus(t.amount);
                break;
            case PosTransactionType.PAY_OUT:
            case PosTransactionType.CASH_REFUND:
                calculatedCash = calculatedCash.minus(t.amount);
                break;
            // Ignore non-cash transactions for CASH drawer calculation
            case PosTransactionType.CARD_SALE:
            case PosTransactionType.MOBILE_MONEY_SALE:
            case PosTransactionType.CHECK_SALE:
            case PosTransactionType.BANK_TRANSFER_SALE:
            case PosTransactionType.OTHER_SALE:
                break;
        }
    });
    return { calculatedCash, paymentSummary };
};

const endSession = async (sessionId: string, data: EndSessionDto, userId: string, posTerminalId: string, locationId: string, tenantId: string): Promise<EndSessionResult> => {
    const logContext: LogContext = { function: 'endSession', sessionId, userId, posTerminalId, locationId, tenantId, endingCash: data.endingCash };

    try {
        const endedSession = await prisma.$transaction(async (tx) => {
            const session = await tx.posSession.findFirst({
                where: { id: sessionId, tenantId, userId, posTerminalId, locationId, status: PosSessionStatus.OPEN }
            });
            if (!session) {
                throw new ApiError(httpStatus.NOT_FOUND, 'Active session not found for this user/terminal/location, or session ID is incorrect.');
            }

            // Calculate expected cash and summary
            // Calculate expected cash and summary
            const { calculatedCash, paymentSummary } = await calculateSessionFinancials(tx, sessionId, session.startingCash);


            const endingCashDecimal = new Prisma.Decimal(data.endingCash);
            const difference = endingCashDecimal.minus(calculatedCash);
            logContext.calculatedCash = calculatedCash.toNumber();
            logContext.difference = difference.toNumber();

            // Update session status and totals
            const updatedSession = await tx.posSession.update({
                where: { id: sessionId },
                data: {
                    endTime: new Date(),
                    endingCash: endingCashDecimal,
                    calculatedCash: calculatedCash,
                    difference: difference,
                    status: PosSessionStatus.CLOSED,
                    notes: data.notes ? `${session.notes ?? ''}\nEnd Note: ${data.notes}`.trim() : session.notes
                }
            });
            return {
                ...updatedSession,
                paymentSummary
            };
        });

        logger.info(`POS session ended successfully`, logContext);
        if (endedSession.difference && !endedSession.difference.isZero()) {
            logger.warn(`POS session ended with cash difference: ${endedSession.difference}`, logContext);
        }
        return endedSession;

    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        logContext.error = error;
        logger.error(`Error ending POS session`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to end session.');
    }
};
/** Reconcile a CLOSED POS Session */
const reconcileSession = async (sessionId: string, tenantId: string, notes?: string): Promise<PosSession & { paymentSummary: any }> => {
    const logContext: LogContext = { function: 'reconcileSession', sessionId, tenantId };
    const session = await prisma.posSession.findFirst({
        where: { id: sessionId, tenantId, status: PosSessionStatus.CLOSED }
    });
    if (!session) throw new ApiError(httpStatus.NOT_FOUND, 'Closed session not found for reconciliation.');

    try {
        const { paymentSummary } = await calculateSessionFinancials(prisma, sessionId, session.startingCash);

        const reconciledSession = await prisma.posSession.update({
            where: { id: sessionId },
            data: {
                status: PosSessionStatus.RECONCILED,
                notes: notes ? `${session.notes ?? ''}\nReconciliation Note: ${notes}`.trim() : session.notes
            }
        });
        logger.info(`POS session reconciled successfully`, logContext);

        return {
            ...reconciledSession,
            paymentSummary
        };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error reconciling POS session`, logContext);
        // --- FIX: Throw from catch ---
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError(httpStatus.NOT_FOUND, 'Session not found during reconciliation update attempt.');
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to reconcile session.');
        // ---------------------------
    }
};

/** Record Cash Pay In/Out */
const recordCashTransaction = async (sessionId: string, data: CashTransactionDto, userId: string, tenantId: string): Promise<PosSessionTransaction> => {
    const logContext: LogContext = { function: 'recordCashTransaction', sessionId, userId, tenantId, type: data.transactionType, amount: data.amount };
    const session = await prisma.posSession.findFirst({
        where: { id: sessionId, tenantId, userId, status: PosSessionStatus.OPEN },
        select: { id: true }
    });
    if (!session) throw new ApiError(httpStatus.BAD_REQUEST, 'Active session not found for this user to record cash transaction.');

    try {
        const amountDecimal = new Prisma.Decimal(data.amount);
        const cashTx = await prisma.posSessionTransaction.create({
            data: {
                tenantId, posSessionId: sessionId,
                transactionType: data.transactionType, // PAY_IN or PAY_OUT
                amount: amountDecimal,
                notes: data.notes,
            }
        });
        logger.info(`Cash transaction recorded successfully`, logContext);
        return cashTx;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error recording cash transaction`, logContext);
        // --- FIX: Throw from catch ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to record cash transaction.');
        // ---------------------------
    }
};

// --- Checkout Process ---

/** Processes a complete POS sale checkout. */
// const processPosCheckout = async (
//     checkoutData: PosCheckoutDto,
//     sessionId: string,
//     tenantId: string,
//     userId: string,
//     posTerminalId: string,
//     locationId: string,
//     ipAddress?: string,
//     userAgent?: string
// ): Promise<OrderWithDetails> => {

//     const logContext: LogContext = { function: 'processPosCheckout', tenantId, userId, sessionId, locationId, terminalId: posTerminalId, customerId: checkoutData.customerId };

//     // 1. Validate Session
//     const currentSession = await getCurrentSession(userId, posTerminalId, locationId, tenantId);
//     if (!currentSession || currentSession.id !== sessionId) {
//         throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or inactive POS session.');
//     }

//     // 2. Fetch Products
//     const productIds = checkoutData.items.map(item => item.productId);
//     const products = await prisma.product.findMany({
//         where: { id: { in: productIds }, tenantId, isActive: true },
//         include: { inventoryItems: { where: { locationId: locationId } } }
//     });
//     if (products.length !== productIds.length) { /* throw product not found error */ }

//     // 3. Basic Payment Validation
//     const totalPaymentAmount = checkoutData.payments.reduce((sum, p) => sum + p.amount, 0);
//     if (totalPaymentAmount <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Total payment amount must be positive.');

//     // --- Transactional Operations ---
//     try {
//         const createdOrder = await prisma.$transaction(async (tx) => {
//             const session = await tx.posSession.findFirst({ where: { id: sessionId, status: PosSessionStatus.OPEN }, select: { id: true }}); // Lock session row? Maybe not needed if checked before.
//             if (!session) throw new Error("Session closed unexpectedly during transaction.");

//             // 4. Prepare Order Items & Check Stock/Calculate Totals
//             let calculatedSubtotal = new Prisma.Decimal(0);
//             const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = []; // Use type for nested create
//             const stockMovements: { productId: string; quantity: Prisma.Decimal; lot?: string | null; serial?: string | null }[] = [];
//             let needsBackorder = false;

//             // for (const itemDto of checkoutData.items) { /* ... validation and calculation logic as before ... */ }


//             for (const itemDto of checkoutData.items) {
//                 const product = products.find(p => p.id === itemDto.productId);
//                 if (!product) throw new Error(`Consistency Error: Product ${itemDto.productId} not found during transaction.`); // Should not happen

//                 const requestedQuantity = new Prisma.Decimal(itemDto.quantity);
//                 if(requestedQuantity.lessThanOrEqualTo(0)) throw new Error(`Invalid quantity for product ${product.sku}.`); // Internal check

//                 const unitPrice = itemDto.unitPrice !== undefined ? new Prisma.Decimal(itemDto.unitPrice) : product.basePrice ?? new Prisma.Decimal(0);
//                 if (unitPrice.lessThan(0)) throw new Error(`Invalid unit price for product ${product.sku}.`);

//                 const lineTotal = unitPrice.times(requestedQuantity);
//                 calculatedSubtotal = calculatedSubtotal.plus(lineTotal);

//                 orderItemsData.push({
//                     tenantId, productId: product.id,
//                     productSnapshot: { sku: product.sku, name: product.name, price: unitPrice.toNumber() },
//                     quantity: requestedQuantity, unitPrice: unitPrice, originalUnitPrice: product.basePrice,
//                     taxAmount: 0, taxRate: 0, lineTotal: lineTotal,
//                     lotNumber: itemDto.lotNumber, serialNumber: itemDto.serialNumber, notes: itemDto.notes,
//                 });

//                 if (product.isStockTracked) {
//                     const inventory = product.inventoryItems[0];
//                     const availableQuantity = inventory ? inventory.quantityOnHand.minus(inventory.quantityAllocated) : new Prisma.Decimal(0);

//                     if (availableQuantity.lessThan(requestedQuantity)) {
//                         const allowBackorder = false; // TODO: Config
//                         if (!allowBackorder) {
//                              throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock for ${product.sku}. Available: ${availableQuantity}`);
//                         } else { needsBackorder = true; }
//                     }
//                      // Add to list of movements needed AFTER order creation
//                     stockMovements.push({
//                         productId: product.id,
//                         quantity: requestedQuantity, // Store positive quantity needed
//                         lot: itemDto.lotNumber,
//                         serial: itemDto.serialNumber
//                     });
//                 }
//             }

//             // 5. Calculate Final Order Total
//             const discountTotal = new Prisma.Decimal(checkoutData.discountAmount ?? 0);
//             const shippingTotal = new Prisma.Decimal(0);
//             const taxTotal = new Prisma.Decimal(0); // TODO: Tax
//             const calculatedTotal = calculatedSubtotal.minus(discountTotal).plus(shippingTotal).plus(taxTotal);

//             // 6. Validate Payment Total against Order Total
//             const paymentTotalDecimal = new Prisma.Decimal(totalPaymentAmount);
//             if (!paymentTotalDecimal.equals(calculatedTotal)) {
//                 throw new ApiError(httpStatus.BAD_REQUEST, `Payment total (${paymentTotalDecimal}) does not match order total (${calculatedTotal}).`);
//             }

//             // 7. Generate Order Number
//             const orderNumber = await orderService.generateOrderNumber(tenantId);

//             // 8. Create Order Header including nested Items and Payments
//             const order = await tx.order.create({
//                 data: {
//                     tenantId, orderNumber, customerId: checkoutData.customerId, locationId, posTerminalId, userId,
//                     orderType: OrderType.POS, status: OrderStatus.COMPLETED, // POS orders usually completed
//                     orderDate: new Date(), subtotal: calculatedSubtotal, discountAmount: discountTotal,
//                     taxAmount: taxTotal, shippingCost: shippingTotal, totalAmount: calculatedTotal,
//                     currencyCode: 'USD', notes: checkoutData.notes, isBackordered: needsBackorder,
//                     shippingAddress: checkoutData.shippingAddress as Prisma.JsonObject ?? Prisma.JsonNull,
//                     items: {
//                         create: orderItemsData, // Create items directly related
//                     },
//                     payments: { // Create payments directly related
//                         create: checkoutData.payments.map(p => ({
//                             tenantId, // Add if needed
//                             paymentMethod: p.paymentMethod,
//                             amount: new Prisma.Decimal(p.amount),
//                             currencyCode: 'USD', // Use order currency
//                             status: PaymentStatus.COMPLETED,
//                             transactionReference: p.transactionReference,
//                             paymentDate: new Date(),
//                             processedByUserId: userId,
//                         })),
//                     }
//                 },
//                 include: { items: { select: { id: true, productId: true }}} // Include items to link stock tx
//             });
//             logContext.orderId = order.id; logContext.orderNumber = order.orderNumber;

//             // 9. Log CASH payment(s) to POS Session Transaction log
//             const cashPayments = checkoutData.payments.filter(p => p.paymentMethod === PaymentMethod.CASH);
//             for (const cashPayment of cashPayments) {
//                  await tx.posSessionTransaction.create({
//                      data: {
//                          tenantId, posSessionId: sessionId,
//                          transactionType: PosTransactionType.CASH_SALE,
//                          amount: new Prisma.Decimal(cashPayment.amount),
//                          relatedOrderId: order.id,
//                          notes: `Cash payment for Order ${order.orderNumber}`
//                      }
//                  });
//             }

//             // 10. Record Stock Movements
//             for (const move of stockMovements) {
//                 const orderItem = order.items.find(oi => oi.productId === move.productId);
//                 if (!orderItem) throw new Error(`Consistency Error: Cannot find order item for stock movement: ${move.productId}`);
//                 await inventoryService._recordStockMovement(
//                      tx, tenantId, userId, move.productId, locationId,
//                      move.quantity.negated(), InventoryTransactionType.SALE, null,
//                      { orderId: order.id, orderItemId: orderItem.id },
//                      `Order ${order.orderNumber}`, move.lot, move.serial
//                  );
//             }

//             // 11. Fetch final order details for response
//              const finalOrder = await tx.order.findUniqueOrThrow({
//                 where: { id: order.id },
//                 include: {
//                     customer: { select: { id: true, firstName: true, lastName: true, email: true } },
//                     location: { select: { id: true, name: true } },
//                     user: { select: { id: true, firstName: true, lastName: true } },
//                     items: { include: { product: { select: { id: true, sku: true, name: true } } } },
//                     payments: true,
//                     returns: { where: { originalOrderId: order.id } }
//                 }
//              });
//             return finalOrder;
//         });

//         logger.info(`POS Checkout successful`, logContext);
//         return createdOrder as OrderWithDetails;

//     } catch (error: any) {
//         if (error instanceof ApiError) throw error;
//         logContext.error = error;
//         logger.error(`Error during POS checkout transaction`, logContext);
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Checkout failed: ${error.message || 'Internal Server Error'}`);
//     }
// };

// --- Session Query Methods ---

// const processPosCheckout = async (
//     checkoutData: PosCheckoutDto,
//     sessionId: string, // Session must be active
//     tenantId: string,
//     userId: string, // Cashier ID from auth context
//     posTerminalId: string,
//     locationId: string,
//     ipAddress?: string, // Optional for logging/token association
//     userAgent?: string // Optional for logging/token association
// ): Promise<OrderWithDetails> => {

//     const logContext: LogContext = { function: 'processPosCheckout', tenantId, userId, sessionId, locationId, terminalId: posTerminalId, customerId: checkoutData.customerId };

//     // --- Pre-computation and Validation (outside transaction if possible) ---
//     // 1. Validate Session is active for this user/terminal/location
//     const currentSession = await getCurrentSession(userId, posTerminalId, locationId, tenantId); // Assumes getCurrentSession exists
//     if (!currentSession || currentSession.id !== sessionId) {
//         throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or inactive POS session for this user/terminal/location.');
//     }

//     // 2. Fetch Products (ensure they exist, are active, and get stock levels)
//     const productIds = checkoutData.items.map(item => item.productId);
//     if (productIds.length === 0) {
//         throw new ApiError(httpStatus.BAD_REQUEST, 'Checkout must include at least one item.');
//     }
//     const products = await prisma.product.findMany({
//         where: { id: { in: productIds }, tenantId, isActive: true }, // Ensure products are active
//         include: { inventoryItems: { where: { locationId: locationId } } }
//     });
//     // Verify all requested products were found and belong to the tenant
//     if (products.length !== productIds.length) {
//         const foundIds = products.map(p => p.id);
//         const missingIds = productIds.filter(id => !foundIds.includes(id));
//         throw new ApiError(httpStatus.BAD_REQUEST, `Product IDs not found or inactive: ${missingIds.join(', ')}`);
//     }

//     // 3. Basic Payment Validation (Total amount check)
//     if (!checkoutData.payments || checkoutData.payments.length === 0) {
//          throw new ApiError(httpStatus.BAD_REQUEST, 'At least one payment method is required for checkout.');
//     }
//     const totalPaymentAmount = checkoutData.payments.reduce((sum, p) => sum + p.amount, 0);
//     if (totalPaymentAmount <= 0) {
//         throw new ApiError(httpStatus.BAD_REQUEST, 'Total payment amount must be positive.');
//     }

//     // --- Transactional Operations ---
//     try {
//         const createdOrder = await prisma.$transaction(async (tx) => {

//             // Optional: Re-fetch session within transaction for locking if strict consistency is needed
//             const session = await tx.posSession.findFirst({ where: { id: sessionId, status: PosSessionStatus.OPEN }, select: { id: true }});
//             if (!session) throw new Error("Session closed unexpectedly during transaction."); // Internal error state

//             // 4. Prepare Order Items & Check Stock/Calculate Totals (within transaction)
//             let calculatedSubtotal = new Prisma.Decimal(0);
//             const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = []; // Use type for nested create
//             const stockMovements: { productId: string; quantity: Prisma.Decimal; lot?: string | null; serial?: string | null }[] = [];
//             let needsBackorder = false; // Flag if any item needs backorder

//             const stockChecks: { productId: string, requested: Prisma.Decimal, available: Prisma.Decimal, isTracked: boolean, sku: string }[] = [];

//             for (const itemDto of checkoutData.items) {
//                 const product = products.find(p => p.id === itemDto.productId);
//                 // This check should ideally be redundant due to the fetch above, but good safeguard
//                 if (!product) throw new Error(`Consistency Error: Product ${itemDto.productId} not found during transaction.`);

//                 const requestedQuantity = new Prisma.Decimal(itemDto.quantity);
//                 if(requestedQuantity.lessThanOrEqualTo(0)) {
//                     throw new ApiError(httpStatus.BAD_REQUEST, `Quantity for product ${product.sku} must be positive.`);
//                 }

//                 // Determine Unit Price (use DTO override or product's base price)
//                 const unitPrice = itemDto.unitPrice !== undefined
//                     ? new Prisma.Decimal(itemDto.unitPrice)
//                     : product.basePrice ?? new Prisma.Decimal(0); // Default to 0 if basePrice is null

//                 if (unitPrice.lessThan(0)) {
//                     throw new ApiError(httpStatus.BAD_REQUEST, `Unit price for product ${product.sku} cannot be negative.`);
//                 }

//                 const lineTotal = unitPrice.times(requestedQuantity);
//                 calculatedSubtotal = calculatedSubtotal.plus(lineTotal);

//                 // Prepare data for OrderItem creation using nested create syntax
//                 orderItemsData.push({
//                     tenantId, // Include tenantId if defined directly on OrderItem schema (usually inherited)
//                     product: { // Use relation field name
//                         connect: { id: product.id } // Connect by ID
//                     },
//                     productSnapshot: { sku: product.sku, name: product.name, price: unitPrice.toNumber() }, // Capture at time of sale
//                     quantity: requestedQuantity,
//                     unitPrice: unitPrice,
//                     originalUnitPrice: product.basePrice, // Store original price
//                     // TODO: Add Tax calculation logic here and assign to taxAmount/taxRate
//                     taxAmount: 0,
//                     taxRate: 0,
//                     lineTotal: lineTotal,
//                     lotNumber: itemDto.lotNumber, // Pass through if provided
//                     serialNumber: itemDto.serialNumber, // Pass through if provided
//                     notes: itemDto.notes,
//                     // quantityReturned defaults to 0
//                     // customAttributes: ... // Add if needed
//                 });

//                 // Check Stock (only for tracked items)
//                 if (product.isStockTracked) {
//                     const inventory = product.inventoryItems[0]; // Fetched for the specific location
//                     const availableQuantity = inventory
//                         ? inventory.quantityOnHand.minus(inventory.quantityAllocated) // Available = OnHand - Allocated
//                         : new Prisma.Decimal(0);

//                     // Add details to stock checks list
//                     stockChecks.push({ productId: product.id, requested: requestedQuantity, available: availableQuantity, isTracked: true, sku: product.sku });

//                     // Handle insufficient stock
//                     if (availableQuantity.lessThan(requestedQuantity)) {
//                         // TODO: Implement tenant/product level configuration for backorders
//                         const allowBackorder = false; // Replace with actual config check
//                         if (!allowBackorder) {
//                              throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock for product ${product.sku}. Available: ${availableQuantity}, Requested: ${requestedQuantity}`);
//                         } else {
//                              logContext.backorderedProduct = product.sku;
//                              logger.warn(`Product ${product.sku} is backordered`, logContext);
//                              needsBackorder = true; // Mark order for backorder status
//                         }
//                     }
//                      // Add details needed for stock movement later
//                     stockMovements.push({
//                         productId: product.id,
//                         quantity: requestedQuantity, // Store positive quantity needed
//                         lot: itemDto.lotNumber,
//                         serial: itemDto.serialNumber
//                     });
//                 } else {
//                      stockChecks.push({ productId: product.id, requested: requestedQuantity, available: new Prisma.Decimal(Infinity), isTracked: false, sku: product.sku });
//                      // No stock movement needed for non-tracked items
//                 }
//             }

//             // 5. Calculate Final Order Total
//             const discountTotal = new Prisma.Decimal(checkoutData.discountAmount ?? 0);
//             const shippingTotal = new Prisma.Decimal(0); // Typically zero for POS
//             const taxTotal = new Prisma.Decimal(0); // TODO: Implement Tax Calculation Service/Logic
//             const calculatedTotal = calculatedSubtotal.minus(discountTotal).plus(shippingTotal).plus(taxTotal);

//             // 6. Validate Payment Total against Order Total
//             const paymentTotalDecimal = new Prisma.Decimal(totalPaymentAmount);
//             // Use tolerance for potential floating point issues if needed, but Decimal should be precise
//             if (!paymentTotalDecimal.equals(calculatedTotal)) {
//                 throw new ApiError(httpStatus.BAD_REQUEST, `Payment total (${paymentTotalDecimal}) does not match calculated order total (${calculatedTotal}). Please verify cart and payment amounts.`);
//             }

//             // 7. Generate Order Number
//             const orderNumber = await orderService.generateOrderNumber(tenantId); // Consider if needs to be outside tx

//             // 8. Create Order Header including nested Items and Payments
//             const order = await tx.order.create({
//                 data: {
//                     tenantId,
//                     orderNumber,
//                     customerId: checkoutData.customerId,
//                     locationId, // Use locationId from context
//                     posTerminalId, // Use terminalId from context
//                     userId, // Use cashier ID from context
//                     orderType: OrderType.POS, // Explicitly POS
//                     status: OrderStatus.COMPLETED, // POS orders usually completed immediately
//                     orderDate: new Date(),
//                     subtotal: calculatedSubtotal,
//                     discountAmount: discountTotal,
//                     taxAmount: taxTotal,
//                     shippingCost: shippingTotal,
//                     totalAmount: calculatedTotal,
//                     currencyCode: 'USD', // TODO: Get from tenant/location settings
//                     notes: checkoutData.notes,
//                     shippingAddress: checkoutData.shippingAddress as Prisma.JsonObject ?? Prisma.JsonNull,
//                     shippingMethod: checkoutData.shippingAddress ? 'POS Pickup/Ship' : null, // Indicate if shipping involved
//                     // trackingNumber: null, // Set later if shipped
//                     isBackordered: needsBackorder,
//                     items: {
//                         create: orderItemsData, // Use the correctly formatted array for nested create
//                     },
//                     payments: { // Use nested create for payments
//                         create: checkoutData.payments.map(p => ({
//                             tenantId, // Include if needed by schema
//                             paymentMethod: p.paymentMethod,
//                             amount: new Prisma.Decimal(p.amount),
//                             currencyCode: 'USD', // Use order currency
//                             status: PaymentStatus.COMPLETED, // Assume POS payments are completed
//                             transactionReference: p.transactionReference,
//                             paymentDate: new Date(),
//                             processedByUserId: userId, // User processing the payment
//                         })),
//                     }
//                 },
//                 include: { items: { select: { id: true, productId: true, lotNumber: true, serialNumber: true }}} // Include items to link stock tx and get lot/serial info if needed
//             });
//             logContext.orderId = order.id; logContext.orderNumber = order.orderNumber;

//             // 9. Log CASH payment(s) to POS Session Transaction log
//             const cashPayments = checkoutData.payments.filter(p => p.paymentMethod === PaymentMethod.CASH);
//             for (const cashPayment of cashPayments) {
//                  await tx.posSessionTransaction.create({
//                      data: {
//                          tenantId, // Add if needed
//                          posSessionId: sessionId,
//                          transactionType: PosTransactionType.CASH_SALE,
//                          amount: new Prisma.Decimal(cashPayment.amount), // Positive amount for cash received
//                          relatedOrderId: order.id, // Link to the order
//                          notes: `Cash payment for Order ${order.orderNumber}`
//                      }
//                  });
//             }

//             // 10. Record Stock Movements (Decrease OnHand for tracked items)
//             for (const move of stockMovements) {
//                  // Find the created order item to link the transaction
//                 const orderItem = order.items.find(oi => oi.productId === move.productId);
//                 if (!orderItem) {
//                     // This indicates a serious consistency issue if an item was processed but not created
//                     throw new Error(`Consistency Error: Cannot find created order item for stock movement: Product ID ${move.productId} on Order ID ${order.id}`);
//                 }
//                 await inventoryService._recordStockMovement(
//                      tx, tenantId, userId, move.productId, locationId, // Use order's locationId
//                      move.quantity.negated(), // Decrease stock (use negated Decimal)
//                      InventoryTransactionType.SALE,
//                      null, // Cost of Goods Sold calculation happens later if needed
//                      { orderId: order.id, orderItemId: orderItem.id }, // Link transaction
//                      `Order ${order.orderNumber}`,
//                      // Use lot/serial determined during order item creation/stock check if applicable
//                      orderItem.lotNumber,
//                      orderItem.serialNumber
//                  );
//             }

//             // 11. Fetch the final order with all details for the response
//              const finalOrder = await tx.order.findUniqueOrThrow({
//                 where: { id: order.id },
//                 include: { // Define includes consistent with OrderWithDetails
//                     customer: { select: { id: true, firstName: true, lastName: true, email: true } },
//                     location: { select: { id: true, name: true } },
//                     user: { select: { id: true, firstName: true, lastName: true } },
//                     items: { include: { product: { select: { id: true, sku: true, name: true } } } },
//                     payments: true,
//                     initiatedReturns: { where: { originalOrderId: order.id } }
//                 }
//              });

//             return finalOrder; // Return the created order with includes
//         }, {
//             maxWait: 15000, // Allow 15 seconds for the operation to start
//             timeout: 30000  // <<< Allow 30 seconds for the entire transaction
//         });

//         logger.info(`POS Checkout successful`, logContext);
//         return createdOrder as OrderWithDetails; // Cast transaction result

//     } catch (error: any) {
//         if (error instanceof ApiError) throw error; // Re-throw known validation/stock errors
//         logContext.error = error;
//         logger.error(`Error during POS checkout transaction`, logContext);
//         // Provide a more context-specific error if possible
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Checkout failed: ${error.message || 'Internal Server Error'}`);
//     }
// };
































const processPosCheckout = async (
    checkoutData: PosCheckoutDto,
    sessionId: string, // Session must be active
    tenantId: string,
    userId: string, // Cashier ID from auth context
    posTerminalId: string,
    locationId: string,
    ipAddress?: string, // Optional for logging/token association
    userAgent?: string // Optional for logging/token association
): Promise<OrderWithDetails> => {

    const logContext: LogContext = { function: 'processPosCheckout', tenantId, userId, sessionId, locationId, terminalId: posTerminalId, customerId: checkoutData.customerId };
    const startTime = Date.now();
    logger.info(`Starting POS checkout process`, logContext);

    // --- Pre-computation and Validation (outside transaction) ---
    // 1. Validate Session is active for this user/terminal/location
    const currentSession = await getCurrentSession(userId, posTerminalId, locationId, tenantId); // Assumes getCurrentSession exists
    if (!currentSession || currentSession.id !== sessionId) {
        logger.warn(`Checkout failed: Invalid or inactive POS session provided`, { ...logContext, providedSessionId: sessionId });
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or inactive POS session for this user/terminal/location.');
    }

    // 2. Fetch Products and necessary inventory data
    const productIds = checkoutData.items.map(item => item.productId);
    if (productIds.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Checkout must include at least one item.');
    }
    const products = await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId, isActive: true }, // Ensure product is active
        // Include inventory specific to the order's location for stock check
        include: { inventoryItems: { where: { locationId: locationId } } }
    });
    // Verify all requested products were found and belong to the tenant
    if (products.length !== productIds.length) {
        const foundIds = products.map(p => p.id);
        const missingIds = productIds.filter(id => !foundIds.includes(id));
        logger.warn(`Checkout failed: Products not found or inactive`, { ...logContext, missingProductIds: missingIds });
        throw new ApiError(httpStatus.BAD_REQUEST, `Product IDs not found or inactive: ${missingIds.join(', ')}`);
    }

    // 3. Basic Payment Validation (Total amount check)
    if (!checkoutData.payments || checkoutData.payments.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'At least one payment method is required for checkout.');
    }
    // Calculate total payment amount provided using Prisma.Decimal for precision
    let totalPaymentAmountDecimal = new Prisma.Decimal(0);
    try {
        checkoutData.payments.forEach(p => {
            if (p.amount <= 0) throw new Error(`Invalid payment amount (${p.amount}) for method ${p.paymentMethod}.`);
            totalPaymentAmountDecimal = totalPaymentAmountDecimal.plus(new Prisma.Decimal(p.amount));
        });
    } catch (e: any) {
        throw new ApiError(httpStatus.BAD_REQUEST, e.message || 'Invalid payment amount provided.');
    }
    if (totalPaymentAmountDecimal.lessThanOrEqualTo(0)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Total payment amount must be positive.');
    }
    logContext.totalPaymentProvided = totalPaymentAmountDecimal.toNumber(); // Log total payment


    const totalPaymentAmount = checkoutData.payments.reduce((sum, p) => sum + p.amount, 0);
    if (totalPaymentAmount <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Total payment amount must be positive.');
    }

    // --- Transactional Operations ---
    const transactionStartTime = Date.now();
    logger.debug(`Starting checkout database transaction`, logContext);
    try {
        const createdOrder = await prisma.$transaction(async (tx) => {

            // Optional: Re-fetch session within transaction for locking if needed
            const session = await tx.posSession.findFirst({ where: { id: sessionId, status: PosSessionStatus.OPEN }, select: { id: true } });
            if (!session) throw new Error("Session closed unexpectedly during transaction."); // Internal error state

            // 4. Prepare Order Items, Apply Item Discounts, Check Stock, Calculate Totals
            let calculatedSubtotal = new Prisma.Decimal(0); // Price *after* item discounts
            const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
            const stockMovements: { productId: string; quantity: Prisma.Decimal; lot?: string | null; serial?: string | null }[] = [];
            // Collect data for inventory transactions separately for batch create later
            let inventoryTransactionDataBatch: Prisma.InventoryTransactionCreateManyInput[] = [];
            let needsBackorder = false; // Flag if any item needs backorder

            for (const itemDto of checkoutData.items) {
                const product = products.find(p => p.id === itemDto.productId);
                // This check should be redundant due to pre-fetch, but good safeguard inside transaction
                if (!product) throw new Error(`Consistency Error: Product ${itemDto.productId} not found during transaction.`);

                const requestedQuantity = new Prisma.Decimal(itemDto.quantity);
                if (requestedQuantity.lessThanOrEqualTo(0)) {
                    // This validation should ideally happen in DTO, but double-check
                    throw new ApiError(httpStatus.BAD_REQUEST, `Quantity for product ${product.sku} must be positive.`);
                }

                // Determine base unit price (before item discount)
                const originalUnitPrice = product.basePrice ?? new Prisma.Decimal(0);
                // Use override from DTO if provided (permission check might be needed?), otherwise use product price
                let basePriceForCalc = itemDto.unitPrice !== undefined
                    ? new Prisma.Decimal(itemDto.unitPrice)
                    : originalUnitPrice;

                // Apply Item-Level Discount
                let itemDiscountAmount = new Prisma.Decimal(0);
                if (itemDto.discountAmount && itemDto.discountAmount > 0) {
                    // Use fixed amount if provided
                    itemDiscountAmount = new Prisma.Decimal(itemDto.discountAmount);
                } else if (itemDto.discountPercent && itemDto.discountPercent > 0) {
                    // Calculate from percentage if provided
                    const percent = Math.min(itemDto.discountPercent, 1); // Cap at 100%
                    itemDiscountAmount = basePriceForCalc.times(percent);
                }
                // Ensure discount doesn't make price negative
                itemDiscountAmount = Prisma.Decimal.min(itemDiscountAmount, basePriceForCalc);
                const finalUnitPrice = basePriceForCalc.minus(itemDiscountAmount);

                if (finalUnitPrice.lessThan(0)) { throw new ApiError(httpStatus.BAD_REQUEST, `Price cannot be negative after discount for ${product.sku}.`); }

                const lineTotal = finalUnitPrice.times(requestedQuantity);
                calculatedSubtotal = calculatedSubtotal.plus(lineTotal);

                // Prepare data for OrderItem creation using nested create syntax
                orderItemsData.push({
                    tenantId, // Include if needed by schema (usually inherited)
                    product: { connect: { id: product.id } },
                    productSnapshot: { sku: product.sku, name: product.name, price: finalUnitPrice.toNumber() },
                    quantity: requestedQuantity,
                    unitPrice: finalUnitPrice,
                    originalUnitPrice: originalUnitPrice,
                    discountAmount: itemDiscountAmount, // Store item discount amount
                    taxAmount: 0, taxRate: 0, // TODO: Tax
                    lineTotal: lineTotal,
                    lotNumber: itemDto.lotNumber, serialNumber: itemDto.serialNumber, notes: itemDto.notes,
                });

                // Check Stock & Prepare Inventory Movement (only for tracked items)
                if (product.isStockTracked) {
                    const inventory = product.inventoryItems[0]; // Fetched for the specific location
                    const availableQuantity = inventory ? inventory.quantityOnHand.minus(inventory.quantityAllocated) : new Prisma.Decimal(0);

                    // Handle insufficient stock
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
                    // Add to list of movements needed AFTER order creation
                    stockMovements.push({
                        productId: product.id,
                        quantity: requestedQuantity, // Store positive quantity needed
                        lot: itemDto.lotNumber,
                        serial: itemDto.serialNumber // Store single serial if provided here
                        // Note: If multiple serials needed, adjust DTO and capture logic
                    });
                }
            } // End of item loop

            // 5. Apply Cart-Level Discount & Calculate Final Order Total
            let cartDiscountValue = new Prisma.Decimal(0);
            if (checkoutData.cartDiscountAmount && checkoutData.cartDiscountAmount > 0) {
                cartDiscountValue = new Prisma.Decimal(checkoutData.cartDiscountAmount);
            } else if (checkoutData.cartDiscountPercent && checkoutData.cartDiscountPercent > 0) {
                const percent = Math.min(checkoutData.cartDiscountPercent, 1);
                cartDiscountValue = calculatedSubtotal.times(percent);
            }
            cartDiscountValue = Prisma.Decimal.min(cartDiscountValue, calculatedSubtotal); // Cap discount

            const subtotalAfterCartDiscount = calculatedSubtotal.minus(cartDiscountValue);
            const shippingTotal = new Prisma.Decimal(0); // Typically zero for POS
            const taxTotal = new Prisma.Decimal(0); // TODO: Implement Tax Calculation Service/Logic
            const calculatedTotal = subtotalAfterCartDiscount.plus(shippingTotal).plus(taxTotal);
            logContext.calculatedTotal = calculatedTotal.toNumber();

            const paymentTotalDecimal = new Prisma.Decimal(totalPaymentAmount); // Convert pre-calculated total

            // 6. Validate Payment Total against Final Calculated Order Total
            if (!paymentTotalDecimal.equals(calculatedTotal)) {
                logger.error(`Payment total mismatch`, { ...logContext, paymentTotal: paymentTotalDecimal.toNumber() });
                throw new ApiError(httpStatus.BAD_REQUEST, `Payment total (${paymentTotalDecimal}) does not match final order total (${calculatedTotal}). Verify cart, discounts, and payment amounts.`);
            }

            // 7. Generate Order Number
            const orderNumber = await orderService.generateOrderNumber(tenantId);

            // 8. Create Order Header including nested Items and Payments
            const order = await tx.order.create({
                data: {
                    tenantId, orderNumber, customerId: checkoutData.customerId, locationId, posTerminalId, userId,
                    orderType: OrderType.POS, status: OrderStatus.COMPLETED, // POS orders usually completed immediately
                    orderDate: new Date(),
                    subtotal: calculatedSubtotal, // Subtotal *before* cart discount
                    discountAmount: cartDiscountValue, // Store CART discount amount
                    taxAmount: taxTotal, shippingCost: shippingTotal, totalAmount: calculatedTotal,
                    currencyCode: 'USD', // TODO: Get from settings
                    notes: checkoutData.notes,
                    shippingAddress: checkoutData.shippingAddress as Prisma.JsonObject ?? Prisma.JsonNull,
                    shippingMethod: checkoutData.shippingAddress ? 'POS Pickup/Ship' : null,
                    isBackordered: needsBackorder,
                    items: { create: orderItemsData }, // Use nested create for items
                    payments: { // Use nested create for payments
                        create: checkoutData.payments.map(p => ({
                            tenantId,
                            paymentMethod: p.paymentMethod,
                            amount: new Prisma.Decimal(p.amount),
                            currencyCode: 'USD', // Use order currency
                            status: PaymentStatus.COMPLETED,
                            transactionReference: p.transactionReference,
                            paymentDate: new Date(),
                            processedByUserId: userId,
                            // isRefund: false, // Explicitly mark as not a refund
                        })),
                    }
                },
                // Include items to get their generated IDs for linking inventory transactions
                include: { items: { select: { id: true, productId: true, lotNumber: true, serialNumber: true } } }
            });
            logContext.orderId = order.id; logContext.orderNumber = order.orderNumber;

            // 9. Log ALL payments to POS Session Transaction log
            // const cashPayments = checkoutData.payments.filter(p => p.paymentMethod === PaymentMethod.CASH);
            for (const payment of checkoutData.payments) {
                let transactionType: PosTransactionType | undefined;

                switch (payment.paymentMethod) {
                    case PaymentMethod.CASH:
                        transactionType = PosTransactionType.CASH_SALE;
                        break;
                    case PaymentMethod.CREDIT_CARD:
                    case PaymentMethod.DEBIT_CARD:
                        transactionType = PosTransactionType.CARD_SALE;
                        break;
                    case PaymentMethod.MOBILE_MONEY:
                        transactionType = PosTransactionType.MOBILE_MONEY_SALE;
                        break;
                    case PaymentMethod.CHECK:
                        transactionType = PosTransactionType.CHECK_SALE;
                        break;
                    case PaymentMethod.BANK_TRANSFER:
                        transactionType = PosTransactionType.BANK_TRANSFER_SALE;
                        break;
                    case PaymentMethod.OTHER:
                        transactionType = PosTransactionType.OTHER_SALE;
                        break;
                    // Add default or ignore specific types if not relevant for session logs
                    default:
                        // Log usage warning but map to OTHER_SALE or skip?
                        transactionType = PosTransactionType.OTHER_SALE;
                }

                if (transactionType) {
                    await tx.posSessionTransaction.create({
                        data: {
                            tenantId, posSessionId: sessionId,
                            transactionType: transactionType,
                            amount: new Prisma.Decimal(payment.amount), // Amount paid
                            relatedOrderId: order.id,
                            notes: `${payment.paymentMethod} payment for Order ${order.orderNumber}`
                        }
                    });
                }
            }

            // 10. Record Stock Movements (Decrease OnHand for tracked items) & Prepare Transaction Logs
            inventoryTransactionDataBatch = []; // Re-initialize inside transaction scope
            for (const move of stockMovements) {
                const orderItem = order.items.find(oi => oi.productId === move.productId);
                if (!orderItem) { throw new Error(`Consistency Error: Cannot find created order item for stock movement: Product ID ${move.productId}`); }

                // Update the InventoryItem quantity using the helper
                await purchaseOrderService._updateInventoryItemQuantity(tx, tenantId, move.productId, locationId, move.quantity.negated());

                // Prepare data for the inventory transaction log
                inventoryTransactionDataBatch.push({
                    tenantId, productId: move.productId, locationId: locationId,
                    transactionType: InventoryTransactionType.SALE,
                    quantityChange: move.quantity.negated(), // Negative for sale
                    unitCost: null, // COGS calculated later if needed
                    relatedOrderId: order.id,
                    relatedOrderItemId: orderItem.id,
                    notes: `Order ${order.orderNumber}`,
                    lotNumber: move.lot, // Lot from the order item DTO
                    serialNumber: move.serial, // Serial from the order item DTO
                    userId: userId,
                    expiryDate: undefined // Add if expiry date is tracked/provided
                });
            }
            // Batch create transaction logs
            if (inventoryTransactionDataBatch.length > 0) {
                await tx.inventoryTransaction.createMany({ data: inventoryTransactionDataBatch });
                logContext.transactionsCreated = inventoryTransactionDataBatch.length;
                logger.debug(`Batch created ${inventoryTransactionDataBatch.length} inventory transactions for order ${order.orderNumber}.`, logContext);
            }

            // 11. Fetch the final order with all details needed for the response
            const finalOrder = await tx.order.findUniqueOrThrow({
                where: { id: order.id },
                include: { // Ensure this matches OrderWithDetails type
                    customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    location: { select: { id: true, name: true } },
                    user: { select: { id: true, firstName: true, lastName: true } },
                    items: { include: { product: { select: { id: true, sku: true, name: true } } } },
                    payments: true,
                    initiatedReturns: { where: { originalOrderId: order.id } }
                }
            });

            return finalOrder; // Return the fully created and fetched order
        }, {
            maxWait: 20000, // Increased maxWait (e.g., 20 seconds)
            timeout: 45000  // Increased timeout (e.g., 45 seconds)
        }); // End Transaction

        const checkoutEndTime = Date.now();
        logContext.durationMs = checkoutEndTime - startTime;
        logContext.txDurationMs = checkoutEndTime - transactionStartTime;
        logger.info(`POS Checkout successful`, logContext);

        // SSE: Broadcast stock update to all POS terminals (stock was deducted)
        for (const item of checkoutData.items) {
            const inventoryItem = await prisma.inventoryItem.findFirst({
                where: { tenantId, productId: item.productId, locationId },
                select: { quantityOnHand: true, quantityAllocated: true }
            });
            if (inventoryItem) {
                sseManager.broadcastStockUpdate(
                    tenantId, locationId, item.productId,
                    Number(inventoryItem.quantityOnHand),
                    Number(inventoryItem.quantityAllocated)
                );
            }
            // CRITICAL: Invalidate Redis product cache so API returns fresh data
            await productService.invalidateProductCache(tenantId, item.productId);
        }

        return createdOrder as OrderWithDetails; // Cast transaction result

    } catch (error: any) {
        const errorEndTime = Date.now();
        logContext.durationMs = errorEndTime - startTime;
        logContext.txDurationMs = transactionStartTime ? errorEndTime - transactionStartTime : undefined; // Log tx duration if started
        if (error instanceof ApiError) {
            logContext.apiError = { statusCode: error.statusCode, message: error.message };
            logger.warn(`POS Checkout failed: ${error.message}`, logContext); // Log known errors as warnings
            throw error; // Re-throw ApiError
        }
        // Log unexpected errors
        logContext.error = error;
        logger.error(`Error during POS checkout transaction`, logContext);
        // Check for specific Prisma transaction errors
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Checkout process timed out due to high load. Please try again.');
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Checkout failed: ${error.message || 'Internal Server Error'}`);
    }
};


















/** Get details of a specific POS Session */
/** Get details of a specific POS Session */
const getSessionById = async (sessionId: string, tenantId: string): Promise<(PosSession & { paymentSummary: any }) | null> => {
    const logContext: LogContext = { function: 'getSessionById', sessionId, tenantId };
    try {
        const session = await prisma.posSession.findFirst({
            where: { id: sessionId, tenantId },
            include: {
                user: { select: { id: true, firstName: true, lastName: true } },
                location: { select: { id: true, name: true } }
            }
        });
        if (!session) { logger.warn(`POS Session not found or tenant mismatch`, logContext); return null; }

        // Calculate Summary
        const { paymentSummary } = await calculateSessionFinancials(prisma, sessionId, session.startingCash);

        logger.debug(`POS Session found successfully`, logContext);
        return { ...session, paymentSummary };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching POS Session by ID`, logContext);
        // --- FIX: Throw from catch ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve session.');
        // ---------------------------
    }
};

/** Query POS Sessions */
const querySessions = async (filter: Prisma.PosSessionWhereInput, orderBy: Prisma.PosSessionOrderByWithRelationInput[], limit: number, page: number): Promise<{ sessions: PosSession[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'querySessions', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }
    try {
        const [sessions, totalResults] = await prisma.$transaction([
            prisma.posSession.findMany({
                where: filter,
                include: {
                    user: { select: { id: true, firstName: true, lastName: true } },
                    location: { select: { id: true, name: true } }
                },
                orderBy, skip, take: limit,
            }),
            prisma.posSession.count({ where: filter }),
        ]);
        logger.debug(`POS Session query successful, found ${sessions.length} of ${totalResults}`, logContext);
        return { sessions, totalResults };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying POS sessions`, logContext);
        // --- FIX: Throw from catch ---
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve sessions.');
        // ---------------------------
    }
};


// --- Suspend/Resume Logic ---
/** Suspend an incomplete order */
import { PosSuspendDto } from './dto/pos-suspend.dto';

const suspendOrder = async (
    suspendData: PosSuspendDto,
    sessionId: string,
    tenantId: string,
    userId: string,
    posTerminalId: string,
    locationId: string
): Promise<OrderWithDetails> => {
    const logContext: LogContext = { function: 'suspendOrder', tenantId, userId, sessionId, locationId };

    // Validate session
    const currentSession = await getCurrentSession(userId, posTerminalId, locationId, tenantId);
    if (!currentSession || currentSession.id !== sessionId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or inactive POS session.');
    }

    // Fetch products to get name/sku for snapshot
    const productIds = suspendData.items.map(item => item.productId);
    const products = await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
        select: { id: true, name: true, sku: true, basePrice: true }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    const createdOrder = await prisma.$transaction(async (tx) => {
        // Create Order Header
        // Fix #3: Use provided orderNumber for re-suspend, or generate new one
        const orderNumber = suspendData.orderNumber || await orderService.generateOrderNumber(tenantId);

        let subtotal = new Prisma.Decimal(0);
        // Calculate subtotal from items
        suspendData.items.forEach(item => {
            const qty = new Prisma.Decimal(item.quantity);
            const price = item.unitPrice ? new Prisma.Decimal(item.unitPrice) : new Prisma.Decimal(0);
            subtotal = subtotal.plus(qty.times(price));
        });

        const discount = new Prisma.Decimal(suspendData.discountAmount ?? 0);
        const total = subtotal.minus(discount);

        // Build notes with tag prefix if provided
        const orderNotes = suspendData.tag
            ? `[TAG:${suspendData.tag}]${suspendData.notes ? ' ' + suspendData.notes : ''}`
            : suspendData.notes || null;

        const order = await tx.order.create({
            data: {
                tenantId, orderNumber, customerId: suspendData.customerId, locationId, posTerminalId, userId,
                orderType: OrderType.POS,
                status: OrderStatus.SUSPENDED,
                orderDate: new Date(),
                subtotal: subtotal,
                discountAmount: discount,
                taxAmount: new Prisma.Decimal(0),
                totalAmount: total,
                currencyCode: 'USD',
                notes: orderNotes,
                isBackordered: false,
                items: {
                    create: suspendData.items.map(item => {
                        const product = productMap.get(item.productId);
                        return {
                            tenantId,
                            productSnapshot: {
                                name: product?.name || 'Unknown',
                                sku: product?.sku || '',
                                price: item.unitPrice ?? product?.basePrice?.toNumber() ?? 0
                            },
                            quantity: new Prisma.Decimal(item.quantity),
                            unitPrice: new Prisma.Decimal(item.unitPrice ?? 0),
                            originalUnitPrice: new Prisma.Decimal(item.unitPrice ?? 0),
                            lineTotal: new Prisma.Decimal(Number(item.quantity) * (Number(item.unitPrice) ?? 0)),
                            product: { connect: { id: item.productId } }
                        };
                    })
                }
            },
            include: {
                items: { include: { product: { select: { id: true, sku: true, name: true, basePrice: true } } } },
                customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                location: { select: { id: true, name: true } },
                user: { select: { id: true, firstName: true, lastName: true } },
                payments: true
            }
        });

        // Fix #2: Reserve stock by incrementing quantityAllocated for each item
        for (const item of suspendData.items) {
            await tx.inventoryItem.updateMany({
                where: {
                    tenantId,
                    productId: item.productId,
                    locationId,
                },
                data: {
                    quantityAllocated: {
                        increment: new Prisma.Decimal(item.quantity)
                    }
                }
            });
        }

        return order;
    });

    // Fix #12: Create audit log for order suspension
    await prisma.posAuditLog.create({
        data: {
            tenantId,
            locationId,
            userId,
            sessionId: currentSession.id,
            action: PosAuditAction.ORDER_SUSPENDED,
            orderId: createdOrder.id,
            orderNumber: createdOrder.orderNumber,
            orderTag: suspendData.tag || (suspendData.notes?.match(/\[TAG:([^\]]+)\]/)?.[1]),
            totalAmount: createdOrder.totalAmount,
            itemCount: suspendData.items.length,
            customerId: suspendData.customerId,
        }
    }).catch(err => logger.warn('Failed to create audit log for suspend', { error: err })); // Non-blocking

    // SSE: Broadcast stock update to all POS terminals at this location
    for (const item of suspendData.items) {
        const inventoryItem = await prisma.inventoryItem.findFirst({
            where: { tenantId, productId: item.productId, locationId },
            select: { quantityOnHand: true, quantityAllocated: true }
        });
        if (inventoryItem) {
            sseManager.broadcastStockUpdate(
                tenantId, locationId, item.productId,
                Number(inventoryItem.quantityOnHand),
                Number(inventoryItem.quantityAllocated)
            );
        }
        // CRITICAL: Invalidate Redis product cache so API returns fresh data
        await productService.invalidateProductCache(tenantId, item.productId);
    }

    // SSE: Broadcast suspended order count update
    const suspendedCount = await prisma.order.count({
        where: { tenantId, locationId, status: OrderStatus.SUSPENDED }
    });
    sseManager.broadcastSuspendedCountUpdate(tenantId, locationId, suspendedCount);

    logger.info(`Order suspended successfully`, { ...logContext, orderId: createdOrder.id, tag: suspendData.tag });
    return createdOrder as unknown as OrderWithDetails;
};

/** Get suspended orders */
const getSuspendedOrders = async (tenantId: string, locationId: string): Promise<OrderWithDetails[]> => {
    return prisma.order.findMany({
        where: {
            tenantId,
            locationId,
            status: OrderStatus.SUSPENDED
        },
        include: {
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
            location: { select: { id: true, name: true } },
            user: { select: { id: true, firstName: true, lastName: true } },
            items: { include: { product: { select: { id: true, sku: true, name: true, basePrice: true } } } },
            payments: true,
            initiatedReturns: true,
            returnForExchange: true
        },
        orderBy: { createdAt: 'desc' }
    }) as unknown as OrderWithDetails[];
};

/** Resume/delete a suspended order after recall */
const resumeOrder = async (
    orderId: string,
    tenantId: string,
    locationId: string,
    userId: string,
    posTerminalId: string
): Promise<void> => {
    const logContext: LogContext = { function: 'resumeOrder', tenantId, orderId, locationId, userId };

    // Fix #10: Validate session like suspendOrder does
    const currentSession = await getCurrentSession(userId, posTerminalId, locationId, tenantId);
    if (!currentSession) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No active POS session. Start a session to recall orders.');
    }

    // Fix #5: Use transaction with row lock to prevent concurrent recalls
    const order = await prisma.$transaction(async (tx) => {
        // Lock the row for update - prevents another transaction from deleting while we're working
        const orders = await tx.$queryRaw<{ id: string; orderNumber: string; notes: string | null; totalAmount: any; customerId: string | null }[]>`
            SELECT id, order_number as "orderNumber", notes, total_amount as "totalAmount", customer_id as "customerId"
            FROM orders 
            WHERE id = ${orderId} 
              AND tenant_id = ${tenantId} 
              AND location_id = ${locationId} 
              AND status = 'SUSPENDED'
            FOR UPDATE NOWAIT
        `;

        if (!orders || orders.length === 0) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Suspended order not found or already recalled.');
        }

        const order = orders[0];

        // Fix #2: Release stock allocation by fetching order items and decrementing quantityAllocated
        const orderItems = await tx.orderItem.findMany({
            where: { orderId: orderId },
            select: { productId: true, quantity: true }
        });

        for (const item of orderItems) {
            await tx.inventoryItem.updateMany({
                where: {
                    tenantId,
                    productId: item.productId,
                    locationId,
                },
                data: {
                    quantityAllocated: {
                        decrement: item.quantity
                    }
                }
            });
        }

        // Delete the suspended order (items will cascade delete)
        await tx.order.delete({ where: { id: orderId } });

        return order;
    }).catch((err: any) => {
        // Handle lock acquisition failure (another user is recalling)
        if (err.code === 'P2034' || err.message?.includes('NOWAIT')) {
            throw new ApiError(httpStatus.CONFLICT, 'Order is being recalled by another user. Please try again.');
        }
        throw err;
    });

    // Fix #12: Create audit log for order recall
    await prisma.posAuditLog.create({
        data: {
            tenantId,
            locationId,
            userId,
            sessionId: currentSession.id,
            action: PosAuditAction.ORDER_RECALLED,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderTag: order.notes?.match(/\[TAG:([^\]]+)\]/)?.[1],
            totalAmount: order.totalAmount,
            customerId: order.customerId,
        }
    }).catch(err => logger.warn('Failed to create audit log for recall', { error: err })); // Non-blocking

    // SSE: Broadcast suspended order count update (items were fetched before delete, so we need to re-query)
    const suspendedCount = await prisma.order.count({
        where: { tenantId, locationId, status: OrderStatus.SUSPENDED }
    });
    sseManager.broadcastSuspendedCountUpdate(tenantId, locationId, suspendedCount);

    // SSE: Broadcast stock update - stock allocation was released
    // Note: We fetched order items before delete within the transaction
    // We can approximate by broadcasting a general refresh signal
    sseManager.broadcastStockUpdate(tenantId, locationId, 'ALL', 0, 0); // Signal to refresh all products

    logger.info(`Suspended order deleted/resumed`, logContext);
};

export const posService = {
    // Session Management
    getCurrentSession,
    startSession,
    endSession,
    reconcileSession,
    recordCashTransaction,
    getSessionById,
    querySessions,
    // Checkout
    processPosCheckout,
    // Suspend
    suspendOrder,
    getSuspendedOrders,
    resumeOrder
};