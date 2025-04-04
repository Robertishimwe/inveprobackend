"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/products/product.routes.ts
const express_1 = __importDefault(require("express"));
const product_controller_1 = require("./product.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const create_product_dto_1 = require("./dto/create-product.dto");
const update_product_dto_1 = require("./dto/update-product.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const router = express_1.default.Router();
// Apply auth and tenant context middleware to all product routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// Define Product Routes with specific permissions
router.route('/')
    /**
     * POST /api/v1/products
     * Creates a new product. Requires 'product:create' permission.
     */
    .post((0, rbac_middleware_1.checkPermissions)(['product:create']), (0, validate_middleware_1.default)(create_product_dto_1.CreateProductDto), product_controller_1.productController.createProduct)
    /**
     * GET /api/v1/products
     * Retrieves a list of products with filtering/sorting/pagination.
     * Requires 'product:read' permission.
     */
    .get((0, rbac_middleware_1.checkPermissions)(['product:read']), product_controller_1.productController.getProducts);
router.route('/:productId')
    /**
     * GET /api/v1/products/:productId
     * Retrieves details of a specific product. Requires 'product:read' permission.
     */
    .get((0, rbac_middleware_1.checkPermissions)(['product:read']), product_controller_1.productController.getProduct)
    /**
     * PATCH /api/v1/products/:productId
     * Updates details of a specific product. Requires 'product:update' permission.
     */
    .patch((0, rbac_middleware_1.checkPermissions)(['product:update']), (0, validate_middleware_1.default)(update_product_dto_1.UpdateProductDto), product_controller_1.productController.updateProduct)
    /**
     * DELETE /api/v1/products/:productId
     * Deletes a specific product (if dependencies allow). Requires 'product:delete' permission.
     */
    .delete((0, rbac_middleware_1.checkPermissions)(['product:delete']), product_controller_1.productController.deleteProduct);
exports.default = router;
//# sourceMappingURL=product.routes.js.map