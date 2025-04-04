"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryService = void 0;
// src/modules/inventory/inventory.service.ts
const client_1 = require("@prisma/client"); // Ensure all necessary Prisma types are imported
const http_status_1 = __importDefault(require("http-status"));
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
// --- Internal Helper: Record Stock Movement ---
/**
 * Atomically updates InventoryItem and logs an InventoryTransaction.
 * Handles Prisma Decimal type correctly.
 * This is the core function for ALL inventory changes.
 */
const _recordStockMovement = async (tx, // Requires Prisma Transaction Client
tenantId, userId, // User performing the action
productId, locationId, quantityChangeInput, // Accept number or Decimal
transactionType, unitCost, // Optional: Cost for valuation
relatedIds, notes, lotNumber, serialNumber
// expiryDate?: Date | null // Add if tracking expiry date
) => {
    // Convert quantityChangeInput to Prisma.Decimal
    const quantityChange = new client_1.Prisma.Decimal(quantityChangeInput);
    const logContext = {
        function: "_recordStockMovement",
        tenantId,
        userId,
        productId,
        locationId,
        quantityChange: quantityChange.toNumber(),
        transactionType,
    }; // Log number for readability
    if (quantityChange.isZero()) {
        // Consider if logging a zero change attempt is useful
        logger_1.default.warn(`Attempted stock movement with zero quantity change`, logContext);
        // It might be better to throw or return a specific indicator instead of proceeding
        throw new Error("Stock movement quantity change cannot be zero.");
    }
    // 1. Find or Create Inventory Item (handles product/location validation implicitly)
    const inventoryItem = await tx.inventoryItem.upsert({
        where: {
            tenantId_productId_locationId: { tenantId, productId, locationId },
        },
        create: {
            tenantId,
            productId,
            locationId,
            quantityOnHand: quantityChange, // Initial quantity
            // Initialize other fields like allocated/incoming if needed
            quantityAllocated: 0,
            quantityIncoming: 0,
            // averageCost: unitCost ? new Prisma.Decimal(unitCost) : undefined, // Initialize avg cost if possible? Risky without quantity.
        },
        update: {
            quantityOnHand: {
                increment: quantityChange, // Atomic update using Decimal
            },
            // TODO: Add more sophisticated logic here based on transactionType
            // e.g., if SALE, increment quantityAllocated appropriately before decrementing onHand?
            // e.g., if PURCHASE_RECEIPT, decrement quantityIncoming?
            // This depends heavily on detailed order/PO fulfillment logic.
            updatedAt: new Date(),
        },
    });
    logContext.inventoryItemId = inventoryItem.id;
    // 2. Post-update Check: Prevent negative stock unless allowed by configuration
    if (inventoryItem.quantityOnHand.lessThan(0)) {
        // TODO: Fetch tenant configuration to check if negative stock is allowed
        const allowNegativeStock = false; // Replace with actual config lookup
        if (!allowNegativeStock) {
            logger_1.default.error(`Operation resulted in negative stock for item ${inventoryItem.id}, which is not allowed.`, logContext);
            // IMPORTANT: Since this check is *after* the update, we need to signal failure to potentially rollback the transaction
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Operation results in negative stock for product ID ${productId} at location ${locationId}.`);
        }
        else {
            logger_1.default.warn(`Stock quantity went negative for item ${inventoryItem.id} (Allowed by config).`, logContext);
        }
    }
    // 3. Create the immutable transaction log record
    const transaction = await tx.inventoryTransaction.create({
        data: {
            tenantId,
            productId,
            locationId,
            transactionType,
            quantityChange: quantityChange, // Store as Decimal
            unitCost: unitCost ? new client_1.Prisma.Decimal(unitCost) : undefined, // Convert cost if provided
            lotNumber,
            serialNumber,
            // expiryDate,
            relatedOrderId: relatedIds?.orderId,
            relatedOrderItemId: relatedIds?.orderItemId,
            relatedPoId: relatedIds?.poId,
            relatedPoItemId: relatedIds?.poItemId,
            relatedTransferId: relatedIds?.transferId,
            relatedAdjustmentId: relatedIds?.adjustmentId,
            relatedReturnItemId: relatedIds?.returnItemId,
            userId,
            notes,
            // Optional: Store quantity AFTER the change for easier auditing?
            // quantityAfter: inventoryItem.quantityOnHand
        },
    });
    logContext.transactionId = transaction.id;
    logger_1.default.debug(`Stock movement recorded successfully`, logContext);
    // TODO: Add logic here to handle InventoryDetail records for lot/serial/expiry tracking
    // This would involve finding/creating/updating InventoryDetail rows based on lot/serial/expiry
    // and associating them with the inventoryItem. This requires careful handling of quantities
    // within lots/serials and potentially complex logic if quantityChange spans multiple lots.
    return { updatedItem: inventoryItem, transaction };
};
// --- Adjustment Service Methods ---
/** Create an Inventory Adjustment */
const createAdjustment = async (data, tenantId, userId) => {
    const logContext = {
        function: "createAdjustment",
        tenantId,
        userId,
        locationId: data.locationId,
    };
    // Validate Location
    const locationExists = await config_1.prisma.location.findFirst({
        where: { id: data.locationId, tenantId },
        select: { id: true },
    });
    if (!locationExists)
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Location with ID ${data.locationId} not found.`);
    // Validate Products & Stock Tracking status
    const productIds = data.items.map((item) => item.productId);
    const validProducts = await config_1.prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
        select: { id: true, isStockTracked: true },
    });
    if (validProducts.length !== productIds.length) {
        const invalidIds = productIds.filter((id) => !validProducts.some((p) => p.id === id));
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Invalid Product IDs found: ${invalidIds.join(", ")}`);
    }
    for (const item of data.items) {
        const product = validProducts.find((p) => p.id === item.productId);
        if (!product?.isStockTracked) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Product ${item.productId} is not tracked by stock and cannot be adjusted.`);
        }
    }
    try {
        // Use transaction to ensure atomicity
        const { adjustment, transactionIds } = await config_1.prisma.$transaction(async (tx) => {
            // 1. Create Adjustment Header
            const adj = await tx.inventoryAdjustment.create({
                data: {
                    tenantId,
                    locationId: data.locationId,
                    reasonCode: data.reasonCode,
                    notes: data.notes,
                    createdByUserId: userId,
                },
            });
            logContext.adjustmentId = adj.id;
            const txIds = [];
            // 2. Process Items and Record Stock Movements
            for (const item of data.items) {
                if (item.quantityChange === 0)
                    continue; // Skip zero quantity changes
                const { transaction } = await _recordStockMovement(tx, tenantId, userId, item.productId, data.locationId, item.quantityChange, // Pass number, helper converts to Decimal
                item.quantityChange > 0
                    ? client_1.InventoryTransactionType.ADJUSTMENT_IN
                    : client_1.InventoryTransactionType.ADJUSTMENT_OUT, item.unitCost, // Pass number or undefined
                { adjustmentId: adj.id }, // Link transaction to adjustment
                data.reasonCode ?? data.notes, // Use reason or notes
                item.lotNumber, item.serialNumber);
                txIds.push(transaction.id);
                // 3. Create adjustment item link (useful for querying adjustment details)
                await tx.inventoryAdjustmentItem.create({
                    data: {
                        tenantId, // Needed if model has tenantId directly
                        adjustmentId: adj.id,
                        productId: item.productId,
                        quantityChange: new client_1.Prisma.Decimal(item.quantityChange), // Ensure Decimal
                        unitCost: item.unitCost
                            ? new client_1.Prisma.Decimal(item.unitCost)
                            : undefined, // Ensure Decimal
                        lotNumber: item.lotNumber,
                        serialNumber: item.serialNumber,
                    },
                });
            }
            if (txIds.length === 0) {
                logger_1.default.warn(`Inventory adjustment created but resulted in no stock movements (all items had zero quantity change).`, logContext);
                // Consider if an adjustment with zero effective change should be allowed or raise an error.
                // For now, proceed.
            }
            return { adjustment: adj, transactionIds: txIds };
        });
        logger_1.default.info(`Inventory adjustment created successfully`, logContext);
        return { adjustmentId: adjustment.id, transactionIds };
    }
    catch (error) {
        if (error instanceof ApiError_1.default)
            throw error; // Re-throw known validation/logic errors
        logContext.error = error;
        logger_1.default.error(`Error creating inventory adjustment`, logContext);
        // Handle potential transaction rollback errors
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to create inventory adjustment.");
    }
};
// --- Transfer Service Methods ---
/** Create an Inventory Transfer request */
const createTransfer = async (data, tenantId, userId) => {
    const logContext = {
        function: "createTransfer",
        tenantId,
        userId,
        source: data.sourceLocationId,
        dest: data.destinationLocationId,
    };
    if (data.sourceLocationId === data.destinationLocationId) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, "Source and destination locations cannot be the same.");
    }
    // Validate Locations exist for the tenant
    const locations = await config_1.prisma.location.findMany({
        where: {
            id: { in: [data.sourceLocationId, data.destinationLocationId] },
            tenantId,
        },
        select: { id: true },
    });
    if (locations.length !== 2)
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, "Invalid source or destination location ID.");
    // Validate Products exist & are stock tracked
    const productIds = data.items.map((item) => item.productId);
    const validProducts = await config_1.prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
        select: { id: true, isStockTracked: true },
    });
    if (validProducts.length !== productIds.length) {
        const invalidIds = productIds.filter((id) => !validProducts.some((p) => p.id === id));
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Invalid Product IDs found: ${invalidIds.join(", ")}`);
    }
    for (const item of data.items) {
        const product = validProducts.find((p) => p.id === item.productId);
        if (!product?.isStockTracked) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Product ${item.productId} is not tracked by stock and cannot be transferred.`);
        }
        if (item.quantityRequested <= 0) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Requested quantity for product ${item.productId} must be positive.`);
        }
    }
    try {
        const transfer = await config_1.prisma.inventoryTransfer.create({
            data: {
                tenantId,
                sourceLocationId: data.sourceLocationId,
                destinationLocationId: data.destinationLocationId,
                status: client_1.TransferStatus.PENDING, // Initial status
                notes: data.notes,
                createdByUserId: userId,
                items: {
                    create: data.items.map((item) => ({
                        tenantId, // Needed if model has tenantId directly
                        productId: item.productId,
                        quantityRequested: new client_1.Prisma.Decimal(item.quantityRequested), // Ensure Decimal
                        // quantityShipped/Received default to 0
                    })),
                },
            },
            select: { id: true }, // Only need ID back
        });
        logContext.transferId = transfer.id;
        logger_1.default.info(`Inventory transfer request created successfully`, logContext);
        return { transferId: transfer.id };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error creating inventory transfer`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to create inventory transfer.");
    }
};
/** Ship an Inventory Transfer */
const shipTransfer = async (transferId, tenantId, userId
// TODO: Add optional DTO for shipping details (e.g., partial quantities, lots/serials shipped)
) => {
    const logContext = {
        function: "shipTransfer",
        tenantId,
        userId,
        transferId,
    };
    try {
        const result = await config_1.prisma.$transaction(async (tx) => {
            // 1. Find transfer and items, ensure it's PENDING
            const transfer = await tx.inventoryTransfer.findUnique({
                where: { id: transferId, tenantId: tenantId },
                include: { items: true },
            });
            if (!transfer)
                throw new ApiError_1.default(http_status_1.default.NOT_FOUND, "Transfer not found.");
            if (transfer.status !== client_1.TransferStatus.PENDING) {
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Transfer status is already ${transfer.status}, cannot ship.`);
            }
            // 2. Update Transfer status (potentially based on full/partial shipment)
            // For now, assume full shipment attempt and set to IN_TRANSIT
            await tx.inventoryTransfer.update({
                where: { id: transferId },
                data: { status: client_1.TransferStatus.IN_TRANSIT },
            });
            const transactionIds = [];
            // 3. Process Items: Decrease stock at source, log transactions
            for (const item of transfer.items) {
                // Assume shipping full requested quantity now
                const quantityToShip = item.quantityRequested; // This is already Decimal
                if (quantityToShip.isZero() || quantityToShip.lessThan(0)) {
                    logger_1.default.warn(`Skipping shipping for item ${item.id} with zero/negative quantity`, logContext);
                    continue;
                }
                // TODO: Add check here for available stock at source location before decrementing?
                // This would require fetching the source InventoryItem within the transaction.
                const { transaction } = await _recordStockMovement(tx, tenantId, userId, item.productId, transfer.sourceLocationId, quantityToShip.negated(), // Use negated Decimal value for decrease
                client_1.InventoryTransactionType.TRANSFER_OUT, null, // Cost not tracked on transfer out
                { transferId: transfer.id }, `Shipped for transfer ${transferId}`, item.lotNumber, // Use if lot was pre-assigned
                item.serialNumber // Use if serial was pre-assigned
                );
                transactionIds.push(transaction.id);
                // Update the shipped quantity on the item line
                await tx.inventoryTransferItem.update({
                    where: { id: item.id },
                    data: { quantityShipped: quantityToShip }, // Store Decimal
                });
            }
            // Check if any movements actually occurred
            if (transactionIds.length === 0) {
                logger_1.default.warn(`Inventory transfer shipping resulted in no stock movements (all items might have had zero quantity).`, logContext);
                // Optionally roll back status change if nothing was shipped?
                // await tx.inventoryTransfer.update({ where: { id: transferId }, data: { status: TransferStatus.PENDING } });
                // throw new ApiError(httpStatus.BAD_REQUEST, "No items with quantity > 0 to ship.");
            }
            return { transferId: transfer.id, transactionIds };
        });
        logger_1.default.info(`Inventory transfer ${result.transferId} shipped successfully`, logContext);
        return { success: true };
    }
    catch (error) {
        if (error instanceof ApiError_1.default)
            throw error;
        logContext.error = error;
        logger_1.default.error(`Error shipping inventory transfer`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to ship inventory transfer.");
    }
};
/** Receive items for an Inventory Transfer */
const receiveTransfer = async (transferId, data, tenantId, userId) => {
    const logContext = {
        function: "receiveTransfer",
        tenantId,
        userId,
        transferId,
    };
    try {
        const result = await config_1.prisma.$transaction(async (tx) => {
            // 1. Find transfer and items, ensure it's PENDING or IN_TRANSIT
            const transfer = await tx.inventoryTransfer.findUnique({
                where: { id: transferId, tenantId: tenantId },
                include: { items: true },
            });
            if (!transfer)
                throw new ApiError_1.default(http_status_1.default.NOT_FOUND, "Transfer not found.");
            if (transfer.status === client_1.TransferStatus.COMPLETED ||
                transfer.status === client_1.TransferStatus.CANCELLED) {
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Transfer status is ${transfer.status}, cannot receive.`);
            }
            const transactionIds = [];
            let totalReceivedForAllItems = new client_1.Prisma.Decimal(0);
            let totalRequestedForAllItems = new client_1.Prisma.Decimal(0);
            const receiveItemsMap = new Map(data.items.map((item) => [item.productId, item])); // Map for quick lookup
            // 2. Process Received Items iteratively based on transfer lines
            for (const transferLineItem of transfer.items) {
                totalRequestedForAllItems = totalRequestedForAllItems.plus(transferLineItem.quantityRequested);
                const receivedItemPayload = receiveItemsMap.get(transferLineItem.productId);
                if (receivedItemPayload) {
                    logContext.productId = receivedItemPayload.productId; // Add product to context
                    const quantityReceivedDecimal = new client_1.Prisma.Decimal(receivedItemPayload.quantityReceived);
                    // Calculate max quantity that can *still* be received for this line item
                    const maxReceivable = transferLineItem.quantityRequested.minus(transferLineItem.quantityReceived);
                    if (quantityReceivedDecimal.greaterThan(maxReceivable)) {
                        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot receive quantity ${quantityReceivedDecimal} for product ${receivedItemPayload.productId}. Max receivable: ${maxReceivable}.`);
                    }
                    if (quantityReceivedDecimal.isZero() ||
                        quantityReceivedDecimal.lessThan(0)) {
                        logger_1.default.warn(`Skipping zero/negative receive quantity for product ${receivedItemPayload.productId}`, logContext);
                        totalReceivedForAllItems = totalReceivedForAllItems.plus(transferLineItem.quantityReceived); // Add already received amount
                        continue; // Skip processing this received item
                    }
                    const { transaction } = await _recordStockMovement(tx, tenantId, userId, receivedItemPayload.productId, transfer.destinationLocationId, quantityReceivedDecimal, // Use Decimal for positive increase
                    client_1.InventoryTransactionType.TRANSFER_IN, null, // Cost not tracked on transfer in
                    { transferId: transfer.id }, `Received for transfer ${transferId}`, receivedItemPayload.lotNumber, receivedItemPayload.serialNumber);
                    transactionIds.push(transaction.id);
                    const updatedLine = await tx.inventoryTransferItem.update({
                        where: { id: transferLineItem.id },
                        data: { quantityReceived: { increment: quantityReceivedDecimal } }, // Increment by Decimal
                    });
                    totalReceivedForAllItems = totalReceivedForAllItems.plus(updatedLine.quantityReceived); // Add updated total received for this line
                }
                else {
                    // Item was on transfer but not in this receive payload, just add its current received amount
                    totalReceivedForAllItems = totalReceivedForAllItems.plus(transferLineItem.quantityReceived);
                }
            }
            // 3. Determine and Update Final Transfer status
            let finalStatus = transfer.status; // Start with current status
            if (totalReceivedForAllItems.greaterThanOrEqualTo(totalRequestedForAllItems) &&
                totalRequestedForAllItems.greaterThan(0)) {
                // Mark completed only if total received meets or exceeds total requested (and requested > 0)
                finalStatus = client_1.TransferStatus.COMPLETED;
            }
            else if (totalReceivedForAllItems.greaterThan(0)) {
                // If received > 0 but less than requested, ensure status is IN_TRANSIT (if it was PENDING)
                // Or could add a PARTIAL status
                finalStatus = client_1.TransferStatus.IN_TRANSIT;
                logger_1.default.info(`Transfer ${transferId} now partially received.`, logContext);
            }
            // If nothing received (totalReceived is 0), status remains PENDING or IN_TRANSIT
            // Update status only if it changed
            if (finalStatus !== transfer.status) {
                await tx.inventoryTransfer.update({
                    where: { id: transferId },
                    data: { status: finalStatus },
                });
                logContext.finalStatus = finalStatus;
            }
            else {
                logContext.finalStatus = transfer.status; // Log current status
            }
            return { transferId: transfer.id, transactionIds, finalStatus };
        });
        logger_1.default.info(`Inventory transfer ${result.transferId} received. Final Status: ${result.finalStatus}`, logContext);
        return { success: true };
    }
    catch (error) {
        if (error instanceof ApiError_1.default)
            throw error;
        logContext.error = error;
        logger_1.default.error(`Error receiving inventory transfer`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to receive inventory transfer.");
    }
};
// --- Query Methods ---
/** Query Inventory Adjustments */
const queryAdjustments = async (filter, orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    const tenantIdForLog = typeof filter.tenantId === "string" ? filter.tenantId : undefined;
    const logContext = {
        function: "queryAdjustments",
        tenantId: tenantIdForLog,
        limit,
        page,
    };
    if (!tenantIdForLog) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Tenant context missing.");
    }
    try {
        const [adjustments, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.inventoryAdjustment.findMany({
                where: filter,
                include: {
                    location: { select: { id: true, name: true } },
                    createdByUser: {
                        select: { id: true, firstName: true, lastName: true },
                    },
                    _count: { select: { items: true } }, // Count items in the adjustment
                },
                orderBy,
                skip,
                take: limit,
            }),
            config_1.prisma.inventoryAdjustment.count({ where: filter }),
        ]);
        logger_1.default.debug(`Adjustment query successful, found ${adjustments.length} of ${totalResults}`, logContext);
        return { adjustments, totalResults };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying inventory adjustments`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to retrieve adjustments.");
    }
};
/** Get details of a specific Inventory Adjustment */
const getAdjustmentById = async (adjustmentId, tenantId) => {
    const logContext = {
        function: "getAdjustmentById",
        adjustmentId,
        tenantId,
    };
    try {
        const adjustment = await config_1.prisma.inventoryAdjustment.findFirst({
            where: { id: adjustmentId, tenantId },
            include: {
                location: { select: { id: true, name: true } },
                createdByUser: {
                    select: { id: true, firstName: true, lastName: true },
                },
                items: {
                    include: {
                        product: { select: { id: true, sku: true, name: true } }, // Include product details for items
                    },
                },
            },
        });
        if (!adjustment) {
            logger_1.default.warn(`Adjustment not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Adjustment found successfully`, logContext);
        return adjustment;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching adjustment by ID`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to retrieve adjustment.");
    }
};
/** Query Inventory Transfers */
const queryTransfers = async (filter, orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    const tenantIdForLog = typeof filter.tenantId === "string" ? filter.tenantId : undefined;
    const logContext = {
        function: "queryTransfers",
        tenantId: tenantIdForLog,
        limit,
        page,
    };
    if (!tenantIdForLog) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Tenant context missing.");
    }
    try {
        const [transfers, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.inventoryTransfer.findMany({
                where: filter,
                include: {
                    sourceLocation: { select: { id: true, name: true } },
                    destinationLocation: { select: { id: true, name: true } },
                    createdByUser: {
                        select: { id: true, firstName: true, lastName: true },
                    },
                    _count: { select: { items: true } },
                },
                orderBy,
                skip,
                take: limit,
            }),
            config_1.prisma.inventoryTransfer.count({ where: filter }),
        ]);
        logger_1.default.debug(`Transfer query successful, found ${transfers.length} of ${totalResults}`, logContext);
        return { transfers, totalResults };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying inventory transfers`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to retrieve transfers.");
    }
};
/** Get details of a specific Inventory Transfer */
const getTransferById = async (transferId, tenantId) => {
    const logContext = {
        function: "getTransferById",
        transferId,
        tenantId,
    };
    try {
        const transfer = await config_1.prisma.inventoryTransfer.findFirst({
            where: { id: transferId, tenantId },
            include: {
                sourceLocation: { select: { id: true, name: true } },
                destinationLocation: { select: { id: true, name: true } },
                createdByUser: {
                    select: { id: true, firstName: true, lastName: true },
                },
                items: {
                    include: {
                        product: { select: { id: true, sku: true, name: true } }, // Include product details for items
                    },
                },
            },
        });
        if (!transfer) {
            logger_1.default.warn(`Transfer not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Transfer found successfully`, logContext);
        return transfer;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching transfer by ID`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to retrieve transfer.");
    }
};
/** Query Inventory Items (Stock Levels) */
const queryInventoryItems = async (filter, orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    const tenantIdForLog = typeof filter.tenantId === "string" ? filter.tenantId : undefined;
    const logContext = {
        function: "queryInventoryItems",
        tenantId: tenantIdForLog,
        limit,
        page,
    };
    if (!tenantIdForLog) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Tenant context missing.");
    }
    try {
        const [items, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.inventoryItem.findMany({
                where: filter, // Pass original filter to Prisma
                include: {
                    product: { select: { id: true, sku: true, name: true } },
                    location: { select: { id: true, name: true } },
                },
                orderBy,
                skip,
                take: limit,
            }),
            config_1.prisma.inventoryItem.count({ where: filter }),
        ]);
        logger_1.default.debug(`Inventory item query successful, found ${items.length} of ${totalResults}`, logContext);
        return {
            items: items,
            totalResults,
        };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying inventory items`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to retrieve inventory levels.");
    }
};
/** Get details for a specific Inventory Item (Stock at one location) */
const getInventoryItemById = async (inventoryItemId, tenantId) => {
    const logContext = {
        function: "getInventoryItemById",
        inventoryItemId,
        tenantId,
    };
    try {
        const item = await config_1.prisma.inventoryItem.findFirst({
            where: { id: inventoryItemId, tenantId },
            include: {
                product: { select: { id: true, sku: true, name: true } },
                location: { select: { id: true, name: true } },
            },
        });
        if (!item) {
            logger_1.default.warn(`Inventory item not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Inventory item found successfully`, logContext);
        return item;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching inventory item by ID`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "Failed to retrieve inventory item.");
    }
};
// Export all public service methods
exports.inventoryService = {
    // Commands
    createAdjustment,
    createTransfer,
    shipTransfer,
    receiveTransfer,
    // Queries
    queryAdjustments,
    getAdjustmentById,
    queryTransfers,
    getTransferById,
    queryInventoryItems,
    getInventoryItemById,
    _recordStockMovement
};
//# sourceMappingURL=inventory.service.js.map