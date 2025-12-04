// src/modules/purchase-orders/purchase-order.service.ts
import httpStatus from 'http-status';
import {
    Prisma, PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus, Product, Location, Supplier, User,
    InventoryTransactionType, InventoryItem// Ensure all necessary Prisma types are imported
} from '@prisma/client';
import { prisma } from '@/config'; // Centralized Prisma client
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';


import { CreatePurchaseOrderDto } from './dto/create-po.dto';
import { UpdatePurchaseOrderDto } from './dto/update-po.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-po.dto';
import { ReceivePOItemDto } from './dto/receive-po-item.dto';
import { POActionDto } from './dto/po-action.dto';
import { CreatePOItemDto } from './dto/po-item.dto';


// import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto, ReceivePurchaseOrderDto, POActionDto, CreatePOItemDto, ReceivePOItemDto } from './dto'; // Import all DTOs
// Assuming _recordStockMovement is NOT exported directly from inventory service
// We are using the internal _updateInventoryItemQuantity helper defined below
// and creating transaction logs directly in the receive function.
import pick from '@/utils/pick'; // Import pick utility

// Define log context type if not already defined globally
type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; poId?: string | null; poNumber?: string | null; data?: any; error?: any;[key: string]: any; };

// --- Type Helpers ---
// For detailed view (GET /:poId) includes full items and related entities
type PurchaseOrderWithDetails = PurchaseOrder & {
    supplier: Pick<Supplier, 'id' | 'name'>;
    location: Pick<Location, 'id' | 'name'>; // Delivery location
    createdByUser: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
    items: (PurchaseOrderItem & { product: Pick<Product, 'id' | 'sku' | 'name' | 'requiresSerialNumber' | 'requiresLotTracking' | 'requiresExpiryDate'> })[];
};
// Type for list view (doesn't include full items for performance)
type PurchaseOrderSummary = PurchaseOrder & {
    supplier: Pick<Supplier, 'id' | 'name'>;
    location: Pick<Location, 'id' | 'name'>;
    createdByUser: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
    _count: { items: number } | null; // Include item count
};


// --- Helper: Generate PO Number using PostgreSQL Sequence ---
// IMPORTANT: Ensure sequence "GlobalPoNumberSeq" exists in your database via a migration
async function generatePONumber(tenantId: string, tx: Prisma.TransactionClient): Promise<string> {
    const prefix = "PO-"; // Your desired prefix
    const sequenceName = "GlobalPoNumberSeq"; // The exact name of the sequence

    try {
        // Use the transaction client (tx) passed into the function
        const result = await tx.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('"${sequenceName}"')`); // Use quotes for safety if seq name needs it
        if (!result || result.length === 0 || typeof result[0]?.nextval !== 'bigint') {
            logger.error(`Unexpected result structure from sequence query for ${sequenceName}`, { result });
            throw new Error('Failed to get next value from PO sequence.');
        }
        const nextNum = result[0].nextval;
        // Format the number (e.g., padding with zeros)
        const poNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;

        // Final uniqueness check within transaction (belt-and-suspenders)
        const poNumExists = await tx.purchaseOrder.count({ where: { tenantId, poNumber } });
        if (poNumExists) {
            // This should ideally never happen with a DB sequence, indicates a major issue
            logger.error(`Generated PO Number ${poNumber} already exists despite using sequence!`, { tenantId });
            throw new ApiError(httpStatus.CONFLICT, `Generated PO Number ${poNumber} already exists (sequence error?).`);
        }
        return poNumber;

    } catch (seqError: any) {
        logger.error(`Error fetching PO number from sequence ${sequenceName}`, { tenantId, error: seqError });
        if (seqError?.code === '42P01') { // PostgreSQL code for undefined_table/sequence
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Database sequence "${sequenceName}" not found. Please ensure it exists.`);
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Could not generate PO number from sequence.`);
    }
}

// --- Helper: Prepare Item Data & Calculate PO Totals ---
function prepareItemsAndCalculateTotals(
    itemsDto: CreatePOItemDto[],
    shippingCostInput: number | undefined,
    tenantId: string // Needed if item model requires tenantId directly
): {
    itemsData: Prisma.PurchaseOrderItemCreateManyPurchaseOrderInput[];
    subtotal: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    shippingCost: Prisma.Decimal;
} {
    let subtotal = new Prisma.Decimal(0);
    let totalTax = new Prisma.Decimal(0);
    const shippingCost = new Prisma.Decimal(shippingCostInput ?? 0);

    const itemsData: Prisma.PurchaseOrderItemCreateManyPurchaseOrderInput[] = itemsDto.map(item => {
        if (!item.productId) throw new ApiError(httpStatus.BAD_REQUEST, `Missing productId for an item.`);
        if (item.quantityOrdered <= 0) throw new ApiError(httpStatus.BAD_REQUEST, `Quantity ordered for product ${item.productId} must be positive.`);
        if (item.unitCost === undefined || item.unitCost === null || item.unitCost < 0) throw new ApiError(httpStatus.BAD_REQUEST, `Unit cost for product ${item.productId} is required and cannot be negative.`);

        const quantity = new Prisma.Decimal(item.quantityOrdered);
        const cost = new Prisma.Decimal(item.unitCost);
        const lineTotal = quantity.times(cost);
        const taxRate = item.taxRate ? new Prisma.Decimal(item.taxRate) : new Prisma.Decimal(0);
        if (taxRate.lessThan(0)) throw new ApiError(httpStatus.BAD_REQUEST, `Tax rate for product ${item.productId} cannot be negative.`);


        // --- Placeholder: Replace with actual tax calculation logic ---
        // This might involve fetching tax rates based on location, product type, supplier status, etc.
        const itemTax = lineTotal.times(taxRate);
        // --- End Placeholder ---

        subtotal = subtotal.plus(lineTotal);
        totalTax = totalTax.plus(itemTax);

        return {
            tenantId, // Include tenantId if PurchaseOrderItem model has it directly
            productId: item.productId,
            description: item.description,
            quantityOrdered: quantity,
            quantityReceived: 0, // Initial received is always 0
            unitCost: cost,
            taxRate: taxRate,
            taxAmount: itemTax, // Assign calculated item tax
            lineTotal: lineTotal, // Assign calculated line total
        };
    });

    const totalAmount = subtotal.plus(shippingCost).plus(totalTax);
    return { itemsData, subtotal, taxAmount: totalTax, totalAmount, shippingCost };
}

// --- Helper: Update Inventory Item Quantity (Internal) ---
// Used by receivePurchaseOrderItems to separate stock update from transaction logging
async function _updateInventoryItemQuantity(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    locationId: string,
    quantityChange: number | Prisma.Decimal
): Promise<InventoryItem> { // Return type specified
    const quantityChangeDecimal = new Prisma.Decimal(quantityChange);
    if (quantityChangeDecimal.isZero()) {
        // This case should ideally be filtered out before calling this helper
        logger.warn(`_updateInventoryItemQuantity called with zero quantity change for Product ${productId}, Location ${locationId}`);
        // Attempt to find existing item, or handle error if it must exist
        const existingItem = await tx.inventoryItem.findUnique({
            where: { tenantId_productId_locationId: { tenantId, productId, locationId } }
        });
        if (!existingItem) {
            // If the item *must* exist for a zero change call (unlikely), throw error
            // Otherwise, maybe return null or a placeholder? For now, let's assume upsert handles creation if needed.
            // Reverting to throwing error as upsert below will handle creation if needed, zero change is invalid input here.
            throw new Error("_updateInventoryItemQuantity quantity cannot be zero.");
        }
        return existingItem; // Return existing item if quantity change is zero
    }
    const inventoryItem = await tx.inventoryItem.upsert({
        where: { tenantId_productId_locationId: { tenantId, productId, locationId } },
        create: { tenantId, productId, locationId, quantityOnHand: quantityChangeDecimal, quantityAllocated: 0, quantityIncoming: 0 }, // Initialize other counts
        update: { quantityOnHand: { increment: quantityChangeDecimal }, updatedAt: new Date() },
    });
    // Post-update Check for negative stock
    if (inventoryItem.quantityOnHand.lessThan(0)) {
        const allowNegativeStock = false; // TODO: Get from tenant config via tx if needed
        if (!allowNegativeStock) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Operation results in negative stock for product ID ${productId} at location ${locationId}.`);
        } else {
            logger.warn(`Stock quantity went negative for item ${inventoryItem.id} (Allowed by config).`);
        }
    }
    return inventoryItem;
}


