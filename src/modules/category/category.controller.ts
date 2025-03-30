// src/modules/categories/category.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { categoryService } from './category.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
import { Prisma } from '@prisma/client';

const createCategory = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // req.body is validated CreateCategoryDto
    const category = await categoryService.createCategory(req.body, tenantId);
    res.status(httpStatus.CREATED).send(category);
});

const getCategories = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // Define filters: ?parentId=<id> for children of parent, ?topLevel=true for root, ?hierarchy=true for full tree
    const filterParams = pick(req.query, ['parentId', 'topLevel', 'name']);
    const options = pick(req.query, ['sortBy', 'hierarchy']); // Add 'hierarchy' flag

    const fetchHierarchy = options.hierarchy === 'true';

    // Build Prisma WhereInput, always scoped by tenant
    const filter: Prisma.CategoryWhereInput = { tenantId };
    if (filterParams.parentId) {
        filter.parentCategoryId = filterParams.parentId as string;
    } else if (filterParams.topLevel === 'true' && !fetchHierarchy) {
        // Only filter topLevel if not fetching full hierarchy (tree builder starts from null parent)
        filter.parentCategoryId = null;
    }
    if (filterParams.name) {
         filter.name = { contains: filterParams.name as string, mode: 'insensitive' };
    }


    // Build OrderBy array (mainly relevant for non-hierarchy view)
    const orderBy: Prisma.CategoryOrderByWithRelationInput[] = [];
     if (options.sortBy) {
        const [key, order] = (options.sortBy as string).split(':');
        if (key && (order === 'asc' || order === 'desc')) {
            if (['name', 'createdAt'].includes(key)) {
                orderBy.push({ [key]: order });
            }
        }
    }
    if (orderBy.length === 0 && !fetchHierarchy) { orderBy.push({ name: 'asc' }); } // Default sort for lists

    // Call service
    const result = await categoryService.queryCategories(filter, orderBy, fetchHierarchy);

    // Send response (might be flat list or nested tree)
    res.status(httpStatus.OK).send(result);
});

const getCategory = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const category = await categoryService.getCategoryById(req.params.categoryId, tenantId);
    if (!category) { throw new ApiError(httpStatus.NOT_FOUND, 'Category not found'); }
    res.status(httpStatus.OK).send(category);
});

const updateCategory = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // req.body is validated UpdateCategoryDto
    const category = await categoryService.updateCategoryById(req.params.categoryId, req.body, tenantId);
    res.status(httpStatus.OK).send(category);
});

const deleteCategory = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    await categoryService.deleteCategoryById(req.params.categoryId, tenantId);
    res.status(httpStatus.NO_CONTENT).send();
});

export const categoryController = {
    createCategory,
    getCategories,
    getCategory,
    updateCategory,
    deleteCategory,
};
