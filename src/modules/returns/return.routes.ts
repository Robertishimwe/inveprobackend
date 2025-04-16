// src/modules/returns/return.routes.ts
import express from 'express';
import { returnController } from './return.controller'; // Import the return controller
import validateRequest from '@/middleware/validate.middleware';
import { CreateReturnDto } from './dto'; // Import the DTO for validation
import { authMiddleware } from '@/middleware/auth.middleware'; // Standard authentication
import { ensureTenantContext } from '@/middleware/tenant.middleware'; // Standard tenant scoping
import { checkPermissions } from '@/middleware/rbac.middleware'; // For permission checking

const router = express.Router();

// --- Apply Middleware ---
// All return-related actions require authentication and tenant context
router.use(authMiddleware);
router.use(ensureTenantContext);

// --- Define Return Routes ---

router.route('/')
    /**
     * POST /api/v1/returns
     * Processes a new customer return (linked or blind). Creates Return, ReturnItem,
     * Payment (refund), PosSessionTransaction (if cash refund in session), and updates Inventory.
     * Requires 'order:manage:returns' OR 'pos:return' permission.
     */
    .post(
        // Use checkPermissions that allows EITHER permission for flexibility
        // This requires checkPermissions or your RBAC logic to handle OR conditions if built that way.
        // If not, you might need separate endpoints or a more complex check.
        // Assuming checkPermissions can handle an array as OR:
        checkPermissions(['order:manage:returns', 'pos:return']),
        validateRequest(CreateReturnDto), // Validate the request body
        returnController.processReturn    // Handle the return processing
    )
    /**
     * GET /api/v1/returns
     * Retrieves a paginated list of returns within the authenticated user's tenant.
     * Supports filtering and sorting via query parameters.
     * Requires 'order:read:any' or a specific 'return:read' permission.
     */
    .get(
        // Allow users who can read any order OR have specific return read permission
        checkPermissions(['order:read:any', 'return:read']), // Assuming 'return:read' permission exists
        returnController.getReturns // Handle fetching the list
    );

router.route('/:returnId')
    /**
     * GET /api/v1/returns/:returnId
     * Retrieves details for a specific return record by its ID.
     * Requires 'order:read:any' or a specific 'return:read' permission.
     */
    .get(
        checkPermissions(['order:read:any', 'return:read']), // Allow either permission
        returnController.getReturn // Handle fetching single record
    );

// Note: Updating or Deleting returns is generally discouraged in accounting workflows.
// Corrections are usually handled by creating new reversing/adjusting transactions.
// If needed, specific endpoints for specific, allowed updates could be added here.
// Example:
// router.patch('/:returnId/notes', checkPermissions(['order:manage:returns']), validateRequest(UpdateReturnNotesDto), returnController.updateNotes);

// Export the configured router for the returns module
export default router;