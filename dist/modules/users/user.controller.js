"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const user_service_1 = require("./user.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick")); // For filtering/pagination query params
const tenant_middleware_1 = require("@/middleware/tenant.middleware"); // Helper to get tenantId
/**
 * Controller to handle user creation.
 */
const createUser = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req); // Ensures tenantId is present from auth context
    // req.body is validated CreateUserDto by validateRequest middleware
    const user = await user_service_1.userService.createUser(req.body, tenantId);
    // Send back the newly created user (without password hash)
    res.status(http_status_1.default.CREATED).send(user);
});
/**
 * Controller to handle querying multiple users with filters and pagination.
 */
const getUsers = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Define allowed filters from query parameters
    const filterParams = (0, pick_1.default)(req.query, [
        'firstName', 'lastName', 'name', 'email', 'phoneNumber', 'isActive', 'roleId'
    ]);
    // Define allowed options for sorting and pagination
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    // Build Prisma WhereInput object, always including the tenantId
    const filter = { tenantId }; // Automatically scope by tenant
    if (filterParams.firstName)
        filter.firstName = { contains: filterParams.firstName, mode: 'insensitive' };
    if (filterParams.lastName)
        filter.lastName = { contains: filterParams.lastName, mode: 'insensitive' };
    if (filterParams.email)
        filter.email = { contains: filterParams.email, mode: 'insensitive' };
    if (filterParams.phoneNumber)
        filter.phoneNumber = { contains: filterParams.phoneNumber }; // Adjust mode if needed
    if (filterParams.isActive !== undefined)
        filter.isActive = filterParams.isActive === 'true';
    // Combined name search
    if (filterParams.name) {
        const name = filterParams.name;
        filter.OR = [
            { firstName: { contains: name, mode: 'insensitive' } },
            { lastName: { contains: name, mode: 'insensitive' } },
        ];
    }
    // Filter by Role ID (users having this role)
    if (filterParams.roleId) {
        filter.roles = {
            some: { roleId: filterParams.roleId },
        };
    }
    // Build Prisma OrderBy array
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['email', 'firstName', 'lastName', 'createdAt', 'updatedAt', 'isActive'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ firstName: 'asc' }, { lastName: 'asc' }); // Default sort
    }
    // Parse pagination options
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    // Call the service with constructed filters and options
    const result = await user_service_1.userService.queryUsers(filter, orderBy, limit, page);
    // Format and send the paginated response
    res.status(http_status_1.default.OK).send({
        results: result.users,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.totalResults / limit),
        totalResults: result.totalResults,
    });
});
/**
 * Controller to handle fetching a single user by ID.
 */
const getUser = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req); // Tenant scope from auth
    const userId = req.params.userId; // User ID from URL parameter
    // Permission check examples (RBAC middleware should handle basic 'user:read:any'/'user:read:own')
    const requestingUser = req.user;
    if (!requestingUser)
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, "Not authenticated");
    // Basic check if trying to access own profile (even without specific 'own' permission)
    // RBAC middleware should grant access if user has 'user:read:any' OR (is accessing own profile AND has 'user:read:own')
    // if (requestingUser.id !== userId && !requestingUser.effectivePermissions.has('user:read:any')) {
    //      throw new ApiError(httpStatus.FORBIDDEN, "Insufficient permissions to view this user");
    // }
    // if (requestingUser.id === userId && !requestingUser.effectivePermissions.has('user:read:own') && !requestingUser.effectivePermissions.has('user:read:any')) {
    //     throw new ApiError(httpStatus.FORBIDDEN, "Insufficient permissions to view own profile");
    // }
    const user = await user_service_1.userService.getUserById(userId, tenantId);
    if (!user) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    res.status(http_status_1.default.OK).send(user);
});
/**
 * Controller to handle updating basic user info (excluding roles) by ID.
 */
