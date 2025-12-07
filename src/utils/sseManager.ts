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

// Event types
export enum SSEEventType {
    STOCK_UPDATE = 'STOCK_UPDATE',
    ORDER_UPDATE = 'ORDER_UPDATE',
    SUSPENDED_COUNT_UPDATE = 'SUSPENDED_COUNT_UPDATE',
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

type SSEEvent = StockUpdateEvent | SuspendedCountUpdateEvent;

/**
 * Register a new SSE client connection
 */
export const registerClient = (tenantId: string, locationId: string, res: Response): void => {
    const key = `${tenantId}:${locationId}`;

    if (!clients.has(key)) {
        clients.set(key, new Set());
    }

    clients.get(key)!.add(res);

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

export const sseManager = {
    registerClient,
    removeClient,
    broadcastStockUpdate,
    broadcastSuspendedCountUpdate,
    getClientCount,
};

export default sseManager;
