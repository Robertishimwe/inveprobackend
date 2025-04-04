"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/purchase-orders/purchase-order.routes.ts
const express_1 = __importDefault(require("express"));
const purchase_order_controller_1 = require("./purchase-order.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
// Import all necessary DTOs for validation
const create_po_dto_1 = require("./dto/create-po.dto");
const update_po_dto_1 = require("./dto/update-po.dto");
const receive_po_dto_1 = require("./dto/receive-po.dto");
const po_action_dto_1 = require("./dto/po-action.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware"); // Verifies JWT, attaches req.user, req.tenantId
const tenant_middleware_1 = require("@/middleware/tenant.middleware"); // Ensures req.tenantId is set after auth
const rbac_middleware_1 = require("@/middleware/rbac.middleware"); // Permission checking middleware
const router = express_1.default.Router();
// Apply authentication and tenant context check to all Purchase Order routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// --- Define Purchase Order CRUD Routes ---
router.route('/')
    /**
     * POST /api/v1/purchase-orders
     * Creates a new Purchase Order (starts in DRAFT).
     * Requires 'po:create' permission.
     */
    .post((0, rbac_middleware_1.checkPermissions)(['po:create']), // Permission check
(0, validate_middleware_1.default)(create_po_dto_1.CreatePurchaseOrderDto), // Body validation
purchase_order_controller_1.purchaseOrderController.createPurchaseOrder // Handler
)
    /**
     * GET /api/v1/purchase-orders
     * Retrieves a paginated list of Purchase Orders within the authenticated user's tenant.
     * Supports filtering and sorting via query parameters.
     * Requires 'po:read' permission.
     */
    .get((0, rbac_middleware_1.checkPermissions)(['po:read']), // Permission check
purchase_order_controller_1.purchaseOrderController.getPurchaseOrders // Handler (query param validation inside)
);
router.route('/:poId')
    /**
     * GET /api/v1/purchase-orders/:poId
     * Retrieves details for a specific Purchase Order.
     * Requires 'po:read' permission.
     */
    .get((0, rbac_middleware_1.checkPermissions)(['po:read']), // Permission check
purchase_order_controller_1.purchaseOrderController.getPurchaseOrder // Handler
)
    /**
     * PATCH /api/v1/purchase-orders/:poId
     * Updates basic details (like notes, expected date, shipping cost if DRAFT) for a specific Purchase Order.
     * Requires 'po:update' permission. Status changes are handled by action endpoints.
     */
    .patch((0, rbac_middleware_1.checkPermissions)(['po:update']), // Permission check
(0, validate_middleware_1.default)(update_po_dto_1.UpdatePurchaseOrderDto), // Body validation (for allowed fields)
purchase_order_controller_1.purchaseOrderController.updatePurchaseOrder // Handler
);
// Note: DELETE /:poId is often restricted or handled differently (e.g., only for DRAFT status)
// --- Define Purchase Order Action Routes ---
/**
 * POST /api/v1/purchase-orders/:poId/submit
 * Submits a DRAFT PO for approval.
 * Requires 'po:update' or a specific 'po:submit' permission.
 */
router.post('/:poId/submit', (0, rbac_middleware_1.checkPermissions)(['po:update']), // Or 'po:submit'
(0, validate_middleware_1.default)(po_action_dto_1.POActionDto), // Allows optional notes
purchase_order_controller_1.purchaseOrderController.submitPurchaseOrder);
/**
 * POST /api/v1/purchase-orders/:poId/approve
 * Approves a PENDING_APPROVAL (or DRAFT) PO.
 * Requires 'po:approve' permission.
 */
router.post('/:poId/approve', (0, rbac_middleware_1.checkPermissions)(['po:approve']), (0, validate_middleware_1.default)(po_action_dto_1.POActionDto), // Allows optional notes
purchase_order_controller_1.purchaseOrderController.approvePurchaseOrder);
/**
 * POST /api/v1/purchase-orders/:poId/send
 * Marks an APPROVED PO as SENT to the supplier.
 * Requires 'po:send' permission.
 */
router.post('/:poId/send', (0, rbac_middleware_1.checkPermissions)(['po:send']), (0, validate_middleware_1.default)(po_action_dto_1.POActionDto), // Allows optional notes
purchase_order_controller_1.purchaseOrderController.sendPurchaseOrder);
/**
 * POST /api/v1/purchase-orders/:poId/cancel
 * Cancels a PO (if in a cancellable state).
 * Requires 'po:cancel' permission.
 */
router.post('/:poId/cancel', (0, rbac_middleware_1.checkPermissions)(['po:cancel']), (0, validate_middleware_1.default)(po_action_dto_1.POActionDto), // Allows optional cancellation reason notes
purchase_order_controller_1.purchaseOrderController.cancelPurchaseOrder);
/**
 * POST /api/v1/purchase-orders/:poId/receive
 * Records the receipt of items against a SENT or PARTIALLY_RECEIVED PO.
 * Requires 'po:receive' permission.
 */
router.post('/:poId/receive', (0, rbac_middleware_1.checkPermissions)(['po:receive']), (0, validate_middleware_1.default)(receive_po_dto_1.ReceivePurchaseOrderDto), // Validate the received items payload
purchase_order_controller_1.purchaseOrderController.receiveItems);
// Export the configured router
exports.default = router;
//# sourceMappingURL=purchase-order.routes.js.map