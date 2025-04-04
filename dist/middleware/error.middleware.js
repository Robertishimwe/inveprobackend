"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.errorConverter = void 0;
// Import Prisma namespace along with the client
const client_1 = require("@prisma/client");
const config_1 = require("@/config");
const logger_1 = __importDefault(require("@/utils/logger"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
/**
 * Middleware to convert non-ApiError errors into ApiError instances.
 * Ensures consistent error structure before the final error handler.
 * Uses the standard `Prisma` namespace for type checking.
 *
 * @param err - The error object.
 * @param req - Express Request object.
 * @param res - Express Response object.
 * @param next - Express NextFunction.
 */
const errorConverter = (err, req, res, next) => {
    let error = err;
    // If the error is not an instance of our custom ApiError
    if (!(error instanceof ApiError_1.default)) {
        let statusCode;
        let message;
        let isOperational = false; // Assume non-ApiErrors are programming errors unless identified otherwise
        let details = undefined;
        // --- Handle Prisma Errors using the Prisma namespace ---
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            isOperational = true; // Generally operational (bad input, constraint violation)
            switch (error.code) {
                case 'P2002': // Unique constraint violation
                    const target = error.meta?.target;
                    message = `Record already exists or violates unique constraint${target ? ` on field(s): ${target.join(', ')}` : ''}.`;
                    statusCode = http_status_1.default.BAD_REQUEST; // Or CONFLICT (409) depending on context
                    details = { code: error.code, field: target ? target.join(', ') : undefined };
                    break;
                case 'P2003': // Foreign key constraint failed
                    const fieldName = error.meta?.field_name;
                    message = `Invalid reference: The operation failed because a related record does not exist${fieldName ? ` (field: ${fieldName})` : ''}.`;
                    statusCode = http_status_1.default.BAD_REQUEST;
                    details = { code: error.code, field: fieldName };
                    break;
                case 'P2014': // Relation violation (e.g., trying to delete parent with children)
                    message = `Operation failed because related records depend on this resource.`;
                    statusCode = http_status_1.default.BAD_REQUEST; // Or CONFLICT (409)
                    details = { code: error.code };
                    break;
                case 'P2025': // Record to update/delete not found
                    // Extract model name if available in future Prisma versions or context
                    message = `Resource not found. The requested record does not exist or could not be updated/deleted.`;
                    statusCode = http_status_1.default.NOT_FOUND;
                    details = { code: error.code };
                    break;
                // Add more specific Prisma error codes as needed
                default:
                    // Log the specific code for unexpected Prisma errors
                    logger_1.default.warn(`Unhandled Prisma Known Request Error Code: ${error.code}`);
                    message = `A database constraint occurred (Code: ${error.code}). Please check your input.`;
                    statusCode = http_status_1.default.BAD_REQUEST; // Treat as bad request generally
                    details = { code: error.code };
                    break;
            }
        }
        else if (error instanceof client_1.Prisma.PrismaClientValidationError) {
            isOperational = true;
            statusCode = http_status_1.default.BAD_REQUEST;
            // Try to provide a more user-friendly message than the raw validation error
            message = `Invalid input data provided. Please check the format and types of your input.`;
            details = { code: 'P_VALIDATION_ERROR', reason: error.message.split('\n').pop() || 'Validation failed.' };
        }
        // Handle other Prisma errors if necessary (e.g., PrismaClientUnknownRequestError, PrismaClientRustPanicError)
        // else if (error instanceof Prisma.PrismaClientUnknownRequestError) { ... }
        // --- Handle Generic Errors ---
        else {
            // Check if the error object has a statusCode property (e.g., from other libraries or manual throws)
            statusCode = (typeof error.statusCode === 'number')
                ? error.statusCode
                : http_status_1.default.INTERNAL_SERVER_ERROR;
            // Use error message or default http status message
            message = error.message || (http_status_1.default[statusCode] || 'An unexpected error occurred');
            // Determine if it's operational based on status code
            // If a specific status code < 500 was provided, assume it was intentional
            if (statusCode < 500) {
                isOperational = true;
            }
            else {
                // Otherwise, assume 5xx or default INTERNAL_SERVER_ERROR are non-operational programming errors
                isOperational = false;
            }
        }
        // Create a new ApiError instance, preserving the original stack
        error = new ApiError_1.default(statusCode, message, isOperational, details, err.stack);
    }
    // Pass the standardized ApiError to the final error handler
    next(error);
};
exports.errorConverter = errorConverter;
/**
 * Final Express error handling middleware.
 * Sends a JSON response to the client based on the ApiError instance.
 * Logs the error appropriately.
 * (This function remains the same as your previous correct version)
 *
 * @param err - The ApiError instance (guaranteed by errorConverter).
 * @param req - Express Request object.
 * @param res - Express Response object.
 * @param next - Express NextFunction (unused here, but required by Express).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const errorHandler = (err, req, res, next) => {
    let { statusCode, message, isOperational, errorDetails } = err;
    // In production environments, prevent leaking details of non-operational (likely programming) errors
    if (config_1.env.NODE_ENV === 'production' && !isOperational) {
        statusCode = http_status_1.default.INTERNAL_SERVER_ERROR;
        message = http_status_1.default[http_status_1.default.INTERNAL_SERVER_ERROR];
        errorDetails = undefined; // Clear details in production for non-operational errors
    }
    // Store error message in res.locals (useful for access logs or monitoring)
    res.locals.errorMessage = err.message;
    // Construct the JSON response payload
    const response = {
        code: statusCode,
        message: message,
        // Include error details if they exist (and not masked by production rule above)
        ...(errorDetails && { details: errorDetails }),
        // Include stack trace only in development environment for debugging
        ...(config_1.env.NODE_ENV === 'development' && { stack: err.stack }),
    };
    // Log the error using Winston logger
    if (config_1.env.NODE_ENV === 'development') {
        // Log the full error object in development for maximum detail
        logger_1.default.error('Error caught by handler:', err);
    }
    else {
        // In production, log essential info or use structured logging
        // Include essential request context
        logger_1.default.error(`[${statusCode}${isOperational ? '' : ' NON-OPERATIONAL'}] ${message} - ${req.method} ${req.originalUrl} - IP: ${req.ip}` +
            // Optionally log stack for non-operational errors even in prod for debugging critical issues
            `${err.stack && !isOperational ? `\nStack: ${err.stack}` : ''}`);
    }
    // Send the error response to the client
    res.status(statusCode).send(response);
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=error.middleware.js.map