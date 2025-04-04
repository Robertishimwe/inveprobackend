"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const category_service_1 = require("./category.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick"));
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const createCategory = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // req.body is validated CreateCategoryDto
    const category = await category_service_1.categoryService.createCategory(req.body, tenantId);
    res.status(http_status_1.default.CREATED).send(category);
});
const getCategories = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Define filters: ?parentId=<id> for children of parent, ?topLevel=true for root, ?hierarchy=true for full tree
    const filterParams = (0, pick_1.default)(req.query, ['parentId', 'topLevel', 'name']);
    const options = (0, pick_1.default)(req.query, ['sortBy', 'hierarchy']); // Add 'hierarchy' flag
    const fetchHierarchy = options.hierarchy === 'true';
    // Build Prisma WhereInput, always scoped by tenant
    const filter = { tenantId };
    if (filterParams.parentId) {
        filter.parentCategoryId = filterParams.parentId;
    }
    else if (filterParams.topLevel === 'true' && !fetchHierarchy) {
        // Only filter topLevel if not fetching full hierarchy (tree builder starts from null parent)
        filter.parentCategoryId = null;
    }
    if (filterParams.name) {
        filter.name = { contains: filterParams.name, mode: 'insensitive' };
    }
    // Build OrderBy array (mainly relevant for non-hierarchy view)
    const orderBy = [];
    if (options.sortBy) {
        const [key, order] = options.sortBy.split(':');
        if (key && (order === 'asc' || order === 'desc')) {
            if (['name', 'createdAt'].includes(key)) {
                orderBy.push({ [key]: order });
            }
        }
    }
    if (orderBy.length === 0 && !fetchHierarchy) {
        orderBy.push({ name: 'asc' });
    } // Default sort for lists
    // Call service
    const result = await category_service_1.categoryService.queryCategories(filter, orderBy, fetchHierarchy);
    // Send response (might be flat list or nested tree)
    res.status(http_status_1.default.OK).send(result);
});
const getCategory = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const category = await category_service_1.categoryService.getCategoryById(req.params.categoryId, tenantId);
    if (!category) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Category not found');
    }
    res.status(http_status_1.default.OK).send(category);
});
const updateCategory = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // req.body is validated UpdateCategoryDto
    const category = await category_service_1.categoryService.updateCategoryById(req.params.categoryId, req.body, tenantId);
    res.status(http_status_1.default.OK).send(category);
});
const deleteCategory = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    await category_service_1.categoryService.deleteCategoryById(req.params.categoryId, tenantId);
    res.status(http_status_1.default.NO_CONTENT).send();
});
exports.categoryController = {
    createCategory,
    getCategories,
    getCategory,
    updateCategory,
    deleteCategory,
};
//# sourceMappingURL=category.controller.js.map