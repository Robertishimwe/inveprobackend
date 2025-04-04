"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/orders/order.routes.ts
const express_1 = __importDefault(require("express"));
const order_controller_1 = require("./order.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const create_order_dto_1 = require("./dto/create-order.dto");
const update_order_dto_1 = require("./dto/update-order.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware"); // Verifies JWT, attaches req.user, req.tenantId
const tenant_middleware_1 = require("@/middleware/tenant.middleware"); // Ensures req.tenantId is set after auth
const rbac_middleware_1 = require("@/middleware/rbac.middleware"); // Permission checking middleware
const router = express_1.default.Router();
// Apply authentication and tenant context check to all order routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// Define Order Routes with Permissions
router.route('/')
    /**
     * POST /api/v1/orders
     * Creates a new order within the authenticated user's tenant.
     * Requires 'order:create' permission.
     */
    .post((0, rbac_middleware_1.checkPermissions)(['order:create']), // Permission check
(0, validate_middleware_1.default)(create_order_dto_1.CreateOrderDto), // Body validation
order_controller_1.orderController.createOrder // Handler
)
    /**
     * GET /api/v1/orders
     * Retrieves a paginated list of orders within the authenticated user's tenant.
     * Supports filtering and sorting via query parameters.
     * Requires 'order:read' permission.
     */
    .get((0, rbac_middleware_1.checkPermissions)(['order:read']), // Permission check
order_controller_1.orderController.getOrders // Handler (query param validation inside)
);
router.route('/:orderId')
    /**
     * GET /api/v1/orders/:orderId
     * Retrieves details for a specific order.
     * Requires 'order:read' permission.
     */
    .get((0, rbac_middleware_1.checkPermissions)(['order:read']), // Permission check
order_controller_1.orderController.getOrder // Handler
)
    /**
     * PATCH /api/v1/orders/:orderId
     * Updates details (like status, tracking info) for a specific order.
     * Requires 'order:update' permission.
     */
    .patch((0, rbac_middleware_1.checkPermissions)(['order:update']), // Permission check
(0, validate_middleware_1.default)(update_order_dto_1.UpdateOrderDto), // Body validation
order_controller_1.orderController.updateOrder // Handler
);
// Specific action endpoint for cancelling an order
router.post('/:orderId/cancel', // Use POST for actions with side effects
(0, rbac_middleware_1.checkPermissions)(['order:cancel']), // Requires specific cancel permission
// Optional: validateRequest(CancelOrderDto) if reason is required in body
order_controller_1.orderController.cancelOrder);
// Note: A DELETE method might be reserved for hard deletion, which is usually avoided for orders.
// router.delete(...)
// Export the configured router
exports.default = router;
//# sourceMappingURL=order.routes.js.map