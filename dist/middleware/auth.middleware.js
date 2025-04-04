"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken")); // npm i jsonwebtoken @types/jsonwebtoken
const http_status_1 = __importDefault(require("http-status"));
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Authentication token required'));
    }
    const token = authHeader.split(' ')[1];
    try {
        // Verify token and decode payload
        const payload = jsonwebtoken_1.default.verify(token, config_1.env.JWT_SECRET);
        // --- Fetch User with Roles and Permissions ---
        // This is the crucial part for RBAC - get all necessary data in one go
        const userWithRoles = await config_1.prisma.user.findUnique({
            where: {
                id: payload.userId,
                tenantId: payload.tenantId, // **CRITICAL**: Ensure user belongs to the tenant in the token
                isActive: true, // Ensure user is active
            },
            include: {
                // Eager load roles and their permissions
                roles: {
                    include: {
                        role: {
                            include: {
                                permissions: {
                                    include: {
                                        permission: true // The actual Permission
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        if (!userWithRoles) {
            logger_1.default.warn(`Auth attempt failed: User ${payload.userId} not found, inactive, or tenant mismatch for token tenant ${payload.tenantId}`);
            return next(new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'User not found or inactive'));
        }
        // --- Calculate Effective Permissions ---
        const effectivePermissions = new Set();
        userWithRoles.roles.forEach(userRole => {
            userRole.role.permissions.forEach(rolePermission => {
                effectivePermissions.add(rolePermission.permission.permissionKey);
            });
        });
        // --- Attach to Request ---
        // Attach the enriched user object and tenantId separately
        req.user = {
            ...userWithRoles,
            roles: userWithRoles.roles.map(ur => ur.role), // Simplify roles structure attached
            effectivePermissions: effectivePermissions,
        }; // Cast to our specific type
        req.tenantId = payload.tenantId; // Attach tenantId from validated token
        logger_1.default.debug(`User ${req.user.id} authenticated for tenant ${req.tenantId}`);
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return next(new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Token expired'));
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            logger_1.default.warn('JWT verification failed:', error.message);
            return next(new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid token'));
        }
        // Handle other potential errors during user fetching etc.
        logger_1.default.error('Authentication error:', error);
        return next(new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Authentication failed'));
    }
};
exports.authMiddleware = authMiddleware;
//# sourceMappingURL=auth.middleware.js.map