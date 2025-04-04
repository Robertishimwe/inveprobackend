"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantIdFromRequest = exports.ensureTenantContext = void 0;
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
const logger_1 = __importDefault(require("@/utils/logger"));
/**
 * Middleware to ensure that a tenant context (req.tenantId) has been established.
 * This should typically run *after* the authentication middleware that sets req.tenantId.
 * It acts as an assertion for routes requiring tenant scope.
 */
const ensureTenantContext = (req, res, next) => {
    // Check if tenantId was attached to the request object (presumably by authMiddleware)
    if (!req.tenantId) {
        // This indicates a programming error - authMiddleware should have run or failed.
        logger_1.default.error('Programming Error: ensureTenantContext middleware ran but req.tenantId is missing. Check middleware order.');
        return next(new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Tenant context could not be determined.'));
    }
    // Tenant context exists, proceed to the next handler
    // logger.debug(`Tenant context verified for tenant: ${req.tenantId}`); // Optional: debug logging
    next();
};
exports.ensureTenantContext = ensureTenantContext;
/**
 * Utility function (optional, can be placed here or in a shared utils file)
 * Safely retrieves the tenantId from the request object.
 * Throws an error if the tenantId is missing, ensuring controllers don't operate without it.
 *
 * @param req - The Express Request object.
 * @returns The tenantId string.
 * @throws {ApiError} If tenantId is not found on the request object.
 */
const getTenantIdFromRequest = (req) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
        // This should ideally not happen if ensureTenantContext middleware is used correctly.
        logger_1.default.error('Attempted to get tenantId from request, but it was missing.');
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Tenant identifier is missing from request context.');
    }
    return tenantId;
};
exports.getTenantIdFromRequest = getTenantIdFromRequest;
// Note: If implementing tenant identification via subdomain/header for public routes,
// you would add a different middleware here that performs that lookup and attaches req.tenantId.
//# sourceMappingURL=tenant.middleware.js.map