// --- CRUD and Workflow Methods ---

/** Create Purchase Order (starts in DRAFT) */
const createPurchaseOrder = async (data: CreatePurchaseOrderDto, tenantId: string, userId: string): Promise<PurchaseOrderWithDetails> => {
    const logContext: LogContext = { function: 'createPurchaseOrder', tenantId, userId, supplierId: data.supplierId, locationId: data.locationId };

    // 1. Validate Supplier and Location (ensure active)
    const [supplier, location] = await Promise.all([
        prisma.supplier.findFirst({ where: { id: data.supplierId, tenantId, isActive: true }, select: { id: true } }),
        prisma.location.findFirst({ where: { id: data.locationId, tenantId, isActive: true }, select: { id: true } })
    ]);
    if (!supplier) throw new ApiError(httpStatus.BAD_REQUEST, `Active supplier with ID ${data.supplierId} not found or inactive.`);
    if (!location) throw new ApiError(httpStatus.BAD_REQUEST, `Active delivery location with ID ${data.locationId} not found or inactive.`);

    // 2. Validate Products (ensure active)
    const productIds = data.items.map(item => item.productId);
    if (productIds.length === 0) { throw new ApiError(httpStatus.BAD_REQUEST, `Purchase order must contain at least one item.`); }
    const validProducts = await prisma.product.findMany({ where: { id: { in: productIds }, tenantId, isActive: true }, select: { id: true } });
    if (validProducts.length !== productIds.length) {
        const missingIds = productIds.filter(id => !validProducts.some(p => p.id === id));
        throw new ApiError(httpStatus.BAD_REQUEST, `One or more active products not found: ${missingIds.join(', ')}`);
    }

    // 3. Prepare Item Data and Calculate Totals
    const { itemsData, subtotal, taxAmount, totalAmount, shippingCost } = prepareItemsAndCalculateTotals(
        data.items, data.shippingCost, tenantId
    );

    // 4. Create PO and Items in Transaction
    try {
        const newPO = await prisma.$transaction(async (tx) => {
            // Generate PO Number using sequence within transaction
            const poNumber = await generatePONumber(tenantId, tx);
            logContext.poNumber = poNumber;
            // Use the generated PO number unless a manual one was provided AND allowed
            const finalPoNumber = data.poNumber ?? poNumber; // Allow override if present
            if (data.poNumber && data.poNumber !== poNumber) { // If manual provided, check its uniqueness
                const poNumExists = await tx.purchaseOrder.count({ where: { tenantId, poNumber: data.poNumber } });
                if (poNumExists) { throw new ApiError(httpStatus.CONFLICT, `Manual PO Number ${data.poNumber} already exists.`); }
                logContext.poNumber = data.poNumber; // Log the manual number used
            } else {
                logContext.finalPoNumber = finalPoNumber; // Log the generated number used
            }


            return await tx.purchaseOrder.create({
                data: {
                    tenantId,
                    poNumber: finalPoNumber,
                    supplierId: data.supplierId, locationId: data.locationId,
                    status: PurchaseOrderStatus.DRAFT, // Start as DRAFT
                    orderDate: new Date(),
                    expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : null,
                    notes: data.notes,
                    shippingCost: shippingCost, // Use calculated Decimal
                    subtotal: subtotal,         // Store calculated subtotal
                    taxAmount: taxAmount,       // Store calculated tax
                    totalAmount: totalAmount,   // Store calculated total
                    createdByUserId: userId,
                    items: { createMany: { data: itemsData } } // Use prepared itemsData
                },
                include: { // Standard include for response consistency
                    supplier: { select: { id: true, name: true } },
                    location: { select: { id: true, name: true } },
                    createdByUser: { select: { id: true, firstName: true, lastName: true } },
                    items: { include: { product: { select: { id: true, sku: true, name: true, requiresSerialNumber: true, requiresLotTracking: true, requiresExpiryDate: true } } } }
                }
            });
        });

        logContext.poId = newPO.id;
        logger.info(`Purchase order created successfully`, logContext);
        return newPO as PurchaseOrderWithDetails;
    } catch (error: any) {
        if (error instanceof ApiError) throw error; // Re-throw known errors
        logContext.error = error;
        logger.error(`Error creating purchase order`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Unique constraint violation (likely poNumber if manual override was used and existed)
            throw new ApiError(httpStatus.CONFLICT, `PO Number conflict or other unique constraint violation during creation.`);
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create purchase order.');
    }
};

/** Query Purchase Orders */
const queryPurchaseOrders = async (
    filter: Prisma.PurchaseOrderWhereInput,
    orderBy: Prisma.PurchaseOrderOrderByWithRelationInput[],
    limit: number,
    page: number,
    allowedLocationIds: string[] = []
): Promise<{ pos: PurchaseOrderSummary[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'queryPurchaseOrders', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }

    const locationFilter = allowedLocationIds.includes('*') ? {} : { locationId: { in: allowedLocationIds } };

    try {
        const [pos, totalResults] = await prisma.$transaction([
            prisma.purchaseOrder.findMany({
                where: { ...filter, ...locationFilter },
                include: { // Summary data for list view
                    supplier: { select: { id: true, name: true } },
                    location: { select: { id: true, name: true } },
                    createdByUser: { select: { id: true, firstName: true, lastName: true } },
                    _count: { select: { items: true } }
                },
                orderBy, skip, take: limit,
            }),
            prisma.purchaseOrder.count({ where: { ...filter, ...locationFilter } }),
        ]);
        logger.debug(`PO query successful, found ${pos.length} of ${totalResults}`, logContext);
        return { pos: pos as PurchaseOrderSummary[], totalResults };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying purchase orders`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve purchase orders.');
    }
};

/** Get Purchase Order By ID */
const getPurchaseOrderById = async (poId: string, tenantId: string): Promise<PurchaseOrderWithDetails | null> => {
    const logContext: LogContext = { function: 'getPurchaseOrderById', poId, tenantId };
    try {
        const po = await prisma.purchaseOrder.findFirst({
            where: { id: poId, tenantId },
            include: { // Full details consistent with PurchaseOrderWithDetails
                supplier: { select: { id: true, name: true } },
                location: { select: { id: true, name: true } },
                createdByUser: { select: { id: true, firstName: true, lastName: true } },
                items: {
                    include: { product: { select: { id: true, sku: true, name: true, requiresSerialNumber: true, requiresLotTracking: true, requiresExpiryDate: true } } },
                    orderBy: { id: 'asc' } // Consistent item order
                },
            }
        });
        if (!po) { logger.warn(`PO not found or tenant mismatch`, logContext); return null; }
        logger.debug(`PO found successfully`, logContext);
        return po as PurchaseOrderWithDetails;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching PO by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve purchase order.');
    }
};

/** Update Basic Purchase Order Details (Allowed fields depend on status) */
const updatePurchaseOrder = async (poId: string, updateData: UpdatePurchaseOrderDto, tenantId: string, userId: string): Promise<PurchaseOrderWithDetails> => {
    const logContext: LogContext = { function: 'updatePurchaseOrder', poId, tenantId, userId, data: updateData };

    // Fetch full PO for calculations and status check
    const existingPO = await prisma.purchaseOrder.findFirst({ where: { id: poId, tenantId } });
    if (!existingPO) { throw new ApiError(httpStatus.NOT_FOUND, 'Purchase Order not found.'); }

    const isDraft = existingPO.status === PurchaseOrderStatus.DRAFT;
    // Determine which fields from the DTO are allowed for update based on status
    const allowedFields = ['notes', 'expectedDeliveryDate', ...(isDraft ? ['shippingCost'] : [])];
    const allowedUpdates = pick(updateData, allowedFields as (keyof UpdatePurchaseOrderDto)[]);

    if (Object.keys(allowedUpdates).length === 0) {
        logger.info(`PO update skipped: No allowed fields provided or no changes`, logContext);
        // Return full details
        return getPurchaseOrderById(poId, tenantId).then(po => { if (!po) throw new ApiError(httpStatus.NOT_FOUND, 'PO not found after skip.'); return po; });
    }

    const dataToUpdate: Prisma.PurchaseOrderUpdateInput = {};
    if (allowedUpdates.expectedDeliveryDate !== undefined) dataToUpdate.expectedDeliveryDate = allowedUpdates.expectedDeliveryDate ? new Date(allowedUpdates.expectedDeliveryDate) : null;
    if (allowedUpdates.notes !== undefined) dataToUpdate.notes = allowedUpdates.notes;

    // Recalculate total only if shipping cost changed (and was allowed)
    let needsTotalRecalc = false;
    if (allowedUpdates.shippingCost !== undefined) {
        const newShippingCost = new Prisma.Decimal(allowedUpdates.shippingCost);
        if (!newShippingCost.equals(existingPO.shippingCost)) {
            dataToUpdate.shippingCost = newShippingCost;
            needsTotalRecalc = true;
        }
    }

    if (needsTotalRecalc) {
        // Explicitly cast Decimal before arithmetic and logging
        const currentShippingCost = (dataToUpdate.shippingCost ?? existingPO.shippingCost) as Prisma.Decimal;
        dataToUpdate.totalAmount = existingPO.subtotal.plus(currentShippingCost).plus(existingPO.taxAmount);
        logContext.totalRecalculated = (dataToUpdate.totalAmount as Prisma.Decimal).toNumber();
    }

    // Check if, after filtering allowed fields and calculations, there are still effective changes
    if (Object.keys(dataToUpdate).length === 0) {
        logger.info(`PO update skipped: No effective changes after status/value checks`, logContext);
        return getPurchaseOrderById(poId, tenantId).then(po => { if (!po) throw new ApiError(httpStatus.NOT_FOUND, 'PO not found after skip.'); return po; });
    }

    try {
        const updatedPO = await prisma.purchaseOrder.update({
            where: { id: poId },
            data: dataToUpdate,
            include: { // Standard include for PurchaseOrderWithDetails
                supplier: { select: { id: true, name: true } },
                location: { select: { id: true, name: true } },
                createdByUser: { select: { id: true, firstName: true, lastName: true } },
                items: { include: { product: { select: { id: true, sku: true, name: true, requiresSerialNumber: true, requiresLotTracking: true, requiresExpiryDate: true } } } }
            }
        });
        logger.info(`PO ${existingPO.poNumber} updated successfully`, logContext);
        return updatedPO as PurchaseOrderWithDetails;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating PO`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { throw new ApiError(httpStatus.NOT_FOUND, 'PO not found during update attempt.'); }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update purchase order.');
    }
};

// --- PO Status Transition Functions ---

/** Helper to update PO Status, ensuring valid transitions */
const _updatePOStatus = async (poId: string, tenantId: string, userId: string, allowedFromStatuses: PurchaseOrderStatus[], newStatus: PurchaseOrderStatus, notes?: string | null): Promise<PurchaseOrderWithDetails> => {
    const logContext: LogContext = { function: '_updatePOStatus', poId, tenantId, userId, newStatus, notes };
    const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, tenantId }, select: { id: true, status: true, poNumber: true, notes: true } });
    if (!po) throw new ApiError(httpStatus.NOT_FOUND, 'Purchase Order not found.');

    if (!allowedFromStatuses.includes(po.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot change PO status from ${po.status} to ${newStatus}.`);
    }
    if (po.status === newStatus) {
        logger.info(`PO ${po.poNumber} status is already ${newStatus}. No update performed.`, logContext);
        return getPurchaseOrderById(poId, tenantId).then(fullPo => { if (!fullPo) throw new ApiError(httpStatus.NOT_FOUND, 'PO not found'); return fullPo; });
    }

    try {
        const updatedPO = await prisma.purchaseOrder.update({
            where: { id: poId },
            data: {
                status: newStatus,
                notes: notes ? `${po.notes ?? ''}\n[${newStatus} by User ${userId}]: ${notes}`.trim() : po.notes,
                updatedAt: new Date()
            },
            include: { /* Standard include for PurchaseOrderWithDetails */
                supplier: { select: { id: true, name: true } },
                location: { select: { id: true, name: true } },
                createdByUser: { select: { id: true, firstName: true, lastName: true } },
                items: { include: { product: { select: { id: true, sku: true, name: true, requiresSerialNumber: true, requiresLotTracking: true, requiresExpiryDate: true } } } }
            }
        });
        logger.info(`PO ${po.poNumber} status updated to ${newStatus}`, logContext);
        // TODO: Trigger side effects (update 'incoming' stock, emails)
        return updatedPO as PurchaseOrderWithDetails;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating PO status`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { throw new ApiError(httpStatus.NOT_FOUND, 'PO not found during status update.'); }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update PO status.');
    }
};

