// src/modules/roles/role.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { roleService } from './role.service'; // Assuming roleService now has new methods
import catchAsync from '@/utils/catchAsync';
import ApiError from '@/utils/ApiError';
import pick from '@/utils/pick';
import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
import { Prisma } from '@prisma/client';
import { BatchPermissionsDto } from './dto/batch-permissions.dto'; 
// Import DTOs needed for validation middleware in routes
// import { CreateRoleDto, UpdateRoleDto, AssignPermissionDto } from './dto'; // Not strictly needed here, but shows context

/** Controller to create a role */
const createRole = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // req.body is validated CreateRoleDto by middleware
    const role = await roleService.createRole(req.body, tenantId);
    res.status(httpStatus.CREATED).send(role);
});

/** Controller to get roles */
const getRoles = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const filterParams = pick(req.query, ['name', 'isSystemRole']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    const filter: Prisma.RoleWhereInput = { tenantId };
    if (filterParams.name) filter.name = { contains: filterParams.name as string, mode: 'insensitive' };
    if (filterParams.isSystemRole !== undefined) filter.isSystemRole = filterParams.isSystemRole === 'true';

    const orderBy: Prisma.RoleOrderByWithRelationInput[] = [];
     if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['name', 'createdAt', 'isSystemRole'].includes(key)) { orderBy.push({ [key]: order }); }
            }
        });
    }
    if (orderBy.length === 0) { orderBy.push({ isSystemRole: 'desc' }, { name: 'asc' }); } // Show system roles first

    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    const result = await roleService.queryRoles(filter, orderBy, limit, page);
    res.status(httpStatus.OK).send({
        results: result.roles,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});


/** Controller to get roles without linked data(without permissions) */



const getRolesWithOutPermissions = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const filterParams = pick(req.query, ['name', 'isSystemRole']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);

    const filter: Prisma.RoleWhereInput = { tenantId };
    if (filterParams.name) filter.name = { contains: filterParams.name as string, mode: 'insensitive' };
    if (filterParams.isSystemRole !== undefined) filter.isSystemRole = filterParams.isSystemRole === 'true';

    const orderBy: Prisma.RoleOrderByWithRelationInput[] = [];
     if (options.sortBy) {
        (options.sortBy as string).split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['name', 'createdAt', 'isSystemRole'].includes(key)) { orderBy.push({ [key]: order }); }
            }
        });
    }
    if (orderBy.length === 0) { orderBy.push({ isSystemRole: 'desc' }, { name: 'asc' }); } // Show system roles first

    const limit = parseInt(options.limit as string) || 10;
    const page = parseInt(options.page as string) || 1;

    const result = await roleService.queryRolesWithOutLinkedData(filter, orderBy, limit, page);
    res.status(httpStatus.OK).send({
        results: result.roles,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});



/** Controller to get a single role */
const getRole = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const role = await roleService.getRoleById(req.params.roleId, tenantId);
    if (!role) { throw new ApiError(httpStatus.NOT_FOUND, 'Role not found'); }
    res.status(httpStatus.OK).send(role);
});

/** Controller to update basic role info (name/description) */
const updateRole = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    // req.body is validated UpdateRoleDto (without permissionIds) by middleware
    const role = await roleService.updateRoleById(req.params.roleId, req.body, tenantId);
    res.status(httpStatus.OK).send(role);
});

/** Controller to delete a role */
const deleteRole = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    await roleService.deleteRoleById(req.params.roleId, tenantId);
    res.status(httpStatus.NO_CONTENT).send();
});


// --- NEW: Permission Assignment Controllers ---

/** Controller to assign a permission to a role */
const assignPermission = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const { roleId } = req.params;
    // req.body is validated AssignPermissionDto by middleware
    const { permissionId } = req.body; // Extract from validated body

    // Permission check handled by middleware ('role:update')

    await roleService.assignPermissionToRole(roleId, permissionId, tenantId);
    res.status(httpStatus.OK).send({ message: 'Permission assigned successfully.' });
});

/** Controller to remove a permission from a role */
const removePermission = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const { roleId, permissionId } = req.params; // Get permissionId from URL parameter now

    // Permission check handled by middleware ('role:update')

    await roleService.removePermissionFromRole(roleId, permissionId, tenantId);
    res.status(httpStatus.NO_CONTENT).send(); // 204 No Content
});


