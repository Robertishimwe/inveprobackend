/**
 * In-App Notification Channel
 * 
 * Stores notifications in the database and broadcasts via SSE.
 */

import { NotificationChannel, NotificationPriority } from '@prisma/client';
import { prisma } from '@/config';
import { sseManager } from '@/utils/sseManager';
import logger from '@/utils/logger';
import {
    INotificationChannel,
    NotificationPayload,
    NotificationResult,
} from '../notification.types';

export class InAppChannel implements INotificationChannel {
    readonly channel = NotificationChannel.IN_APP;

    async send(payload: NotificationPayload): Promise<NotificationResult> {
        try {
            // Check for deduplication
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

            // Create notification in database
            const notification = await prisma.notification.create({
                data: {
                    tenantId: payload.tenantId,
                    userId: payload.userId || null,
                    locationId: payload.locationId || null,
                    type: payload.type,
                    priority: payload.priority || NotificationPriority.NORMAL,
                    title: payload.title,
                    message: payload.message,
                    data: payload.data || {},
                    dedupeKey: payload.dedupeKey || null,
                    expiresAt: payload.expiresAt || null,
                },
            });

            // Broadcast via SSE to all connected clients
            sseManager.broadcastNotification(payload.tenantId, {
                id: notification.id,
                type: notification.type,
                priority: notification.priority,
                title: notification.title,
                message: notification.message,
                data: notification.data,
                createdAt: notification.createdAt.toISOString(),
            });

            logger.info('In-app notification sent', {
                notificationId: notification.id,
                tenantId: payload.tenantId,
                type: payload.type,
            });

            return {
                success: true,
                channel: this.channel,
                notificationId: notification.id,
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