/** Submit PO for Approval (DRAFT -> PENDING_APPROVAL) */
const submitPurchaseOrder = async (poId: string, tenantId: string, userId: string, actionData?: POActionDto): Promise<PurchaseOrderWithDetails> => {
    return _updatePOStatus(poId, tenantId, userId, [PurchaseOrderStatus.DRAFT], PurchaseOrderStatus.PENDING_APPROVAL, actionData?.notes);
};

/** Approve Purchase Order (DRAFT or PENDING_APPROVAL -> APPROVED) */
const approvePurchaseOrder = async (poId: string, tenantId: string, userId: string, actionData?: POActionDto): Promise<PurchaseOrderWithDetails> => {
    return _updatePOStatus(poId, tenantId, userId, [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL], PurchaseOrderStatus.APPROVED, actionData?.notes);
};

/** Mark Purchase Order as Sent (APPROVED -> SENT) */
const sendPurchaseOrder = async (poId: string, tenantId: string, userId: string, actionData?: POActionDto): Promise<PurchaseOrderWithDetails> => {
    logger.info(`Simulating sending PO ${poId} to supplier... (Actual sending not implemented)`);
    return _updatePOStatus(poId, tenantId, userId, [PurchaseOrderStatus.APPROVED], PurchaseOrderStatus.SENT, actionData?.notes);
};