/** Controller to assign multiple permissions to a role */
const addPermissions = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const { roleId } = req.params;
    // req.body is validated BatchPermissionsDto by middleware
    const { permissionIds } = req.body as BatchPermissionsDto;

    await roleService.addPermissionsToRole(roleId, permissionIds, tenantId);
    res.status(httpStatus.OK).send({ message: 'Permissions added successfully.' });
});

/** Controller to remove multiple permissions from a role */
const removePermissions = catchAsync(async (req: Request, res: Response) => {
    const tenantId = getTenantIdFromRequest(req);
    const { roleId } = req.params;
     // req.body is validated BatchPermissionsDto by middleware
     const { permissionIds } = req.body as BatchPermissionsDto;

    await roleService.removePermissionsFromRole(roleId, permissionIds, tenantId);
    res.status(httpStatus.OK).send({ message: 'Permissions removed successfully.' }); // Use 200 OK as it's idempotent potentially
});


export const roleController = {
    createRole,
    getRoles,
    getRole,
    updateRole,
    deleteRole,
    assignPermission, // Keep single assign
    removePermission, // Keep single remove
    addPermissions,   // New batch add
    removePermissions,// New batch remove
    getRolesWithOutPermissions,
};

// // Export all controller methods including the new ones
// export const roleController = {
//     createRole,
//     getRoles,
//     getRole,
//     updateRole, // Only updates name/description
//     deleteRole,
//     assignPermission, // New handler
//     removePermission, // New handler
// };



















// // src/modules/roles/role.controller.ts
// import { Request, Response } from 'express';
// import httpStatus from 'http-status';
// import { roleService } from './role.service';
// import catchAsync from '@/utils/catchAsync';
// import ApiError from '@/utils/ApiError';
// import pick from '@/utils/pick';
// import { getTenantIdFromRequest } from '@/middleware/tenant.middleware';
// import { Prisma } from '@prisma/client';

// /** Controller to create a role */
// const createRole = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     // req.body is validated CreateRoleDto
//     const role = await roleService.createRole(req.body, tenantId);
//     res.status(httpStatus.CREATED).send(role);
// });

// /** Controller to get roles */
// const getRoles = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const filterParams = pick(req.query, ['name', 'isSystemRole']);
//     const options = pick(req.query, ['sortBy', 'limit', 'page']);

//     const filter: Prisma.RoleWhereInput = { tenantId };
//     if (filterParams.name) filter.name = { contains: filterParams.name as string, mode: 'insensitive' };
//     if (filterParams.isSystemRole !== undefined) filter.isSystemRole = filterParams.isSystemRole === 'true';

//     const orderBy: Prisma.RoleOrderByWithRelationInput[] = [];
//      if (options.sortBy) {
//         const [key, order] = (options.sortBy as string).split(':');
//         if (key && (order === 'asc' || order === 'desc')) {
//             if (['name', 'createdAt', 'isSystemRole'].includes(key)) { orderBy.push({ [key]: order }); }
//         }
//     }
//     if (orderBy.length === 0) { orderBy.push({ isSystemRole: 'desc' }, { name: 'asc' }); } // Show system roles first

//     const limit = parseInt(options.limit as string) || 10;
//     const page = parseInt(options.page as string) || 1;

//     const result = await roleService.queryRoles(filter, orderBy, limit, page);
//     res.status(httpStatus.OK).send({
//         results: result.roles,
//         page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
//     });
// });

// /** Controller to get a single role */
// const getRole = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const role = await roleService.getRoleById(req.params.roleId, tenantId);
//     if (!role) { throw new ApiError(httpStatus.NOT_FOUND, 'Role not found'); }
//     res.status(httpStatus.OK).send(role);
// });

// /** Controller to update a role */
// const updateRole = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     // req.body is validated UpdateRoleDto
//     const role = await roleService.updateRoleById(req.params.roleId, req.body, tenantId);
//     res.status(httpStatus.OK).send(role);
// });

// /** Controller to delete a role */
// const deleteRole = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     await roleService.deleteRoleById(req.params.roleId, tenantId);
//     res.status(httpStatus.NO_CONTENT).send();
// });

// export const roleController = {
//     createRole,
//     getRoles,
//     getRole,
//     updateRole,
//     deleteRole,
// };