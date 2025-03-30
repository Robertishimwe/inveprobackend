// src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
// Import Prisma namespace along with the client
import { Prisma } from '@prisma/client';
import { env } from '@/config';
import logger from '@/utils/logger';
import ApiError from '@/utils/ApiError';
import httpStatus from 'http-status';

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
export const errorConverter = (err: any, req: Request, res: Response, next: NextFunction) => {
  let error = err;

  // If the error is not an instance of our custom ApiError
  if (!(error instanceof ApiError)) {
    let statusCode: number;
    let message: string;
    let isOperational = false; // Assume non-ApiErrors are programming errors unless identified otherwise
    let details: any = undefined;

    // --- Handle Prisma Errors using the Prisma namespace ---
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        isOperational = true; // Generally operational (bad input, constraint violation)
        switch (error.code) {
            case 'P2002': // Unique constraint violation
                const target = error.meta?.target as string[] | undefined;
                message = `Record already exists or violates unique constraint${target ? ` on field(s): ${target.join(', ')}` : ''}.`;
                statusCode = httpStatus.BAD_REQUEST; // Or CONFLICT (409) depending on context
                details = { code: error.code, field: target ? target.join(', ') : undefined };
                break;
            case 'P2003': // Foreign key constraint failed
                const fieldName = error.meta?.field_name as string | undefined;
                message = `Invalid reference: The operation failed because a related record does not exist${fieldName ? ` (field: ${fieldName})` : ''}.`;
                statusCode = httpStatus.BAD_REQUEST;
                details = { code: error.code, field: fieldName };
                break;
            case 'P2014': // Relation violation (e.g., trying to delete parent with children)
                 message = `Operation failed because related records depend on this resource.`;
                 statusCode = httpStatus.BAD_REQUEST; // Or CONFLICT (409)
                 details = { code: error.code };
                 break;
            case 'P2025': // Record to update/delete not found
                // Extract model name if available in future Prisma versions or context
                message = `Resource not found. The requested record does not exist or could not be updated/deleted.`;
                statusCode = httpStatus.NOT_FOUND;
                details = { code: error.code };
                break;
            // Add more specific Prisma error codes as needed
            default:
                // Log the specific code for unexpected Prisma errors
                logger.warn(`Unhandled Prisma Known Request Error Code: ${error.code}`);
                message = `A database constraint occurred (Code: ${error.code}). Please check your input.`;
                statusCode = httpStatus.BAD_REQUEST; // Treat as bad request generally
                details = { code: error.code };
                break;
        }
    }
    else if (error instanceof Prisma.PrismaClientValidationError) {
        isOperational = true;
        statusCode = httpStatus.BAD_REQUEST;
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
            : httpStatus.INTERNAL_SERVER_ERROR;

        // Use error message or default http status message
        message = error.message || (httpStatus[statusCode as keyof typeof httpStatus] as string || 'An unexpected error occurred');

        // Determine if it's operational based on status code
        // If a specific status code < 500 was provided, assume it was intentional
        if (statusCode < 500) {
            isOperational = true;
        } else {
            // Otherwise, assume 5xx or default INTERNAL_SERVER_ERROR are non-operational programming errors
            isOperational = false;
        }
    }

    // Create a new ApiError instance, preserving the original stack
    error = new ApiError(statusCode, message, isOperational, details, err.stack);
  }

  // Pass the standardized ApiError to the final error handler
  next(error);
};


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
export const errorHandler = (err: ApiError, req: Request, res: Response, next: NextFunction) => {
  let { statusCode, message, isOperational, errorDetails } = err;

  // In production environments, prevent leaking details of non-operational (likely programming) errors
  if (env.NODE_ENV === 'production' && !isOperational) {
    statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR] as string;
    errorDetails = undefined; // Clear details in production for non-operational errors
  }

  // Store error message in res.locals (useful for access logs or monitoring)
  res.locals.errorMessage = err.message;

  // Construct the JSON response payload
  const response: Record<string, any> = {
    code: statusCode,
    message: message,
    // Include error details if they exist (and not masked by production rule above)
    ...(errorDetails && { details: errorDetails }),
    // Include stack trace only in development environment for debugging
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  // Log the error using Winston logger
  if (env.NODE_ENV === 'development') {
    // Log the full error object in development for maximum detail
    logger.error('Error caught by handler:', err);
  } else {
    // In production, log essential info or use structured logging
    // Include essential request context
    logger.error(
        `[${statusCode}${isOperational ? '' : ' NON-OPERATIONAL'}] ${message} - ${req.method} ${req.originalUrl} - IP: ${req.ip}` +
        // Optionally log stack for non-operational errors even in prod for debugging critical issues
        `${err.stack && !isOperational ? `\nStack: ${err.stack}` : ''}`
        );
  }

  // Send the error response to the client
  res.status(statusCode).send(response);
};