/** Cancel Purchase Order */
const cancelPurchaseOrder = async (poId: string, tenantId: string, userId: string, actionData?: POActionDto): Promise<PurchaseOrderWithDetails> => {
    const cancellableStatuses: PurchaseOrderStatus[] = [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL, PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED];
    const reason = actionData?.notes ?? 'Cancelled by user';
    const po = await _updatePOStatus(poId, tenantId, userId, cancellableStatuses, PurchaseOrderStatus.CANCELLED, reason);
    logger.info(`PO ${po.poNumber} cancelled. Incoming stock reversal may be needed.`);
    return po;
};

/** Close Purchase Order (Short) */
const closePurchaseOrder = async (poId: string, tenantId: string, userId: string, actionData?: POActionDto): Promise<PurchaseOrderWithDetails> => {
    // Business Rule: Only SENT or PARTIALLY_RECEIVED can be closed short.
    // DRAFT/PENDING should be Cancelled. FULLY_RECEIVED is already done.
    const allowedStatuses: PurchaseOrderStatus[] = [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED];
    const reason = actionData?.notes ?? 'Closed short by user';

    // We use _updatePOStatus which handles the status transition validation
    const po = await _updatePOStatus(poId, tenantId, userId, allowedStatuses, PurchaseOrderStatus.CLOSED, reason);
    logger.info(`PO ${po.poNumber} closed short. No further receiving allowed.`);
    return po;
};


