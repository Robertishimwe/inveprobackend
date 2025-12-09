/**
 * Notification Service
 * 
 * Central routing service that manages notification channels and dispatches
 * notifications to the appropriate channels based on configuration and preferences.
 */

import { NotificationChannel, AlertType, NotificationPriority } from '@prisma/client';
import { prisma } from '@/config';
import logger from '@/utils/logger';
import {
    INotificationChannel,
    NotificationPayload,
    NotificationResult,
    NotificationQueryOptions,
    NotificationWithRelations,
    TenantNotificationConfig,
} from './notification.types';
import { inAppChannel } from './channels/in-app.channel';
import { emailChannel } from './channels/email.channel';
import { smsChannel } from './channels/sms.channel';

class NotificationService {
    private channels: Map<NotificationChannel, INotificationChannel> = new Map();

    constructor() {
        // Register available channels
        this.channels.set(NotificationChannel.IN_APP, inAppChannel);
        this.channels.set(NotificationChannel.EMAIL, emailChannel);
        this.channels.set(NotificationChannel.SMS, smsChannel);
    }

    /**
     * Register a new notification channel
     */
    registerChannel(channel: INotificationChannel): void {
        this.channels.set(channel.channel, channel);
        logger.info('Notification channel registered', { channel: channel.channel });
    }

    /**
     * Send notification to specified channels
     * If no channels specified, uses IN_APP + any configured channels for the tenant
     */
    async notify(
        payload: NotificationPayload,
        channels?: NotificationChannel[]
    ): Promise<NotificationResult[]> {
        const results: NotificationResult[] = [];

        // Determine which channels to use
        let targetChannels = channels || [NotificationChannel.IN_APP];

        // If no specific channels provided, also check tenant config for enabled channels
        if (!channels) {
            const tenantChannels = await this.getTenantEnabledChannels(payload.tenantId);
            targetChannels = [...new Set([...targetChannels, ...tenantChannels])];
        }

        // Send to each channel
        for (const channelType of targetChannels) {
            const channel = this.channels.get(channelType);

            if (!channel) {
                logger.warn('Channel not found', { channel: channelType });
                results.push({
                    success: false,
                    channel: channelType,
                    error: `Channel ${channelType} not found`,
                });
                continue;
            }

            // Check if channel is configured for this tenant
            const isConfigured = await channel.isConfigured(payload.tenantId);
            if (!isConfigured && channelType !== NotificationChannel.IN_APP) {
                logger.debug('Channel not configured, skipping', {
                    channel: channelType,
                    tenantId: payload.tenantId,
                });
                continue;
            }

            try {
                const result = await channel.send(payload);
                results.push(result);
            } catch (error: any) {
                logger.error('Channel send failed', {
                    channel: channelType,
                    error: error.message,
                });
                results.push({
                    success: false,
                    channel: channelType,
                    error: error.message,
                });
            }
        }

        return results;
    }

    /**
     * Send a low stock alert notification
     */
    async notifyLowStock(
        tenantId: string,
        productId: string,
        productSku: string,
        productName: string,
        locationId: string,
        locationName: string,
        available: number,
        reorderPoint: number
    ): Promise<NotificationResult[]> {
        return this.notify({
            tenantId,
            locationId,
            type: AlertType.LOW_STOCK,
            priority: available <= 0 ? NotificationPriority.URGENT : NotificationPriority.HIGH,
            title: available <= 0 ? 'Stock Out Alert' : 'Low Stock Alert',
            message: available <= 0
                ? `${productName} (${productSku}) is out of stock at ${locationName}`
                : `${productName} (${productSku}) is below reorder point at ${locationName}. Available: ${available}, Reorder Point: ${reorderPoint}`,
            data: {
                productId,
                productSku,
                productName,
                locationId,
                locationName,
                available,
                reorderPoint,
            },
            dedupeKey: `low_stock:${productId}:${locationId}`,
        });
    }

    /**
     * Send a stock out (zero stock) alert
     */
    async notifyStockOut(
        tenantId: string,
        productId: string,
        productSku: string,
        productName: string,
        locationId: string,
        locationName: string
    ): Promise<NotificationResult[]> {
        return this.notify({
            tenantId,
            locationId,
            type: AlertType.STOCK_OUT,
            priority: NotificationPriority.URGENT,
            title: 'Stock Out Alert',
            message: `${productName} (${productSku}) is now out of stock at ${locationName}`,
            data: {
                productId,
                productSku,
                productName,
                locationId,
                locationName,
            },
            dedupeKey: `stock_out:${productId}:${locationId}`,
        });
    }

    /**
     * Send a generic system notification
     */
    async notifySystem(
        tenantId: string,
        title: string,
        message: string,
        data?: Record<string, any>,
        priority: NotificationPriority = NotificationPriority.NORMAL
    ): Promise<NotificationResult[]> {
        return this.notify({
            tenantId,
            type: AlertType.SYSTEM_ALERT,
            priority,
            title,
            message,
            data,
        });
    }

    /**
     * Get notifications for a user
     */
    async getNotifications(options: NotificationQueryOptions): Promise<{
        notifications: NotificationWithRelations[];
        total: number;
        unreadCount: number;
    }> {
        const { tenantId, userId, unreadOnly, types, limit = 50, offset = 0 } = options;

        const where: any = { tenantId };

        if (userId) {
            where.OR = [
                { userId },
                { userId: null }, // Broadcast notifications
            ];
        }

        if (unreadOnly) {
            where.isRead = false;
        }

        if (types && types.length > 0) {
            where.type = { in: types };
        }

        const [notifications, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            prisma.notification.count({ where }),
            prisma.notification.count({ where: { ...where, isRead: false } }),
        ]);

        return {
            notifications: notifications as NotificationWithRelations[],
            total,
            unreadCount,
        };
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId: string, userId: string): Promise<void> {
        await prisma.notification.updateMany({
            where: {
                id: notificationId,
                OR: [
                    { userId },
                    { userId: null },
                ],
            },
            data: {
                isRead: true,
                readAt: new Date(),
            },
        });
    }

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(tenantId: string, userId: string): Promise<number> {
        const result = await prisma.notification.updateMany({
            where: {
                tenantId,
                isRead: false,
                OR: [
                    { userId },
                    { userId: null },
                ],
            },
            data: {
                isRead: true,
                readAt: new Date(),
            },
        });
        return result.count;
    }

    /**
     * Get unread notification count
     */
    async getUnreadCount(tenantId: string, userId: string): Promise<number> {
        return prisma.notification.count({
            where: {
                tenantId,
                isRead: false,
                OR: [
                    { userId },
                    { userId: null },
                ],
            },
        });
    }

    /**
     * Delete a notification
     */
    async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
        const result = await prisma.notification.deleteMany({
            where: {
                id: notificationId,
                OR: [
                    { userId },
                    { userId: null },
                ],
            },
        });
        return result.count > 0;
    }

    /**
     * Get enabled notification channels from tenant configuration
     */
    private async getTenantEnabledChannels(tenantId: string): Promise<NotificationChannel[]> {
        try {
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { configuration: true },
            });

            if (!tenant?.configuration) return [];

            const config = tenant.configuration as TenantNotificationConfig;
            return config.enabledChannels || [];
        } catch (error) {
            return [];
        }
    }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;
