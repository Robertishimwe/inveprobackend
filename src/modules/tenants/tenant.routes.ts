// src/modules/tenants/tenant.routes.ts
import express from 'express';
import { tenantController } from './tenant.controller'; // Import the controller with all methods
import validateRequest from '@/middleware/validate.middleware';
// Import all necessary DTOs for validation middleware
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { TenantActionDto } from './dto/tenant-action.dto';
import { ManageTenantAdminsDto } from './dto/manage-tenant-admins.dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware'; // Permission checking middleware

const router = express.Router();

// --- Routes for Super Admins (managing any tenant) ---
// These routes require authentication BUT likely bypass the standard tenant context check.
// The `checkPermissions` middleware needs to be configured to recognize Super Admin permissions
// (e.g., 'tenant:create:any', 'tenant:read:any') without requiring a specific tenantId match.
// This Super Admin identification logic is crucial and assumed to be part of your auth/RBAC setup.

router.route('/')
    /**
     * POST /api/v1/tenants (Super Admin Only)
     * Creates a new tenant and assigns an existing user as its initial admin.
     */
    .post(
        authMiddleware, // Authenticate the user
        checkPermissions(['tenant:create:any']), // Check for Super Admin permission
        validateRequest(CreateTenantDto),       // Validate request body
        tenantController.createTenant           // Handle request
    )
    /**
     * GET /api/v1/tenants (Super Admin Only)
     * Retrieves a paginated list of all tenants. Supports filtering/sorting.
     */
    .get(
        authMiddleware,
        checkPermissions(['tenant:read:any']), // Check for Super Admin permission
        tenantController.getTenants            // Handle request
    );

router.route('/:tenantId')
    /**
     * GET /api/v1/tenants/:tenantId (Super Admin Only)
     * Retrieves details for a specific tenant by ID.
     */
    .get(
        authMiddleware,
        checkPermissions(['tenant:read:any']), // Check for Super Admin permission
        tenantController.getTenant             // Handle request
    )
    /**
     * PATCH /api/v1/tenants/:tenantId (Super Admin Only)
     * Updates a tenant's basic info or status (ACTIVE, SUSPENDED, TRIAL).
     * Does NOT handle deactivation (use separate endpoint).
     */
    .patch(
        authMiddleware,
        checkPermissions(['tenant:update:any']), // Check for Super Admin permission
        validateRequest(UpdateTenantDto),       // Validate request body
        tenantController.updateTenant           // Handle request
    );

/**
 * POST /api/v1/tenants/:tenantId/deactivate (Super Admin Only)
 * Soft-deletes a tenant by setting its status to DEACTIVATED.
 */
router.post( // Using POST for an action that changes state
    '/:tenantId/deactivate',
    authMiddleware,
    checkPermissions(['tenant:delete:any']), // Use delete permission for deactivate action
    validateRequest(TenantActionDto),       // Validate optional notes in body
    tenantController.deactivateTenant         // Handle request
);

/**
 * PUT /api/v1/tenants/:tenantId/admins (Super Admin Only)
 * Sets/Replaces the list of administrators for a specific tenant.
 * Body: { adminUserIds: ["<uuid1>", "<uuid2>"] } (max 2)
 */
router.put( // Using PUT as it replaces the entire admin set for the tenant
    '/:tenantId/admins',
    authMiddleware,
    checkPermissions(['tenant:manage:admins']), // Specific Super Admin permission
    validateRequest(ManageTenantAdminsDto),     // Validate the array of user IDs
    tenantController.setTenantAdmins            // Handle request
);


// --- Routes for Tenant Admins (managing their own tenant config) ---
// These routes use standard authentication and tenant context checking.
const selfTenantRouter = express.Router();
selfTenantRouter.use(authMiddleware);       // Ensure user is logged in
selfTenantRouter.use(ensureTenantContext); // Ensure tenant context is set for this user

/**
 * GET /api/v1/tenants/self/config
 * Retrieves the configuration details for the authenticated user's own tenant.
 */
selfTenantRouter.get(
    '/config',
    checkPermissions(['tenant:config:read']), // Tenant Admin permission to read config
    tenantController.getOwnTenant             // Handle request
);

/**
 * PATCH /api/v1/tenants/self/config
 * Updates specific configuration settings for the authenticated user's own tenant.
 */
selfTenantRouter.patch(
    '/config',
    checkPermissions(['tenant:config:update']), // Tenant Admin permission to update config
    validateRequest(UpdateTenantConfigDto),     // Validate the subset of config allowed
    tenantController.updateOwnTenantConfig    // Handle request
);

/**
 * POST /api/v1/tenants/self/test-email
 * Sends a test email to verify SMTP configuration.
 */
selfTenantRouter.post(
    '/test-email',
    checkPermissions(['tenant:config:update']), // Only allow if user can update config
    tenantController.sendTestEmail            // Handle request
);

// Mount the self-tenant configuration sub-router under the main tenants path
router.use('/self', selfTenantRouter);


// Export the fully configured router for the tenants module
export default router;
