"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const client_1 = require("@prisma/client"); // Ensure Permission is imported
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
/**
 * Create a new custom role for a tenant, optionally with initial permissions.
 * @param {CreateRoleDto} data - Data for the new role.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<RoleWithPermissions>} The created role object including permissions.
 */
const createRole = async (data, tenantId) => {
    const logContext = { function: 'createRole', tenantId, name: data.name };
    // 1. Check name uniqueness within the tenant
    const existing = await config_1.prisma.role.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
        select: { id: true }
    });
    if (existing) {
        logger_1.default.warn(`Role creation failed: Name exists`, logContext);
        throw new ApiError_1.default(http_status_1.default.CONFLICT, `Role with name "${data.name}" already exists.`);
    }
    // 2. Validate provided permission IDs exist (globally)
    let validPermissionIds = [];
    if (data.permissionIds && data.permissionIds.length > 0) {
        const validPerms = await config_1.prisma.permission.findMany({
            where: { id: { in: data.permissionIds } },
            select: { id: true } // Select only ID
        });
        if (validPerms.length !== data.permissionIds.length) {
            const invalidIds = data.permissionIds.filter(reqId => !validPerms.some(vp => vp.id === reqId));
            logContext.invalidPermissionIds = invalidIds;
            logger_1.default.warn(`Role creation failed: Invalid permission IDs provided: ${invalidIds.join(', ')}`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `One or more provided permission IDs are invalid: ${invalidIds.join(', ')}`);
        }
        validPermissionIds = validPerms.map(p => p.id); // Use the validated IDs
    }
    // 3. Create Role and connect initial permissions
    try {
        const newRole = await config_1.prisma.role.create({
            data: {
                tenantId,
                name: data.name,
                description: data.description,
                isSystemRole: false, // API always creates custom roles
                // Connect permissions using the RolePermission join table structure
                permissions: validPermissionIds.length > 0 ? {
                    create: validPermissionIds.map(permissionId => ({
                        permission: { connect: { id: permissionId } }
                    }))
                } : undefined, // Connect only if valid permissionIds were provided
            },
            include: {
                permissions: { include: { permission: true }, orderBy: { permission: { permissionKey: 'asc' } } }
            }
        });
        logContext.roleId = newRole.id;
        logContext.initialPermissions = validPermissionIds;
        logger_1.default.info(`Role created successfully`, logContext);
        return newRole; // Cast to ensure correct type
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error creating role`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Role name conflict during creation.`);
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to create role.');
    }
};
/**
 * Query roles for a tenant. Includes permissions.
 */
const queryRoles = async (filter, orderBy, limit, page) => {
    const skip = (page - 1) * limit;
    const tenantIdForLog = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext = { function: 'queryRoles', tenantId: tenantIdForLog, limit, page };
    if (!tenantIdForLog) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Tenant context missing.');
    }
    try {
        const [roles, totalResults] = await config_1.prisma.$transaction([
            config_1.prisma.role.findMany({
                where: filter,
                // Include permissions, sorted for consistency
                include: { permissions: { include: { permission: true }, orderBy: { permission: { permissionKey: 'asc' } } } },
                orderBy, skip, take: limit
            }),
            config_1.prisma.role.count({ where: filter }),
        ]);
        logger_1.default.debug(`Role query successful, found ${roles.length} of ${totalResults}`, logContext);
        return { roles: roles, totalResults };
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error querying roles`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve roles.');
    }
};
/**
 * Get role by ID, ensuring tenant isolation. Includes permissions.
 */
const getRoleById = async (roleId, tenantId) => {
    const logContext = { function: 'getRoleById', roleId, tenantId };
    try {
        const role = await config_1.prisma.role.findFirst({
            where: { id: roleId, tenantId },
            // Include permissions, sorted for consistency
            include: { permissions: { include: { permission: true }, orderBy: { permission: { permissionKey: 'asc' } } } }
        });
        if (!role) {
            logger_1.default.warn(`Role not found or tenant mismatch`, logContext);
            return null;
        }
        logger_1.default.debug(`Role found successfully`, logContext);
        return role;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error fetching role by ID`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to retrieve role.');
    }
};
/**
 * Update a custom role's name or description by ID.
 * Permission assignments are handled by separate dedicated functions.
 * @param {string} roleId - The ID of the role to update.
 * @param {UpdateRoleDto} updateData - Data containing name and/or description.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<RoleWithPermissions>} The updated role object including its current permissions.
 */
