"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/permissions/permission.routes.ts
const express_1 = __importDefault(require("express"));
const permission_controller_1 = require("./permission.controller");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const router = express_1.default.Router();
// Apply auth & tenant context
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// Define Permission Routes (usually just read)
router.route('/')
    /** GET /api/v1/permissions */
    .get((0, rbac_middleware_1.checkPermissions)(['role:read']), // Reading permissions often tied to reading/managing roles
permission_controller_1.permissionController.getPermissions);
exports.default = router;
//# sourceMappingURL=permission.routes.js.map