/**
 * SSE (Server-Sent Events) Manager for real-time stock updates
 * 
 * This module manages SSE connections and broadcasts stock update events
 * to all connected POS terminals within the same tenant+location.
 */

import { Response } from 'express';
import logger from '@/utils/logger';

// Store connected clients by tenant+location
// Key: `${tenantId}:${locationId}`, Value: Set of Response objects
const clients = new Map<string, Set<Response>>();

// Store all clients by tenant (for tenant-wide broadcasts like notifications)
// Key: tenantId, Value: Set of Response objects
const tenantClients = new Map<string, Set<Response>>();

// Event types
export enum SSEEventType {
    STOCK_UPDATE = 'STOCK_UPDATE',
    ORDER_UPDATE = 'ORDER_UPDATE',
    SUSPENDED_COUNT_UPDATE = 'SUSPENDED_COUNT_UPDATE',
    NOTIFICATION = 'NOTIFICATION',
}

export interface StockUpdateEvent {
    type: SSEEventType.STOCK_UPDATE;
    productId: string;
    locationId: string;
    quantityOnHand: number;
    quantityAllocated: number;
    timestamp: string;
}

export interface SuspendedCountUpdateEvent {
    type: SSEEventType.SUSPENDED_COUNT_UPDATE;
    locationId: string;
    count: number;
    timestamp: string;
}

export interface NotificationEvent {
    type: SSEEventType.NOTIFICATION;
    id: string;
    alertType: string;
    priority: string;
    title: string;
    message: string;
    data: any;
    createdAt: string;
    userId?: string | null; // For per-user notification filtering
}

type SSEEvent = StockUpdateEvent | SuspendedCountUpdateEvent | NotificationEvent;

/**
 * Register a new SSE client connection
 */
export const registerClient = (tenantId: string, locationId: string, res: Response): void => {
    const key = `${tenantId}:${locationId}`;

    if (!clients.has(key)) {
        clients.set(key, new Set());
    }

    clients.get(key)!.add(res);

    // Also track by tenant for tenant-wide broadcasts
    if (!tenantClients.has(tenantId)) {
        tenantClients.set(tenantId, new Set());
    }
    tenantClients.get(tenantId)!.add(res);

    const clientCount = clients.get(key)!.size;
    logger.info(`SSE client connected`, { tenantId, locationId, clientCount });

    // Send initial connection success event
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to stock updates' })}\n\n`);
};

/**
 * Remove a client connection (on disconnect)
 */
export const removeClient = (tenantId: string, locationId: string, res: Response): void => {
    const key = `${tenantId}:${locationId}`;

    const clientSet = clients.get(key);
    if (clientSet) {
        clientSet.delete(res);

        if (clientSet.size === 0) {
            clients.delete(key);
        }

        logger.info(`SSE client disconnected`, { tenantId, locationId, remainingClients: clientSet.size });
    }

    // Also remove from tenant-wide tracking
    const tenantClientSet = tenantClients.get(tenantId);
    if (tenantClientSet) {
        tenantClientSet.delete(res);
        if (tenantClientSet.size === 0) {
            tenantClients.delete(tenantId);
        }
    }
};

/**
 * Broadcast an event to all clients in a specific tenant+location
 */
export const broadcastToLocation = (tenantId: string, locationId: string, event: SSEEvent): void => {
    const key = `${tenantId}:${locationId}`;
    const clientSet = clients.get(key);

    if (!clientSet || clientSet.size === 0) {
        logger.debug(`No SSE clients connected for broadcast`, { tenantId, locationId });
        return;
    }

    const eventData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

    let sentCount = 0;
    for (const client of clientSet) {
        try {
            client.write(eventData);
            sentCount++;
        } catch (err) {
            // Client probably disconnected, will be cleaned up
            logger.warn(`Failed to send SSE event to client`, { error: err });
        }
    }

    logger.debug(`SSE event broadcast`, { tenantId, locationId, eventType: event.type, sentCount });
};

/**
 * Broadcast stock update to all terminals at a location
 */
export const broadcastStockUpdate = (
    tenantId: string,
    locationId: string,
    productId: string,
    quantityOnHand: number,
    quantityAllocated: number
): void => {
    broadcastToLocation(tenantId, locationId, {
        type: SSEEventType.STOCK_UPDATE,
        productId,
        locationId,
        quantityOnHand,
        quantityAllocated,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Broadcast suspended orders count update
 */
export const broadcastSuspendedCountUpdate = (
    tenantId: string,
    locationId: string,
    count: number
): void => {
    broadcastToLocation(tenantId, locationId, {
        type: SSEEventType.SUSPENDED_COUNT_UPDATE,
        locationId,
        count,
        timestamp: new Date().toISOString(),
    });
};

/**
 * Get count of connected clients (for debugging/monitoring)
 */
export const getClientCount = (tenantId?: string, locationId?: string): number => {
    if (tenantId && locationId) {
        const key = `${tenantId}:${locationId}`;
        return clients.get(key)?.size || 0;
    }

    let total = 0;
    for (const clientSet of clients.values()) {
        total += clientSet.size;
    }
    return total;
};

/**
 * Broadcast a notification to all clients in a tenant
 */
export const broadcastNotification = (
    tenantId: string,
    notification: {
        id: string;
        type: string;
        priority: string;
        title: string;
        message: string;
        data: any;
        createdAt: string;
        userId?: string | null; // For per-user notification filtering
    }
): void => {
    const clientSet = tenantClients.get(tenantId);

    if (!clientSet || clientSet.size === 0) {
        logger.debug(`No SSE clients connected for notification broadcast`, { tenantId });
        return;
    }

    const event: NotificationEvent = {
        type: SSEEventType.NOTIFICATION,
        id: notification.id,
        alertType: notification.type,
        priority: notification.priority,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        createdAt: notification.createdAt,
        userId: notification.userId,
    };

    const eventData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

    let sentCount = 0;
    for (const client of clientSet) {
        try {
            client.write(eventData);
            sentCount++;
        } catch (err) {
            logger.warn(`Failed to send notification SSE event to client`, { error: err });
        }
    }

    logger.debug(`Notification broadcast`, { tenantId, type: notification.type, sentCount });
};

export const sseManager = {
    registerClient,
    removeClient,
    broadcastStockUpdate,
    broadcastSuspendedCountUpdate,
    broadcastNotification,
    getClientCount,
};

export default sseManager;

