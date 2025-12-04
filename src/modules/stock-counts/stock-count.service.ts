import httpStatus from 'http-status';
import {
    Prisma, StockCount, StockCountStatus, StockCountType, StockCountItemStatus, StockCountItem, Location, User, Product, InventoryTransactionType// Import necessary types/enums
} from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { InitiateStockCountDto, EnterCountsDto, ReviewCountDto } from './dto';
// Import inventory helper
import { inventoryService } from '@/modules/inventory/inventory.service'; // Or adjust import

type LogContext = { function?: string; tenantId?: string | null; userId?: string | null; stockCountId?: string | null; data?: any; error?: any;[key: string]: any; };

type StockCountSummary = StockCount & {
    location: Pick<Location, 'id' | 'name'>;
    initiatedByUser: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
    _count?: { items: number } | null; // Include item count
};

// --- Type Helper for Detailed View Response ---
// Includes full items and potentially more related info
type StockCountWithDetails = StockCount & {
    location: Pick<Location, 'id' | 'name'>;
    initiatedByUser: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
    reviewedByUser: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
    completedByUser: Pick<User, 'id' | 'firstName' | 'lastName'> | null;
    items: (StockCountItem & { product: Pick<Product, 'id' | 'sku' | 'name'> })[]; // Include basic product info for items
};

// Helper: Generate Stock Count Number
async function generateStockCountNumber(tenantId: string, tx: Prisma.TransactionClient): Promise<string> {
    const prefix = "SC-"; // Or INVCOUNT- etc.
    const count = await tx.stockCount.count({ where: { tenantId } });
    const nextNum = count + 1;
    const countNumber = `${prefix}${new Date().getFullYear()}-${nextNum.toString().padStart(5, '0')}`; // Example: SC-2024-00123
    const exists = await tx.stockCount.count({ where: { tenantId, countNumber } });
    if (exists > 0) throw new Error(`Generated Stock Count Number ${countNumber} collision.`);
    return countNumber;
}

