"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/customers/customer.routes.ts
const express_1 = __importDefault(require("express"));
const customer_controller_1 = require("./customer.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const create_customer_dto_1 = require("./dto/create-customer.dto");
const update_customer_dto_1 = require("./dto/update-customer.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware"); // Verifies JWT, attaches req.user, req.tenantId
const tenant_middleware_1 = require("@/middleware/tenant.middleware"); // Ensures req.tenantId is set after auth
const rbac_middleware_1 = require("@/middleware/rbac.middleware"); // Permission checking middleware
const router = express_1.default.Router();
// Apply authentication and tenant context check to all customer routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// Define Customer Routes with Permissions
router.route('/')
    /**
     * POST /api/v1/customers
     * Creates a new customer within the authenticated user's tenant.
     * Requires 'customer:create' permission.
     */
    .post((0, rbac_middleware_1.checkPermissions)(['customer:create']), // Permission check
(0, validate_middleware_1.default)(create_customer_dto_1.CreateCustomerDto), // Body validation
customer_controller_1.customerController.createCustomer // Handler
)
    /**
     * GET /api/v1/customers
     * Retrieves a paginated list of customers within the authenticated user's tenant.
     * Supports filtering and sorting via query parameters.
     * Requires 'customer:read' permission.
     */
    .get((0, rbac_middleware_1.checkPermissions)(['customer:read']), // Permission check
customer_controller_1.customerController.getCustomers // Handler (query param validation inside)
);
router.route('/:customerId')
    /**
     * GET /api/v1/customers/:customerId
     * Retrieves details for a specific customer.
     * Requires 'customer:read' permission.
     */
    .get((0, rbac_middleware_1.checkPermissions)(['customer:read']), // Permission check
customer_controller_1.customerController.getCustomer // Handler
)
    /**
     * PATCH /api/v1/customers/:customerId
     * Updates details for a specific customer.
     * Requires 'customer:update' permission.
     */
    .patch((0, rbac_middleware_1.checkPermissions)(['customer:update']), // Permission check
(0, validate_middleware_1.default)(update_customer_dto_1.UpdateCustomerDto), // Body validation
customer_controller_1.customerController.updateCustomer // Handler
)
    /**
     * DELETE /api/v1/customers/:customerId
     * Deletes a specific customer (if dependencies allow, e.g., no open orders).
     * Requires 'customer:delete' permission.
     */
    .delete((0, rbac_middleware_1.checkPermissions)(['customer:delete']), // Permission check
customer_controller_1.customerController.deleteCustomer // Handler
);
// Export the configured router
exports.default = router;
//# sourceMappingURL=customer.routes.js.map