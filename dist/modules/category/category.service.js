"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryService = void 0;
// src/modules/categories/category.service.ts
const http_status_1 = __importDefault(require("http-status"));
const client_1 = require("@prisma/client");
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
/**
 * Create a new category.
 */
const createCategory = async (data, tenantId) => {
    const logContext = { function: 'createCategory', tenantId, name: data.name, parentId: data.parentCategoryId };
    // 1. Check name uniqueness within the same parent (or at top level) for the tenant
    const existing = await config_1.prisma.category.findFirst({
        where: {
            name: data.name,
            tenantId: tenantId,
            parentCategoryId: data.parentCategoryId ?? null // Check against null if parentId is not provided
        },
        select: { id: true }
    });
    if (existing) {
        logger_1.default.warn(`Category creation failed: Name "${data.name}" already exists under the specified parent`, logContext);
        throw new ApiError_1.default(http_status_1.default.CONFLICT, `Category name "${data.name}" must be unique under the same parent.`);
    }
    // 2. Validate parentCategoryId if provided
    if (data.parentCategoryId) {
        const parentExists = await config_1.prisma.category.count({ where: { id: data.parentCategoryId, tenantId } });
        if (!parentExists) {
            logger_1.default.warn(`Category creation failed: Parent category not found`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Parent category not found.');
        }
    }
    // 3. Create in DB
    try {
        const category = await config_1.prisma.category.create({
            data: {
                tenantId,
                name: data.name,
                description: data.description,
                parentCategoryId: data.parentCategoryId // Prisma handles null correctly
            },
        });
        logContext.categoryId = category.id;
        logger_1.default.info(`Category created successfully`, logContext);
        // Add cache invalidation if category caching is implemented
        return category;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error creating category`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Should be caught by the first check, but as safeguard
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Category name conflict during creation.`);
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to create category.');
    }
};
/**
 * Query categories, optionally filtering by parent or fetching hierarchy.
 * NOTE: Fetching full hierarchy can be inefficient for deep trees. Consider limiting depth.
 */
const queryCategories = async (filter, orderBy, fetchHierarchy = false // Add option to fetch full tree
) => {
    const tenantIdForLog = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext = { function: 'queryCategories', tenantId: tenantIdForLog, fetchHierarchy };
    if (!tenantIdForLog) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Tenant context missing.');
    }
    try {
        if (fetchHierarchy) {
            // Fetch all categories for the tenant (potentially inefficient for large datasets)
            const allCategories = await config_1.prisma.category.findMany({
                where: { tenantId: tenantIdForLog },
                orderBy: [{ parentCategoryId: 'asc' }, { name: 'asc' }] // Order to help build tree
            });
            logger_1.default.debug(`Fetched ${allCategories.length} categories for hierarchy build`, logContext);
            // Build tree structure
            return buildCategoryTree(allCategories);
        }
        else {
            // Fetch filtered list (no pagination for simplicity, add if needed)
            const categories = await config_1.prisma.category.findMany({
                where: filter, // Apply incoming filters (e.g., specific parentId or top-level)
                orderBy: orderBy.length > 0 ? orderBy : [{ name: 'asc' }], // Default sort
                include: {
                    _count: { select: { subCategories: true } }
                }
            });
            logger_1.default.debug(`Category query successful, found ${categories.length} categories.`, logContext);
            return categories;
        }
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying categories`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve categories.');
    }
};
// Helper function to build nested tree structure
const buildCategoryTree = (categories, parentId = null) => {
    const tree = [];
    categories
        .filter(category => category.parentCategoryId === parentId)
        .forEach(category => {
        const children = buildCategoryTree(categories, category.id);
        tree.push({ ...category, children });
    });
    return tree;
};
/**
 * Get category by ID.
 */
const getCategoryById = async (categoryId, tenantId) => {
    const logContext = { function: 'getCategoryById', categoryId, tenantId };
    try {
        const category = await config_1.prisma.category.findFirst({
            where: { id: categoryId, tenantId }
            // Optionally include parent or children:
            // include: { parentCategory: true, subCategories: true }
        });
        if (!category) {
            logger_1.default.warn(`Category not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Category found successfully`, logContext);
        return category;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching category by ID`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve category.');
    }
};
/**
 * Update category details by ID.
 */