/** Initiate a new Stock Count */
const initiateStockCount = async (data: InitiateStockCountDto, tenantId: string, userId: string): Promise<StockCount> => {
    const logContext: LogContext = { function: 'initiateStockCount', tenantId, userId, locationId: data.locationId, type: data.type };

    // 1. Validate Location
    const locationExists = await prisma.location.count({ where: { id: data.locationId, tenantId, isActive: true } });
    if (!locationExists) throw new ApiError(httpStatus.BAD_REQUEST, `Active location ${data.locationId} not found.`);

    // 2. Determine Products to Include
    const productFilter: Prisma.ProductWhereInput = {
        tenantId,
        isActive: true,
        isStockTracked: true, // Only count stock-tracked items
    };
    if (data.type === StockCountType.CYCLE && data.productIds && data.productIds.length > 0) {
        productFilter.id = { in: data.productIds };
        // TODO: Add validation that provided product IDs exist and are active/tracked
        logContext.productCount = data.productIds.length;
    } else if (data.type === StockCountType.CYCLE) {
        // TODO: Implement other cycle count criteria (category, zone, velocity etc.)
        // For now, require productIds for CYCLE or handle as FULL if no criteria
        logger.warn(`Cycle count initiated without specific criteria - defaulting to FULL count scope for location ${data.locationId}`, logContext);
        // Or throw: throw new ApiError(httpStatus.BAD_REQUEST, 'Cycle count requires specific product IDs or other criteria.');
    }
    // If type is FULL, productFilter just uses tenantId, isActive, isStockTracked

    // 3. Fetch Inventory Items and Snapshot Quantities
    const itemsToSnapshot = await prisma.inventoryItem.findMany({
        where: {
            locationId: data.locationId,
            product: productFilter,
            // Optionally filter out items with zero onHand? Depends on count scope.
            // quantityOnHand: { not: 0 }
        },
        select: {
            productId: true,
            quantityOnHand: true, // This is the snapshot quantity
            averageCost: true,    // Snapshot cost for variance valuation
        }
    });

    if (itemsToSnapshot.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No active, stock-tracked products found matching the criteria for this location.');
    }
    logContext.itemsToSnapshot = itemsToSnapshot.length;

    // 4. Create Stock Count and Items in Transaction
    try {
        const newStockCount = await prisma.$transaction(async (tx) => {
            const countNumber = await generateStockCountNumber(tenantId, tx);
            logContext.countNumber = countNumber;

            const stockCountHeader = await tx.stockCount.create({
                data: {
                    tenantId,
                    locationId: data.locationId,
                    countNumber,
                    status: StockCountStatus.PENDING, // Ready to start counting
                    type: data.type,
                    initiatedByUserId: userId,
                    initiatedAt: new Date(),
                    notes: data.notes,
                }
            });
            logContext.stockCountId = stockCountHeader.id;

            const stockCountItemsData: Prisma.StockCountItemCreateManyInput[] = itemsToSnapshot.map(item => ({
                tenantId,
                stockCountId: stockCountHeader.id,
                productId: item.productId,
                snapshotQuantity: item.quantityOnHand,
                countedQuantity: null, // Null until counted
                varianceQuantity: null, // Null until counted
                unitCostAtSnapshot: item.averageCost, // Use average cost as snapshot cost
                status: StockCountItemStatus.PENDING,
            }));

            await tx.stockCountItem.createMany({
                data: stockCountItemsData,
            });

            // Return header (items can be fetched separately)
            return stockCountHeader;
        });

        logger.info(`Stock count ${newStockCount.countNumber} initiated successfully`, logContext);
        return newStockCount;

    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        logContext.error = error;
        logger.error(`Error initiating stock count`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to initiate stock count.');
    }
};

/** Enter counted quantities for items in a stock count */
const enterCountData = async (stockCountId: string, data: EnterCountsDto, tenantId: string, userId: string): Promise<{ updatedItems: number }> => {
    const logContext: LogContext = { function: 'enterCountData', tenantId, userId, stockCountId, itemCount: data.items.length };

    // 1. Verify stock count exists and is in a countable state
    const stockCount = await prisma.stockCount.findFirst({
        where: { id: stockCountId, tenantId },
        select: { status: true, id: true }
    });
    if (!stockCount) throw new ApiError(httpStatus.NOT_FOUND, 'Stock count not found.');

    const allowedStatuses: StockCountStatus[] = [StockCountStatus.PENDING, StockCountStatus.COUNTING, StockCountStatus.REVIEW];

    if (!allowedStatuses.includes(stockCount.status)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot enter counts for stock count with status ${stockCount.status}.`);
    }

    // TODO: Add validation for lot/serial counts against product requirements if applicable

    // 2. Update items within a transaction for atomicity
    try {
        let updatedCount = 0;
        await prisma.$transaction(async (tx) => {
            // Update status to COUNTING if it was PENDING
            if (stockCount.status === StockCountStatus.PENDING) {
                await tx.stockCount.update({ where: { id: stockCountId }, data: { status: StockCountStatus.COUNTING } });
            }

            for (const itemData of data.items) {
                const countedQuantity = new Prisma.Decimal(itemData.countedQuantity);
                const stockCountItem = await tx.stockCountItem.findUnique({ where: { id: itemData.stockCountItemId }, select: { snapshotQuantity: true, stockCountId: true } });

                // Validate item belongs to this count
                if (!stockCountItem || stockCountItem.stockCountId !== stockCountId) {
                    logger.warn(`Stock count item ${itemData.stockCountItemId} not found or doesn't belong to count ${stockCountId}`, logContext);
                    // Optionally collect errors and report back, or just skip invalid items
                    continue;
                }

                const varianceQuantity = countedQuantity.minus(stockCountItem.snapshotQuantity);

                const result = await tx.stockCountItem.updateMany({ // Use updateMany to ensure it belongs to the count
                    where: {
                        id: itemData.stockCountItemId,
                        stockCountId: stockCountId // Ensure item belongs to this count
                    },
                    data: {
                        countedQuantity: countedQuantity,
                        varianceQuantity: varianceQuantity,
                        status: StockCountItemStatus.COUNTED, // Mark as counted
                        countedByUserId: userId,
                        countedAt: new Date(),
                        notes: itemData.notes, // Update notes if provided
                        // TODO: Update lot/serial if captured
                    }
                });
                updatedCount += result.count;
            }
        });

        logger.info(`Successfully entered counts for ${updatedCount} items in stock count ${stockCountId}`, logContext);
        return { updatedItems: updatedCount };

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error entering stock count data`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to enter count data.');
    }
};

/** Review counted items and mark for approval/recount/skip */
const reviewStockCount = async (stockCountId: string, data: ReviewCountDto, tenantId: string, userId: string): Promise<{ success: boolean, finalStatus?: StockCountStatus }> => {
    const logContext: LogContext = { function: 'reviewStockCount', tenantId, userId, stockCountId, itemCount: data.items.length };

    // 1. Verify stock count exists and is in a reviewable state
    const stockCount = await prisma.stockCount.findFirst({
        where: { id: stockCountId, tenantId },
        select: { status: true, id: true }
    });
    if (!stockCount) throw new ApiError(httpStatus.NOT_FOUND, 'Stock count not found.');
    // Allow review if Counting or already in Review
    if (stockCount.status !== StockCountStatus.COUNTING && stockCount.status !== StockCountStatus.REVIEW) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot review stock count with status ${stockCount.status}. Counts must be entered first.`);
    }

    // 2. Update items within a transaction
    try {
        let needsFurtherAction = false; // Track if any items still need counting/recounting

        await prisma.$transaction(async (tx) => {
            // Update header status to REVIEW if it wasn't already
            if (stockCount.status !== StockCountStatus.REVIEW) {
                await tx.stockCount.update({ where: { id: stockCountId }, data: { status: StockCountStatus.REVIEW } });
            }

            for (const itemAction of data.items) {
                const updateResult = await tx.stockCountItem.updateMany({
                    where: {
                        id: itemAction.stockCountItemId,
                        stockCountId: stockCountId, // Ensure item belongs to this count
                        // Only allow review actions on items that HAVE been counted
                        status: { in: [StockCountItemStatus.COUNTED, StockCountItemStatus.RECOUNT_REQUESTED] } // Or allow re-reviewing approved? Depends on workflow.
                    },
                    data: {
                        status: itemAction.action, // Set to APPROVED, RECOUNT_REQUESTED, or SKIPPED
                        reviewNotes: itemAction.notes,
                        // Optionally store reviewer ID/timestamp if needed on item level
                    }
                });
                if (updateResult.count === 0) {
                    // Log or potentially throw error if trying to review an item not in correct state
                    logger.warn(`Review action skipped for item ${itemAction.stockCountItemId} - item not found or not in countable/recountable state.`, logContext);
                }
                if (itemAction.action === StockCountItemStatus.RECOUNT_REQUESTED) {
                    needsFurtherAction = true;
                }
            }

            // Check if all items are now resolved (APPROVED or SKIPPED)
            if (!needsFurtherAction) {
                const unresolvedCount = await tx.stockCountItem.count({
                    where: { stockCountId: stockCountId, status: { notIn: [StockCountItemStatus.APPROVED, StockCountItemStatus.SKIPPED] } }
                });
                if (unresolvedCount === 0) {
                    // If no items need recount/counting, mark the main count ready for posting (or directly to COMPLETED if no explicit posting step)
                    // Let's assume an explicit posting step, so just ensure status is REVIEW.
                    // If status wasn't REVIEW initially, it was set above. If it was REVIEW, it stays REVIEW.
                    logger.info(`All items reviewed for stock count ${stockCountId}. Ready for posting adjustments.`, logContext);
                } else {
                    // Some items might still be PENDING if not all were submitted in EnterCountsDto
                    logger.info(`${unresolvedCount} items still pending count/recount for stock count ${stockCountId}.`, logContext);
                }
            } else {
                logger.info(`Recount requested for one or more items in stock count ${stockCountId}. Status remains REVIEW.`, logContext);
            }

        });

        return { success: true }; // Return simple success, final status decided later or check state

    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        logContext.error = error;
        logger.error(`Error reviewing stock count data`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to review count data.');
    }
};


