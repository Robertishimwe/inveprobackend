// src/modules/suppliers/supplier.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { supplierService } from './supplier.service';
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
import { Prisma } from '@prisma/client';

const createSupplier = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // req.body is validated CreateSupplierDto
    const supplier = await supplierService.createSupplier(req.body, tenantId);
    res.status(httpStatus.CREATED).send(supplier);
});

const getSuppliers = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const filterParams = pick(req.query, ['name', 'email', 'phone', 'isActive', 'search']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    const filter: Prisma.SupplierWhereInput = { tenantId };

    if (filterParams.search) {
        const search = filterParams.search as string;
        filter.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { contactName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
        ];
    }

    if (filterParams.name) filter.name = { contains: filterParams.name as string, mode: 'insensitive' };
    if (filterParams.email) filter.email = { contains: filterParams.email as string, mode: 'insensitive' };
    if (filterParams.phone) filter.phone = { contains: filterParams.phone as string };
    if (filterParams.isActive !== undefined) filter.isActive = filterParams.isActive === 'true';

    const orderBy: Prisma.SupplierOrderByWithRelationInput[] = [];
    if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['name', 'email', 'createdAt', 'isActive'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) { orderBy.push({ name: 'asc' }); } // Default sort

    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    const result = await supplierService.querySuppliers(filter, orderBy, limit, page);

    res.status(httpStatus.OK).send({
        results: result.suppliers,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});

const getSupplier = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const supplier = await supplierService.getSupplierById(req.params.supplierId, tenantId);
    if (!supplier) { throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found'); }
    res.status(httpStatus.OK).send(supplier);
});

const updateSupplier = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // req.body is validated UpdateSupplierDto
    const supplier = await supplierService.updateSupplierById(req.params.supplierId, req.body, tenantId);
    res.status(httpStatus.OK).send(supplier);
});

const deleteSupplier = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // Service performs soft delete (deactivation)
    await supplierService.deleteSupplierById(req.params.supplierId, tenantId);
    // Send 204 No Content for successful deactivation/deletion
    res.status(httpStatus.NO_CONTENT).send();
});

export const supplierController = {
    createSupplier,
    getSuppliers,
    getSupplier,
    updateSupplier,
    deleteSupplier,
};
