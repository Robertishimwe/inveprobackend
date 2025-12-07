// src/modules/inventory/inventory.routes.ts
import express from 'express';
import { inventoryController } from './inventory.controller';
import validateRequest from '@/middleware/validate.middleware';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ReceiveTransferDto } from './dto/receive-transfer.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';

const router = express.Router();

// Apply auth & tenant context to all inventory routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// --- Adjustment Routes ---
router.route('/adjustments')
    /** POST /api/v1/inventory/adjustments */
    .post(
        checkPermissions(['inventory:adjust']), // Requires permission
        validateRequest(CreateAdjustmentDto),
        inventoryController.createAdjustment
    )
    /** GET /api/v1/inventory/adjustments */
    .get(
        checkPermissions(['inventory:read']), // Requires general inventory read
        inventoryController.getAdjustments
    );

router.route('/adjustments/:adjustmentId')
    /** GET /api/v1/inventory/adjustments/:adjustmentId */
    .get(
        checkPermissions(['inventory:read']),
        inventoryController.getAdjustment
    );

// --- Transfer Routes ---
router.route('/transfers')
    /** POST /api/v1/inventory/transfers */
    .post(
        checkPermissions(['inventory:transfer:create']), // Specific permission
        validateRequest(CreateTransferDto),
        inventoryController.createTransfer
    )
    /** GET /api/v1/inventory/transfers */
    .get(
        checkPermissions(['inventory:read']), // General inventory read
        inventoryController.getTransfers
    );

router.route('/transfers/:transferId')
    /** GET /api/v1/inventory/transfers/:transferId */
    .get(
        checkPermissions(['inventory:read']),
        inventoryController.getTransfer
    );

/** POST /api/v1/inventory/transfers/:transferId/ship */
router.post(
    '/transfers/:transferId/ship',
    checkPermissions(['inventory:transfer:ship']), // Specific permission
    // Optional: Add validateRequest(ShipTransferDto) if needed
    inventoryController.shipTransfer
);

/** POST /api/v1/inventory/transfers/:transferId/receive */
router.post(
    '/transfers/:transferId/receive',
    checkPermissions(['inventory:transfer:receive']), // Specific permission
    validateRequest(ReceiveTransferDto),
    inventoryController.receiveTransfer
);


// --- Inventory Item (Stock Level) Routes ---
router.route('/items')
    /** GET /api/v1/inventory/items */
    .get(
        checkPermissions(['inventory:read']), // General inventory read
        inventoryController.getInventoryItems
    );

router.route('/items/:itemId')
    /** GET /api/v1/inventory/items/:itemId */
    .get(
        checkPermissions(['inventory:read']),
        inventoryController.getInventoryItem
    )
    /** PATCH /api/v1/inventory/items/:itemId - Update reorder settings */
    .patch(
        checkPermissions(['inventory:update']),
        validateRequest(UpdateInventoryItemDto),
        inventoryController.updateInventoryItem
    );


export default router;

