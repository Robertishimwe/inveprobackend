"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/users/user.routes.ts
const express_1 = __importDefault(require("express"));
const user_controller_1 = require("./user.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const create_user_dto_1 = require("./dto/create-user.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const router = express_1.default.Router();
// Apply authentication and tenant context check to all user routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// Define User Routes with Permissions
router.route('/')
    .post((0, rbac_middleware_1.checkPermissions)(['user:create']), (0, validate_middleware_1.default)(create_user_dto_1.CreateUserDto), user_controller_1.userController.createUser)
    .get((0, rbac_middleware_1.checkPermissions)(['user:read:any']), // Use specific read permission
user_controller_1.userController.getUsers);
router.route('/:userId')
    .get(
// Permission check done inside controller (own vs any) or use specific permission like 'user:read:target'
(0, rbac_middleware_1.checkPermissions)(['user:read:own', 'user:read:any']), // Example allowing own or any read perm
user_controller_1.userController.getUser)
    .patch(
// Requires general update + potentially specific ones checked in controller
(0, rbac_middleware_1.checkPermissions)(['user:update:own', 'user:update:any', 'user:update:activity']), // Ensure user has at least one relevant perm
(0, validate_middleware_1.default)(update_user_dto_1.UpdateUserDto), // Validates basic fields
user_controller_1.userController.updateUser)
    .delete((0, rbac_middleware_1.checkPermissions)(['user:delete']), // Requires permission to delete/deactivate users
user_controller_1.userController.deleteUser);
// --- NEW: Dedicated Routes for Role Assignment ---
/**
 * POST /api/v1/users/:userId/roles/:roleId
 * Assigns a specific role to a specific user.
 * Requires 'user:assign:roles' permission.
 */
router.post('/:userId/roles/:roleId', (0, rbac_middleware_1.checkPermissions)(['user:assign:roles']), // Specific permission for assignment
user_controller_1.userController.assignRole);
/**
 * DELETE /api/v1/users/:userId/roles/:roleId
 * Removes a specific role from a specific user.
 * Requires 'user:assign:roles' permission.
 */
router.delete('/:userId/roles/:roleId', (0, rbac_middleware_1.checkPermissions)(['user:assign:roles']), // Same permission often used for remove
user_controller_1.userController.removeRole);
// ---------------------------------------------
exports.default = router;
// // src/modules/users/user.routes.ts
// import express from 'express';
// import { userController } from './user.controller';
// import validateRequest from '@/middleware/validate.middleware';
// import { CreateUserDto } from './dto/create-user.dto';
// import { UpdateUserDto } from './dto/update-user.dto';
// import { authMiddleware } from '@/middleware/auth.middleware'; // Verifies JWT, attaches req.user, req.tenantId
// import { ensureTenantContext } from '@/middleware/tenant.middleware'; // Ensures req.tenantId is set after auth
// import { checkPermissions } from '@/middleware/rbac.middleware'; // Permission checking middleware
// const router = express.Router();
// // --- Apply Middleware to ALL routes in this router ---
// // 1. Authenticate: Verify JWT, set req.user and req.tenantId
// router.use(authMiddleware);
// // 2. Ensure Tenant Context: Verify req.tenantId was set by authMiddleware
// router.use(ensureTenantContext);
// // Note: General rate limiting is likely applied globally or to '/api/v1' in app.ts
// // --- Define User Routes ---
// // Route: /api/v1/users/
// router.route('/')
//     /**
//      * POST /api/v1/users
//      * Creates a new user within the authenticated user's tenant.
//      * Requires 'user:create' permission.
//      */
//     .post(
//         checkPermissions(['user:create']), // 3. Check specific permission
//         validateRequest(CreateUserDto),    // 4. Validate request body
//         userController.createUser          // 5. Handle request
//     )
//     /**
//      * GET /api/v1/users
//      * Retrieves a paginated list of users within the authenticated user's tenant.
//      * Supports filtering and sorting via query parameters.
//      * Requires 'user:read' permission.
//      */
//     .get(
//         checkPermissions(['user:read']),   // 3. Check specific permission
//         userController.getUsers            // 4. Handle request (validation of query params happens inside controller)
//     );
// // Route: /api/v1/users/:userId
// router.route('/:userId')
//     /**
//      * GET /api/v1/users/:userId
//      * Retrieves details for a specific user within the authenticated user's tenant.
//      * Requires 'user:read' permission (controller may apply further checks for own vs any).
//      */
//     .get(
//         checkPermissions(['user:read']),   // 3. Check specific permission
//         userController.getUser             // 4. Handle request
//     )
//     /**
//      * PATCH /api/v1/users/:userId
//      * Updates details for a specific user within the authenticated user's tenant.
//      * Requires 'user:update' permission (controller may apply further checks).
//      */
//     .patch(
//         checkPermissions(['user:update']),   // 3. Check specific permission
//         validateRequest(UpdateUserDto),    // 4. Validate request body
//         userController.updateUser          // 5. Handle request
//     )
//     /**
//      * DELETE /api/v1/users/:userId
//      * Deactivates (soft deletes) a specific user within the authenticated user's tenant.
//      * Requires 'user:delete' permission. Cannot self-delete.
//      */
//     .delete(
//         checkPermissions(['user:delete']),   // 3. Check specific permission
//         userController.deleteUser          // 4. Handle request
//     );
// // Export the configured router
// export default router;
//# sourceMappingURL=user.routes.js.map