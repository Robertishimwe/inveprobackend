// src/modules/returns/return.routes.ts
import express from 'express';
import { returnController } from './return.controller'; // Import the return controller
import validateRequest from '@/middleware/validate.middleware';
// Import necessary DTOs for validation
import { CreateReturnDto, UpdateReturnDto } from './dto';
import { authMiddleware } from '@/middleware/auth.middleware'; // Verifies JWT, attaches req.user, req.tenantId
import { ensureTenantContext } from '@/middleware/tenant.middleware'; // Ensures req.tenantId is set after auth
import { checkPermissions } from '@/middleware/rbac.middleware'; // Permission checking middleware

const router = express.Router();

// Apply authentication and tenant context check to all Return routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// Define Return Routes with Permissions
router.route('/')
    /**
     * POST /api/v1/returns
     * Creates a new return request/record.
     * Requires 'order:manage:returns' or a specific 'return:create' permission.
     * Permissions may also implicitly include POS-related permissions if created via POS.
     */
    .post(
        // Example using general order management permission, adjust as needed
        checkPermissions(['order:manage:returns', 'pos:return']), // Allow if user has either permission
        validateRequest(CreateReturnDto),      // Validate the return creation payload
        returnController.createReturn          // Handle request
    )
    /**
     * GET /api/v1/returns
     * Retrieves a paginated list of returns within the authenticated user's tenant.
     * Supports filtering and sorting via query parameters.
     * Requires 'order:manage:returns' or 'return:read' permission.
     */
    .get(
        checkPermissions(['order:manage:returns', 'return:read']), // Permission check
        returnController.getReturns               // Handler (query param validation inside)
    );

router.route('/:returnId')
    /**
     * GET /api/v1/returns/:returnId
     * Retrieves details for a specific return.
     * Requires 'order:manage:returns' or 'return:read' permission.
     */
    .get(
        checkPermissions(['order:manage:returns', 'return:read']), // Permission check
        returnController.getReturn                 // Handler
    )
    /**
     * PATCH /api/v1/returns/:returnId
     * Updates details (primarily status or notes) for a specific return.
     * Requires 'order:manage:returns' or 'return:update' permission.
     */
    .patch(
        checkPermissions(['order:manage:returns', 'return:update']), // Permission check
        validateRequest(UpdateReturnDto),         // Validate update payload
        returnController.updateReturn             // Handler
    );

// Optional: Dedicated Action Endpoints (Alternative to PATCH for status changes)
/*
router.post(
    '/:returnId/approve',
    checkPermissions(['order:manage:returns', 'return:approve']),
    // Optional: validateRequest(ActionDto) for notes
    returnController.approveReturn // Needs corresponding controller method
);

router.post(
    '/:returnId/reject',
    checkPermissions(['order:manage:returns', 'return:reject']),
     // Optional: validateRequest(ActionDto) for notes
    returnController.rejectReturn // Needs corresponding controller method
);

router.post(
    '/:returnId/complete',
    checkPermissions(['order:manage:returns', 'return:complete']),
     // Optional: validateRequest(ActionDto) for notes
    returnController.completeReturn // Needs corresponding controller method
);
*/

// Export the configured router for returns
export default router;
