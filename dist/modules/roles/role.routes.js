"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/roles/role.routes.ts
const express_1 = __importDefault(require("express"));
const role_controller_1 = require("./role.controller"); // Controller now has assign/remove methods
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
// Import necessary DTOs for validation middleware
// import { CreateRoleDto, UpdateRoleDto } from './dto';
const create_role_dto_1 = require("./dto/create-role.dto");
const update_role_dto_1 = require("./dto/update-role.dto");
const assign_permission_dto_1 = require("./dto/assign-permission.dto"); // <<< Import DTO for assigning permissions
const batch_permissions_dto_1 = require("./dto/batch-permissions.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const router = express_1.default.Router();
// Apply auth & tenant context middleware to all routes within this router
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// --- Define Role CRUD Routes ---
router.route('/')
    /** POST /api/v1/roles */
    .post((0, rbac_middleware_1.checkPermissions)(['role:create']), // Permission to create roles
(0, validate_middleware_1.default)(create_role_dto_1.CreateRoleDto), // Validate body for creation
role_controller_1.roleController.createRole)
    /** GET /api/v1/roles */
    .get((0, rbac_middleware_1.checkPermissions)(['role:read']), // Permission to read roles
role_controller_1.roleController.getRoles);
router.route('/:roleId')
    /** GET /api/v1/roles/:roleId */
    .get((0, rbac_middleware_1.checkPermissions)(['role:read']), // Permission to read a specific role
role_controller_1.roleController.getRole)
    /**
     * PATCH /api/v1/roles/:roleId
     * Updates basic role info (name, description).
     * Does NOT update permissions via this route anymore.
     */
    .patch((0, rbac_middleware_1.checkPermissions)(['role:update']), // Permission to update roles
(0, validate_middleware_1.default)(update_role_dto_1.UpdateRoleDto), // Validate body (name, description only)
role_controller_1.roleController.updateRole)
    /** DELETE /api/v1/roles/:roleId */
    .delete((0, rbac_middleware_1.checkPermissions)(['role:delete']), // Permission to delete roles
role_controller_1.roleController.deleteRole);
// --- NEW: Routes for Managing Permissions on a Role ---
/**
 * POST /api/v1/roles/:roleId/permissions
 * Assigns a single permission to the specified role.
 * Body requires { "permissionId": "<uuid>" }
 * Requires 'role:update' permission (or a more specific 'role:manage:permissions').
 */
router.post('/:roleId/permissions', // Nested route under role ID
(0, rbac_middleware_1.checkPermissions)(['role:update']), // Reuse update permission or create specific one
(0, validate_middleware_1.default)(assign_permission_dto_1.AssignPermissionDto), // Validate body contains valid permissionId
role_controller_1.roleController.assignPermission // Call the new controller method
);
/**
 * DELETE /api/v1/roles/:roleId/permissions/:permissionId
 * Removes a single permission from the specified role.
 * Requires 'role:update' permission (or a more specific 'role:manage:permissions').
 */
router.delete('/:roleId/permissions/:permissionId', // Nested route identifying role and permission
(0, rbac_middleware_1.checkPermissions)(['role:update']), // Reuse update permission or create specific one
role_controller_1.roleController.removePermission // Call the new controller method
);
// --- NEW: Batch Permission Management ---
/**
 * POST /api/v1/roles/:roleId/permissions/batch-add
 * Assigns multiple permissions provided in the request body.
 * Body: { "permissionIds": ["<uuid1>", "<uuid2>"] }
 * Requires 'role:update' permission.
 */
router.post('/:roleId/permissions/batch-add', // Specific path for batch add
(0, rbac_middleware_1.checkPermissions)(['role:update']), (0, validate_middleware_1.default)(batch_permissions_dto_1.BatchPermissionsDto), // Validate the array of IDs
role_controller_1.roleController.addPermissions);
/**
 * POST /api/v1/roles/:roleId/permissions/batch-remove (Using POST for body)
 * Removes multiple permissions provided in the request body.
 * Body: { "permissionIds": ["<uuid1>", "<uuid2>"] }
 * Requires 'role:update' permission.
 */
router.post(// Using POST instead of DELETE because DELETE typically doesn't have a body
'/:roleId/permissions/batch-remove', // Specific path for batch remove
(0, rbac_middleware_1.checkPermissions)(['role:update']), (0, validate_middleware_1.default)(batch_permissions_dto_1.BatchPermissionsDto), // Validate the array of IDs
role_controller_1.roleController.removePermissions);
// ----------------------------------------------------
exports.default = router;
// // src/modules/roles/role.routes.ts
// import express from 'express';
// import { roleController } from './role.controller';
// import validateRequest from '@/middleware/validate.middleware';
// import { CreateRoleDto } from './dto/create-role.dto';
// import { UpdateRoleDto } from './dto/update-role.dto';
// import { authMiddleware } from '@/middleware/auth.middleware';
// import { ensureTenantContext } from '@/middleware/tenant.middleware';
// import { checkPermissions } from '@/middleware/rbac.middleware';
// const router = express.Router();
// // Apply auth & tenant context
// router.use(authMiddleware);
// router.use(ensureTenantContext);
// // Define Role Routes
// router.route('/')
//     /** POST /api/v1/roles */
//     .post(
//         checkPermissions(['role:create']),
//         validateRequest(CreateRoleDto),
//         roleController.createRole
//     )
//     /** GET /api/v1/roles */
//     .get(
//         checkPermissions(['role:read']),
//         roleController.getRoles
//     );
// router.route('/:roleId')
//     /** GET /api/v1/roles/:roleId */
//     .get(
//         checkPermissions(['role:read']),
//         roleController.getRole
//     )
//     /** PATCH /api/v1/roles/:roleId */
//     .patch(
//         checkPermissions(['role:update']),
//         validateRequest(UpdateRoleDto),
//         roleController.updateRole
//     )
//     /** DELETE /api/v1/roles/:roleId */
//     .delete(
//         checkPermissions(['role:delete']),
//         roleController.deleteRole
//     );
// export default router;
//# sourceMappingURL=role.routes.js.map