const updateRoleById = async (roleId, updateData, tenantId) => {
    const logContext = { function: 'updateRoleById', roleId, tenantId, data: updateData };
    // 1. Fetch existing role, ensure it exists and is not a system role
    const existing = await config_1.prisma.role.findFirst({ where: { id: roleId, tenantId } }); // Fetch full role for return if no update happens
    if (!existing) {
        logger_1.default.warn(`Update failed: Role not found`, logContext);
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Role not found.');
    }
    if (existing.isSystemRole) {
        logger_1.default.warn(`Update failed: Attempted to modify system role`, logContext);
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Cannot modify system roles.');
    }
    // 2. Check name uniqueness if changing name
    if (updateData.name && updateData.name !== existing.name) {
        const nameExists = await config_1.prisma.role.findFirst({ where: { name: updateData.name, tenantId, id: { not: roleId } }, select: { id: true } });
        if (nameExists) {
            logger_1.default.warn(`Update failed: Name already exists`, logContext);
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Role name "${updateData.name}" already exists.`);
        }
    }
    // 3. Prepare update payload for basic fields only
    const dataToUpdate = {};
    if (updateData.name !== undefined)
        dataToUpdate.name = updateData.name;
    if (updateData.description !== undefined)
        dataToUpdate.description = updateData.description;
    // 4. Check if anything needs updating
    if (Object.keys(dataToUpdate).length === 0) {
        logger_1.default.info(`Role update skipped: No name/description changes provided`, logContext);
        // Re-fetch with permissions for consistent return type
        return getRoleById(roleId, tenantId).then(role => {
            if (!role)
                throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Role disappeared unexpectedly.');
            return role;
        });
    }
    // 5. Perform Update (only name/description)
    try {
        const updatedRole = await config_1.prisma.role.update({
            where: { id: roleId }, // Tenant verified by initial fetch
            data: dataToUpdate,
            include: { permissions: { include: { permission: true }, orderBy: { permission: { permissionKey: 'asc' } } } } // Include permissions for response
        });
        logger_1.default.info(`Role basic info updated successfully`, logContext);
        // Invalidate role cache if implemented
        return updatedRole;
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error updating role`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError_1.default(http_status_1.default.CONFLICT, `Role name conflict during update.`);
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Role not found during update attempt.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to update role.');
    }
};
/**
 * Assign a single permission to a specific role.
 * Idempotent: Does nothing if the assignment already exists.
 * @param {string} roleId - The ID of the role.
 * @param {string} permissionId - The ID of the permission to assign.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<void>}
 */
const assignPermissionToRole = async (roleId, permissionId, tenantId) => {
    const logContext = { function: 'assignPermissionToRole', roleId, permissionId, tenantId };
    try {
        await config_1.prisma.$transaction(async (tx) => {
            // 1. Verify role exists, belongs to tenant, and is not system role
            const role = await tx.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true, isSystemRole: true } });
            if (!role)
                throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Role not found.');
            if (role.isSystemRole)
                throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Cannot assign permissions to system roles.');
            // 2. Verify permission exists (globally)
            const permissionExists = await tx.permission.count({ where: { id: permissionId } });
            if (!permissionExists)
                throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Permission not found.');
            // 3. Create the assignment (upsert handles existing gracefully)
            await tx.rolePermission.upsert({
                where: { roleId_permissionId: { roleId, permissionId } }, // Unique constraint on join table
                create: { roleId, permissionId },
                update: {}, // No fields to update on the join table itself
            });
        });
        logger_1.default.info(`Permission ${permissionId} assigned successfully to role ${roleId}`, logContext);
        // Invalidate role cache if implemented
    }
    catch (error) {
        if (error instanceof ApiError_1.default)
            throw error; // Re-throw known validation errors
        logContext.error = error;
        logger_1.default.error(`Error assigning permission to role`, logContext);
        // Handle potential DB errors (e.g., foreign key constraint if ID was wrong despite checks)
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to assign permission.');
    }
};
/**
 * Remove a single permission from a specific role.
 * Idempotent: Does nothing if the assignment doesn't exist.
 * @param {string} roleId - The ID of the role.
 * @param {string} permissionId - The ID of the permission to remove.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<void>}
 */
