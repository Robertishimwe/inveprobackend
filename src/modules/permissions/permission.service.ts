// src/modules/permissions/permission.service.ts
import { Permission } from '@prisma/client';
import { prisma } from '@/config';
import logger from '@/utils/logger';
import ApiError from '@/utils/ApiError';
import httpStatus from 'http-status';

type LogContext = { function?: string; error?: any; [key: string]: any; };

/**
 * Get all available permissions.
 */
const getAllPermissions = async (): Promise<Permission[]> => {
    const logContext: LogContext = { function: 'getAllPermissions' };
    try {
        // Permissions are usually static, caching can be very effective here
        // TODO: Implement caching for permissions list
        const permissions = await prisma.permission.findMany({
            orderBy: { permissionKey: 'asc' } // Order for consistent display
        });
        logger.debug(`Fetched ${permissions.length} permissions`);
        return permissions;
    } catch (error: any) {
        logContext.error = error;
        logger.error('Error fetching permissions', logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve permissions.');
    }
};

export const permissionService = {
    getAllPermissions,
};