/** Post approved variances as Inventory Adjustments */
const postStockCountAdjustments = async (stockCountId: string, tenantId: string, userId: string): Promise<{ success: boolean, adjustmentsCreated: number }> => {
    const logContext: LogContext = { function: 'postStockCountAdjustments', tenantId, userId, stockCountId };

    // 1. Verify stock count exists and is ready for posting
    const stockCount = await prisma.stockCount.findFirst({
        where: { id: stockCountId, tenantId },
        select: { status: true, id: true, countNumber: true, locationId: true }
    });
    if (!stockCount) throw new ApiError(httpStatus.NOT_FOUND, 'Stock count not found.');
    // Allow posting only from REVIEW status (after manager has approved items)
    // Or allow posting directly from COUNTING if skipping review step? Assuming REVIEW is required.
    if (stockCount.status !== StockCountStatus.REVIEW) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Stock count must be in REVIEW status to post adjustments (current: ${stockCount.status}). Ensure all items are approved or skipped.`);
    }

    // 2. Find items with approved variances
    const itemsToAdjust = await prisma.stockCountItem.findMany({
        where: {
            stockCountId: stockCountId,
            status: StockCountItemStatus.APPROVED, // Only post approved items
            varianceQuantity: { not: 0 } // Only post items with actual variance
        },
        select: { id: true, productId: true, varianceQuantity: true, unitCostAtSnapshot: true, lotNumber: true, serialNumber: true }
    });

    if (itemsToAdjust.length === 0) {
        logger.info(`No approved variances found to post for stock count ${stockCountId}. Marking as complete.`, logContext);
        // Update status to COMPLETED even if no adjustments needed
        await prisma.stockCount.update({
            where: { id: stockCountId },
            data: { status: StockCountStatus.COMPLETED, completedAt: new Date(), completedByUserId: userId }
        });
        return { success: true, adjustmentsCreated: 0 };
    }
    logContext.itemsToAdjustCount = itemsToAdjust.length;

    // 3. Post adjustments within a transaction
    try {
        await prisma.$transaction(async (tx) => {

            // Option 1: Create one large adjustment record
            //  let adjustmentItemsData: Prisma.InventoryAdjustmentItemCreateManyInput[] = [];
            //  let inventoryTransactionData: Prisma.InventoryTransactionCreateManyInput[] = [];
            /*
            const adjustment = await tx.inventoryAdjustment.create({
                data: { tenantId, locationId: stockCount.locationId, reasonCode: 'STOCK_COUNT_VARIANCE', notes: `Variance from Stock Count ${stockCount.countNumber ?? stockCountId}`, createdByUserId: userId, adjustmentDate: new Date() }
            });
            logContext.adjustmentId = adjustment.id;

            for (const item of itemsToAdjust) {
                await _updateInventoryItemQuantity(tx, tenantId, item.productId, stockCount.locationId, item.varianceQuantity!);
                adjustmentItemsData.push({ tenantId, adjustmentId: adjustment.id, productId: item.productId, quantityChange: item.varianceQuantity!, unitCost: item.unitCostAtSnapshot, lotNumber: item.lotNumber, serialNumber: item.serialNumber });
                inventoryTransactionData.push({ tenantId, userId, productId: item.productId, locationId: stockCount.locationId, quantityChange: item.varianceQuantity!, transactionType: InventoryTransactionType.CYCLE_COUNT_ADJUSTMENT, unitCost: item.unitCostAtSnapshot, relatedAdjustmentId: adjustment.id, notes: `Variance from SC ${stockCount.countNumber ?? stockCountId}`, lotNumber: item.lotNumber, serialNumber: item.serialNumber });
            }
            await tx.inventoryAdjustmentItem.createMany({ data: adjustmentItemsData });
            await tx.inventoryTransaction.createMany({ data: inventoryTransactionData });
            */

            // Option 2 (Using _recordStockMovement): Create adjustment header FIRST, then loop items
            const adjustment = await tx.inventoryAdjustment.create({
                data: { tenantId, locationId: stockCount.locationId, reasonCode: 'STOCK_COUNT_VARIANCE', notes: `Variance from Stock Count ${stockCount.countNumber ?? stockCountId}`, createdByUserId: userId, adjustmentDate: new Date() }
            });
            logContext.adjustmentId = adjustment.id;

            for (const item of itemsToAdjust) {
                // Call the helper which updates item and creates transaction
                // Ensure varianceQuantity is not null (checked by findMany where clause)
                await inventoryService._recordStockMovement(
                    tx, tenantId, userId, item.productId, stockCount.locationId,
                    item.varianceQuantity!, // Pass variance directly
                    InventoryTransactionType.CYCLE_COUNT_ADJUSTMENT,
                    item.unitCostAtSnapshot,
                    { adjustmentId: adjustment.id }, // Link to the adjustment record
                    `Variance from SC ${stockCount.countNumber ?? stockCountId}`,
                    item.lotNumber,
                    item.serialNumber
                );
                // Also create the AdjustmentItem link
                await tx.inventoryAdjustmentItem.create({
                    data: {
                        tenantId,
                        adjustmentId: adjustment.id,
                        productId: item.productId,
                        quantityChange: item.varianceQuantity!,
                        unitCost: item.unitCostAtSnapshot,
                        lotNumber: item.lotNumber,
                        serialNumber: item.serialNumber,
                    }
                });
            }

            // 4. Update Stock Count status to COMPLETED
            await tx.stockCount.update({
                where: { id: stockCountId },
                data: { status: StockCountStatus.COMPLETED, completedAt: new Date(), completedByUserId: userId }
            });
        });

        logger.info(`Successfully posted ${itemsToAdjust.length} adjustments for stock count ${stockCountId}`, logContext);
        return { success: true, adjustmentsCreated: itemsToAdjust.length };

    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        logContext.error = error;
        logger.error(`Error posting stock count adjustments`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to post stock count adjustments.');
    }
};


// --- Query Methods (Added previously) ---
// const queryStockCounts = async (filter: Prisma.StockCountWhereInput, orderBy: Prisma.StockCountOrderByWithRelationInput[], limit: number, page: number): Promise<{ stockCounts: any[], totalResults: number }> => { /* ... Implementation ... */ };
// const getStockCountById = async (stockCountId: string, tenantId: string): Promise<StockCount | null> => { /* ... Implementation ... */ };

/**
 * Query Stock Counts with filtering, sorting, pagination.
 * Returns a summary view including item counts.
 * @param {Prisma.StockCountWhereInput} filter - Prisma filter object (must include tenantId).
 * @param {Prisma.StockCountOrderByWithRelationInput[]} orderBy - Prisma sorting object array.
 * @param {number} limit - Max records per page.
 * @param {number} page - Current page number.
 * @returns {Promise<{ stockCounts: StockCountSummary[], totalResults: number }>} List of stock count summaries and total count.
 */
const queryStockCounts = async (
    filter: Prisma.StockCountWhereInput,
    orderBy: Prisma.StockCountOrderByWithRelationInput[],
    limit: number,
    page: number
): Promise<{ stockCounts: StockCountSummary[], totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'queryStockCounts', tenantId: tenantIdForLog, limit, page, filter: '...' }; // Don't log full filter object

    if (!tenantIdForLog) {
        logger.error('Programming Error: queryStockCounts called without tenantId filter', logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing for stock count query.');
    }

    try {
        // Use $transaction for consistent reads of list and count
        const [stockCounts, totalResults] = await prisma.$transaction([
            prisma.stockCount.findMany({
                where: filter, // Apply the filter constructed in the controller
                include: { // Include necessary data for the summary view
                    location: { select: { id: true, name: true } },
                    initiatedByUser: { select: { id: true, firstName: true, lastName: true } },
                    _count: { select: { items: true } } // Get the count of associated items
                },
                orderBy: orderBy, // Apply sorting
                skip: skip,       // Apply pagination skip
                take: limit,      // Apply pagination limit
            }),
            prisma.stockCount.count({ where: filter }), // Count based on the same filter
        ]);

        logger.debug(`Stock count query successful, found ${stockCounts.length} of ${totalResults}`, logContext);
        // Cast the result to the specific summary type
        return { stockCounts: stockCounts as StockCountSummary[], totalResults };

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying stock counts`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve stock counts.');
    }
};