/** Receive Items against a Purchase Order */
// const receivePurchaseOrderItems = async (poId: string, data: ReceivePurchaseOrderDto, tenantId: string, userId: string): Promise<{ success: boolean, updatedStatus: PurchaseOrderStatus }> => {
//     const logContext: LogContext = { function: 'receivePurchaseOrderItems', poId, tenantId, userId };

//     // --- Pre-fetch and Validate Outside Transaction ---
//     const poForCheck = await prisma.purchaseOrder.findUnique({
//         where: { id: poId, tenantId: tenantId },
//         include: { items: { include: { product: { select: { id: true, sku: true, name: true, requiresSerialNumber: true, isStockTracked: true }} } } }
//     });
//     if (!poForCheck) throw new ApiError(httpStatus.NOT_FOUND, 'Purchase Order not found.');
//     const allowedReceiveStatuses: PurchaseOrderStatus[] = [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED];
//     if (!allowedReceiveStatuses.includes(poForCheck.status)) { throw new ApiError(httpStatus.BAD_REQUEST, `Cannot receive items against PO with status ${poForCheck.status}.`); }

//     const poItemsMap = new Map(poForCheck.items.map(item => [item.id, item]));
//     // Define the expected structure for itemsToProcess clearly
//     const itemsToProcess: {
//         poLineItem: PurchaseOrderItem & { product: { id: string; sku: string; name: string; requiresSerialNumber: boolean; isStockTracked: boolean; }};
//         receivedData: ReceivePOItemDto;
//         quantityReceivedDecimal: Prisma.Decimal;
//         serialsToReceive: string[];
//     }[] = [];
//     for (const receivedItemDto of data.items) {
//          const poLineItem = poItemsMap.get(receivedItemDto.poItemId);
//          if (!poLineItem) { throw new ApiError(httpStatus.BAD_REQUEST, `PO Item ID ${receivedItemDto.poItemId} not found on PO ${poId}.`); }
//          if (!poLineItem.product.isStockTracked) { logger.warn(/*...*/); continue; } // Skip non-tracked
//          const quantityReceivedDecimal = new Prisma.Decimal(receivedItemDto.quantityReceived);
//          if (quantityReceivedDecimal.lessThanOrEqualTo(0)) continue; // Skip zero/negative
//          const maxReceivable = poLineItem.quantityOrdered.minus(poLineItem.quantityReceived);
//          if (quantityReceivedDecimal.greaterThan(maxReceivable)) { throw new ApiError(httpStatus.BAD_REQUEST, `Received quantity ${quantityReceivedDecimal} exceeds outstanding quantity ${maxReceivable} for PO Item ${poLineItem.id}.`); }
//          let serialsToReceive: string[] = [];
//          if (poLineItem.product.requiresSerialNumber) {
//              serialsToReceive = receivedItemDto.serialNumbers ?? (receivedItemDto.serialNumber ? [receivedItemDto.serialNumber] : []);
//              const expectedSerialCount = quantityReceivedDecimal.isInteger() ? quantityReceivedDecimal.toNumber() : -1;
//              if (expectedSerialCount <= 0 || serialsToReceive.length !== expectedSerialCount) { throw new ApiError(httpStatus.BAD_REQUEST, `Incorrect number of serial numbers for PO Item ${poLineItem.id}. Expected ${expectedSerialCount}, got ${serialsToReceive.length}.`); }
//          }
//         itemsToProcess.push({ poLineItem, receivedData: receivedItemDto, quantityReceivedDecimal, serialsToReceive });
//     }
//     if (itemsToProcess.length === 0) {
//         logger.warn(`PO receiving request contained no valid items to process`, logContext);
//         return { success: true, updatedStatus: poForCheck.status }; // Return current status
//     }
//     // --- End Pre-fetch ---


//     try {
//         const updatedStatus = await prisma.$transaction(async (tx) => {
//             // Initialize transaction data array BEFORE the loop
//             const inventoryTransactionData: Prisma.InventoryTransactionCreateManyInput[] = [];

//             // Process Validated Items
//             for (const itemData of itemsToProcess) {
//                  const { poLineItem, receivedData, quantityReceivedDecimal, serialsToReceive } = itemData;
//                  logContext.poItemId = poLineItem.id; logContext.productId = poLineItem.productId;
//                  const unitCostForTx = poLineItem.unitCost;

