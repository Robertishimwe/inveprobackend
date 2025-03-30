// src/modules/customer-groups/customer-group.routes.ts
import express from 'express';
import { customerGroupController } from './customer-group.controller';
import validateRequest from '@/middleware/validate.middleware';
import { CreateCustomerGroupDto } from './dto/create-customer-group.dto';
import { UpdateCustomerGroupDto } from './dto/update-customer-group.dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';

const router = express.Router();

// Apply auth & tenant context to all customer group routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// Define Customer Group Routes with permissions
router.route('/')
    /** POST /api/v1/customer-groups */
    .post(
        checkPermissions(['group:create']), // Define this permission
        validateRequest(CreateCustomerGroupDto),
        customerGroupController.createGroup
    )
    /** GET /api/v1/customer-groups */
    .get(
        checkPermissions(['group:read']), // Define this permission
        customerGroupController.getGroups
    );

router.route('/:groupId')
    /** GET /api/v1/customer-groups/:groupId */
    .get(
        checkPermissions(['group:read']),
        customerGroupController.getGroup
    )
    /** PATCH /api/v1/customer-groups/:groupId */
    .patch(
        checkPermissions(['group:update']), // Define this permission
        validateRequest(UpdateCustomerGroupDto),
        customerGroupController.updateGroup
    )
    /** DELETE /api/v1/customer-groups/:groupId */
    .delete(
        checkPermissions(['group:delete']), // Define this permission
        customerGroupController.deleteGroup
    );

export default router;
