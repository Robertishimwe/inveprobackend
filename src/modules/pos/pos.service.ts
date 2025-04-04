import httpStatus from 'http-status';
import {
    Prisma, PosSession, PosSessionStatus, PosTransactionType, OrderType, PaymentMethod, PaymentStatus, // Added PaymentStatus
    OrderStatus, InventoryTransactionType, PosSessionTransaction // Added Payment, PosSessionTransaction
} from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';

import { StartSessionDto } from './dto/start-session.dto';
import { EndSessionDto } from './dto/end-session.dto';
import { CashTransactionDto } from './dto/cash-transaction.dto';
import { PosCheckoutDto } from './dto/pos-checkout.dto';
// import { StartSessionDto, EndSessionDto, CashTransactionDto, PosCheckoutDto } from './dto';
// Assuming these are correctly typed and exported
import { OrderWithDetails } from '@/modules/orders/order.service';
import { orderService } from '@/modules/orders/order.service';
import { inventoryService } from '@/modules/inventory/inventory.service';


type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; sessionId?: string | null; terminalId?: string | null; locationId?: string | null; error?: any; [key: string]: any; };

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
                    tenantId, locationId, posTerminalId, userId,
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


const endSession = async (sessionId: string, data: EndSessionDto, userId: string, posTerminalId: string, locationId: string, tenantId: string): Promise<PosSession> => {
    const logContext: LogContext = { function: 'endSession', sessionId, userId, posTerminalId, locationId, tenantId, endingCash: data.endingCash };

    try {
        const endedSession = await prisma.$transaction(async (tx) => {
            const session = await tx.posSession.findFirst({
                where: { id: sessionId, tenantId, userId, posTerminalId, locationId, status: PosSessionStatus.OPEN }
            });
            if (!session) {
                throw new ApiError(httpStatus.NOT_FOUND, 'Active session not found for this user/terminal/location, or session ID is incorrect.');
            }

            // Calculate expected cash
            const transactions = await tx.posSessionTransaction.findMany({
                where: { posSessionId: sessionId }
            });
            let calculatedCash = session.startingCash; // Start with float

            // --- FIX: Use explicit comparisons or switch statement ---
            transactions.forEach(t => {
                switch (t.transactionType) {
                    case PosTransactionType.PAY_IN:
                    case PosTransactionType.CASH_SALE:
                        calculatedCash = calculatedCash.plus(t.amount);
                        break;
                    case PosTransactionType.PAY_OUT:
                    case PosTransactionType.CASH_REFUND:
                        calculatedCash = calculatedCash.minus(t.amount);
                        break;
                    // Default case is optional - handle unexpected types?
                    // default:
                    //     logger.warn(`Encountered unexpected PosTransactionType: ${t.transactionType} in session ${sessionId}`);
                }
                /* // Alternative using if/else if
                if (t.transactionType === PosTransactionType.PAY_IN || t.transactionType === PosTransactionType.CASH_SALE) {
                    calculatedCash = calculatedCash.plus(t.amount);
                } else if (t.transactionType === PosTransactionType.PAY_OUT || t.transactionType === PosTransactionType.CASH_REFUND) {
                    calculatedCash = calculatedCash.minus(t.amount);
                }
                */
            });
            // --- End of FIX ---


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
            return updatedSession;
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
const reconcileSession = async (sessionId: string, tenantId: string): Promise<PosSession> => {
     const logContext: LogContext = { function: 'reconcileSession', sessionId, tenantId };
      const session = await prisma.posSession.findFirst({
          where: { id: sessionId, tenantId, status: PosSessionStatus.CLOSED }
      });
      if (!session) throw new ApiError(httpStatus.NOT_FOUND, 'Closed session not found for reconciliation.');

      try {
        const reconciledSession = await prisma.posSession.update({
            where: { id: sessionId },
            data: { status: PosSessionStatus.RECONCILED }
        });
        logger.info(`POS session reconciled successfully`, logContext);
        return reconciledSession;
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

    // --- Pre-computation and Validation (outside transaction if possible) ---
    // 1. Validate Session is active for this user/terminal/location
    const currentSession = await getCurrentSession(userId, posTerminalId, locationId, tenantId); // Assumes getCurrentSession exists
    if (!currentSession || currentSession.id !== sessionId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or inactive POS session for this user/terminal/location.');
    }

    // 2. Fetch Products (ensure they exist, are active, and get stock levels)
    const productIds = checkoutData.items.map(item => item.productId);
    if (productIds.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Checkout must include at least one item.');
    }
    const products = await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId, isActive: true }, // Ensure products are active
        include: { inventoryItems: { where: { locationId: locationId } } }
    });
    // Verify all requested products were found and belong to the tenant
    if (products.length !== productIds.length) {
        const foundIds = products.map(p => p.id);
        const missingIds = productIds.filter(id => !foundIds.includes(id));
        throw new ApiError(httpStatus.BAD_REQUEST, `Product IDs not found or inactive: ${missingIds.join(', ')}`);
    }

    // 3. Basic Payment Validation (Total amount check)
    if (!checkoutData.payments || checkoutData.payments.length === 0) {
         throw new ApiError(httpStatus.BAD_REQUEST, 'At least one payment method is required for checkout.');
    }
    const totalPaymentAmount = checkoutData.payments.reduce((sum, p) => sum + p.amount, 0);
    if (totalPaymentAmount <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Total payment amount must be positive.');
    }

    // --- Transactional Operations ---
    try {
        const createdOrder = await prisma.$transaction(async (tx) => {

            // Optional: Re-fetch session within transaction for locking if strict consistency is needed
            const session = await tx.posSession.findFirst({ where: { id: sessionId, status: PosSessionStatus.OPEN }, select: { id: true }});
            if (!session) throw new Error("Session closed unexpectedly during transaction."); // Internal error state

            // 4. Prepare Order Items & Check Stock/Calculate Totals (within transaction)
            let calculatedSubtotal = new Prisma.Decimal(0);
            const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = []; // Use type for nested create
            const stockMovements: { productId: string; quantity: Prisma.Decimal; lot?: string | null; serial?: string | null }[] = [];
            let needsBackorder = false; // Flag if any item needs backorder

            const stockChecks: { productId: string, requested: Prisma.Decimal, available: Prisma.Decimal, isTracked: boolean, sku: string }[] = [];

            for (const itemDto of checkoutData.items) {
                const product = products.find(p => p.id === itemDto.productId);
                // This check should ideally be redundant due to the fetch above, but good safeguard
                if (!product) throw new Error(`Consistency Error: Product ${itemDto.productId} not found during transaction.`);

                const requestedQuantity = new Prisma.Decimal(itemDto.quantity);
                if(requestedQuantity.lessThanOrEqualTo(0)) {
                    throw new ApiError(httpStatus.BAD_REQUEST, `Quantity for product ${product.sku} must be positive.`);
                }

                // Determine Unit Price (use DTO override or product's base price)
                const unitPrice = itemDto.unitPrice !== undefined
                    ? new Prisma.Decimal(itemDto.unitPrice)
                    : product.basePrice ?? new Prisma.Decimal(0); // Default to 0 if basePrice is null

                if (unitPrice.lessThan(0)) {
                    throw new ApiError(httpStatus.BAD_REQUEST, `Unit price for product ${product.sku} cannot be negative.`);
                }

                const lineTotal = unitPrice.times(requestedQuantity);
                calculatedSubtotal = calculatedSubtotal.plus(lineTotal);

                // Prepare data for OrderItem creation using nested create syntax
                orderItemsData.push({
                    tenantId, // Include tenantId if defined directly on OrderItem schema (usually inherited)
                    product: { // Use relation field name
                        connect: { id: product.id } // Connect by ID
                    },
                    productSnapshot: { sku: product.sku, name: product.name, price: unitPrice.toNumber() }, // Capture at time of sale
                    quantity: requestedQuantity,
                    unitPrice: unitPrice,
                    originalUnitPrice: product.basePrice, // Store original price
                    // TODO: Add Tax calculation logic here and assign to taxAmount/taxRate
                    taxAmount: 0,
                    taxRate: 0,
                    lineTotal: lineTotal,
                    lotNumber: itemDto.lotNumber, // Pass through if provided
                    serialNumber: itemDto.serialNumber, // Pass through if provided
                    notes: itemDto.notes,
                    // quantityReturned defaults to 0
                    // customAttributes: ... // Add if needed
                });

                // Check Stock (only for tracked items)
                if (product.isStockTracked) {
                    const inventory = product.inventoryItems[0]; // Fetched for the specific location
                    const availableQuantity = inventory
                        ? inventory.quantityOnHand.minus(inventory.quantityAllocated) // Available = OnHand - Allocated
                        : new Prisma.Decimal(0);

                    // Add details to stock checks list
                    stockChecks.push({ productId: product.id, requested: requestedQuantity, available: availableQuantity, isTracked: true, sku: product.sku });

                    // Handle insufficient stock
                    if (availableQuantity.lessThan(requestedQuantity)) {
                        // TODO: Implement tenant/product level configuration for backorders
                        const allowBackorder = false; // Replace with actual config check
                        if (!allowBackorder) {
                             throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock for product ${product.sku}. Available: ${availableQuantity}, Requested: ${requestedQuantity}`);
                        } else {
                             logContext.backorderedProduct = product.sku;
                             logger.warn(`Product ${product.sku} is backordered`, logContext);
                             needsBackorder = true; // Mark order for backorder status
                        }
                    }
                     // Add details needed for stock movement later
                    stockMovements.push({
                        productId: product.id,
                        quantity: requestedQuantity, // Store positive quantity needed
                        lot: itemDto.lotNumber,
                        serial: itemDto.serialNumber
                    });
                } else {
                     stockChecks.push({ productId: product.id, requested: requestedQuantity, available: new Prisma.Decimal(Infinity), isTracked: false, sku: product.sku });
                     // No stock movement needed for non-tracked items
                }
            }

            // 5. Calculate Final Order Total
            const discountTotal = new Prisma.Decimal(checkoutData.discountAmount ?? 0);
            const shippingTotal = new Prisma.Decimal(0); // Typically zero for POS
            const taxTotal = new Prisma.Decimal(0); // TODO: Implement Tax Calculation Service/Logic
            const calculatedTotal = calculatedSubtotal.minus(discountTotal).plus(shippingTotal).plus(taxTotal);

            // 6. Validate Payment Total against Order Total
            const paymentTotalDecimal = new Prisma.Decimal(totalPaymentAmount);
            // Use tolerance for potential floating point issues if needed, but Decimal should be precise
            if (!paymentTotalDecimal.equals(calculatedTotal)) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Payment total (${paymentTotalDecimal}) does not match calculated order total (${calculatedTotal}). Please verify cart and payment amounts.`);
            }

            // 7. Generate Order Number
            const orderNumber = await orderService.generateOrderNumber(tenantId); // Consider if needs to be outside tx

            // 8. Create Order Header including nested Items and Payments
            const order = await tx.order.create({
                data: {
                    tenantId,
                    orderNumber,
                    customerId: checkoutData.customerId,
                    locationId, // Use locationId from context
                    posTerminalId, // Use terminalId from context
                    userId, // Use cashier ID from context
                    orderType: OrderType.POS, // Explicitly POS
                    status: OrderStatus.COMPLETED, // POS orders usually completed immediately
                    orderDate: new Date(),
                    subtotal: calculatedSubtotal,
                    discountAmount: discountTotal,
                    taxAmount: taxTotal,
                    shippingCost: shippingTotal,
                    totalAmount: calculatedTotal,
                    currencyCode: 'USD', // TODO: Get from tenant/location settings
                    notes: checkoutData.notes,
                    shippingAddress: checkoutData.shippingAddress as Prisma.JsonObject ?? Prisma.JsonNull,
                    shippingMethod: checkoutData.shippingAddress ? 'POS Pickup/Ship' : null, // Indicate if shipping involved
                    // trackingNumber: null, // Set later if shipped
                    isBackordered: needsBackorder,
                    items: {
                        create: orderItemsData, // Use the correctly formatted array for nested create
                    },
                    payments: { // Use nested create for payments
                        create: checkoutData.payments.map(p => ({
                            tenantId, // Include if needed by schema
                            paymentMethod: p.paymentMethod,
                            amount: new Prisma.Decimal(p.amount),
                            currencyCode: 'USD', // Use order currency
                            status: PaymentStatus.COMPLETED, // Assume POS payments are completed
                            transactionReference: p.transactionReference,
                            paymentDate: new Date(),
                            processedByUserId: userId, // User processing the payment
                        })),
                    }
                },
                include: { items: { select: { id: true, productId: true, lotNumber: true, serialNumber: true }}} // Include items to link stock tx and get lot/serial info if needed
            });
            logContext.orderId = order.id; logContext.orderNumber = order.orderNumber;

            // 9. Log CASH payment(s) to POS Session Transaction log
            const cashPayments = checkoutData.payments.filter(p => p.paymentMethod === PaymentMethod.CASH);
            for (const cashPayment of cashPayments) {
                 await tx.posSessionTransaction.create({
                     data: {
                         tenantId, // Add if needed
                         posSessionId: sessionId,
                         transactionType: PosTransactionType.CASH_SALE,
                         amount: new Prisma.Decimal(cashPayment.amount), // Positive amount for cash received
                         relatedOrderId: order.id, // Link to the order
                         notes: `Cash payment for Order ${order.orderNumber}`
                     }
                 });
            }

            // 10. Record Stock Movements (Decrease OnHand for tracked items)
            for (const move of stockMovements) {
                 // Find the created order item to link the transaction
                const orderItem = order.items.find(oi => oi.productId === move.productId);
                if (!orderItem) {
                    // This indicates a serious consistency issue if an item was processed but not created
                    throw new Error(`Consistency Error: Cannot find created order item for stock movement: Product ID ${move.productId} on Order ID ${order.id}`);
                }
                await inventoryService._recordStockMovement(
                     tx, tenantId, userId, move.productId, locationId, // Use order's locationId
                     move.quantity.negated(), // Decrease stock (use negated Decimal)
                     InventoryTransactionType.SALE,
                     null, // Cost of Goods Sold calculation happens later if needed
                     { orderId: order.id, orderItemId: orderItem.id }, // Link transaction
                     `Order ${order.orderNumber}`,
                     // Use lot/serial determined during order item creation/stock check if applicable
                     orderItem.lotNumber,
                     orderItem.serialNumber
                 );
            }

            // 11. Fetch the final order with all details for the response
             const finalOrder = await tx.order.findUniqueOrThrow({
                where: { id: order.id },
                include: { // Define includes consistent with OrderWithDetails
                    customer: { select: { id: true, firstName: true, lastName: true, email: true } },
                    location: { select: { id: true, name: true } },
                    user: { select: { id: true, firstName: true, lastName: true } },
                    items: { include: { product: { select: { id: true, sku: true, name: true } } } },
                    payments: true,
                    returns: { where: { originalOrderId: order.id } }
                }
             });

            return finalOrder; // Return the created order with includes
        }, {
            maxWait: 15000, // Allow 15 seconds for the operation to start
            timeout: 30000  // <<< Allow 30 seconds for the entire transaction
        });

        logger.info(`POS Checkout successful`, logContext);
        return createdOrder as OrderWithDetails; // Cast transaction result

    } catch (error: any) {
        if (error instanceof ApiError) throw error; // Re-throw known validation/stock errors
        logContext.error = error;
        logger.error(`Error during POS checkout transaction`, logContext);
        // Provide a more context-specific error if possible
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Checkout failed: ${error.message || 'Internal Server Error'}`);
    }
};



/** Get details of a specific POS Session */
const getSessionById = async (sessionId: string, tenantId: string): Promise<PosSession | null> => {
    const logContext: LogContext = { function: 'getSessionById', sessionId, tenantId };
    try {
        const session = await prisma.posSession.findFirst({
            where: { id: sessionId, tenantId },
            include: {
                 user: { select: { id: true, firstName: true, lastName: true } },
                 location: { select: { id: true, name: true } }
                 // transactions: { orderBy: { timestamp: 'asc' }} // Maybe add pagination later
            }
        });
        if (!session) { logger.warn(`POS Session not found or tenant mismatch`, logContext); return null; }
        logger.debug(`POS Session found successfully`, logContext);
        return session;
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
};