/**
 * Get full details of a specific Stock Count by ID, including all its items.
 * Ensures tenant isolation.
 * @param {string} stockCountId - The ID of the stock count to retrieve.
 * @param {string} tenantId - The ID of the tenant making the request.
 * @returns {Promise<StockCountWithDetails | null>} The stock count object with details or null if not found.
 */
const getStockCountById = async (stockCountId: string, tenantId: string): Promise<StockCountWithDetails | null> => {
    const logContext: LogContext = { function: 'getStockCountById', stockCountId, tenantId };
    try {
        const stockCount = await prisma.stockCount.findFirst({
            where: {
                id: stockCountId,
                tenantId: tenantId // Tenant isolation
            },
            include: { // Include all necessary details
                location: { select: { id: true, name: true } },
                initiatedByUser: { select: { id: true, firstName: true, lastName: true } },
                reviewedByUser: { select: { id: true, firstName: true, lastName: true } }, // Include if review step exists
                completedByUser: { select: { id: true, firstName: true, lastName: true } }, // Include if posting step exists
                items: { // Include all items associated with this count
                    include: {
                        product: { select: { id: true, sku: true, name: true } }, // Include basic product info
                        countedByUser: { select: { id: true, firstName: true, lastName: true } } // User who counted this item
                    },
                    orderBy: { // Consistent order for items
                        product: { sku: 'asc' }
                    }
                }
            }
        });

        if (!stockCount) {
            logger.warn(`Stock count not found or tenant mismatch`, logContext);
            return null;
        }

        logger.debug(`Stock count found successfully`, logContext);
        // Cast the result to ensure it matches the detailed type definition
        return stockCount as StockCountWithDetails;

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching stock count by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve stock count details.');
    }
};



