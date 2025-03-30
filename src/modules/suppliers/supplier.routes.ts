// src/modules/suppliers/supplier.routes.ts
import express from 'express';
import { supplierController } from './supplier.controller';
import validateRequest from '@/middleware/validate.middleware';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';

const router = express.Router();

// Apply auth & tenant context to all supplier routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// Define Supplier Routes
router.route('/')
    /** POST /api/v1/suppliers */
    .post(
        checkPermissions(['supplier:create']), // Define permission
        validateRequest(CreateSupplierDto),
        supplierController.createSupplier
    )
    /** GET /api/v1/suppliers */
    .get(
        checkPermissions(['supplier:read']), // Define permission
        supplierController.getSuppliers
    );

router.route('/:supplierId')
    /** GET /api/v1/suppliers/:supplierId */
    .get(
        checkPermissions(['supplier:read']),
        supplierController.getSupplier
    )
    /** PATCH /api/v1/suppliers/:supplierId */
    .patch(
        checkPermissions(['supplier:update']), // Define permission
        validateRequest(UpdateSupplierDto),
        supplierController.updateSupplier
    )
    /** DELETE /api/v1/suppliers/:supplierId */
    .delete(
        checkPermissions(['supplier:delete']), // Define permission (for deactivation)
        supplierController.deleteSupplier
    );

export default router;
