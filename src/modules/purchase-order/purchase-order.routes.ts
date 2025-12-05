// src/modules/purchase-orders/purchase-order.routes.ts
import express from 'express';
import { purchaseOrderController } from './purchase-order.controller';
import validateRequest from '@/middleware/validate.middleware';
// Import all necessary DTOs for validation
import { CreatePurchaseOrderDto } from './dto/create-po.dto';
import { UpdatePurchaseOrderDto } from './dto/update-po.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-po.dto';
import { POActionDto } from './dto/po-action.dto';
import { authMiddleware } from '@/middleware/auth.middleware'; // Verifies JWT, attaches req.user, req.tenantId
import { ensureTenantContext } from '@/middleware/tenant.middleware'; // Ensures req.tenantId is set after auth
import { checkPermissions } from '@/middleware/rbac.middleware'; // Permission checking middleware

const router = express.Router();

// Apply authentication and tenant context check to all Purchase Order routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// --- Define Purchase Order CRUD Routes ---
router.route('/')
    /**
     * POST /api/v1/purchase-orders
     * Creates a new Purchase Order (starts in DRAFT).
     * Requires 'po:create' permission.
     */
    .post(
        checkPermissions(['po:create']),        // Permission check
        validateRequest(CreatePurchaseOrderDto),// Body validation
        purchaseOrderController.createPurchaseOrder // Handler
    )
    /**
     * GET /api/v1/purchase-orders
     * Retrieves a paginated list of Purchase Orders within the authenticated user's tenant.
     * Supports filtering and sorting via query parameters.
     * Requires 'po:read' permission.
     */
    .get(
        checkPermissions(['po:read']),          // Permission check
        purchaseOrderController.getPurchaseOrders // Handler (query param validation inside)
    );

router.get('/stats',
    checkPermissions(['po:read']),
    purchaseOrderController.getPurchaseOrderStats
);

router.route('/:poId')
    /**
     * GET /api/v1/purchase-orders/:poId
     * Retrieves details for a specific Purchase Order.
     * Requires 'po:read' permission.
     */
    .get(
        checkPermissions(['po:read']),          // Permission check
        purchaseOrderController.getPurchaseOrder // Handler
    )
    /**
     * PATCH /api/v1/purchase-orders/:poId
     * Updates basic details (like notes, expected date, shipping cost if DRAFT) for a specific Purchase Order.
     * Requires 'po:update' permission. Status changes are handled by action endpoints.
     */
    .patch(
        checkPermissions(['po:update']),        // Permission check
        validateRequest(UpdatePurchaseOrderDto),// Body validation (for allowed fields)
        purchaseOrderController.updatePurchaseOrder // Handler
    );
// Note: DELETE /:poId is often restricted or handled differently (e.g., only for DRAFT status)


// --- Define Purchase Order Action Routes ---

/**
 * POST /api/v1/purchase-orders/:poId/submit
 * Submits a DRAFT PO for approval.
 * Requires 'po:update' or a specific 'po:submit' permission.
 */
router.post(
    '/:poId/submit',
    checkPermissions(['po:update']), // Or 'po:submit'
    validateRequest(POActionDto), // Allows optional notes
    purchaseOrderController.submitPurchaseOrder
);

/**
 * POST /api/v1/purchase-orders/:poId/approve
 * Approves a PENDING_APPROVAL (or DRAFT) PO.
 * Requires 'po:approve' permission.
 */
router.post(
    '/:poId/approve',
    checkPermissions(['po:approve']),
    validateRequest(POActionDto), // Allows optional notes
    purchaseOrderController.approvePurchaseOrder
);

/**
 * POST /api/v1/purchase-orders/:poId/send
 * Marks an APPROVED PO as SENT to the supplier.
 * Requires 'po:send' permission.
 */
router.post(
    '/:poId/send',
    checkPermissions(['po:send']),
    validateRequest(POActionDto), // Allows optional notes
    purchaseOrderController.sendPurchaseOrder
);

/**
 * POST /api/v1/purchase-orders/:poId/cancel
 * Cancels a PO (if in a cancellable state).
 * Requires 'po:cancel' permission.
 */
router.post(
    '/:poId/cancel',
    checkPermissions(['po:cancel']),
    validateRequest(POActionDto), // Allows optional cancellation reason notes
    purchaseOrderController.cancelPurchaseOrder
);

/**
 * POST /api/v1/purchase-orders/:poId/close
 * Closes a PO (short) if SENT or PARTIALLY_RECEIVED.
 * Requires 'po:close' permission.
 */
router.post(
    '/:poId/close',
    checkPermissions(['po:close']),
    validateRequest(POActionDto), // Allows optional notes
    purchaseOrderController.closePurchaseOrder
);

/**
 * POST /api/v1/purchase-orders/:poId/receive
 * Records the receipt of items against a SENT or PARTIALLY_RECEIVED PO.
 * Requires 'po:receive' permission.
 */
router.post(
    '/:poId/receive',
    checkPermissions(['po:receive']),
    validateRequest(ReceivePurchaseOrderDto), // Validate the received items payload
    purchaseOrderController.receiveItems
);


// Export the configured router
export default router;
