// src/modules/locations/location.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { locationService } from './location.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
import { Prisma } from '@prisma/client';

const createLocation = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const location = await locationService.createLocation(req.body, tenantId);
    res.status(httpStatus.CREATED).send(location);
});

const getLocations = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const filterParams = pick(req.query, ['name', 'locationType', 'isActive']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    const filter: Prisma.LocationWhereInput = { tenantId };
    if (filterParams.name) filter.name = { contains: filterParams.name as string, mode: 'insensitive' };
    if (filterParams.locationType) filter.locationType = { equals: filterParams.locationType as any };
    if (filterParams.isActive !== undefined) filter.isActive = filterParams.isActive === 'true';

    const orderBy: Prisma.LocationOrderByWithRelationInput[] = [];
     if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['name', 'locationType', 'createdAt', 'isActive'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) { orderBy.push({ name: 'asc' }); }

    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    const result = await locationService.queryLocations(filter, orderBy, limit, page);

    res.status(httpStatus.OK).send({
        results: result.locations,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});

const getLocation = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const location = await locationService.getLocationById(req.params.locationId, tenantId);
    if (!location) { throw new ApiError(httpStatus.NOT_FOUND, 'Location not found'); }
    res.status(httpStatus.OK).send(location);
});

const updateLocation = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const location = await locationService.updateLocationById(req.params.locationId, req.body, tenantId);
    res.status(httpStatus.OK).send(location);
});

const deleteLocation = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    await locationService.deleteLocationById(req.params.locationId, tenantId);
    res.status(httpStatus.NO_CONTENT).send();
});

export const locationController = {
    createLocation,
    getLocations,
    getLocation,
    updateLocation,
    deleteLocation,
};