const updateUser = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const userId = req.params.userId; // Target user ID
    // req.body is validated UpdateUserDto (which no longer contains roleIds) by middleware
    // --- Permission Checks (Example) ---
    const requestingUser = req.user;
    if (!requestingUser)
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, "Not authenticated");
    // Check if authorized to update the target user
    if (requestingUser.id !== userId && !requestingUser.effectivePermissions.has('user:update:any')) {
        // If not updating self, need 'user:update:any' permission
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, "Insufficient permissions to update this user");
    }
    if (requestingUser.id === userId && !requestingUser.effectivePermissions.has('user:update:own') && !requestingUser.effectivePermissions.has('user:update:any')) {
        // If updating self, need 'user:update:own' OR 'user:update:any'
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, "Insufficient permissions to update own profile");
    }
    // Check if trying to update restricted fields (like isActive)
    if (req.body.isActive !== undefined) {
        // Prevent self-deactivation via this endpoint
        if (requestingUser.id === userId) {
            throw new ApiError_1.default(http_status_1.default.FORBIDDEN, "Cannot change own active status via this endpoint.");
        }
        // Check if user has permission to change activity status for others
        if (!requestingUser.effectivePermissions.has('user:update:activity')) {
            throw new ApiError_1.default(http_status_1.default.FORBIDDEN, "Insufficient permissions to change user active status.");
        }
    }
    // --- End Permission Checks ---
    // Call service with validated data (excluding roles)
    const user = await user_service_1.userService.updateUserById(userId, req.body, tenantId);
    res.status(http_status_1.default.OK).send(user);
});
/**
 * Controller to handle deactivating (soft deleting) a user by ID.
 */
const deleteUser = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const userId = req.params.userId; // Target user ID
    const requestingUser = req.user; // User performing the action
    if (!requestingUser)
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, "Not authenticated");
    // Permission check ('user:delete') handled by middleware in routes
    // Service layer handles self-deletion check
    await user_service_1.userService.deleteUserById(userId, tenantId, requestingUser.id);
    res.status(http_status_1.default.NO_CONTENT).send(); // Send 204 No Content on success
});
// --- NEW: Role Assignment Controllers ---
/**
 * Controller to assign a role to a user.
 */
const assignRole = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const { userId, roleId } = req.params; // Get user and role from URL parameters
    // Permission check ('user:assign:roles') handled by middleware
    await user_service_1.userService.assignRoleToUser(userId, roleId, tenantId);
    res.status(http_status_1.default.OK).send({ message: 'Role assigned successfully.' });
});
/**
 * Controller to remove a role from a user.
 */
