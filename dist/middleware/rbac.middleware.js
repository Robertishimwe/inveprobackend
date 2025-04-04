"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRoles = exports.checkPermissions = void 0;
const http_status_1 = __importDefault(require("http-status"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
/**
 * Middleware factory to check if the authenticated user has ALL the required permissions.
 * This should be used AFTER the authMiddleware.
 *
 * @param requiredPermissions - An array of permission keys (e.g., ['product:create', 'product:edit'])
 */
const checkPermissions = (requiredPermissions) => {
    return (req, res, next) => {
        // Ensure user is attached by authMiddleware and has effectivePermissions
        if (!req.user || !req.user.effectivePermissions) {
            logger_1.default.error('RBAC check failed: User or permissions not found on request. Ensure authMiddleware runs first.');
            return next(new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'User authentication context missing'));
        }
        // Check if the user has all the required permissions
        const hasAllPermissions = requiredPermissions.every(permission => req.user.effectivePermissions.has(permission));
        if (!hasAllPermissions) {
            logger_1.default.warn(`Authorization failed for user ${req.user.id} (tenant: ${req.tenantId}): Missing permissions. Required: [${requiredPermissions.join(', ')}], Has: [${Array.from(req.user.effectivePermissions).join(', ')}]`);
            return next(new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Insufficient permissions'));
        }
        // User has all required permissions
        logger_1.default.debug(`User ${req.user.id} authorized for permissions: [${requiredPermissions.join(', ')}]`);
        next();
    };
};
exports.checkPermissions = checkPermissions;
/**
 * Optional: Middleware factory to check if the authenticated user has AT LEAST ONE of the specified roles.
 * This is less granular than permission checks but can be useful.
 * NOTE: Requires roles to be correctly included in the req.user object by authMiddleware.
 *
 * @param requiredRoles - An array of role names (e.g., ['admin', 'manager'])
 */
const checkRoles = (requiredRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.roles) {
            logger_1.default.error('RBAC role check failed: User or roles not found on request. Ensure authMiddleware runs first and includes roles.');
            return next(new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'User authentication context missing'));
        }
        const userRoleNames = req.user.roles.map(role => role.name);
        const hasRequiredRole = requiredRoles.some(role => userRoleNames.includes(role));
        if (!hasRequiredRole) {
            logger_1.default.warn(`Authorization failed for user ${req.user.id} (tenant: ${req.tenantId}): Missing roles. Required one of: [${requiredRoles.join(', ')}], Has: [${userRoleNames.join(', ')}]`);
            return next(new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Insufficient role'));
        }
        logger_1.default.debug(`User ${req.user.id} authorized via role: [${requiredRoles.join(', ')}]`);
        next();
    };
};
exports.checkRoles = checkRoles;
//Usage example
// Example: src/modules/products/product.routes.ts
// import express from 'express';
// import { productController } from './product.controller';
// import validateRequest from '@/middleware/validate.middleware';
// import { CreateProductDto, UpdateProductDto } from './dto';
// import { authMiddleware } from '@/middleware/auth.middleware'; // Import Auth middleware
// import { checkPermissions } from '@/middleware/rbac.middleware'; // Import RBAC middleware
// const router = express.Router();
// router
//     .route('/')
//     .post(
//         authMiddleware, // 1. Authenticate the user
//         checkPermissions(['product:create']), // 2. Check for specific permission
//         validateRequest(CreateProductDto, 'body'),
//         productController.createProduct
//     )
//     .get(
//         authMiddleware,
//         checkPermissions(['product:read']), // Check read permission
//         productController.getProducts
//     );
// router
//     .route('/:productId')
//     .get(
//         authMiddleware,
//         checkPermissions(['product:read']),
//         productController.getProduct
//     )
//     .patch(
//         authMiddleware,
//         checkPermissions(['product:update']), // Check update permission
//         validateRequest(UpdateProductDto, 'body'),
//         productController.updateProduct
//     )
//     .delete(
//         authMiddleware,
//         checkPermissions(['product:delete']), // Check delete permission
//         productController.deleteProduct
//     );
// export default router;
//# sourceMappingURL=rbac.middleware.js.map