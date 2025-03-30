// src/modules/auth/auth.routes.ts
import express from 'express';
import cookieParser from 'cookie-parser'; // Import cookie-parser
import { authController } from './auth.controller';
import validateRequest from '@/middleware/validate.middleware';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { authRateLimiter } from '@/middleware/rateLimit.middleware'; // Import auth rate limiter
// Import generalRateLimiter if needed for other routes

const router = express.Router();

// Apply cookie parser middleware to this router to handle refresh token cookies
router.use(cookieParser());

// Apply auth-specific rate limiting to all auth routes
router.use(authRateLimiter);

// --- Define Authentication Routes ---

router.post(
    '/login',
    validateRequest(LoginDto), // Defaults to 'body'
    authController.login
);

router.post(
    '/refresh-token',
    authController.refreshTokens // Reads refresh token from cookie
);

router.post(
    '/logout',
    authController.logout // Reads refresh token from cookie to invalidate server-side
);

router.post(
    '/forgot-password',
    validateRequest(ForgotPasswordDto),
    authController.forgotPassword
);

router.post(
    '/reset-password',
    validateRequest(ResetPasswordDto),
    authController.resetPassword
);

export default router;