// --- Service Exports ---
export const stockCountService = {
    initiateStockCount,
    enterCountData,
    reviewStockCount,
    postStockCountAdjustments,
    queryStockCounts,
    getStockCountById,
};

// --- Re-add _updateInventoryItemQuantity Helper ---
// (Make sure InventoryItem type is imported)





// async function _updateInventoryItemQuantity(
//     tx: Prisma.TransactionClient,
//     tenantId: string,
//     productId: string,
//     locationId: string,
//     quantityChange: number | Prisma.Decimal
// ): Promise<InventoryItem> {
//      const quantityChangeDecimal = new Prisma.Decimal(quantityChange);
//       if (quantityChangeDecimal.isZero()) {
//         const existingItem = await tx.inventoryItem.findUnique({ where: { tenantId_productId_locationId: { tenantId, productId, locationId } } });
//         if (!existingItem) { throw new Error(`Cannot update zero quantity for non-existent InventoryItem: Prod ${productId}, Loc ${locationId}`); }
//         return existingItem;
//       }
//       const inventoryItem = await tx.inventoryItem.upsert({
//         where: { tenantId_productId_locationId: { tenantId, productId, locationId } },
//         create: { tenantId, productId, locationId, quantityOnHand: quantityChangeDecimal, quantityAllocated: 0, quantityIncoming: 0 },
//         update: { quantityOnHand: { increment: quantityChangeDecimal }, updatedAt: new Date() },
//     });
//      if (inventoryItem.quantityOnHand.lessThan(0)) {
//           const allowNegativeStock = false; // TODO: Config
//           if (!allowNegativeStock) {
//               throw new ApiError(httpStatus.BAD_REQUEST, `Operation results in negative stock for product ID ${productId} at location ${locationId}.`);
//           } else { logger.warn(`Stock quantity went negative for item ${inventoryItem.id} (Allowed by config).`); }
//      }
//      return inventoryItem;
// }
