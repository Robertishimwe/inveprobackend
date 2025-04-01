import bcrypt from 'bcryptjs';
import httpStatus from 'http-status';
import { prisma } from '@/config'; // Import centralized Prisma client
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { User, Prisma, Role } from '@prisma/client'; // Import necessary Prisma types
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Helper type for user response (omitting password) including simplified roles
export type SafeUserWithRoles = Omit<User, 'passwordHash'> & {
    roles: { role: Pick<Role, 'id' | 'name'> }[];
};

// Type for richer user details, perhaps for single user GET
export type SafeUserWithRoleDetails = Omit<User, 'passwordHash'> & {
    roles: { role: Role }[]; // Include full role details
};

// Define log context type if not already defined globally
type LogContext = {
    function?: string;
    email?: string | null;
    userId?: string | null;
    tenantId?: string | null | undefined;
    updateData?: any;
    filter?: any;
    orderBy?: any;
    limit?: number;
    page?: number;
    roleId?: string | null; // Added for role assignment functions
    error?: any;
    [key: string]: any;
};


/**
 * Create a new user within a specific tenant.
 * Handles initial role assignment from DTO.
 * @param {CreateUserDto} userData - Data for the new user.
 * @param {string} tenantId - The ID of the tenant the user belongs to.
 * @returns {Promise<SafeUserWithRoles>} The created user object.
 */
const createUser = async (userData: CreateUserDto, tenantId: string): Promise<SafeUserWithRoles> => {
    const lowerCaseEmail = userData.email.toLowerCase();
    const logContext: LogContext = { function: 'createUser', email: lowerCaseEmail, tenantId };

    // 1. Check email uniqueness within tenant
    const existingUser = await prisma.user.findFirst({
        where: { email: lowerCaseEmail, tenantId: tenantId },
        select: { id: true }
    });
    if (existingUser) {
        logger.warn(`User creation failed: Email already exists`, logContext);
        throw new ApiError(httpStatus.CONFLICT, 'Email address already in use by another user in this tenant.');
    }

    // 2. Check if provided roleIds are valid for the tenant
    let validRoleIds: string[] = [];
    if (userData.roleIds && userData.roleIds.length > 0) {
        const validRoles = await prisma.role.findMany({
            where: { id: { in: userData.roleIds }, tenantId: tenantId },
            select: { id: true }
        });
        if (validRoles.length !== userData.roleIds.length) {
            const invalidIds = userData.roleIds.filter(reqId => !validRoles.some(validRole => validRole.id === reqId));
            logContext.invalidRoleIds = invalidIds;
            logger.warn(`User creation failed: Invalid role ID(s) provided for this tenant`, logContext);
            throw new ApiError(httpStatus.BAD_REQUEST, `Invalid role ID(s) provided: ${invalidIds.join(', ')}`);
        }
        validRoleIds = validRoles.map(r => r.id); // Use validated IDs
    }

    // 3. Hash the password
    const passwordHash = await bcrypt.hash(userData.password, 10);

    // 4. Create the user and connect initial roles
    try {
        const createdUserWithRoles = await prisma.user.create({
            data: {
                tenantId: tenantId,
                email: lowerCaseEmail,
                passwordHash: passwordHash,
                firstName: userData.firstName,
                lastName: userData.lastName,
                phoneNumber: userData.phoneNumber,
                isActive: true, // Default new users to active
                roles: { // Connect initial roles
                    create: validRoleIds.map(roleId => ({
                        role: { connect: { id: roleId } },
                    })),
                },
            },
            select: { // Select consistent with SafeUserWithRoles
                id: true, tenantId: true, email: true, firstName: true, lastName: true,
                phoneNumber: true, isActive: true, createdAt: true, updatedAt: true,
                roles: { select: { role: { select: { id: true, name: true } } } }
            }
        });

        logContext.userId = createdUserWithRoles.id;
        logContext.initialRoles = validRoleIds;
        logger.info(`User created successfully`, logContext);

        return createdUserWithRoles as SafeUserWithRoles;

    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error creating user in database`, logContext);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
             throw new ApiError(httpStatus.CONFLICT, 'Email address already in use.'); // More specific error if constraint is on email
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create user.');
    }
};

/**
 * Query for users within a specific tenant with pagination, filtering, and sorting.
 */
const queryUsers = async (
    filter: Prisma.UserWhereInput,
    orderBy: Prisma.UserOrderByWithRelationInput[],
    limit: number,
    page: number
): Promise<{ users: SafeUserWithRoles[]; totalResults: number }> => {
    const skip = (page - 1) * limit;
    const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;
    const logContext: LogContext = { function: 'queryUsers', filter: '...', orderBy, limit, page, tenantId: tenantIdForLog };
    if (!tenantIdForLog) { throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing.'); }

    try {
        const [users, totalResults] = await prisma.$transaction([
            prisma.user.findMany({
                where: filter,
                select: { // Consistent selection for list view
                    id: true, tenantId: true, email: true, firstName: true, lastName: true,
                    phoneNumber: true, isActive: true, createdAt: true, updatedAt: true,
                    roles: { select: { role: { select: { id: true, name: true } } } }
                },
                orderBy: orderBy, skip: skip, take: limit,
            }),
            prisma.user.count({ where: filter }),
        ]);

        logger.debug(`User query successful, found ${users.length} of ${totalResults} users.`, logContext);
        return { users: users as SafeUserWithRoles[], totalResults };
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error querying users`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve users.');
    }
};

