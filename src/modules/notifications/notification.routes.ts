/**
 * Notification Routes
 * 
 * API endpoints for notification management.
 */

import { Router } from 'express';
import { authMiddleware } from '@/middleware/auth.middleware';
import notificationController from './notification.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @route GET /api/notifications
 * @desc Get notifications for authenticated user
 * @query unreadOnly - Filter to unread only
 * @query types - Comma-separated list of notification types
 * @query limit - Number of results (default 50)
 * @query offset - Offset for pagination
 */
router.get('/', notificationController.getNotifications);

/**
 * @route GET /api/notifications/unread-count
 * @desc Get count of unread notifications
 */
router.get('/unread-count', notificationController.getUnreadCount);

/**
 * @route PUT /api/notifications/mark-all-read
 * @desc Mark all notifications as read
 */
router.put('/mark-all-read', notificationController.markAllAsRead);

/**
 * @route PUT /api/notifications/:id/read
 * @desc Mark a specific notification as read
 */
router.put('/:id/read', notificationController.markAsRead);

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete a notification
 */
router.delete('/:id', notificationController.deleteNotification);

export default router;