const removeRole = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const { userId, roleId } = req.params; // Get user and role from URL parameters
    // Permission check ('user:assign:roles') handled by middleware
    await user_service_1.userService.removeRoleFromUser(userId, roleId, tenantId);
    res.status(http_status_1.default.NO_CONTENT).send(); // 204 No Content on successful removal
});
// Export all controller methods
exports.userController = {
    createUser,
    getUsers,
    getUser,
    updateUser,
    deleteUser,
    assignRole,
    removeRole,
};
// import { Request, Response } from 'express';
// import httpStatus from 'http-status';
// import { userService } from './user.service';
// import catchAsync from '@/utils/catchAsync';
// import ApiError from '@/utils/ApiError';
// import pick from '@/utils/pick'; // Utility for filtering/pagination query params
// import { getTenantIdFromRequest } from '@/middleware/tenant.middleware'; // Helper to get tenantId
// import { Prisma } from '@prisma/client'; // Import Prisma types
// const createUser = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req); // Ensures tenantId is present from auth context
//     // req.body is validated CreateUserDto by validateRequest middleware
//     const user = await userService.createUser(req.body, tenantId);
//     // Send back the newly created user (without password hash)
//     res.status(httpStatus.CREATED).send(user);
// });
// const getUsers = catchAsync(async (req: Request, res: Response) => {
//     // Tenant ID is automatically applied by the service based on the authenticated user's context
//     const tenantId = getTenantIdFromRequest(req);
//     // Define allowed filters from query parameters
//     const filterParams = pick(req.query, [
//         'firstName', 'lastName', 'name', 'email', 'phoneNumber', 'isActive', 'roleId'
//     ]);
//     // Define allowed options for sorting and pagination
//     const options = pick(req.query, ['sortBy', 'limit', 'page']);
//     // Build Prisma WhereInput object, always including the tenantId
//     const filter: Prisma.UserWhereInput = { tenantId }; // Automatically scope by tenant
//     if (filterParams.firstName) filter.firstName = { contains: filterParams.firstName as string, mode: 'insensitive' };
//     if (filterParams.lastName) filter.lastName = { contains: filterParams.lastName as string, mode: 'insensitive' };
//     if (filterParams.email) filter.email = { contains: filterParams.email as string, mode: 'insensitive' };
//     if (filterParams.phoneNumber) filter.phoneNumber = { contains: filterParams.phoneNumber as string }; // Adjust mode if needed
//     if (filterParams.isActive !== undefined) filter.isActive = filterParams.isActive === 'true';
//     // Combined name search
//     if (filterParams.name) {
//         const name = filterParams.name as string;
//         filter.OR = [ // Search in either first OR last name
//             { firstName: { contains: name, mode: 'insensitive' } },
//             { lastName: { contains: name, mode: 'insensitive' } },
//         ];
//     }
//     // Filter by Role ID (users having this role)
//     if (filterParams.roleId) {
//         filter.roles = {
//             some: { roleId: filterParams.roleId as string },
//         };
//     }
//     // Build Prisma OrderBy array
//     const orderBy: Prisma.UserOrderByWithRelationInput[] = [];
//     if (options.sortBy) {
//         (options.sortBy as string).split(',').forEach(sortOption => {
//             const [key, order] = sortOption.split(':');
//             if (key && (order === 'asc' || order === 'desc')) {
//                 if (['email', 'firstName', 'lastName', 'createdAt', 'updatedAt', 'isActive'].includes(key)) {
//                     orderBy.push({ [key]: order });
//                 }
//             }
//         });
//     }
//     if (orderBy.length === 0) {
//         orderBy.push({ firstName: 'asc' }, { lastName: 'asc' }); // Default sort
//     }
//     // Parse pagination options
//     const limit = parseInt(options.limit as string) || 10;
//     const page = parseInt(options.page as string) || 1;
//     // Call the service with constructed filters and options
//     const result = await userService.queryUsers(filter, orderBy, limit, page);
//     // Format and send the paginated response
//     res.status(httpStatus.OK).send({
//         results: result.users,
//         page: page,
//         limit: limit,
//         totalPages: Math.ceil(result.totalResults / limit),
//         totalResults: result.totalResults,
//     });
// });
// const getUser = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req); // Tenant scope from auth
//     const userId = req.params.userId; // User ID from URL parameter
//     // Permission check examples (implement actual RBAC checks via middleware or here)
//     const requestingUser = req.user;
//     if (!requestingUser) throw new ApiError(httpStatus.UNAUTHORIZED, "Not authenticated");
//     // Allow users to get their own profile OR users with 'user:read' permission to get any
//     if (requestingUser.id !== userId && !requestingUser.effectivePermissions.has('user:read')) {
//        // Note: Refined permission check - maybe 'user:read:any' vs 'user:read:own'
//        throw new ApiError(httpStatus.FORBIDDEN, "Insufficient permissions to view this user");
//     }
//     const user = await userService.getUserById(userId, tenantId);
//     if (!user) {
//         throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
//     }
//     res.status(httpStatus.OK).send(user);
// });
// const updateUser = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const userId = req.params.userId;
//     // req.body is validated UpdateUserDto by middleware
//     // Permission check examples
//     const requestingUser = req.user;
//     if (!requestingUser) throw new ApiError(httpStatus.UNAUTHORIZED, "Not authenticated");
//     let updateData = req.body; // Start with validated DTO data
//     // Apply permission logic: Can user update this target user? What fields?
//     if (requestingUser.id !== userId) { // Updating someone else
//        if (!requestingUser.effectivePermissions.has('user:update')) { // Requires general update permission
//            throw new ApiError(httpStatus.FORBIDDEN, "Insufficient permissions to update this user");
//        }
//        // Check if trying to update restricted fields without specific permission
//        if ((updateData.roleIds || updateData.isActive !== undefined) && !requestingUser.effectivePermissions.has('user:manage:roles_activity')) { // Example specific permission
//             throw new ApiError(httpStatus.FORBIDDEN, "Insufficient permissions to update roles or active status.");
//        }
//     } else { // Updating own profile
//         // Ensure user isn't trying to update fields they shouldn't
//         if (updateData.roleIds || updateData.isActive !== undefined) {
//              throw new ApiError(httpStatus.FORBIDDEN, "Cannot update roles or active status for own account via this endpoint.");
//              // Or filter out disallowed fields: delete updateData.roleIds; delete updateData.isActive;
//         }
//     }
//     const user = await userService.updateUserById(userId, updateData, tenantId);
//     res.status(httpStatus.OK).send(user);
// });
// const deleteUser = catchAsync(async (req: Request, res: Response) => {
//     const tenantId = getTenantIdFromRequest(req);
//     const userId = req.params.userId;
//     const requestingUser = req.user; // From auth middleware
//     if (!requestingUser) throw new ApiError(httpStatus.UNAUTHORIZED, "Not authenticated");
//     // Permission check ('user:delete') should be handled by RBAC middleware ideally
//     // Middleware applied in user.routes.ts ensures this check happens first
//     // Service layer handles self-deletion check now
//     await userService.deleteUserById(userId, tenantId, requestingUser.id);
//     res.status(httpStatus.NO_CONTENT).send(); // Send 204 No Content on success
// });
// export const userController = {
//     createUser,
//     getUsers,
//     getUser,
//     updateUser,
//     deleteUser,
// };
//# sourceMappingURL=user.controller.js.map