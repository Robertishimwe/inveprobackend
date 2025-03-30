// src/modules/customer-groups/customer-group.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { customerGroupService } from './customer-group.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
import { Prisma } from '@prisma/client';

/** Controller to create a customer group */
const createGroup = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // req.body is validated CreateCustomerGroupDto
    const group = await customerGroupService.createGroup(req.body, tenantId);
    res.status(httpStatus.CREATED).send(group);
});

/** Controller to get a list of customer groups */
const getGroups = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const filterParams = pick(req.query, ['name']); // Add other filters if needed
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    const filter: Prisma.CustomerGroupWhereInput = { tenantId };
    if (filterParams.name) filter.name = { contains: filterParams.name as string, mode: 'insensitive' };

    const orderBy: Prisma.CustomerGroupOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        const [key, order] = (options.sortBy as string).split(':');
         if (key && (order === 'asc' || order === 'desc')) {
             if (['name', 'createdAt'].includes(key)) { // Add sortable fields
                 orderBy.push({ [key]: order });
             }
         }
    }
     if (orderBy.length === 0) { orderBy.push({ name: 'asc' }); } // Default sort

    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    const result = await customerGroupService.queryGroups(filter, orderBy, limit, page);

    res.status(httpStatus.OK).send({
        results: result.groups,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});

/** Controller to get a single customer group by ID */
const getGroup = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const group = await customerGroupService.getGroupById(req.params.groupId, tenantId);
    if (!group) { throw new ApiError(httpStatus.NOT_FOUND, 'Customer group not found'); }
    res.status(httpStatus.OK).send(group);
});

/** Controller to update a customer group by ID */
const updateGroup = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // req.body is validated UpdateCustomerGroupDto
    const group = await customerGroupService.updateGroupById(req.params.groupId, req.body, tenantId);
    res.status(httpStatus.OK).send(group);
});

/** Controller to delete a customer group by ID */
const deleteGroup = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    await customerGroupService.deleteGroupById(req.params.groupId, tenantId);
    res.status(httpStatus.NO_CONTENT).send();
});

export const customerGroupController = {
    createGroup,
    getGroups,
    getGroup,
    updateGroup,
    deleteGroup,
};
