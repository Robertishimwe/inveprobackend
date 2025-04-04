"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const ms_1 = __importDefault(require("ms"));
const auth_service_1 = require("./auth.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const config_1 = require("@/config");
const logger_1 = __importDefault(require("@/utils/logger"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
/**
 * Sets the refresh token in an HttpOnly cookie.
 */
const setRefreshTokenCookie = (res, refreshToken) => {
    const cookieOptions = {
        httpOnly: true, // Prevent client-side JS access
        secure: config_1.env.NODE_ENV === 'production', // Send only over HTTPS in production
        sameSite: 'lax', // Or 'strict'. Lax is often suitable for SPAs. Avoid 'none' unless absolutely necessary with secure flag.
        maxAge: (0, ms_1.default)(`${config_1.env.JWT_REFRESH_EXPIRES_IN_DAYS}d`), // Cookie expiry in milliseconds
        // path: '/api/v1/auth', // Optional: Scope cookie path to auth routes
    };
    res.cookie(config_1.env.REFRESH_TOKEN_COOKIE_NAME, refreshToken, cookieOptions);
};
/**
 * Clears the refresh token cookie.
 */
const clearRefreshTokenCookie = (res) => {
    const cookieOptions = {
        httpOnly: true,
        secure: config_1.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: new Date(0), // Set expiry date to the past
    };
    res.cookie(config_1.env.REFRESH_TOKEN_COOKIE_NAME, '', cookieOptions); // Set empty value with past expiry
};
/**
 * Handle user login requests.
 */
const login = (0, catchAsync_1.default)(async (req, res) => {
    const { email, password } = req.body;
    const ipAddress = req.ip; // Get IP address from request
    const userAgent = req.headers['user-agent']; // Get user agent
    const { user, tokens } = await auth_service_1.authService.loginUserWithEmailAndPassword(email, password, ipAddress, userAgent);
    // Set refresh token in cookie
    setRefreshTokenCookie(res, tokens.refreshToken);
    // Send access token and user info in response body
    res.status(http_status_1.default.OK).send({
        message: "Login successful",
        user,
        accessToken: tokens.accessToken, // Only send access token in body
    });
});
/**
 * Handle refresh token requests.
 */
const refreshTokens = (0, catchAsync_1.default)(async (req, res) => {
    // Get refresh token from cookie
    const oldRefreshToken = req.cookies[config_1.env.REFRESH_TOKEN_COOKIE_NAME];
    if (!oldRefreshToken) {
        logger_1.default.warn(`Refresh token request failed: Missing refresh token cookie. IP: ${req.ip}`);
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Refresh token missing');
    }
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    // Call service to refresh tokens
    const newTokens = await auth_service_1.authService.refreshAuthTokens(oldRefreshToken, ipAddress, userAgent);
    // Set new refresh token in cookie
    setRefreshTokenCookie(res, newTokens.refreshToken);
    // Send only the new access token in the response body
    res.status(http_status_1.default.OK).send({
        accessToken: newTokens.accessToken
    });
});
/**
 * Handle user logout requests.
 */
const logout = (0, catchAsync_1.default)(async (req, res) => {
    const refreshToken = req.cookies[config_1.env.REFRESH_TOKEN_COOKIE_NAME];
    if (refreshToken) {
        // Instruct service to revoke the token
        await auth_service_1.authService.logoutUser(refreshToken);
    }
    else {
        logger_1.default.info(`Logout request received without a refresh token cookie. IP: ${req.ip}`);
    }
    // Clear the cookie on the client side regardless
    clearRefreshTokenCookie(res);
    res.status(http_status_1.default.OK).send({ message: 'Logout successful' });
});
/**
 * Handle forgot password requests.
 */
const forgotPassword = (0, catchAsync_1.default)(async (req, res) => {
    const { email } = req.body;
    // Service handles logic including sending email (or mock)
    // It intentionally doesn't throw error if user not found
    await auth_service_1.authService.forgotPassword(email);
    // Always send a generic success message to prevent email enumeration
    res.status(http_status_1.default.OK).send({ message: 'If an account with that email exists, a password reset link has been sent.' });
});
/**
 * Handle reset password requests.
 */
const resetPassword = (0, catchAsync_1.default)(async (req, res) => {
    const { token, newPassword } = req.body;
    // Service validates token and updates password
    await auth_service_1.authService.resetPassword(token, newPassword);
    // Send success response
    res.status(http_status_1.default.OK).send({ message: 'Password has been reset successfully.' });
});
exports.authController = {
    login,
    refreshTokens,
    logout,
    forgotPassword,
    resetPassword,
};
//# sourceMappingURL=auth.controller.js.map