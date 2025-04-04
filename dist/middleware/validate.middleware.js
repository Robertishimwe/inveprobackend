"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
const logger_1 = __importDefault(require("@/utils/logger"));
/**
 * Recursively extracts constraint messages from validation errors.
 * @param errors - Array of ValidationErrors.
 * @returns An array of string error messages.
 */
const formatValidationErrors = (errors) => {
    let messages = [];
    errors.forEach((err) => {
        // Get constraints from the current error object
        if (err.constraints) {
            messages = messages.concat(Object.values(err.constraints));
        }
        // Recursively process children errors (for nested objects)
        if (err.children && err.children.length > 0) {
            messages = messages.concat(formatValidationErrors(err.children));
        }
    });
    return messages;
};
/**
 * Middleware factory function to generate a validation middleware.
 *
 * @template T - The type of the DTO class (must be an object).
 * @param dtoClass - The DTO class constructor to validate against.
 * @param source - Where to find the data in the request ('body', 'query', or 'params'). Defaults to 'body'.
 * @param skipMissingProperties - If true, skips validation for missing properties. Defaults to false.
 * @returns An Express RequestHandler middleware function.
 */
const validateRequest = (dtoClass, // Use ClassConstructor for type safety
source = 'body', skipMissingProperties = false // Allow optional skipping of missing properties
) => {
    return async (req, res, next) => {
        // Get the data object from the specified request source
        const dataToValidate = req[source];
        // Use plainToInstance to create an instance of the DTO class.
        // This applies transformation decorators (e.g., @Type, @Transform).
        // Pass `exposeUnsetFields: false` if you want to ensure only defined fields are present after transformation.
        const dtoInstance = (0, class_transformer_1.plainToInstance)(dtoClass, dataToValidate, {
        // excludeExtraneousValues: true, // Use if you want to strip properties not in DTO *after* transformation
        });
        // Perform validation using class-validator
        const errors = await (0, class_validator_1.validate)(dtoInstance, {
            skipMissingProperties, // Control validation of missing fields
            whitelist: true, // Remove properties not defined in DTO (incoming data)
            forbidNonWhitelisted: true, // Throw error if extra properties are present after whitelist
            forbidUnknownValues: true, // Prevent unknown values (similar to forbidNonWhitelisted)
        });
        // If validation errors are found
        if (errors.length > 0) {
            // Format the errors into a readable list
            const errorMessages = formatValidationErrors(errors);
            const message = `Input validation failed: ${errorMessages.join(', ')}`;
            logger_1.default.warn(`Validation Error (${req.method} ${req.originalUrl}): ${message}`);
            // Pass an ApiError to the global error handler
            return next(new ApiError_1.default(http_status_1.default.BAD_REQUEST, message, true, { errors: errorMessages }));
        }
        // Validation successful!
        // Replace the original request data (e.g., req.body) with the validated and potentially transformed DTO instance.
        // This ensures controllers receive clean, typed, and transformed data.
        req[source] = dtoInstance;
        // Proceed to the next middleware or route handler
        next();
    };
};
exports.default = validateRequest;
//# sourceMappingURL=validate.middleware.js.map