//                  // 4. Update Inventory Item Stock ONLY (using helper)
//                  //    Collect Transaction Data
//                   if (poLineItem.product.requiresSerialNumber && serialsToReceive.length > 0) {
//                        for (const serial of serialsToReceive) {
//                             await _updateInventoryItemQuantity(tx, tenantId, poLineItem.productId, poForCheck.locationId, 1);
//                             inventoryTransactionData.push({
//                                 tenantId, productId: poLineItem.productId, locationId: poForCheck.locationId,
//                                 transactionType: InventoryTransactionType.PURCHASE_RECEIPT, quantityChange: new Prisma.Decimal(1),
//                                 unitCost: unitCostForTx, relatedPoId: poForCheck.id, relatedPoItemId: poLineItem.id,
//                                 notes: `Received serial for PO ${poForCheck.poNumber}`, lotNumber: receivedData.lotNumber,
//                                 serialNumber: serial, userId,
//                                 expiryDate: receivedData.expiryDate ? new Date(receivedData.expiryDate) : undefined
//                            });
//                        }
//                   } else if (!poLineItem.product.requiresSerialNumber) {
//                         await _updateInventoryItemQuantity(tx, tenantId, poLineItem.productId, poForCheck.locationId, quantityReceivedDecimal);
//                         inventoryTransactionData.push({
//                             tenantId, productId: poLineItem.productId, locationId: poForCheck.locationId,
//                             transactionType: InventoryTransactionType.PURCHASE_RECEIPT, quantityChange: quantityReceivedDecimal,
//                             unitCost: unitCostForTx, relatedPoId: poForCheck.id, relatedPoItemId: poLineItem.id,
//                             notes: `Received item for PO ${poForCheck.poNumber}`, lotNumber: receivedData.lotNumber,
//                             serialNumber: null, userId,
//                             expiryDate: receivedData.expiryDate ? new Date(receivedData.expiryDate) : undefined
//                         });
//                   } else { throw new ApiError(httpStatus.BAD_REQUEST, `Serial number processing error for PO Item ${poLineItem.id}.`); }

//                  // 5. Update quantityReceived on the PO line item using 'tx'
//                  await tx.purchaseOrderItem.update({
//                       where: { id: poLineItem.id },
//                       data: { quantityReceived: { increment: quantityReceivedDecimal } }
//                   });
//             } // End loop through itemsToProcess

//             // Batch create transactions AFTER the loop
//             if (inventoryTransactionData.length > 0) {
//                  await tx.inventoryTransaction.createMany({ data: inventoryTransactionData });
//                  logContext.transactionsCreated = inventoryTransactionData.length;
//                  logger.debug(`Batch created ${inventoryTransactionData.length} inventory transactions.`, logContext);
//             }

//             // 6. Determine and update overall PO status (use 'tx')
//              const updatedItems = await tx.purchaseOrderItem.findMany({ where: { poId: poId }, select: { quantityOrdered: true, quantityReceived: true }});
//              const totalOrdered = updatedItems.reduce((sum, item) => sum.plus(item.quantityOrdered), new Prisma.Decimal(0));
//              const totalReceived = updatedItems.reduce((sum, item) => sum.plus(item.quantityReceived), new Prisma.Decimal(0));
//              let newStatus = poForCheck.status; // Use status from pre-fetched PO
//              const tolerance = new Prisma.Decimal('0.00001');
//              if (totalReceived.greaterThan(0)) {
//                  newStatus = totalReceived.plus(tolerance).greaterThanOrEqualTo(totalOrdered)
//                            ? PurchaseOrderStatus.FULLY_RECEIVED
//                            : PurchaseOrderStatus.PARTIALLY_RECEIVED;
//              }
//              if (newStatus !== poForCheck.status) {
//                  await tx.purchaseOrder.update({ where: { id: poId }, data: { status: newStatus, updatedAt: new Date() } });
//                  logContext.newStatus = newStatus;
//              } else {
//                  logContext.newStatus = poForCheck.status;
//              }

//              // Check if transactions were expected but not created
//              if (inventoryTransactionData.length === 0 && itemsToProcess.length > 0) {
//                  logger.warn(`PO receiving processed valid items but no stock movements were recorded.`, logContext);
//              }

//             return newStatus; // Return the final status
//         }, { timeout: 45000 }); // Optional increased timeout for complex receives

//         logger.info(`Items received successfully against PO ${poId}. Final Status: ${updatedStatus}`, logContext);
//         return { success: true, updatedStatus: updatedStatus };

//     } catch (error: any) {
//         if (error instanceof ApiError) throw error;
//         logContext.error = error;
//         logger.error(`Error receiving purchase order items`, logContext);
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to receive PO items.');
//     }
// };

