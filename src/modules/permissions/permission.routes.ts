// src/modules/permissions/permission.routes.ts
import express from 'express';
import { permissionController } from './permission.controller';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';

const router = express.Router();

// Apply auth & tenant context
router.use(authMiddleware);
router.use(ensureTenantContext);

// Define Permission Routes (usually just read)
router.route('/')
    /** GET /api/v1/permissions */
    .get(
        checkPermissions(['role:read']), // Reading permissions often tied to reading/managing roles
        permissionController.getPermissions
    );

export default router;
