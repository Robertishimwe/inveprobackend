// src/modules/categories/category.service.ts
import httpStatus from 'http-status';
import { Prisma, Category } from '@prisma/client';
import { prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
// import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

// Define log context type if not global
type LogContext = { function?: string; tenantId?: string | null; categoryId?: string | null; data?: any; error?: any; [key: string]: any; };

// Type helper for category with children count (example for list view)
// type CategoryWithSubCount = Category & { _count?: { subCategories: number } | null };
// Type helper for full category tree node
type CategoryTreeNode = Category & { children: CategoryTreeNode[] };


/**
 * Create a new category.
 */
const createCategory = async (data: CreateCategoryDto, tenantId: string): Promise<Category> => {
    const logContext: LogContext = { function: 'createCategory', tenantId, name: data.name, parentId: data.parentCategoryId };

    // 1. Check name uniqueness within the same parent (or at top level) for the tenant
    const existing = await prisma.category.findFirst({
        where: {
            name: data.name,
            tenantId: tenantId,
            parentCategoryId: data.parentCategoryId ?? null // Check against null if parentId is not provided
        },
        select: { id: true }
    });
    if (existing) {
        logger.warn(`Category creation failed: Name "${data.name}" already exists under the specified parent`, logContext);
        throw new ApiError(httpStatus.CONFLICT, `Category name "${data.name}" must be unique under the same parent.`);
    }

    // 2. Validate parentCategoryId if provided
    if (data.parentCategoryId) {
        const parentExists = await prisma.category.count({ where: { id: data.parentCategoryId, tenantId }});
        if (!parentExists) {
            logger.warn(`Category creation failed: Parent category not found`, logContext);
            throw new ApiError(httpStatus.BAD_REQUEST, 'Parent category not found.');
        }
    }

    // 3. Create in DB
    try {
        const category = await prisma.category.create({
            data: {
                tenantId,
                name: data.name,
                description: data.description,
                parentCategoryId: data.parentCategoryId // Prisma handles null correctly
            },
        });
        logContext.categoryId = category.id;
        logger.info(`Category created successfully`, logContext);
        // Add cache invalidation if category caching is implemented
        return category;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error creating category`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             // Should be caught by the first check, but as safeguard
             throw new ApiError(httpStatus.CONFLICT, `Category name conflict during creation.`);
         }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create category.');
    }
};

/**
 * Query categories, optionally filtering by parent or fetching hierarchy.
 * NOTE: Fetching full hierarchy can be inefficient for deep trees. Consider limiting depth.
 */
const queryCategories = async (
    filter: Prisma.CategoryWhereInput,
    orderBy: Prisma.CategoryOrderByWithRelationInput[],
    fetchHierarchy: boolean = false // Add option to fetch full tree
): Promise<Category[] | CategoryTreeNode[]> => {
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'queryCategories', tenantId: tenantIdForLog, fetchHierarchy };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }

    try {
        if (fetchHierarchy) {
            // Fetch all categories for the tenant (potentially inefficient for large datasets)
            const allCategories = await prisma.category.findMany({
                where: { tenantId: tenantIdForLog },
                orderBy: [{ parentCategoryId: 'asc' }, { name: 'asc' }] // Order to help build tree
            });
             logger.debug(`Fetched ${allCategories.length} categories for hierarchy build`, logContext);
            // Build tree structure
            return buildCategoryTree(allCategories);
        } else {
            // Fetch filtered list (no pagination for simplicity, add if needed)
            const categories = await prisma.category.findMany({
                where: filter, // Apply incoming filters (e.g., specific parentId or top-level)
                orderBy: orderBy.length > 0 ? orderBy : [{ name: 'asc'}], // Default sort
                include: { // Include count of direct children for list view
                    _count: { select: { subCategories: true } }
                }
            });
            logger.debug(`Category query successful, found ${categories.length} categories.`, logContext);
            return categories;
        }
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying categories`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve categories.');
    }
};

// Helper function to build nested tree structure
const buildCategoryTree = (categories: Category[], parentId: string | null = null): CategoryTreeNode[] => {
    const tree: CategoryTreeNode[] = [];
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
const getCategoryById = async (categoryId: string, tenantId: string): Promise<Category | null> => {
    const logContext: LogContext = { function: 'getCategoryById', categoryId, tenantId };
    try {
        const category = await prisma.category.findFirst({
            where: { id: categoryId, tenantId }
            // Optionally include parent or children:
            // include: { parentCategory: true, subCategories: true }
        });
        if (!category) {
             logger.warn(`Category not found or tenant mismatch`, logContext);
             return null;
        }
        logger.debug(`Category found successfully`, logContext);
        return category;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching category by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve category.');
    }
};

/**
 * Update category details by ID.
 */
const updateCategoryById = async (
    categoryId: string,
    updateData: UpdateCategoryDto,
    tenantId: string
): Promise<Category> => {
     const logContext: LogContext = { function: 'updateCategoryById', categoryId, tenantId, data: updateData };

    // 1. Verify category exists
    const existing = await prisma.category.findFirst({ where: { id: categoryId, tenantId } });
    if (!existing) {
        logger.warn(`Update failed: Category not found`, logContext);
        throw new ApiError(httpStatus.NOT_FOUND, 'Category not found.');
    }

    // 2. Prepare data and perform checks
    const dataToUpdate: Prisma.CategoryUpdateInput = {};
    // let parentIdToCheck: string | null | undefined = existing.parentCategoryId; // Check against original parent

    if (updateData.name !== undefined) {
        if(updateData.name !== existing.name) {
            // Check name uniqueness under the intended parent
            const targetParentId = updateData.parentCategoryId !== undefined ? updateData.parentCategoryId : existing.parentCategoryId;
            const nameExists = await prisma.category.findFirst({
                where: { name: updateData.name, tenantId, parentCategoryId: targetParentId, id: { not: categoryId } },
                select: { id: true }
            });
            if (nameExists) {
                 logger.warn(`Update failed: Name already exists under target parent`, logContext);
                throw new ApiError(httpStatus.CONFLICT, `Category name "${updateData.name}" already exists under the target parent.`);
            }
        }
        dataToUpdate.name = updateData.name;
    }

    if (updateData.description !== undefined) dataToUpdate.description = updateData.description;

    // Handle parent update carefully
    if (updateData.parentCategoryId !== undefined) {
         // Prevent setting parent to self
        if (updateData.parentCategoryId === categoryId) {
             logger.warn(`Update failed: Category cannot be its own parent`, logContext);
            throw new ApiError(httpStatus.BAD_REQUEST, 'Category cannot be its own parent.');
        }
         // Prevent creating circular dependencies (more complex check needed for full prevention)
         // Basic check: cannot set parent to one of its own descendants.
         // This requires fetching descendants, which can be slow. Omitted for brevity, add if needed.
         // logger.warn("Circular dependency check for category parent update not fully implemented.");

         if (updateData.parentCategoryId === null) {
             // Unsetting parent
             dataToUpdate.parentCategory = { disconnect: true };
         } else {
             // Setting new parent - verify it exists
             const parentExists = await prisma.category.count({ where: { id: updateData.parentCategoryId, tenantId }});
             if (!parentExists) {
                 logger.warn(`Update failed: New parent category not found`, logContext);
                 throw new ApiError(httpStatus.BAD_REQUEST, 'New parent category not found.');
             }
             dataToUpdate.parentCategory = { connect: { id: updateData.parentCategoryId } };
         }
        // let parentIdToCheck = updateData.parentCategoryId; // Update parent check reference
    }

     if (Object.keys(dataToUpdate).length === 0) {
         logger.info(`Category update skipped: No changes provided`, logContext);
         return existing;
     }

    // 3. Perform update
    try {
        const updatedCategory = await prisma.category.update({
            where: { id: categoryId }, // Tenant verified above
            data: dataToUpdate,
        });
        logger.info(`Category updated successfully`, logContext);
        // Invalidate cache if implemented
        return updatedCategory;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating category`, logContext);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             throw new ApiError(httpStatus.CONFLICT, `Category name conflict during update.`);
         }
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             throw new ApiError(httpStatus.NOT_FOUND, 'Category not found during update attempt.');
         }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update category.');
    }
};

/**
 * Delete a category by ID. Handle children (e.g., disallow, re-parent, cascade).
 * Current implementation: Disallow deletion if category has children or associated products.
 */
const deleteCategoryById = async (categoryId: string, tenantId: string): Promise<void> => {
    const logContext: LogContext = { function: 'deleteCategoryById', categoryId, tenantId };

    // 1. Verify existence
    const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId }, select: { id: true } });
    if (!category) {
         logger.warn(`Delete failed: Category not found`, logContext);
        throw new ApiError(httpStatus.NOT_FOUND, 'Category not found.');
    }

    // 2. Check Dependencies
    // Check for sub-categories
    const subCategoryCount = await prisma.category.count({ where: { parentCategoryId: categoryId } });
    if (subCategoryCount > 0) {
         logger.warn(`Delete failed: Category has sub-categories`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, `Cannot delete category because it has ${subCategoryCount} sub-categories. Delete or re-assign children first.`);
    }

    // Check for associated products
    const productCount = await prisma.productCategory.count({ where: { categoryId: categoryId }});
     if (productCount > 0) {
         logger.warn(`Delete failed: Category has associated products`, logContext);
         throw new ApiError(httpStatus.BAD_REQUEST, `Cannot delete category because it is linked to ${productCount} product(s). Unlink products first.`);
    }

    // 3. Perform delete
    try {
        await prisma.category.delete({ where: { id: categoryId } }); // Tenant verified above
        logger.info(`Category deleted successfully`, logContext);
        // Invalidate cache
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error deleting category`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             throw new ApiError(httpStatus.NOT_FOUND, 'Category not found during delete attempt.');
         }
         // Catch foreign key constraints if dependency checks missed something
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
             logger.warn(`Delete failed: Foreign key constraint violation`, logContext);
             throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete category due to existing references.');
         }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete category.');
    }
};


export const categoryService = {
  createCategory,
  queryCategories,
  getCategoryById,
  updateCategoryById,
  deleteCategoryById,
};
