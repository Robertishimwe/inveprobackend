"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/categories/category.routes.ts
const express_1 = __importDefault(require("express"));
const category_controller_1 = require("./category.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const create_category_dto_1 = require("./dto/create-category.dto");
const update_category_dto_1 = require("./dto/update-category.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const router = express_1.default.Router();
// Apply auth & tenant context to all category routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// Define Category Routes
router.route('/')
    /** POST /api/v1/categories */
    .post((0, rbac_middleware_1.checkPermissions)(['category:create']), // Define permission
(0, validate_middleware_1.default)(create_category_dto_1.CreateCategoryDto), category_controller_1.categoryController.createCategory)
    /** GET /api/v1/categories */
    .get((0, rbac_middleware_1.checkPermissions)(['category:read']), // Define permission
category_controller_1.categoryController.getCategories // Supports ?parentId=... & ?topLevel=true & ?hierarchy=true
);
router.route('/:categoryId')
    /** GET /api/v1/categories/:categoryId */
    .get((0, rbac_middleware_1.checkPermissions)(['category:read']), category_controller_1.categoryController.getCategory)
    /** PATCH /api/v1/categories/:categoryId */
    .patch((0, rbac_middleware_1.checkPermissions)(['category:update']), // Define permission
(0, validate_middleware_1.default)(update_category_dto_1.UpdateCategoryDto), category_controller_1.categoryController.updateCategory)
    /** DELETE /api/v1/categories/:categoryId */
    .delete((0, rbac_middleware_1.checkPermissions)(['category:delete']), // Define permission
category_controller_1.categoryController.deleteCategory);
exports.default = router;
//# sourceMappingURL=category.routes.js.map