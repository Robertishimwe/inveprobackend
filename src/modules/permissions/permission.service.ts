// src/modules/permissions/permission.service.ts
import { Permission } from '@prisma/client';
import { prisma } from '@/config';
import logger from '@/utils/logger';
import ApiError from '@/utils/ApiError';
import httpStatus from 'http-status';

type LogContext = { function?: string; error?: any;[key: string]: any; };

// Super Admin only permissions - these should NOT be visible to regular users
const SUPER_ADMIN_ONLY_PERMISSION_KEYS = [
    'tenant:create:any',
    'tenant:read:any',
    'tenant:update:any',
    'tenant:delete:any',
    'tenant:manage:admins',
    'user:create:any',
    'system:config:read',
    'system:config:update',
];

/**
 * Get all available permissions.
 * Super admin permissions are filtered out - regular users should not see them.
 */
const getAllPermissions = async (): Promise<Permission[]> => {
    const logContext: LogContext = { function: 'getAllPermissions' };
    try {
        // Permissions are usually static, caching can be very effective here
        // Filter out super admin only permissions - regular users should not see or assign these
        const permissions = await prisma.permission.findMany({
            where: {
                permissionKey: {
                    notIn: SUPER_ADMIN_ONLY_PERMISSION_KEYS
                }
            },
            orderBy: { permissionKey: 'asc' } // Order for consistent display
        });
        logger.debug(`Fetched ${permissions.length} permissions (excluding super admin permissions)`);
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