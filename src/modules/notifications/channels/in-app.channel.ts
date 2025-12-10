/**
 * In-App Notification Channel
 * 
 * Stores notifications in the database and broadcasts via SSE.
 * Now with role-based and location-based recipient filtering.
 */

import { NotificationChannel, NotificationPriority, AlertType } from '@prisma/client';
import { prisma } from '@/config';
import { sseManager } from '@/utils/sseManager';
import logger from '@/utils/logger';
import {
    INotificationChannel,
    NotificationPayload,
    NotificationResult,
} from '../notification.types';
import { getEligibleRecipients } from '../notification-recipients.helper';

export class InAppChannel implements INotificationChannel {
    readonly channel = NotificationChannel.IN_APP;

    async send(payload: NotificationPayload): Promise<NotificationResult> {
        try {
            // Check for deduplication (check if same alert was sent within last hour)
            if (payload.dedupeKey) {
                const existing = await prisma.notification.findFirst({
                    where: {
                        tenantId: payload.tenantId,
                        dedupeKey: payload.dedupeKey,
                        createdAt: {
                            // Don't duplicate within last hour
                            gte: new Date(Date.now() - 60 * 60 * 1000),
                        },
                    },
                });

                if (existing) {
                    logger.debug('Skipping duplicate notification', {
                        dedupeKey: payload.dedupeKey,
                        existingId: existing.id,
                    });
                    return {
                        success: true,
                        channel: this.channel,
                        notificationId: existing.id,
                    };
                }
            }

            // Get eligible recipients based on alert settings
            const recipients = await getEligibleRecipients(
                payload.tenantId,
                payload.type as AlertType,
                'inApp',
                payload.locationId
            );

            // If no eligible recipients, log and return success (not an error)
            if (recipients.length === 0) {
                logger.info('No eligible recipients for in-app notification', {
                    tenantId: payload.tenantId,
                    type: payload.type,
                    locationId: payload.locationId,
                });
                return {
                    success: true,
                    channel: this.channel,
                };
            }

            // Create notifications for each eligible user
            const createdNotifications = await prisma.$transaction(async (tx) => {
                const notifications = [];

                for (const recipient of recipients) {
                    const notification = await tx.notification.create({
                        data: {
                            tenantId: payload.tenantId,
                            userId: recipient.userId, // Each user gets their own notification
                            locationId: payload.locationId || null,
                            type: payload.type,
                            priority: payload.priority || NotificationPriority.NORMAL,
                            title: payload.title,
                            message: payload.message,
                            data: payload.data || {},
                            dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${recipient.userId}` : null,
                            expiresAt: payload.expiresAt || null,
                        },
                    });
                    notifications.push(notification);
                }

                return notifications;
            });

            // Broadcast via SSE to notify connected clients
            // Each user will only see their own notification when they fetch
            for (const notification of createdNotifications) {
                sseManager.broadcastNotification(payload.tenantId, {
                    id: notification.id,
                    type: notification.type,
                    priority: notification.priority,
                    title: notification.title,
                    message: notification.message,
                    data: notification.data,
                    createdAt: notification.createdAt.toISOString(),
                    userId: notification.userId, // Include userId so client can filter
                });
            }

            logger.info('In-app notifications sent', {
                tenantId: payload.tenantId,
                type: payload.type,
                recipientCount: recipients.length,
                notificationIds: createdNotifications.map(n => n.id),
            });

            return {
                success: true,
                channel: this.channel,
                notificationId: createdNotifications[0]?.id,
            };
        } catch (error: any) {
            logger.error('Failed to send in-app notification', {
                error: error.message,
                payload,
            });
            return {
                success: false,
                channel: this.channel,
                error: error.message,
            };
        }
    }

    async isConfigured(_tenantId: string): Promise<boolean> {
        // In-app is always configured as it uses the database
        return true;
    }
}

export const inAppChannel = new InAppChannel();

