"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/customer-groups/customer-group.routes.ts
const express_1 = __importDefault(require("express"));
const customer_group_controller_1 = require("./customer-group.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const create_customer_group_dto_1 = require("./dto/create-customer-group.dto");
const update_customer_group_dto_1 = require("./dto/update-customer-group.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const router = express_1.default.Router();
// Apply auth & tenant context to all customer group routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// Define Customer Group Routes with permissions
router.route('/')
    /** POST /api/v1/customer-groups */
    .post((0, rbac_middleware_1.checkPermissions)(['group:create']), // Define this permission
(0, validate_middleware_1.default)(create_customer_group_dto_1.CreateCustomerGroupDto), customer_group_controller_1.customerGroupController.createGroup)
    /** GET /api/v1/customer-groups */
    .get((0, rbac_middleware_1.checkPermissions)(['group:read']), // Define this permission
customer_group_controller_1.customerGroupController.getGroups);
router.route('/:groupId')
    /** GET /api/v1/customer-groups/:groupId */
    .get((0, rbac_middleware_1.checkPermissions)(['group:read']), customer_group_controller_1.customerGroupController.getGroup)
    /** PATCH /api/v1/customer-groups/:groupId */
    .patch((0, rbac_middleware_1.checkPermissions)(['group:update']), // Define this permission
(0, validate_middleware_1.default)(update_customer_group_dto_1.UpdateCustomerGroupDto), customer_group_controller_1.customerGroupController.updateGroup)
    /** DELETE /api/v1/customer-groups/:groupId */
    .delete((0, rbac_middleware_1.checkPermissions)(['group:delete']), // Define this permission
customer_group_controller_1.customerGroupController.deleteGroup);
exports.default = router;
//# sourceMappingURL=customer-group.routes.js.map