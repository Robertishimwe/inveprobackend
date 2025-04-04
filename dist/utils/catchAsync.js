"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Wraps an asynchronous request handler to catch any promise rejections
 * and pass them to the Express error handling middleware.
 *
 * @param fn - The asynchronous request handler function to wrap.
 * @returns A standard Express request handler function.
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        // Execute the async function and ensure its promise is handled
        Promise.resolve(fn(req, res, next)).catch((err) => {
            // If an error occurs (promise rejects), pass it to the next middleware (error handler)
            next(err);
        });
    };
};
exports.default = catchAsync;
//# sourceMappingURL=catchAsync.js.map