// * @param {string} poId - The ID of the Purchase Order to receive against.
//  * @param {ReceivePurchaseOrderDto} data - The DTO containing details of items being received.
//  * @param {string} tenantId - The ID of the tenant performing the action.
//  * @param {string} userId - The ID of the user performing the receiving action.
//  * @returns {Promise<{ success: boolean, updatedStatus: PurchaseOrderStatus }>} An object indicating success and the final status of the PO.
//  * @throws {ApiError} If PO not found, status invalid, item IDs invalid, quantities invalid, serial numbers invalid, or DB transaction fails.
//  */
const receivePurchaseOrderItems = async (poId: string, data: ReceivePurchaseOrderDto, tenantId: string, userId: string): Promise<{ success: boolean, updatedStatus: PurchaseOrderStatus }> => {
    const logContext: LogContext = { function: 'receivePurchaseOrderItems', poId, tenantId, userId };
    const startTime = Date.now(); // For performance logging

    // --- Pre-fetch and Validate Outside Transaction ---
    logger.debug(`Starting pre-fetch for PO ${poId}`, logContext);
    const poForCheck = await prisma.purchaseOrder.findUnique({
        where: { id: poId, tenantId: tenantId },
        include: {
            items: { // Include items to validate received DTO against
                include: {
                    // Include product details needed for validation
                    product: { select: { id: true, sku: true, name: true, requiresSerialNumber: true, isStockTracked: true } }
                }
            }
        }
    });
    if (!poForCheck) {
        logger.warn(`PO Receiving failed: PO not found or tenant mismatch`, logContext);
        throw new ApiError(httpStatus.NOT_FOUND, 'Purchase Order not found.');
    }
    logContext.poNumber = poForCheck.poNumber; // Add PO number to context

    // Validate PO status for receiving
    const allowedReceiveStatuses: PurchaseOrderStatus[] = [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED];
    if (!allowedReceiveStatuses.includes(poForCheck.status)) {
        logger.warn(`PO Receiving failed: Invalid status ${poForCheck.status}`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot receive items against PO with status ${poForCheck.status}.`);
    }

    const poItemsMap = new Map(poForCheck.items.map(item => [item.id, item]));
    // Define the structure for validated items to process inside the transaction
    const itemsToProcess: {
        poLineItem: PurchaseOrderItem & { product: { id: string; sku: string; name: string; requiresSerialNumber: boolean; isStockTracked: boolean; } };
        receivedData: ReceivePOItemDto; // The original DTO item for reference
        quantityReceivedDecimal: Prisma.Decimal; // Pre-calculated Decimal quantity
        serialsToReceive: string[]; // Pre-processed serials list
    }[] = [];

    // Loop through the DTO items for pre-validation
    for (const receivedItemDto of data.items) {
        const poLineItem = poItemsMap.get(receivedItemDto.poItemId);
        const itemLogContext = { ...logContext, poItemId: receivedItemDto.poItemId, productId: poLineItem?.productId };

        if (!poLineItem) {
            throw new ApiError(httpStatus.BAD_REQUEST, `PO Item ID ${receivedItemDto.poItemId} not found on ${poForCheck.poNumber}.`);
        }

        if (!poLineItem.product.isStockTracked) {
            logger.warn(`Skipping receive attempt for non-stock-tracked product`, itemLogContext);
            continue; // Skip non-tracked items from being processed further
        }

        const quantityReceivedDecimal = new Prisma.Decimal(receivedItemDto.quantityReceived);
        if (quantityReceivedDecimal.lessThanOrEqualTo(0)) {
            logger.warn(`Skipping zero/negative quantity received for PO Item`, itemLogContext);
            continue; // Skip zero/negative quantities
        }

        // Validate quantity doesn't exceed outstanding amount
        const maxReceivable = poLineItem.quantityOrdered.minus(poLineItem.quantityReceived);
        if (quantityReceivedDecimal.greaterThan(maxReceivable)) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Received quantity ${quantityReceivedDecimal} exceeds outstanding quantity ${maxReceivable} for PO Item ${poLineItem.id} (Product ${poLineItem.productId}).`);
        }

        // Validate serial numbers if required
        let serialsToReceive: string[] = [];
        if (poLineItem.product.requiresSerialNumber) {
            serialsToReceive = receivedItemDto.serialNumbers ?? (receivedItemDto.serialNumber ? [receivedItemDto.serialNumber] : []);
            // Ensure quantity is an integer for serialized items
            if (!quantityReceivedDecimal.isInteger()) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Received quantity (${quantityReceivedDecimal}) must be a whole number for serialized PO Item ${poLineItem.id}.`);
            }
            const expectedSerialCount = quantityReceivedDecimal.toNumber();
            if (serialsToReceive.length !== expectedSerialCount) {
                throw new ApiError(httpStatus.BAD_REQUEST, `Incorrect number of serial numbers provided for PO Item ${poLineItem.id}. Expected ${expectedSerialCount}, got ${serialsToReceive.length}.`);
            }
            // TODO: Add pre-check for serial number format/uniqueness if feasible (might require extra DB query)
        }
        // TODO: Add pre-check for Lot Number / Expiry Date format if required by product settings

        // If all validations pass for this item, add it to the list to be processed in the transaction
        itemsToProcess.push({
            poLineItem,
            receivedData: receivedItemDto,
            quantityReceivedDecimal,
            serialsToReceive
        });
    } // End of validation loop

    // Check if there are actually any valid items to process after filtering
    if (itemsToProcess.length === 0) {
        logger.warn(`PO receiving request contained no valid stock-tracked items with positive quantity to process for PO ${poForCheck.poNumber}.`, logContext);
        // Return current status as nothing changed
        return { success: true, updatedStatus: poForCheck.status };
    }
    const prefetchEndTime = Date.now();
    logger.debug(`Pre-fetch and validation completed for PO ${poId}. Duration: ${prefetchEndTime - startTime}ms`, logContext);
    // --- End Pre-fetch / Pre-validation ---


    // --- Transactional Operations ---
    try {
        const transactionStartTime = Date.now();
        // Use a longer timeout for potentially complex receiving transactions
        const updatedStatus = await prisma.$transaction(async (tx) => {
            // Initialize array to collect transaction log data
            const inventoryTransactionData: Prisma.InventoryTransactionCreateManyInput[] = [];

            // Process Validated Items within the transaction
            for (const itemData of itemsToProcess) {
                const { poLineItem, receivedData, quantityReceivedDecimal, serialsToReceive } = itemData;
                const itemLogContext = { ...logContext, poItemId: poLineItem.id, productId: poLineItem.productId }; // Context for item specific logs
                const unitCostForTx = poLineItem.unitCost; // Use cost from PO line for inventory transaction

                // 4. Update Inventory Item Stock & Collect Transaction Data
                if (poLineItem.product.requiresSerialNumber && serialsToReceive.length > 0) {
                    // Handle serialized items: one stock update and one transaction log per serial
                    for (const serial of serialsToReceive) {
                        // Update inventory item quantity (increment by 1)
                        await _updateInventoryItemQuantity(tx, tenantId, poLineItem.productId, poForCheck.locationId, 1);
                        // Collect data for batch transaction create later
                        inventoryTransactionData.push({
                            tenantId, productId: poLineItem.productId, locationId: poForCheck.locationId,
                            transactionType: InventoryTransactionType.PURCHASE_RECEIPT,
                            quantityChange: new Prisma.Decimal(1), // Quantity is 1 per serial
                            unitCost: unitCostForTx,
                            relatedPoId: poForCheck.id,
                            relatedPoItemId: poLineItem.id,
                            notes: `Received serial for PO ${poForCheck.poNumber}`,
                            lotNumber: receivedData.lotNumber,
                            serialNumber: serial, // The specific serial number
                            userId: userId,
                            expiryDate: receivedData.expiryDate ? new Date(receivedData.expiryDate) : undefined
                        });
                    }
                } else if (!poLineItem.product.requiresSerialNumber) {
                    // Non-serialized item: single stock update and collect one transaction log
                    await _updateInventoryItemQuantity(tx, tenantId, poLineItem.productId, poForCheck.locationId, quantityReceivedDecimal);
                    inventoryTransactionData.push({
                        tenantId, productId: poLineItem.productId, locationId: poForCheck.locationId,
                        transactionType: InventoryTransactionType.PURCHASE_RECEIPT,
                        quantityChange: quantityReceivedDecimal, // Full quantity received
                        unitCost: unitCostForTx,
                        relatedPoId: poForCheck.id,
                        relatedPoItemId: poLineItem.id,
                        notes: `Received item for PO ${poForCheck.poNumber}`,
                        lotNumber: receivedData.lotNumber,
                        serialNumber: null, // No single serial number here
                        userId: userId,
                        expiryDate: receivedData.expiryDate ? new Date(receivedData.expiryDate) : undefined
                    });
                }
                // NOTE: The validation should prevent reaching here if serials are required but not provided correctly.

                // 5. Update quantityReceived on the PO line item using 'tx'
                await tx.purchaseOrderItem.update({
                    where: { id: poLineItem.id },
                    // Increment the received quantity by the amount received in this specific DTO item
                    data: { quantityReceived: { increment: quantityReceivedDecimal } }
                });
                logger.debug(`Updated PO Item ${poLineItem.id} received quantity by ${quantityReceivedDecimal}`, itemLogContext);

            } // End loop through itemsToProcess

            // Batch create all inventory transaction logs collected
            if (inventoryTransactionData.length > 0) {
                const createdTxResult = await tx.inventoryTransaction.createMany({ data: inventoryTransactionData });
                logContext.transactionsCreated = createdTxResult.count;
                logger.debug(`Batch created ${createdTxResult.count} inventory transactions.`, logContext);
            } else {
                // This case should ideally not be reached if itemsToProcess was not empty,
                // but log just in case.
                logger.warn(`No inventory transactions were generated during PO receiving.`, logContext);
            }

            // 6. Determine and update overall PO status after processing all items
            // Fetch the latest state of *all* items on the PO within the transaction
            const updatedItems = await tx.purchaseOrderItem.findMany({
                where: { poId: poId },
                select: { quantityOrdered: true, quantityReceived: true }
            });
            const totalOrdered = updatedItems.reduce((sum, item) => sum.plus(item.quantityOrdered), new Prisma.Decimal(0));
            const totalReceived = updatedItems.reduce((sum, item) => sum.plus(item.quantityReceived), new Prisma.Decimal(0));

            let newStatus = poForCheck.status; // Start with current status from pre-fetch
            const tolerance = new Prisma.Decimal('0.00001'); // Tolerance for decimal comparison

            if (totalReceived.greaterThan(0)) { // Only change status if something has now been received
                if (totalReceived.plus(tolerance).greaterThanOrEqualTo(totalOrdered)) {
                    newStatus = PurchaseOrderStatus.FULLY_RECEIVED;
                } else {
                    // If received > 0 but less than ordered, it's partially received
                    newStatus = PurchaseOrderStatus.PARTIALLY_RECEIVED;
                }
            }
            // If totalReceived is still 0, status remains unchanged (SENT)

            // Update PO status only if it changed
            if (newStatus !== poForCheck.status) {
                await tx.purchaseOrder.update({
                    where: { id: poId },
                    data: { status: newStatus, updatedAt: new Date() }
                });
                logContext.newStatus = newStatus;
            } else {
                logContext.newStatus = poForCheck.status; // Log status even if unchanged
            }

            return newStatus; // Return the final status determined within the transaction
        }, { timeout: 60000 }); // Increased timeout (60s) for potentially large receiving transactions

        const transactionEndTime = Date.now();
        logger.info(`Items received successfully against PO ${poId}. Final Status: ${updatedStatus}. Tx Duration: ${transactionEndTime - transactionStartTime}ms`, logContext);
        return { success: true, updatedStatus: updatedStatus };

    } catch (error: any) {
        const errorEndTime = Date.now();
        logContext.durationMs = errorEndTime - startTime; // Log total time until error
        if (error instanceof ApiError) {
            logContext.apiError = { statusCode: error.statusCode, message: error.message };
        } else {
            logContext.error = error;
        }
        logger.error(`Error receiving purchase order items`, logContext);
        // Don't throw the original error directly if it's an internal DB issue leaking details
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to receive PO items: ${error instanceof ApiError ? error.message : 'Internal processing error.'}`);
    }
};



// Export service methods
export const purchaseOrderService = {
    createPurchaseOrder,
    queryPurchaseOrders,
    getPurchaseOrderById,
    updatePurchaseOrder,
    // Status transitions
    _updateInventoryItemQuantity,
    submitPurchaseOrder,
    approvePurchaseOrder,
    sendPurchaseOrder,
    cancelPurchaseOrder,
    closePurchaseOrder,
    // Receiving
    receivePurchaseOrderItems,
};
