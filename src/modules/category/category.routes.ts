// src/modules/categories/category.routes.ts
import express from 'express';
import { categoryController } from './category.controller';
import validateRequest from '@/middleware/validate.middleware';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';

const router = express.Router();

// Apply auth & tenant context to all category routes
router.use(authMiddleware);
router.use(ensureTenantContext);

// Define Category Routes
router.route('/')
    /** POST /api/v1/categories */
    .post(
        checkPermissions(['category:create']), // Define permission
        validateRequest(CreateCategoryDto),
        categoryController.createCategory
    )
    /** GET /api/v1/categories */
    .get(
        checkPermissions(['category:read']), // Define permission
        categoryController.getCategories // Supports ?parentId=... & ?topLevel=true & ?hierarchy=true
    );

router.route('/:categoryId')
    /** GET /api/v1/categories/:categoryId */
    .get(
        checkPermissions(['category:read']),
        categoryController.getCategory
    )
    /** PATCH /api/v1/categories/:categoryId */
    .patch(
        checkPermissions(['category:update']), // Define permission
        validateRequest(UpdateCategoryDto),
        categoryController.updateCategory
    )
    /** DELETE /api/v1/categories/:categoryId */
    .delete(
        checkPermissions(['category:delete']), // Define permission
        categoryController.deleteCategory
    );

export default router;
