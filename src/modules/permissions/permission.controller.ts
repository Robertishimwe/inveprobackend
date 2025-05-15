// src/modules/permissions/permission.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { permissionService } from './permission.service';
import catchAsync from '@/utils/catchAsync';

/** Controller to get all available permissions */
const getPermissions = catchAsync(async (req: Request, res: Response) => {
    const permissions = await permissionService.getAllPermissions();
    res.status(httpStatus.OK).send({results: permissions});
});

export const permissionController = {
    getPermissions,
};
