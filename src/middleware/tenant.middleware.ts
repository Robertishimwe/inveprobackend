// src/middleware/tenant.middleware.ts
import { Request, Response, NextFunction } from 'express';
import ApiError from '@/utils/ApiError';
import httpStatus from 'http-status';
import logger from '@/utils/logger';

/**
 * Middleware to ensure that a tenant context (req.tenantId) has been established.
 * This should typically run *after* the authentication middleware that sets req.tenantId.
 * It acts as an assertion for routes requiring tenant scope.
 */
export const ensureTenantContext = (req: Request, res: Response, next: NextFunction): void => {
    // Check if tenantId was attached to the request object (presumably by authMiddleware)
    if (!req.tenantId) {
        // This indicates a programming error - authMiddleware should have run or failed.
        logger.error('Programming Error: ensureTenantContext middleware ran but req.tenantId is missing. Check middleware order.');
        return next(new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context could not be determined.'));
    }

    // Tenant context exists, proceed to the next handler
    // logger.debug(`Tenant context verified for tenant: ${req.tenantId}`); // Optional: debug logging
    next();
};


/**
 * Utility function (optional, can be placed here or in a shared utils file)
 * Safely retrieves the tenantId from the request object.
 * Throws an error if the tenantId is missing, ensuring controllers don't operate without it.
 *
 * @param req - The Express Request object.
 * @returns The tenantId string.
 * @throws {ApiError} If tenantId is not found on the request object.
 */
export const getTenantIdFromRequest = (req: Request): string => {
    const tenantId = req.tenantId;
    if (!tenantId) {
        // This should ideally not happen if ensureTenantContext middleware is used correctly.
        logger.error('Attempted to get tenantId from request, but it was missing.');
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant identifier is missing from request context.');
    }
    return tenantId;
};

// Note: If implementing tenant identification via subdomain/header for public routes,
// you would add a different middleware here that performs that lookup and attaches req.tenantId.