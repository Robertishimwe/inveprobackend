// src/modules/roles/role.routes.ts
import express from 'express';
import { roleController } from './role.controller'; // Controller now has assign/remove methods
import validateRequest from '@/middleware/validate.middleware';
// Import necessary DTOs for validation middleware
// import { CreateRoleDto, UpdateRoleDto } from './dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto'; // <<< Import DTO for assigning permissions
import { BatchPermissionsDto } from './dto/batch-permissions.dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';

const router = express.Router();

// Apply auth & tenant context middleware to all routes within this router
router.use(authMiddleware);
router.use(ensureTenantContext);

// --- Define Role CRUD Routes ---
router.route('/')
    /** POST /api/v1/roles */
    .post(
        checkPermissions(['role:create']), // Permission to create roles
        validateRequest(CreateRoleDto),   // Validate body for creation
        roleController.createRole
    )
    /** GET /api/v1/roles */
    .get(
        checkPermissions(['role:read']),   // Permission to read roles
        roleController.getRoles
    );

router.route('/:roleId')
    /** GET /api/v1/roles/:roleId */
    .get(
        checkPermissions(['role:read']),   // Permission to read a specific role
        roleController.getRole
    )
    /**
     * PATCH /api/v1/roles/:roleId
     * Updates basic role info (name, description).
     * Does NOT update permissions via this route anymore.
     */
    .patch(
        checkPermissions(['role:update']),   // Permission to update roles
        validateRequest(UpdateRoleDto),    // Validate body (name, description only)
        roleController.updateRole
    )
    /** DELETE /api/v1/roles/:roleId */
    .delete(
        checkPermissions(['role:delete']),   // Permission to delete roles
        roleController.deleteRole
    );

// --- NEW: Routes for Managing Permissions on a Role ---

/**
 * POST /api/v1/roles/:roleId/permissions
 * Assigns a single permission to the specified role.
 * Body requires { "permissionId": "<uuid>" }
 * Requires 'role:update' permission (or a more specific 'role:manage:permissions').
 */
router.post(
    '/:roleId/permissions',                // Nested route under role ID
    checkPermissions(['role:update']),     // Reuse update permission or create specific one
    validateRequest(AssignPermissionDto),  // Validate body contains valid permissionId
    roleController.assignPermission        // Call the new controller method
);

/**
 * DELETE /api/v1/roles/:roleId/permissions/:permissionId
 * Removes a single permission from the specified role.
 * Requires 'role:update' permission (or a more specific 'role:manage:permissions').
 */
router.delete(
    '/:roleId/permissions/:permissionId', // Nested route identifying role and permission
    checkPermissions(['role:update']),    // Reuse update permission or create specific one
    roleController.removePermission       // Call the new controller method
);

// --- NEW: Batch Permission Management ---

/**
 * POST /api/v1/roles/:roleId/permissions/batch-add
 * Assigns multiple permissions provided in the request body.
 * Body: { "permissionIds": ["<uuid1>", "<uuid2>"] }
 * Requires 'role:update' permission.
 */
router.post(
    '/:roleId/permissions/batch-add', // Specific path for batch add
    checkPermissions(['role:update']),
    validateRequest(BatchPermissionsDto), // Validate the array of IDs
    roleController.addPermissions
);

/**
 * POST /api/v1/roles/:roleId/permissions/batch-remove (Using POST for body)
 * Removes multiple permissions provided in the request body.
 * Body: { "permissionIds": ["<uuid1>", "<uuid2>"] }
 * Requires 'role:update' permission.
 */
router.post( // Using POST instead of DELETE because DELETE typically doesn't have a body
    '/:roleId/permissions/batch-remove', // Specific path for batch remove
    checkPermissions(['role:update']),
    validateRequest(BatchPermissionsDto), // Validate the array of IDs
    roleController.removePermissions
);


// ----------------------------------------------------

export default router;






















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