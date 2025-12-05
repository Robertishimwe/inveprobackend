import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken'; // npm i jsonwebtoken @types/jsonwebtoken
import httpStatus from 'http-status';
import { env, prisma } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { User, Role, Permission, RolePermission } from '@prisma/client'; // Import generated types

// Define the structure of the JWT payload
interface AuthPayload extends JwtPayload {
    userId: string;
    tenantId: string; // Include tenantId in the token for security and efficiency
    // Add other relevant info like session ID if needed
}

// Extend Express Request type (ensure this matches src/types/express/index.d.ts)
// Define a more specific type for the attached user object
export interface AuthenticatedUser extends User {
    roles: {
        role: Role & {
            permissions: (RolePermission & {
                permission: Permission;
            })[];
        };
    }[];
    // We'll compute effective permissions directly on the object
    effectivePermissions: Set<string>;
    allowedLocationIds: string[]; // IDs of locations the user can access, or ['*'] for global
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser; // Use the detailed type
            tenantId?: string; // Keep tenantId separate for clarity
        }
    }
}


export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new ApiError(httpStatus.UNAUTHORIZED, 'Authentication token required'));
    }

    const token = authHeader.split(' ')[1];

    try {
        // Verify token and decode payload
        const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;

        // --- Fetch User with Roles and Permissions ---
        // This is the crucial part for RBAC - get all necessary data in one go
        const userWithRoles = await prisma.user.findUnique({
            where: {
                id: payload.userId,
                tenantId: payload.tenantId, // **CRITICAL**: Ensure user belongs to the tenant in the token
                isActive: true, // Ensure user is active
            },
            include: {
                // Eager load roles and their permissions
                roles: { // UserRole join table
                    include: {
                        role: { // The actual Role
                            include: {
                                permissions: { // RolePermission join table
                                    include: {
                                        permission: true // The actual Permission
                                    }
                                }
                            }
                        }
                    }
                },
                locations: { select: { locationId: true } } // Fetch assigned location IDs
            }
        });

        if (!userWithRoles) {
            logger.warn(`Auth attempt failed: User ${payload.userId} not found, inactive, or tenant mismatch for token tenant ${payload.tenantId}`);
            return next(new ApiError(httpStatus.UNAUTHORIZED, 'User not found or inactive'));
        }

        // --- Calculate Effective Permissions ---
        const effectivePermissions = new Set<string>();
        let isAdmin = false;

        userWithRoles.roles.forEach(userRole => {
            if (userRole.role.name === 'Super Admin' || userRole.role.name === 'Tenant Admin' || userRole.role.name === 'Admin') {
                isAdmin = true;
            }
            userRole.role.permissions.forEach(rolePermission => {
                effectivePermissions.add(rolePermission.permission.permissionKey);
            });
        });

        // --- Calculate Allowed Locations ---
        let allowedLocationIds: string[] = [];
        if (isAdmin) {
            allowedLocationIds = ['*'];
        } else {
            allowedLocationIds = userWithRoles.locations.map(ul => ul.locationId);
        }

        // --- Attach to Request ---
        // Attach the enriched user object and tenantId separately
        req.user = {
            ...userWithRoles,
            roles: userWithRoles.roles as any, // Keep the original structure (UserRole[]) - cast to any to resolve TS mismatch with AuthenticatedUser interface
            effectivePermissions: effectivePermissions,
            allowedLocationIds: allowedLocationIds
        } as AuthenticatedUser; // Cast to our specific type

        req.tenantId = payload.tenantId; // Attach tenantId from validated token

        console.error(`[AuthMiddleware] User ${req.user.id} authenticated for tenant ${req.tenantId}. Locations: ${JSON.stringify(allowedLocationIds)}`);
        next();

    } catch (error: any) {
        if (error instanceof jwt.TokenExpiredError) {
            return next(new ApiError(httpStatus.UNAUTHORIZED, 'Token expired'));
        }
        if (error instanceof jwt.JsonWebTokenError) {
            logger.warn('JWT verification failed:', error.message);
            return next(new ApiError(httpStatus.UNAUTHORIZED, 'Invalid token'));
        }
        // Handle other potential errors during user fetching etc.
        logger.error('Authentication error:', error);
        return next(new ApiError(httpStatus.UNAUTHORIZED, 'Authentication failed'));
    }
};