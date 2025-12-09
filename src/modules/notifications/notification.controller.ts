/**
 * Notification Controller
 * 
 * Handles HTTP requests for notification management.
 */

import { Request, Response, NextFunction } from 'express';
import notificationService from './notification.service';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
import { AlertType } from '@prisma/client';

/**
 * Get notifications for the authenticated user
 */
export const getNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const tenantId = getTenantIdFromRequest(req);
        const userId = req.user!.id;
        const { unreadOnly, types, limit, offset } = req.query;

        const result = await notificationService.getNotifications({
            tenantId,
            userId,
            unreadOnly: unreadOnly === 'true',
            types: types ? (types as string).split(',') as AlertType[] : undefined,
            limit: limit ? parseInt(limit as string, 10) : 50,
            offset: offset ? parseInt(offset as string, 10) : 0,
        });

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const tenantId = getTenantIdFromRequest(req);
        const userId = req.user!.id;

        const count = await notificationService.getUnreadCount(tenantId, userId);

        res.json({
            success: true,
            data: { count },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Mark a notification as read
 */
export const markAsRead = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        await notificationService.markAsRead(id, userId);

        res.json({
            success: true,
            message: 'Notification marked as read',
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const tenantId = getTenantIdFromRequest(req);
        const userId = req.user!.id;

        const count = await notificationService.markAllAsRead(tenantId, userId);

        res.json({
            success: true,
            message: `${count} notifications marked as read`,
            data: { count },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        const deleted = await notificationService.deleteNotification(id, userId);

        if (!deleted) {
            res.status(404).json({
                success: false,
                message: 'Notification not found',
            });
            return;
        }

        res.json({
            success: true,
            message: 'Notification deleted',
        });
    } catch (error) {
        next(error);
    }
};

export const notificationController = {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
};

export default notificationController;
