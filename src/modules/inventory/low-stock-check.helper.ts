/**
 * Low Stock Detection Helper
 * 
 * Checks if inventory items are below their reorder point and triggers
 * notifications when needed. Can be called after any stock-changing operation.
 */

import { prisma } from '@/config';
import logger from '@/utils/logger';
import notificationService from '@/modules/notifications/notification.service';

interface LowStockCheckResult {
    productId: string;
    productSku: string;
    productName: string;
    locationId: string;
    locationName: string;
    available: number;
    reorderPoint: number;
    notificationSent: boolean;
}

/**
 * Check if an inventory item is below its reorder point and send notification if so.
 * This is designed to be called AFTER a stock transaction completes.
 */
export const checkAndNotifyLowStock = async (
    tenantId: string,
    productId: string,
    locationId: string
): Promise<LowStockCheckResult | null> => {
    try {
        // Fetch the inventory item with product and location details
        const inventoryItem = await prisma.inventoryItem.findUnique({
            where: {
                tenantId_productId_locationId: { tenantId, productId, locationId },
            },
            include: {
                product: {
                    select: { name: true, sku: true },
                },
                location: {
                    select: { name: true },
                },
            },
        });

        if (!inventoryItem) {
            logger.debug('Inventory item not found for low stock check', {
                tenantId, productId, locationId,
            });
            return null;
        }

        // Calculate available stock
        const available = inventoryItem.quantityOnHand
            .minus(inventoryItem.quantityAllocated)
            .toNumber();

        const reorderPoint = inventoryItem.reorderPoint?.toNumber() ?? 0;

        // Only check if a reorder point is set
        if (reorderPoint <= 0) {
            return null;
        }

        const result: LowStockCheckResult = {
            productId,
            productSku: inventoryItem.product.sku,
            productName: inventoryItem.product.name,
            locationId,
            locationName: inventoryItem.location.name,
            available,
            reorderPoint,
            notificationSent: false,
        };

        // Check if below reorder point
        if (available <= reorderPoint) {
            // Send notification (deduplication is handled by NotificationService)
            await notificationService.notifyLowStock(
                tenantId,
                productId,
                inventoryItem.product.sku,
                inventoryItem.product.name,
                locationId,
                inventoryItem.location.name,
                available,
                reorderPoint
            );
            result.notificationSent = true;

            logger.info('Low stock notification triggered', {
                tenantId,
                productId,
                productSku: inventoryItem.product.sku,
                locationId,
                available,
                reorderPoint,
            });
        }

        return result;
    } catch (error: any) {
        logger.error('Error checking low stock', {
            tenantId, productId, locationId, error: error.message,
        });
        // Don't throw - low stock check failure shouldn't break the main operation
        return null;
    }
};

/**
 * Check multiple inventory items for low stock (batch operation)
 * Useful after bulk operations like PO receipts or transfers
 */
export const checkAndNotifyLowStockBatch = async (
    tenantId: string,
    items: Array<{ productId: string; locationId: string }>
): Promise<LowStockCheckResult[]> => {
    const results: LowStockCheckResult[] = [];

    for (const item of items) {
        const result = await checkAndNotifyLowStock(
            tenantId,
            item.productId,
            item.locationId
        );
        if (result) {
            results.push(result);
        }
    }

    return results;
};

export default {
    checkAndNotifyLowStock,
    checkAndNotifyLowStockBatch,
};