const updateCategoryById = async (categoryId, updateData, tenantId) => {
    const logContext = { function: 'updateCategoryById', categoryId, tenantId, data: updateData };
    // 1. Verify category exists
    const existing = await config_1.prisma.category.findFirst({ where: { id: categoryId, tenantId } });
    if (!existing) {
        logger_1.default.warn(`Update failed: Category not found`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Category not found.');
    }
    // 2. Prepare data and perform checks
    const dataToUpdate = {};
    // let parentIdToCheck: string | null | undefined = existing.parentCategoryId; // Check against original parent
    if (updateData.name !== undefined) {
        if (updateData.name !== existing.name) {
            // Check name uniqueness under the intended parent
            const targetParentId = updateData.parentCategoryId !== undefined ? updateData.parentCategoryId : existing.parentCategoryId;
            const nameExists = await config_1.prisma.category.findFirst({
                where: { name: updateData.name, tenantId, parentCategoryId: targetParentId, id: { not: categoryId } },
                select: { id: true }
            });
            if (nameExists) {
                logger_1.default.warn(`Update failed: Name already exists under target parent`, logContext);
                throw new ApiError_1.default(http_status_1.default.CONFLICT, `Category name "${updateData.name}" already exists under the target parent.`);
            }
        }
        dataToUpdate.name = updateData.name;
    }
    if (updateData.description !== undefined)
        dataToUpdate.description = updateData.description;
    // Handle parent update carefully
    if (updateData.parentCategoryId !== undefined) {
        // Prevent setting parent to self
        if (updateData.parentCategoryId === categoryId) {
            logger_1.default.warn(`Update failed: Category cannot be its own parent`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Category cannot be its own parent.');
        }
        // Prevent creating circular dependencies (more complex check needed for full prevention)
        // Basic check: cannot set parent to one of its own descendants.
        // This requires fetching descendants, which can be slow. Omitted for brevity, add if needed.
        // logger.warn("Circular dependency check for category parent update not fully implemented.");
        if (updateData.parentCategoryId === null) {
            // Unsetting parent
            dataToUpdate.parentCategory = { disconnect: true };
        }
        else {
            // Setting new parent - verify it exists
            const parentExists = await config_1.prisma.category.count({ where: { id: updateData.parentCategoryId, tenantId } });
            if (!parentExists) {
                logger_1.default.warn(`Update failed: New parent category not found`, logContext);
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'New parent category not found.');
            }
            dataToUpdate.parentCategory = { connect: { id: updateData.parentCategoryId } };
        }
        // let parentIdToCheck = updateData.parentCategoryId; // Update parent check reference
    }
    if (Object.keys(dataToUpdate).length === 0) {
        logger_1.default.info(`Category update skipped: No changes provided`, logContext);
        return existing;
    }
    // 3. Perform update
    try {
        const updatedCategory = await config_1.prisma.category.update({
            where: { id: categoryId }, // Tenant verified above
            data: dataToUpdate,
        });
        logger_1.default.info(`Category updated successfully`, logContext);
        // Invalidate cache if implemented
        return updatedCategory;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error updating category`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Category name conflict during update.`);
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Category not found during update attempt.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to update category.');
    }
};
/**
 * Delete a category by ID. Handle children (e.g., disallow, re-parent, cascade).
 * Current implementation: Disallow deletion if category has children or associated products.
 */
const deleteCategoryById = async (categoryId, tenantId) => {
    const logContext = { function: 'deleteCategoryById', categoryId, tenantId };
    // 1. Verify existence
    const category = await config_1.prisma.category.findFirst({ where: { id: categoryId, tenantId }, select: { id: true } });
    if (!category) {
        logger_1.default.warn(`Delete failed: Category not found`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Category not found.');
    }
    // 2. Check Dependencies
    // Check for sub-categories
    const subCategoryCount = await config_1.prisma.category.count({ where: { parentCategoryId: categoryId } });
    if (subCategoryCount > 0) {
        logger_1.default.warn(`Delete failed: Category has sub-categories`, logContext);
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot delete category because it has ${subCategoryCount} sub-categories. Delete or re-assign children first.`);
    }
    // Check for associated products
    const productCount = await config_1.prisma.productCategory.count({ where: { categoryId: categoryId } });
    if (productCount > 0) {
        logger_1.default.warn(`Delete failed: Category has associated products`, logContext);
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot delete category because it is linked to ${productCount} product(s). Unlink products first.`);
    }
    // 3. Perform delete
    try {
        await config_1.prisma.category.delete({ where: { id: categoryId } }); // Tenant verified above
        logger_1.default.info(`Category deleted successfully`, logContext);
        // Invalidate cache
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error deleting category`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Category not found during delete attempt.');
        }
        // Catch foreign key constraints if dependency checks missed something
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            logger_1.default.warn(`Delete failed: Foreign key constraint violation`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Cannot delete category due to existing references.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to delete category.');
    }
};
exports.categoryService = {
    createCategory,
    queryCategories,
    getCategoryById,
    updateCategoryById,
    deleteCategoryById,
};
//# sourceMappingURL=category.service.js.map