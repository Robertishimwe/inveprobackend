// src/modules/auth/auth.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import ms from 'ms';
import { authService } from './auth.service';
import catchAsync from '@/utils/catchAsync';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { env } from '@/config';
import logger from '@/utils/logger';
import ApiError from '@/utils/ApiError';


/**
 * Sets the refresh token in an HttpOnly cookie.
 */
const setRefreshTokenCookie = (res: Response, refreshToken: string) => {
    const cookieOptions = {
        httpOnly: true, // Prevent client-side JS access
        secure: env.NODE_ENV === 'production', // Send only over HTTPS in production
        sameSite: 'lax' as const, // Or 'strict'. Lax is often suitable for SPAs. Avoid 'none' unless absolutely necessary with secure flag.
        maxAge: ms(`${env.JWT_REFRESH_EXPIRES_IN_DAYS}d`), // Cookie expiry in milliseconds
        // path: '/api/v1/auth', // Optional: Scope cookie path to auth routes
    };
    res.cookie(env.REFRESH_TOKEN_COOKIE_NAME, refreshToken, cookieOptions);
};

/**
 * Clears the refresh token cookie.
 */
const clearRefreshTokenCookie = (res: Response) => {
     const cookieOptions = {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        expires: new Date(0), // Set expiry date to the past
    };
    res.cookie(env.REFRESH_TOKEN_COOKIE_NAME, '', cookieOptions); // Set empty value with past expiry
};

/**
 * Handle user login requests.
 */
const login = catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginDto;
    const ipAddress = req.ip; // Get IP address from request
    const userAgent = req.headers['user-agent']; // Get user agent

    const { user, tokens } = await authService.loginUserWithEmailAndPassword(
        email,
        password,
        ipAddress,
        userAgent
    );

    // Set refresh token in cookie
    setRefreshTokenCookie(res, tokens.refreshToken);

    // Send access token and user info in response body
    res.status(httpStatus.OK).send({
        message: "Login successful",
        user,
        accessToken: tokens.accessToken, // Only send access token in body
    });
});

/**
 * Handle refresh token requests.
 */
const refreshTokens = catchAsync(async (req: Request, res: Response) => {
    // Get refresh token from cookie
    const oldRefreshToken = req.cookies[env.REFRESH_TOKEN_COOKIE_NAME];
    if (!oldRefreshToken) {
        logger.warn(`Refresh token request failed: Missing refresh token cookie. IP: ${req.ip}`);
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token missing');
    }

    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    // Call service to refresh tokens
    const newTokens = await authService.refreshAuthTokens(
        oldRefreshToken,
        ipAddress,
        userAgent
    );

    // Set new refresh token in cookie
    setRefreshTokenCookie(res, newTokens.refreshToken);

    // Send only the new access token in the response body
    res.status(httpStatus.OK).send({
        accessToken: newTokens.accessToken
    });
});

/**
 * Handle user logout requests.
 */
const logout = catchAsync(async (req: Request, res: Response) => {
     const refreshToken = req.cookies[env.REFRESH_TOKEN_COOKIE_NAME];

     if (refreshToken) {
        // Instruct service to revoke the token
        await authService.logoutUser(refreshToken);
     } else {
        logger.info(`Logout request received without a refresh token cookie. IP: ${req.ip}`);
     }

    // Clear the cookie on the client side regardless
    clearRefreshTokenCookie(res);

    res.status(httpStatus.OK).send({ message: 'Logout successful' });
});


/**
 * Handle forgot password requests.
 */
const forgotPassword = catchAsync(async (req: Request, res: Response) => {
    const { email } = req.body as ForgotPasswordDto;

    // Service handles logic including sending email (or mock)
    // It intentionally doesn't throw error if user not found
    await authService.forgotPassword(email);

    // Always send a generic success message to prevent email enumeration
    res.status(httpStatus.OK).send({ message: 'If an account with that email exists, a password reset link has been sent.' });
});

/**
 * Handle reset password requests.
 */
const resetPassword = catchAsync(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body as ResetPasswordDto;

    // Service validates token and updates password
    await authService.resetPassword(token, newPassword);

    // Send success response
    res.status(httpStatus.OK).send({ message: 'Password has been reset successfully.' });
});


export const authController = {
  login,
  refreshTokens,
  logout,
  forgotPassword,
  resetPassword,
};