const removePermissionFromRole = async (roleId, permissionId, tenantId) => {
    const logContext = { function: 'removePermissionFromRole', roleId, permissionId, tenantId };
    // Optional: Verify role exists and isn't system role first
    const role = await config_1.prisma.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true, isSystemRole: true } });
    if (!role) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Role not found.');
    }
    if (role.isSystemRole) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Cannot remove permissions from system roles.');
    }
    // Permission existence check isn't strictly necessary for deleteMany
    try {
        // Delete the specific assignment if it exists
        const deleteResult = await config_1.prisma.rolePermission.deleteMany({
            where: { roleId: roleId, permissionId: permissionId } // Target specific assignment
        });
        if (deleteResult.count === 0) {
            logger_1.default.warn(`Permission assignment not found for role ${roleId} and permission ${permissionId}. No action taken.`, logContext);
            // Don't throw error, operation is idempotent
        }
        else {
            logger_1.default.info(`Permission ${permissionId} removed successfully from role ${roleId}`, logContext);
        }
        // Invalidate role cache if implemented
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error removing permission from role`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to remove permission.');
    }
};
/**
 * Delete a custom role by ID. Cannot delete system roles or roles in use.
 */
const deleteRoleById = async (roleId, tenantId) => {
    const logContext = { function: 'deleteRoleById', roleId, tenantId };
    // 1. Verify role exists, is not system role
    const role = await config_1.prisma.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true, isSystemRole: true } });
    if (!role) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Role not found.');
    }
    if (role.isSystemRole) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Cannot delete system roles.');
    }
    // 2. Check if role is assigned to any users
    const userCount = await config_1.prisma.userRole.count({ where: { roleId: roleId } });
    if (userCount > 0) {
        logger_1.default.warn(`Delete failed: Role assigned to ${userCount} users`, logContext);
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Cannot delete role assigned to ${userCount} user(s). Unassign users first.`);
    }
    // 3. Perform delete (will cascade delete RolePermission entries via schema relations)
    try {
        // Deleting the role automatically deletes related RolePermission entries due to the relation definition
        await config_1.prisma.role.delete({ where: { id: roleId } }); // Tenant verified above
        logger_1.default.info(`Role deleted successfully`, logContext);
        // Invalidate cache
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error deleting role`, logContext);
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Role not found during delete attempt.');
        }
        // Catch foreign key constraints if dependency checks missed something (shouldn't happen for UserRole if check passed)
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            logger_1.default.warn(`Delete failed: Foreign key constraint violation (unexpected)`, logContext);
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Cannot delete role due to unexpected existing references.');
        }
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to delete role.');
    }
};
// --- NEW: Batch Permission Assignment Functions ---
/**
 * Assigns multiple permissions to a specific role.
 * Skips permissions that are already assigned.
 * Validates that all provided permission IDs exist.
 * @param {string} roleId - The ID of the role.
 * @param {string[]} permissionIds - An array of permission IDs to assign.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<void>}
 */
const addPermissionsToRole = async (roleId, permissionIds, tenantId) => {
    const logContext = { function: 'addPermissionsToRole', roleId, permissionIds, tenantId };
    if (!permissionIds || permissionIds.length === 0) {
        logger_1.default.info(`No permission IDs provided to add to role ${roleId}`, logContext);
        return; // Nothing to do
    }
    try {
        await config_1.prisma.$transaction(async (tx) => {
            // 1. Verify role exists, belongs to tenant, and is not system role
            const role = await tx.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true, isSystemRole: true } });
            if (!role)
                throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Role not found.');
            if (role.isSystemRole)
                throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Cannot assign permissions to system roles.');
            // 2. Verify all provided permission IDs exist
            const validPerms = await tx.permission.findMany({
                where: { id: { in: permissionIds } },
                select: { id: true }
            });
            if (validPerms.length !== permissionIds.length) {
                const invalidIds = permissionIds.filter(reqId => !validPerms.some(vp => vp.id === reqId));
                throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Invalid permission ID(s) provided: ${invalidIds.join(', ')}`);
            }
            // 3. Find permissions already assigned to this role to avoid conflicts/redundancy
            const existingAssignments = await tx.rolePermission.findMany({
                where: { roleId: roleId, permissionId: { in: permissionIds } },
                select: { permissionId: true }
            });
            const existingPermissionIds = new Set(existingAssignments.map(p => p.permissionId));
            // 4. Determine which permissions are actually new
            const permissionsToCreate = permissionIds
                .filter(id => !existingPermissionIds.has(id))
                .map(permissionId => ({ roleId, permissionId })); // Prepare data for createMany
            // 5. Create only the new assignments
            if (permissionsToCreate.length > 0) {
                await tx.rolePermission.createMany({
                    data: permissionsToCreate
                });
                logger_1.default.info(`Assigned ${permissionsToCreate.length} new permissions to role ${roleId}`, logContext);
            }
            else {
                logger_1.default.info(`No new permissions to assign to role ${roleId} (all provided permissions already assigned)`, logContext);
            }
        });
    }
    catch (error) {
        if (error instanceof ApiError_1.default)
            throw error;
        logContext.error = error;
        logger_1.default.error(`Error assigning permissions to role`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to assign permissions.');
    }
};
/**
 * Removes multiple permissions from a specific role.
 * Ignores permission IDs that are not currently assigned.
 * @param {string} roleId - The ID of the role.
 * @param {string[]} permissionIds - An array of permission IDs to remove.
 * @param {string} tenantId - The tenant ID.
 * @returns {Promise<void>}
 */
