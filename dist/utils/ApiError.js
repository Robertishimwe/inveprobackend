"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/utils/ApiError.ts
const http_status_1 = __importDefault(require("http-status"));
class ApiError extends Error {
    /**
     * Creates an API Error object.
     * @param statusCode - The HTTP status code for the error.
     * @param message - The error message.
     * @param isOperational - Flag indicating if this is an operational error (expected, vs. a bug). Defaults to true.
     * @param errorDetails - Optional additional details about the error.
     * @param stack - Optional stack trace. If not provided, it will be captured.
     */
    constructor(statusCode, message, isOperational = true, errorDetails, stack = '') {
        // Ensure message is passed to the parent Error constructor
        super(message);
        // Set properties
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        if (errorDetails) {
            this.errorDetails = errorDetails;
        }
        // Set the prototype explicitly (important for extending built-in classes like Error)
        Object.setPrototypeOf(this, ApiError.prototype);
        // Capture stack trace if not provided
        if (stack) {
            this.stack = stack;
        }
        else {
            Error.captureStackTrace(this, this.constructor);
        }
        // Ensure the name property is set correctly (might be needed by some error handling libraries)
        this.name = this.constructor.name;
    }
    // Static helper methods for common errors (optional but convenient)
    static badRequest(message = http_status_1.default[http_status_1.default.BAD_REQUEST], details) {
        return new ApiError(http_status_1.default.BAD_REQUEST, message, true, details);
    }
    static unauthorized(message = http_status_1.default[http_status_1.default.UNAUTHORIZED], details) {
        return new ApiError(http_status_1.default.UNAUTHORIZED, message, true, details);
    }
    static forbidden(message = http_status_1.default[http_status_1.default.FORBIDDEN], details) {
        return new ApiError(http_status_1.default.FORBIDDEN, message, true, details);
    }
    static notFound(message = http_status_1.default[http_status_1.default.NOT_FOUND], details) {
        return new ApiError(http_status_1.default.NOT_FOUND, message, true, details);
    }
    static internal(message = http_status_1.default[http_status_1.default.INTERNAL_SERVER_ERROR], details, originalError) {
        // For internal errors, mark as non-operational unless explicitly overridden
        const isOperational = false;
        // Capture original stack if provided
        const stack = originalError?.stack;
        return new ApiError(http_status_1.default.INTERNAL_SERVER_ERROR, message, isOperational, details, stack);
    }
}
exports.default = ApiError;
//# sourceMappingURL=ApiError.js.map