/**
 * Get user by ID, ensuring tenant isolation. Includes full role details.
 */
const getUserById = async (userId: string, tenantId: string): Promise<SafeUserWithRoleDetails | null> => {
    const logContext: LogContext = { function: 'getUserById', userId, tenantId };
    try {
        const user = await prisma.user.findFirst({ // Use findFirst for explicit tenant check
            where: { id: userId, tenantId: tenantId },
            select: { // Select fields, include full Role details here
                id: true, tenantId: true, email: true, firstName: true, lastName: true,
                phoneNumber: true, isActive: true, createdAt: true, updatedAt: true,
                roles: { select: { role: true } } // Get the full Role object
            },
        });

        if (!user) { logger.warn(`User not found or tenant mismatch`, logContext); return null; }
        logger.debug(`User found successfully`, logContext);
        return user as SafeUserWithRoleDetails; // Cast to appropriate safe type
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error fetching user by ID`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve user.');
    }
};


/**
 * Update user details by ID (basic info only).
 * Role assignments are handled by dedicated functions.
 * @param {string} userId - The ID of the user to update.
 * @param {UpdateUserDto} updateData - Data to update (should NOT contain roleIds).
 * @param {string} tenantId - The ID of the tenant making the request.
 * @returns {Promise<SafeUserWithRoles>} The updated user object.
 */
const updateUserById = async (
    userId: string,
    updateData: UpdateUserDto, // Should NOT contain roleIds
    tenantId: string
): Promise<SafeUserWithRoles> => {
    const logContext: LogContext = { function: 'updateUserById', userId, tenantId, updateData: { ...updateData } };

    // 1. Verify user exists within the tenant first
    const existingUserCheck = await prisma.user.count({ where: { id: userId, tenantId: tenantId } });
    if (!existingUserCheck) {
        logger.warn(`Update failed: User not found or tenant mismatch`, logContext);
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
    }

    // 2. Prepare data for update (basic fields only)
    const dataToUpdate: Prisma.UserUpdateInput = {};
    if (updateData.firstName !== undefined) dataToUpdate.firstName = updateData.firstName;
    if (updateData.lastName !== undefined) dataToUpdate.lastName = updateData.lastName;
    if (updateData.phoneNumber !== undefined) dataToUpdate.phoneNumber = updateData.phoneNumber;
    if (updateData.isActive !== undefined) dataToUpdate.isActive = updateData.isActive;

    // 3. Check if there's actually anything to update
    if (Object.keys(dataToUpdate).length === 0) {
         logger.info(`User update skipped: No valid data provided`, logContext);
         // Fetch and return current user data safely
         const currentUser = await getUserById(userId, tenantId); // Ensure this includes roles
         if (!currentUser) throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
         return currentUser as SafeUserWithRoles; // Adjust cast if needed
    }

    // 4. Perform the update
    try {
        const updatedUser = await prisma.user.update({
            where: { id: userId }, // Tenant verified by initial check
            data: dataToUpdate,
            select: { // Select consistent with SafeUserWithRoles
                id: true, tenantId: true, email: true, firstName: true, lastName: true,
                phoneNumber: true, isActive: true, createdAt: true, updatedAt: true,
                roles: { select: { role: { select: { id: true, name: true } } } }
            },
        });

        logger.info(`User updated successfully`, logContext);
        return updatedUser as SafeUserWithRoles;
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error updating user`, logContext);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             throw new ApiError(httpStatus.NOT_FOUND, 'User not found during update attempt.');
         }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update user.');
    }
};

