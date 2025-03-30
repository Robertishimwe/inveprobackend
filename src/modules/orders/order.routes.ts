// src/modules/orders/order.routes.ts
import express from 'express';
import { orderController } from './order.controller';
import validateRequest from '@/middleware/validate.middleware';
import { CreateOrderDto } from './dto/create-order.dto';
import {  UpdateOrderDto } from './dto/update-order.dto';
import { authMiddleware } from '@/middleware/auth.middleware'; // Verifies JWT, attaches req.user, req.tenantId
import { ensureTenantContext } from '@/middleware/tenant.middleware'; // Ensures req.tenantId is set after auth
import { checkPermissions } from '@/middleware/rbac.middleware'; // Permission checking middleware

const router = express.Router();

// Apply authentication and tenant context check to all order routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// Define Order Routes with Permissions
router.route('/')
    /**
     * POST /api/v1/orders
     * Creates a new order within the authenticated user's tenant.
     * Requires 'order:create' permission.
     */
    .post(
        checkPermissions(['order:create']),   // Permission check
        validateRequest(CreateOrderDto),      // Body validation
        orderController.createOrder           // Handler
    )
    /**
     * GET /api/v1/orders
     * Retrieves a paginated list of orders within the authenticated user's tenant.
     * Supports filtering and sorting via query parameters.
     * Requires 'order:read' permission.
     */
    .get(
        checkPermissions(['order:read']),     // Permission check
        orderController.getOrders             // Handler (query param validation inside)
    );

router.route('/:orderId')
    /**
     * GET /api/v1/orders/:orderId
     * Retrieves details for a specific order.
     * Requires 'order:read' permission.
     */
    .get(
        checkPermissions(['order:read']),     // Permission check
        orderController.getOrder              // Handler
    )
    /**
     * PATCH /api/v1/orders/:orderId
     * Updates details (like status, tracking info) for a specific order.
     * Requires 'order:update' permission.
     */
    .patch(
        checkPermissions(['order:update']),   // Permission check
        validateRequest(UpdateOrderDto),      // Body validation
        orderController.updateOrder           // Handler
    );

// Specific action endpoint for cancelling an order
router.post(
    '/:orderId/cancel', // Use POST for actions with side effects
    checkPermissions(['order:cancel']), // Requires specific cancel permission
    // Optional: validateRequest(CancelOrderDto) if reason is required in body
    orderController.cancelOrder
);

// Note: A DELETE method might be reserved for hard deletion, which is usually avoided for orders.
// router.delete(...)

// Export the configured router
export default router;
