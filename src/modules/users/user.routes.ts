// src/modules/users/user.routes.ts
import express from 'express';
import { userController } from './user.controller';
import validateRequest from '@/middleware/validate.middleware';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { authMiddleware } from '@/middleware/auth.middleware'; // Verifies JWT, attaches req.user, req.tenantId
import { ensureTenantContext } from '@/middleware/tenant.middleware'; // Ensures req.tenantId is set after auth
import { checkPermissions } from '@/middleware/rbac.middleware'; // Permission checking middleware

const router = express.Router();

// --- Apply Middleware to ALL routes in this router ---
// 1. Authenticate: Verify JWT, set req.user and req.tenantId
router.use(authMiddleware);
// 2. Ensure Tenant Context: Verify req.tenantId was set by authMiddleware
router.use(ensureTenantContext);
// Note: General rate limiting is likely applied globally or to '/api/v1' in app.ts

// --- Define User Routes ---

// Route: /api/v1/users/
router.route('/')
    /**
     * POST /api/v1/users
     * Creates a new user within the authenticated user's tenant.
     * Requires 'user:create' permission.
     */
    .post(
        checkPermissions(['user:create']), // 3. Check specific permission
        validateRequest(CreateUserDto),    // 4. Validate request body
        userController.createUser          // 5. Handle request
    )
    /**
     * GET /api/v1/users
     * Retrieves a paginated list of users within the authenticated user's tenant.
     * Supports filtering and sorting via query parameters.
     * Requires 'user:read' permission.
     */
    .get(
        checkPermissions(['user:read']),   // 3. Check specific permission
        userController.getUsers            // 4. Handle request (validation of query params happens inside controller)
    );

// Route: /api/v1/users/:userId
router.route('/:userId')
    /**
     * GET /api/v1/users/:userId
     * Retrieves details for a specific user within the authenticated user's tenant.
     * Requires 'user:read' permission (controller may apply further checks for own vs any).
     */
    .get(
        checkPermissions(['user:read']),   // 3. Check specific permission
        userController.getUser             // 4. Handle request
    )
    /**
     * PATCH /api/v1/users/:userId
     * Updates details for a specific user within the authenticated user's tenant.
     * Requires 'user:update' permission (controller may apply further checks).
     */
    .patch(
        checkPermissions(['user:update']),   // 3. Check specific permission
        validateRequest(UpdateUserDto),    // 4. Validate request body
        userController.updateUser          // 5. Handle request
    )
    /**
     * DELETE /api/v1/users/:userId
     * Deactivates (soft deletes) a specific user within the authenticated user's tenant.
     * Requires 'user:delete' permission. Cannot self-delete.
     */
    .delete(
        checkPermissions(['user:delete']),   // 3. Check specific permission
        userController.deleteUser          // 4. Handle request
    );

// Export the configured router
export default router;
