// src/modules/customers/customer.routes.ts
import express from 'express';
import { customerController } from './customer.controller';
import validateRequest from '@/middleware/validate.middleware';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { authMiddleware } from '@/middleware/auth.middleware'; // Verifies JWT, attaches req.user, req.tenantId
import { ensureTenantContext } from '@/middleware/tenant.middleware'; // Ensures req.tenantId is set after auth
import { checkPermissions } from '@/middleware/rbac.middleware'; // Permission checking middleware

const router = express.Router();

// Apply authentication and tenant context check to all customer routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// Define Customer Routes with Permissions
router.route('/')
    /**
     * POST /api/v1/customers
     * Creates a new customer within the authenticated user's tenant.
     * Requires 'customer:create' permission.
     */
    .post(
        checkPermissions(['customer:create']),   // Permission check
        validateRequest(CreateCustomerDto),      // Body validation
        customerController.createCustomer        // Handler
    )
    /**
     * GET /api/v1/customers
     * Retrieves a paginated list of customers within the authenticated user's tenant.
     * Supports filtering and sorting via query parameters.
     * Requires 'customer:read' permission.
     */
    .get(
        checkPermissions(['customer:read']),     // Permission check
        customerController.getCustomers          // Handler (query param validation inside)
    );

router.route('/:customerId')
    /**
     * GET /api/v1/customers/:customerId
     * Retrieves details for a specific customer.
     * Requires 'customer:read' permission.
     */
    .get(
        checkPermissions(['customer:read']),     // Permission check
        customerController.getCustomer           // Handler
    )
    /**
     * PATCH /api/v1/customers/:customerId
     * Updates details for a specific customer.
     * Requires 'customer:update' permission.
     */
    .patch(
        checkPermissions(['customer:update']),   // Permission check
        validateRequest(UpdateCustomerDto),      // Body validation
        customerController.updateCustomer        // Handler
    )
    /**
     * DELETE /api/v1/customers/:customerId
     * Deletes a specific customer (if dependencies allow, e.g., no open orders).
     * Requires 'customer:delete' permission.
     */
    .delete(
        checkPermissions(['customer:delete']),   // Permission check
        customerController.deleteCustomer        // Handler
    );

// Export the configured router
export default router;
