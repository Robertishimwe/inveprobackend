// src/middleware/rateLimit.middleware.ts
import rateLimit from "express-rate-limit";
import { env } from "@/config";
import logger from "@/utils/logger";

// General rate limiter for most API requests
export const generalRateLimiter = rateLimit({
  windowMs: (env.RATE_LIMIT_WINDOW_MINUTES || 15) * 60 * 1000, // configurable window in minutes
  max: env.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to N requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: "Too many requests from this IP, please try again later.",
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(options.statusCode).send({ message: options.message });
  },
});

// Stricter rate limiter specifically for authentication routes
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth attempts (login, refresh, forgot, reset) per window
  standardHeaders: true,
  legacyHeaders: false,
  message:
    "Too many authentication attempts from this IP, please try again after 15 minutes.",
  handler: (req, res, next, options) => {
    logger.warn(
      `Auth rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`
    );
    res.status(options.statusCode).send({ message: options.message });
  },
});