// --- Dedicated Role Assignment Functions ---

/**
 * Assign a specific role to a specific user.
 */
const assignRoleToUser = async (userId: string, roleId: string, tenantId: string): Promise<void> => {
    const logContext: LogContext = { function: 'assignRoleToUser', userId, roleId, tenantId };

    try {
        await prisma.$transaction(async (tx) => {
            const userExists = await tx.user.count({ where: { id: userId, tenantId } });
            if (!userExists) throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
            const roleExists = await tx.role.count({ where: { id: roleId, tenantId } });
            if (!roleExists) throw new ApiError(httpStatus.NOT_FOUND, 'Role not found.');

            await tx.userRole.upsert({
                where: { userId_roleId: { userId, roleId } },
                create: { userId, roleId },
                update: {}, // No fields to update on the join table itself
            });
        });
        logger.info(`Role ${roleId} assigned successfully to user ${userId}`, logContext);
    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        logContext.error = error;
        logger.error(`Error assigning role to user`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to assign role.');
    }
};

/**
 * Remove a specific role from a specific user.
 */
const removeRoleFromUser = async (userId: string, roleId: string, tenantId: string): Promise<void> => {
    const logContext: LogContext = { function: 'removeRoleFromUser', userId, roleId, tenantId };

    // Verify user exists first for better error message
    const userExists = await prisma.user.count({ where: { id: userId, tenantId } });
    if (!userExists) throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');

    try {
        const deleteResult = await prisma.userRole.deleteMany({
            where: { userId: userId, roleId: roleId } // Target specific assignment
        });

        if (deleteResult.count === 0) {
            logger.warn(`Role assignment not found for user ${userId} and role ${roleId}. No action taken.`, logContext);
            // Don't throw error, operation is idempotent
        } else {
            logger.info(`Role ${roleId} removed successfully from user ${userId}`, logContext);
        }
    } catch (error: any) {
        logContext.error = error;
        logger.error(`Error removing role from user`, logContext);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to remove role.');
    }
};

/**
 * Soft delete a user by ID (mark as inactive).
 */
const deleteUserById = async (userId: string, tenantId: string, requestingUserId: string): Promise<void> => {
    const logContext: LogContext = { function: 'deleteUserById', userId, tenantId, requestingUserId };

    if (requestingUserId === userId) {
        logger.warn(`User attempted self-deletion`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, 'Users cannot deactivate their own account.');
    }

    try {
        const result = await prisma.user.updateMany({
            where: { id: userId, tenantId: tenantId, isActive: true },
            data: { isActive: false },
        });

        if (result.count === 0) {
            const exists = await prisma.user.findFirst({ where: { id: userId, tenantId: tenantId }, select: { isActive: true } });
            if (!exists) {
                 logger.warn(`Soft delete failed: User not found or tenant mismatch`, logContext);
                 throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
            } else {
                 logger.info(`User was already inactive, no action taken`, logContext);
                 return; // Success if already inactive
            }
        }

        // Revoke refresh tokens
        const revokeResult = await prisma.refreshToken.updateMany({
             where: { userId: userId, revokedAt: null },
             data: { revokedAt: new Date() }
        });
        logContext.refreshTokensRevoked = revokeResult.count;
        logger.info(`User soft deleted (marked inactive) and revoked ${revokeResult.count} refresh tokens successfully`, logContext);

    } catch (error: any) {
         if (error instanceof ApiError) throw error;
         logContext.error = error;
         logger.error(`Error during user soft delete`, logContext);
         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to deactivate user.');
    }
};


export const userService = {
  createUser,
  queryUsers,
  getUserById,
  updateUserById, // Only updates basic info now
  deleteUserById,
  assignRoleToUser, // Added
  removeRoleFromUser, // Added
};























































// import bcrypt from 'bcryptjs';
// import httpStatus from 'http-status';
// import { prisma } from '@/config'; // Import centralized Prisma client
// import ApiError from '@/utils/ApiError';
// import logger from '@/utils/logger';
// import { User, Prisma, Role } from '@prisma/client'; // Import necessary Prisma types
// import { CreateUserDto } from './dto/create-user.dto';
// import { UpdateUserDto } from './dto/update-user.dto';
// // import pick from '@/utils/pick'; // Utility for picking filter/options

// // Helper type for user response (omitting password) including simplified roles
// export type SafeUserWithRoles = Omit<User, 'passwordHash'> & {
//     roles: { role: Pick<Role, 'id' | 'name'> }[];
// };

// // Type for richer user details, perhaps for single user GET
// export type SafeUserWithRoleDetails = Omit<User, 'passwordHash'> & {
//     roles: { role: Role }[]; // Include full role details
// };

// // Define log context type if not already defined globally
// type LogContext = {
//     function?: string;
//     email?: string | null;
//     userId?: string | null;
//     tenantId?: string | null | undefined; // Updated to match extraction logic
//     updateData?: any;
//     filter?: any;
//     orderBy?: any;
//     limit?: number;
//     page?: number;
//     error?: any;
//     [key: string]: any;
// };


// /**
//  * Create a new user within a specific tenant.
//  * @param {CreateUserDto} userData - Data for the new user.
//  * @param {string} tenantId - The ID of the tenant the user belongs to.
//  * @returns {Promise<SafeUserWithRoles>} The created user object (without password hash, with role names).
//  */
// const createUser = async (userData: CreateUserDto, tenantId: string): Promise<SafeUserWithRoles> => {
//     const lowerCaseEmail = userData.email.toLowerCase();
//     const logContext: LogContext = { function: 'createUser', email: lowerCaseEmail, tenantId };

//     // 1. Check if email already exists within the tenant
//     const existingUser = await prisma.user.findFirst({
//         where: {
//             email: lowerCaseEmail,
//             tenantId: tenantId, // Scoped to tenant
//         },
//         select: { id: true } // Only select necessary field for check
//     });
//     if (existingUser) {
//         logger.warn(`User creation failed: Email already exists`, logContext);
//         throw new ApiError(httpStatus.BAD_REQUEST, 'Email address already in use by another user in this tenant.');
//     }

//     // 2. Check if provided roleIds are valid for the tenant
//     const validRoles = await prisma.role.findMany({
//         where: {
//             id: { in: userData.roleIds },
//             tenantId: tenantId, // Ensure roles belong to the correct tenant
//         },
//         select: { id: true } // Select only IDs for comparison
//     });
//     if (validRoles.length !== userData.roleIds.length) {
//         const invalidIds = userData.roleIds.filter(reqId => !validRoles.some(validRole => validRole.id === reqId));
//         logContext.invalidRoleIds = invalidIds;
//         logger.warn(`User creation failed: Invalid role ID(s) provided for this tenant`, logContext);
//         throw new ApiError(httpStatus.BAD_REQUEST, `Invalid role ID(s) provided: ${invalidIds.join(', ')}`);
//     }


//     // 3. Hash the password
//     const passwordHash = await bcrypt.hash(userData.password, 10); // Use appropriate salt rounds

//     // 4. Create the user and connect roles
//     try {
//         const createdUserWithRoles = await prisma.user.create({
//             data: {
//                 tenantId: tenantId,
//                 email: lowerCaseEmail,
//                 passwordHash: passwordHash,
//                 firstName: userData.firstName,
//                 lastName: userData.lastName,
//                 phoneNumber: userData.phoneNumber,
//                 isActive: true, // Default new users to active
//                 roles: {
//                     create: userData.roleIds.map(roleId => ({
//                         role: { connect: { id: roleId } },
//                     })),
//                 },
//             },
//             // Include roles in the return for immediate confirmation
//             select: { // Select safe fields + role info
//                 id: true, tenantId: true, email: true, firstName: true, lastName: true,
//                 phoneNumber: true, isActive: true, createdAt: true, updatedAt: true,
//                 roles: { select: { role: { select: { id: true, name: true } } } }
//             }
//         });

//         logContext.userId = createdUserWithRoles.id;
//         logger.info(`User created successfully`, logContext);

//         return createdUserWithRoles as SafeUserWithRoles; // Cast to our defined safe type

//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error creating user in database`, logContext);
//         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
//              throw new ApiError(httpStatus.BAD_REQUEST, 'Email address already in use.');
//         }
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create user.');
//     }
// };

// /**
//  * Query for users within a specific tenant with pagination, filtering, and sorting.
//  * @param {Prisma.UserWhereInput} filter - Prisma filter object (MUST include tenantId).
//  * @param {Prisma.UserOrderByWithRelationInput[]} orderBy - Prisma sorting object array.
//  * @param {number} limit - Max records per page.
//  * @param {number} page - Current page number.
//  * @returns {Promise<{users: SafeUserWithRoles[], totalResults: number}>} List of users and total count.
//  */
// const queryUsers = async (
//     filter: Prisma.UserWhereInput,
//     orderBy: Prisma.UserOrderByWithRelationInput[],
//     limit: number,
//     page: number
// ): Promise<{ users: SafeUserWithRoles[]; totalResults: number }> => {
//     const skip = (page - 1) * limit;

//     // Extract tenantId safely before creating logContext to satisfy LogContext type
//     const tenantIdForLog: string | undefined = typeof filter.tenantId === 'string' ? filter.tenantId : undefined;

//     const logContext: LogContext = {
//         function: 'queryUsers',
//         filter: '...', // Don't log full filter potentially containing sensitive parts
//         orderBy,
//         limit,
//         page,
//         tenantId: tenantIdForLog // Use the extracted string value
//     };

//     // Safeguard check - ensure tenantId was indeed present as expected
//     if (!tenantIdForLog) {
//         logger.error('Programming Error: queryUsers called without tenantId string in filter', logContext);
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context missing for user query.');
//     }

//     try {
//         // The original 'filter' object is still passed to Prisma methods
//         const [users, totalResults] = await prisma.$transaction([
//             prisma.user.findMany({
//                 where: filter,
//                 select: { // Consistent selection for list view
//                     id: true, tenantId: true, email: true, firstName: true, lastName: true,
//                     phoneNumber: true, isActive: true, createdAt: true, updatedAt: true,
//                     roles: { select: { role: { select: { id: true, name: true } } } }
//                 },
//                 orderBy: orderBy,
//                 skip: skip,
//                 take: limit,
//             }),
//             prisma.user.count({ where: filter }), // Count based on the same filter
//         ]);

//         logger.debug(`User query successful, found ${users.length} of ${totalResults} users.`, logContext);
//         return { users: users as SafeUserWithRoles[], totalResults };
//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error querying users`, logContext);
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve users.');
//     }
// };

// /**
//  * Get user by ID, ensuring tenant isolation.
//  * @param {string} userId - The ID of the user to retrieve.
//  * @param {string} tenantId - The ID of the tenant making the request.
//  * @returns {Promise<SafeUserWithRoleDetails | null>} The user object with full role details or null if not found/not in tenant.
//  */
// const getUserById = async (userId: string, tenantId: string): Promise<SafeUserWithRoleDetails | null> => {
//     const logContext: LogContext = { function: 'getUserById', userId, tenantId };
//     try {
//         const user = await prisma.user.findUnique({
//             where: {
//                 id: userId,
//                 tenantId: tenantId, // CRITICAL: Tenant isolation
//             },
//             select: { // Select fields, include full Role details here
//                 id: true, tenantId: true, email: true, firstName: true, lastName: true,
//                 phoneNumber: true, isActive: true, createdAt: true, updatedAt: true,
//                 roles: { select: { role: true } } // Get the full Role object
//             },
//         });

//         if (!user) {
//             logger.warn(`User not found or tenant mismatch`, logContext);
//             return null;
//         }

//         logger.debug(`User found successfully`, logContext);
//         return user as SafeUserWithRoleDetails; // Cast to appropriate safe type
//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error fetching user by ID`, logContext);
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve user.');
//     }
// };


// /**
//  * Update user details by ID, ensuring tenant isolation.
//  * @param {string} userId - The ID of the user to update.
//  * @param {UpdateUserDto} updateData - Data to update.
//  * @param {string} tenantId - The ID of the tenant making the request.
//  * @returns {Promise<SafeUserWithRoles>} The updated user object.
//  */
// const updateUserById = async (
//     userId: string,
//     updateData: UpdateUserDto,
//     tenantId: string
// ): Promise<SafeUserWithRoles> => {
//     const logContext: LogContext = { function: 'updateUserById', userId, tenantId, updateData: { ...updateData } };

//     // 1. Verify user exists within the tenant first
//     const existingUser = await prisma.user.findUnique({
//         where: { id: userId, tenantId: tenantId },
//         select: { id: true }
//     });

//     if (!existingUser) {
//         logger.warn(`Update failed: User not found or tenant mismatch`, logContext);
//         throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
//     }

//     // 2. Prepare data for update
//     const dataToUpdate: Prisma.UserUpdateInput = {};
//     if (updateData.firstName !== undefined) dataToUpdate.firstName = updateData.firstName;
//     if (updateData.lastName !== undefined) dataToUpdate.lastName = updateData.lastName;
//     if (updateData.phoneNumber !== undefined) dataToUpdate.phoneNumber = updateData.phoneNumber;
//     if (updateData.isActive !== undefined) dataToUpdate.isActive = updateData.isActive;

//     // 3. Handle Role Updates
//     if (updateData.roleIds) {
//         const validRoles = await prisma.role.findMany({
//              where: { id: { in: updateData.roleIds }, tenantId: tenantId },
//              select: { id: true }
//         });
//         if (validRoles.length !== updateData.roleIds.length) {
//             const invalidIds = updateData.roleIds.filter(reqId => !validRoles.some(validRole => validRole.id === reqId));
//             logContext.invalidRoleIds = invalidIds;
//             logger.warn(`User update failed: Invalid role ID(s) provided`, logContext);
//             throw new ApiError(httpStatus.BAD_REQUEST, `Invalid role ID(s) provided for update: ${invalidIds.join(', ')}`);
//         }
//         dataToUpdate.roles = {
//             set: updateData.roleIds.map(roleId => ({ userId_roleId: { userId: userId, roleId: roleId } }))
//         };
//          logContext.rolesUpdated = updateData.roleIds;
//     }

//     if (Object.keys(dataToUpdate).length === 0) {
//          logger.info(`User update skipped: No valid data provided`, logContext);
//          const currentUser = await getUserById(userId, tenantId); // Fetch current data
//          if (!currentUser) throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
//          return currentUser as SafeUserWithRoles; // Cast needed because return type differs slightly
//     }

//     // 4. Perform the update
//     try {
//         const updatedUser = await prisma.user.update({
//             where: { id: userId, tenantId: tenantId },
//             data: dataToUpdate,
//             select: { // Select fields for the response, matching SafeUserWithRoles
//                 id: true, tenantId: true, email: true, firstName: true, lastName: true,
//                 phoneNumber: true, isActive: true, createdAt: true, updatedAt: true,
//                 roles: { select: { role: { select: { id: true, name: true } } } }
//             },
//         });

//         logger.info(`User updated successfully`, logContext);
//         return updatedUser as SafeUserWithRoles;
//     } catch (error: any) {
//         logContext.error = error;
//         logger.error(`Error updating user`, logContext);
//          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
//              throw new ApiError(httpStatus.NOT_FOUND, 'User not found during update attempt.');
//         }
//         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update user.');
//     }
// };

// /**
//  * Soft delete a user by ID (mark as inactive), ensuring tenant isolation.
//  * @param {string} userId - The ID of the user to deactivate.
//  * @param {string} tenantId - The ID of the tenant making the request.
//  * @param {string} requestingUserId - The ID of the user performing the action (for self-delete check).
//  * @returns {Promise<void>}
//  */
// const deleteUserById = async (userId: string, tenantId: string, requestingUserId: string): Promise<void> => {
//     const logContext: LogContext = { function: 'deleteUserById', userId, tenantId, requestingUserId };

//     // Prevent self-deletion
//     if (requestingUserId === userId) {
//         logger.warn(`User attempted self-deletion`, logContext);
//         throw new ApiError(httpStatus.BAD_REQUEST, 'Users cannot deactivate their own account.');
//     }

//     try {
//         // Use updateMany to mark as inactive within the correct tenant
//         const result = await prisma.user.updateMany({
//             where: {
//                 id: userId,
//                 tenantId: tenantId, // Tenant isolation
//                 isActive: true,    // Only affect active users
//             },
//             data: {
//                 isActive: false,
//             },
//         });

//         if (result.count === 0) {
//             const exists = await prisma.user.findFirst({ where: { id: userId, tenantId: tenantId }, select: { isActive: true } });
//             if (!exists) {
//                  logger.warn(`Soft delete failed: User not found or tenant mismatch`, logContext);
//                  throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
//             } else {
//                  // User exists but was already inactive
//                  logger.info(`User was already inactive, no action taken`, logContext);
//                  return; // Treat as success if already inactive
//             }
//         }

//         // Revoke all active refresh tokens for the deactivated user
//         const revokeResult = await prisma.refreshToken.updateMany({
//              where: { userId: userId, revokedAt: null },
//              data: { revokedAt: new Date() }
//         });
//         logContext.refreshTokensRevoked = revokeResult.count;
//         logger.info(`User soft deleted (marked inactive) and revoked ${revokeResult.count} refresh tokens successfully`, logContext);

//     } catch (error: any) {
//          if (error instanceof ApiError) throw error;

//          logContext.error = error;
//          logger.error(`Error during user soft delete`, logContext);
//          throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to deactivate user.');
//     }
// };


// export const userService = {
//   createUser,
//   queryUsers,
//   getUserById,
//   updateUserById,
//   deleteUserById,
// };
