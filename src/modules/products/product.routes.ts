// src/modules/products/product.routes.ts
import express from 'express';
import { productController } from './product.controller';
import validateRequest from '@/middleware/validate.middleware';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { authMiddleware } from '@/middleware/auth.middleware';
import { ensureTenantContext } from '@/middleware/tenant.middleware';
import { checkPermissions } from '@/middleware/rbac.middleware';

const router = express.Router();

// Apply auth and tenant context middleware to all product routes
router.use(authMiddleware);
router.use(ensureTenantContext);
// Define Product Routes with specific permissions
router.route('/')
    /**
     * POST /api/v1/products
     * Creates a new product. Requires 'product:create' permission.
     */
    .post(
        checkPermissions(['product:create']),
        validateRequest(CreateProductDto),
        productController.createProduct
    )
    /**
     * GET /api/v1/products
     * Retrieves a list of products with filtering/sorting/pagination.
     * Requires 'product:read' permission.
     */
    .get(
        checkPermissions(['product:read']),
        productController.getProducts
    );

router.route('/:productId')
    /**
     * GET /api/v1/products/:productId
     * Retrieves details of a specific product. Requires 'product:read' permission.
     */
    .get(
        checkPermissions(['product:read']),
        productController.getProduct
    )
    /**
     * PATCH /api/v1/products/:productId
     * Updates details of a specific product. Requires 'product:update' permission.
     */
    .patch(
        checkPermissions(['product:update']),
        validateRequest(UpdateProductDto),
        productController.updateProduct
    )
    /**
     * DELETE /api/v1/products/:productId
     * Deletes a specific product (if dependencies allow). Requires 'product:delete' permission.
     */
    .delete(
        checkPermissions(['product:delete']),
        productController.deleteProduct
    );

export default router;
