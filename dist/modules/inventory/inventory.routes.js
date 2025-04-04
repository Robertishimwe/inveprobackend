"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/inventory/inventory.routes.ts
const express_1 = __importDefault(require("express"));
const inventory_controller_1 = require("./inventory.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const create_adjustment_dto_1 = require("./dto/create-adjustment.dto");
const create_transfer_dto_1 = require("./dto/create-transfer.dto");
const receive_transfer_dto_1 = require("./dto/receive-transfer.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const router = express_1.default.Router();
// Apply auth & tenant context to all inventory routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// --- Adjustment Routes ---
router.route('/adjustments')
    /** POST /api/v1/inventory/adjustments */
    .post((0, rbac_middleware_1.checkPermissions)(['inventory:adjust']), // Requires permission
(0, validate_middleware_1.default)(create_adjustment_dto_1.CreateAdjustmentDto), inventory_controller_1.inventoryController.createAdjustment)
    /** GET /api/v1/inventory/adjustments */
    .get((0, rbac_middleware_1.checkPermissions)(['inventory:read']), // Requires general inventory read
inventory_controller_1.inventoryController.getAdjustments);
router.route('/adjustments/:adjustmentId')
    /** GET /api/v1/inventory/adjustments/:adjustmentId */
    .get((0, rbac_middleware_1.checkPermissions)(['inventory:read']), inventory_controller_1.inventoryController.getAdjustment);
// --- Transfer Routes ---
router.route('/transfers')
    /** POST /api/v1/inventory/transfers */
    .post((0, rbac_middleware_1.checkPermissions)(['inventory:transfer:create']), // Specific permission
(0, validate_middleware_1.default)(create_transfer_dto_1.CreateTransferDto), inventory_controller_1.inventoryController.createTransfer)
    /** GET /api/v1/inventory/transfers */
    .get((0, rbac_middleware_1.checkPermissions)(['inventory:read']), // General inventory read
inventory_controller_1.inventoryController.getTransfers);
router.route('/transfers/:transferId')
    /** GET /api/v1/inventory/transfers/:transferId */
    .get((0, rbac_middleware_1.checkPermissions)(['inventory:read']), inventory_controller_1.inventoryController.getTransfer);
/** POST /api/v1/inventory/transfers/:transferId/ship */
router.post('/transfers/:transferId/ship', (0, rbac_middleware_1.checkPermissions)(['inventory:transfer:ship']), // Specific permission
// Optional: Add validateRequest(ShipTransferDto) if needed
inventory_controller_1.inventoryController.shipTransfer);
/** POST /api/v1/inventory/transfers/:transferId/receive */
router.post('/transfers/:transferId/receive', (0, rbac_middleware_1.checkPermissions)(['inventory:transfer:receive']), // Specific permission
(0, validate_middleware_1.default)(receive_transfer_dto_1.ReceiveTransferDto), inventory_controller_1.inventoryController.receiveTransfer);
// --- Inventory Item (Stock Level) Routes ---
router.route('/items')
    /** GET /api/v1/inventory/items */
    .get((0, rbac_middleware_1.checkPermissions)(['inventory:read']), // General inventory read
inventory_controller_1.inventoryController.getInventoryItems);
router.route('/items/:itemId')
    /** GET /api/v1/inventory/items/:itemId */
    .get((0, rbac_middleware_1.checkPermissions)(['inventory:read']), inventory_controller_1.inventoryController.getInventoryItem);
exports.default = router;
//# sourceMappingURL=inventory.routes.js.map