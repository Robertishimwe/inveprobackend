/**
 * SSE (Server-Sent Events) Routes
 * 
 * Provides real-time stock update streams for POS terminals
 */

import { Router, Request, Response } from 'express';
import { sseManager } from '@/utils/sseManager';
import logger from '@/utils/logger';

const router = Router();

/**
 * SSE endpoint for stock updates
 * GET /sse/stock-updates
 * 
 * Query params (for EventSource compatibility):
 * - token: JWT access token
 * - locationId: Location to subscribe to
 */
router.get('/stock-updates', async (req: Request, res: Response): Promise<void> => {
    // EventSource doesn't support headers, so accept token via query param
    const token = req.query.token as string || req.headers.authorization?.replace('Bearer ', '');
    const locationId = req.query.locationId as string || req.headers['x-location-id'] as string;

    if (!token) {
        res.status(401).json({ message: 'Token required (via query param or Authorization header)' });
        return;
    }

    if (!locationId) {
        res.status(400).json({ message: 'locationId query param or X-Location-Id header required' });
        return;
    }

    // Verify token and extract user info
    try {
        const jwt = await import('jsonwebtoken');
        const { env } = await import('@/config');
        const decoded = jwt.default.verify(token, env.JWT_SECRET) as any;

        const tenantId = decoded.tenantId;
        const userId = decoded.userId;

        if (!tenantId) {
            res.status(401).json({ message: 'Tenant context required' });
            return;
        }

        logger.info('SSE connection request', { tenantId, locationId, userId });

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

        // Flush headers immediately
        res.flushHeaders();

        // Register this client
        sseManager.registerClient(tenantId, locationId, res);

        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
            try {
                res.write(`:heartbeat\n\n`);
            } catch (err) {
                clearInterval(heartbeatInterval);
            }
        }, 30000);

        // Handle client disconnect
        req.on('close', () => {
            clearInterval(heartbeatInterval);
            sseManager.removeClient(tenantId, locationId, res);
        });

        req.on('error', () => {
            clearInterval(heartbeatInterval);
            sseManager.removeClient(tenantId, locationId, res);
        });
    } catch (err: any) {
        logger.warn('SSE auth failed', { error: err.message });
        res.status(401).json({ message: 'Invalid or expired token' });
        return;
    }
});

/**
 * Debug endpoint to check SSE connection count
 * GET /sse/status
 */
router.get('/status', (req: Request, res: Response) => {
    res.json({
        totalConnections: sseManager.getClientCount(),
    });
});

export default router;
