"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRateLimiter = exports.generalRateLimiter = void 0;
// src/middleware/rateLimit.middleware.ts
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("@/config");
const logger_1 = __importDefault(require("@/utils/logger"));
// General rate limiter for most API requests
exports.generalRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: (config_1.env.RATE_LIMIT_WINDOW_MINUTES || 15) * 60 * 1000, // configurable window in minutes
    max: config_1.env.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to N requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many requests from this IP, please try again later.",
    handler: (req, res, next, options) => {
        logger_1.default.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
        res.status(options.statusCode).send({ message: options.message });
    },
});
// Stricter rate limiter specifically for authentication routes
exports.authRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 auth attempts (login, refresh, forgot, reset) per window
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many authentication attempts from this IP, please try again after 15 minutes.",
    handler: (req, res, next, options) => {
        logger_1.default.warn(`Auth rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
        res.status(options.statusCode).send({ message: options.message });
    },
});
//# sourceMappingURL=rateLimit.middleware.js.map