const removePermissionsFromRole = async (roleId, permissionIds, tenantId) => {
    const logContext = { function: 'removePermissionsFromRole', roleId, permissionIds, tenantId };
    if (!permissionIds || permissionIds.length === 0) {
        logger_1.default.info(`No permission IDs provided to remove from role ${roleId}`, logContext);
        return; // Nothing to do
    }
    // Optional: Verify role exists and isn't system role first
    const role = await config_1.prisma.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true, isSystemRole: true } });
    if (!role) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Role not found.');
    }
    if (role.isSystemRole) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Cannot remove permissions from system roles.');
    }
    try {
        // Delete assignments matching the role ID and any of the provided permission IDs
        const deleteResult = await config_1.prisma.rolePermission.deleteMany({
            where: {
                roleId: roleId,
                permissionId: { in: permissionIds } // Target specific assignments
            }
        });
        logger_1.default.info(`Attempted to remove ${permissionIds.length} permissions from role ${roleId}. Removed ${deleteResult.count} assignments.`, logContext);
        // Invalidate role cache if implemented
    }
    catch (error) {
        logContext.error = error;
        logger_1.default.error(`Error removing permissions from role`, logContext);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to remove permissions.');
    }
};
// Export all public service methods including new ones
exports.roleService = {
    createRole,
    queryRoles,
    getRoleById,
    updateRoleById, // Only updates name/description
    deleteRoleById,
    assignPermissionToRole, // Keep single assignment
    removePermissionFromRole, // Keep single removal
    addPermissionsToRole, // New batch add
    removePermissionsFromRole, // New batch remove
};
// // Export all public service methods
// export const roleService = {
//     createRole,
//     queryRoles,
//     getRoleById,
//     updateRoleById,
//     deleteRoleById,
//     assignPermissionToRole,
//     removePermissionFromRole
// };
// // src/modules/roles/role.service.ts
// import httpStatus from 'http-status';
// import { Prisma, Role, Permission } from '@prisma/client';
// import { prisma } from '@/config';
// import ApiError from '@/utils/ApiError';
// import logger from '@/utils/logger';
// import { CreateRoleDto } from './dto/create-role.dto';
// import { UpdateRoleDto } from './dto/update-role.dto';
// type LogContext = { function?: string; tenantId?: string | null; roleId?: string | null; data?: any; error?: any; [key: string]: any; };
// // Type for Role with Permissions included
// export type RoleWithPermissions = Role & { permissions: ({ permission: Permission })[] };
// /**
//  * Create a new custom role for a tenant.
//  */
// const createRole = async (data: CreateRoleDto, tenantId: string): Promise<RoleWithPermissions> => {
//     const logContext: LogContext = { function: 'createRole', tenantId, name: data.name };
//     // 1. Check name uniqueness
//     const existing = await prisma.role.findUnique({ where: { tenantId_name: { tenantId, name: data.name } }, select: { id: true } });
//     if (existing) {
//         logger.warn(`Role creation failed: Name exists`, logContext);
//         throw new ApiError(httpStatus.CONFLICT, `Role with name "${data.name}" already exists.`);
//     }
//     // 2. Validate permission IDs exist (optional but good practice)
//     if (data.permissionIds && data.permissionIds.length > 0) {
//         const validPermsCount = await prisma.permission.count({ where: { id: { in: data.permissionIds } } });
//         if (validPermsCount !== data.permissionIds.length) {
//              logger.warn(`Role creation failed: Invalid permission IDs provided`, logContext);
//              throw new ApiError(httpStatus.BAD_REQUEST, 'One or more provided permission IDs are invalid.');
//         }
//     }
//     // 3. Create Role and connect permissions within transaction
//     try {
//         const newRole = await prisma.role.create({
//             data: {
//                 tenantId,
//                 name: data.name,
//                 description: data.description,
//                 isSystemRole: false, // API only creates custom roles
//                 // Connect permissions using the RolePermission join table structure
//                 permissions: data.permissionIds ? {
//                     create: data.permissionIds.map(permissionId => ({
//                         permission: { connect: { id: permissionId } }
//                     }))
//                 } : undefined, // Connect only if permissionIds are provided
//             },
//             include: { // Include permissions in the response
//                  permissions: { include: { permission: true }}
//             }
//         });
//         logContext.roleId = newRole.id;
//         logger.info(`Role created successfully`, logContext);
//         return newRole as RoleWithPermissions; // Cast to ensure correct type
//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error creating role`, logContext);
//          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
//              throw new ApiError(httpStatus.CONFLICT, `Role name conflict during creation.`);
//          }
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create role.');
//     }
// };
// /**
//  * Query roles for a tenant.
//  */
// const queryRoles = async (filter: Prisma.RoleWhereInput, orderBy: Prisma.RoleOrderByWithRelationInput[], limit: number, page: number): Promise<{ roles: RoleWithPermissions[], totalResults: number }> => {
//     const skip = (page - 1) * limit;
//     const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
//     const logContext: LogContext = { function: 'queryRoles', tenantId: tenantIdForLog, limit, page };
//     if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }
//     try {
//         const [roles, totalResults] = await prisma.$transaction([
//             prisma.role.findMany({
//                 where: filter,
//                 include: { permissions: { include: { permission: true }} }, // Include permissions
//                 orderBy, skip, take: limit
//             }),
//             prisma.role.count({ where: filter }),
//         ]);
//         logger.debug(`Role query successful, found ${roles.length} of ${totalResults}`, logContext);
//         return { roles: roles as RoleWithPermissions[], totalResults };
//     } catch (error: any) {
//          logContext.error = error;
//          logger.error(`Error querying roles`, logContext);
//          throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve roles.');
//     }
// };
// /**
//  * Get role by ID, ensuring tenant isolation.
//  */
// const getRoleById = async (roleId: string, tenantId: string): Promise<RoleWithPermissions | null> => {
//     const logContext: LogContext = { function: 'getRoleById', roleId, tenantId };
//     try {
//         const role = await prisma.role.findFirst({
//             where: { id: roleId, tenantId },
//             include: { permissions: { include: { permission: true }, orderBy: { permission: { permissionKey: 'asc' }} }} // Include permissions sorted
//         });
//         if (!role) { logger.warn(`Role not found or tenant mismatch`, logContext); return null; }
//         logger.debug(`Role found successfully`, logContext);
//         return role as RoleWithPermissions;
//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error fetching role by ID`, logContext);
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve role.');
//     }
// };
// /**
//  * Update a custom role by ID. Cannot update system roles.
//  */
// const updateRoleById = async (roleId: string, updateData: UpdateRoleDto, tenantId: string): Promise<RoleWithPermissions> => {
//      const logContext: LogContext = { function: 'updateRoleById', roleId, tenantId, data: updateData };
//     // 1. Fetch existing role, ensure it exists and is not a system role
//     const existing = await prisma.role.findFirst({ where: { id: roleId, tenantId }});
//     if (!existing) { throw new ApiError(httpStatus.NOT_FOUND, 'Role not found.'); }
//     if (existing.isSystemRole) { throw new ApiError(httpStatus.FORBIDDEN, 'Cannot modify system roles.'); }
//     // 2. Check name uniqueness if changing name
//     if (updateData.name && updateData.name !== existing.name) {
//         const nameExists = await prisma.role.findFirst({ where: { name: updateData.name, tenantId, id: { not: roleId } }, select: { id: true } });
//         if (nameExists) { throw new ApiError(httpStatus.CONFLICT, `Role name "${updateData.name}" already exists.`); }
//     }
//     // 3. Validate permission IDs if provided
//     if (updateData.permissionIds) {
//          if (updateData.permissionIds.length > 0) {
//              const validPermsCount = await prisma.permission.count({ where: { id: { in: updateData.permissionIds } } });
//              if (validPermsCount !== updateData.permissionIds.length) {
//                  throw new ApiError(httpStatus.BAD_REQUEST, 'One or more provided permission IDs are invalid.');
//              }
//          } else {
//              // If an empty array is provided, it means remove all permissions
//               logger.debug(`Request to remove all permissions from role ${roleId}`, logContext);
//          }
//     }
//     // 4. Prepare update payload
//     const dataToUpdate: Prisma.RoleUpdateInput = {};
//     if (updateData.name !== undefined) dataToUpdate.name = updateData.name;
//     if (updateData.description !== undefined) dataToUpdate.description = updateData.description;
//     // 5. Update Role and Permissions within a transaction
//     try {
//         const updatedRole = await prisma.$transaction(async (tx) => {
//             // Update basic role info
//             const roleUpdatePromise = tx.role.update({
//                 where: { id: roleId },
//                 data: dataToUpdate,
//                  include: { permissions: { include: { permission: true }} } // Include for final return
//             });
//             // If permissionIds provided, update the RolePermission join table
//             if (updateData.permissionIds !== undefined) {
//                 // Delete existing permissions for this role first
//                 await tx.rolePermission.deleteMany({ where: { roleId: roleId } });
//                 // Add new permissions if the array is not empty
//                 if (updateData.permissionIds.length > 0) {
//                     await tx.rolePermission.createMany({
//                          data: updateData.permissionIds.map(permissionId => ({
//                              roleId: roleId,
//                              permissionId: permissionId,
//                          }))
//                      });
//                 }
//                 logContext.permissionsUpdated = updateData.permissionIds;
//             }
//             return await roleUpdatePromise; // Return the result of the role update
//         });
//         logger.info(`Role updated successfully`, logContext);
//         // Invalidate role cache if implemented
//         return updatedRole as RoleWithPermissions;
//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error updating role`, logContext);
//          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
//              throw new ApiError(httpStatus.CONFLICT, `Role name conflict during update.`);
//          }
//          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
//              throw new ApiError(httpStatus.NOT_FOUND, 'Role not found during update attempt.');
//          }
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update role.');
//     }
// };
// /**
//  * Delete a custom role by ID. Cannot delete system roles or roles in use.
//  */
// const deleteRoleById = async (roleId: string, tenantId: string): Promise<void> => {
//     const logContext: LogContext = { function: 'deleteRoleById', roleId, tenantId };
//     // 1. Verify role exists, is not system role
//     const role = await prisma.role.findFirst({ where: { id: roleId, tenantId }, select: { id: true, isSystemRole: true }});
//     if (!role) { throw new ApiError(httpStatus.NOT_FOUND, 'Role not found.'); }
//     if (role.isSystemRole) { throw new ApiError(httpStatus.FORBIDDEN, 'Cannot delete system roles.'); }
//     // 2. Check if role is assigned to any users
//     const userCount = await prisma.userRole.count({ where: { roleId: roleId } });
//     if (userCount > 0) {
//         logger.warn(`Delete failed: Role assigned to ${userCount} users`, logContext);
//         throw new ApiError(httpStatus.BAD_REQUEST, `Cannot delete role assigned to ${userCount} user(s). Unassign users first.`);
//     }
//     // 3. Perform delete (will cascade delete RolePermission entries)
//     try {
//         await prisma.role.delete({ where: { id: roleId } }); // Tenant verified above
//         logger.info(`Role deleted successfully`, logContext);
//         // Invalidate cache
//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error deleting role`, logContext);
//          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
//              throw new ApiError(httpStatus.NOT_FOUND, 'Role not found during delete attempt.');
//          }
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete role.');
//     }
// };
// export const roleService = {
//     createRole,
//     queryRoles,
//     getRoleById,
//     updateRoleById,
//     deleteRoleById,
// };
//# sourceMappingURL=role.service.js.map