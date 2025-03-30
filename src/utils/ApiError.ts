// src/utils/ApiError.ts
import httpStatus from 'http-status';

class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public errorDetails?: any; // Optional field for additional error context

  /**
   * Creates an API Error object.
   * @param statusCode - The HTTP status code for the error.
   * @param message - The error message.
   * @param isOperational - Flag indicating if this is an operational error (expected, vs. a bug). Defaults to true.
   * @param errorDetails - Optional additional details about the error.
   * @param stack - Optional stack trace. If not provided, it will be captured.
   */
  constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    errorDetails?: any,
    stack = ''
  ) {
    // Ensure message is passed to the parent Error constructor
    super(message);

    // Set properties
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if(errorDetails) {
        this.errorDetails = errorDetails;
    }

    // Set the prototype explicitly (important for extending built-in classes like Error)
    Object.setPrototypeOf(this, ApiError.prototype);

    // Capture stack trace if not provided
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }

    // Ensure the name property is set correctly (might be needed by some error handling libraries)
    this.name = this.constructor.name;
  }

  // Static helper methods for common errors (optional but convenient)
  static badRequest(message = httpStatus[httpStatus.BAD_REQUEST] as string, details?: any): ApiError {
    return new ApiError(httpStatus.BAD_REQUEST, message, true, details);
  }

  static unauthorized(message = httpStatus[httpStatus.UNAUTHORIZED] as string, details?: any): ApiError {
    return new ApiError(httpStatus.UNAUTHORIZED, message, true, details);
  }

  static forbidden(message = httpStatus[httpStatus.FORBIDDEN] as string, details?: any): ApiError {
    return new ApiError(httpStatus.FORBIDDEN, message, true, details);
  }

  static notFound(message = httpStatus[httpStatus.NOT_FOUND] as string, details?: any): ApiError {
    return new ApiError(httpStatus.NOT_FOUND, message, true, details);
  }

  static internal(message = httpStatus[httpStatus.INTERNAL_SERVER_ERROR] as string, details?: any, originalError?: Error): ApiError {
    // For internal errors, mark as non-operational unless explicitly overridden
    const isOperational = false;
    // Capture original stack if provided
    const stack = originalError?.stack;
    return new ApiError(httpStatus.INTERNAL_SERVER_ERROR, message, isOperational, details, stack);
  }
}

export default ApiError;
