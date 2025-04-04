"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = void 0;
// src/modules/auth/auth.service.ts
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken")); // Import SignOptions
const ms_1 = __importDefault(require("ms")); // Import 'ms' for time string conversion
const http_status_1 = __importDefault(require("http-status"));
const config_1 = require("@/config");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
const token_utils_1 = require("@/utils/token.utils");
const email_service_1 = require("@/utils/email.service"); // Import mock/real email service
/**
 * Generate JWT access token.
 * @param {User} user - The user object.
 * @returns {string} The generated JWT access token.
 */
const generateAccessToken = (user) => {
    const payload = {
        userId: user.id,
        tenantId: user.tenantId,
    };
    // Convert expiresIn string from env to seconds (number)
    let expiresInSeconds;
    try {
        const expiresInMs = (0, ms_1.default)(config_1.env.JWT_EXPIRES_IN);
        if (typeof expiresInMs !== 'number' || isNaN(expiresInMs) || expiresInMs <= 0) {
            throw new Error(`Invalid time string format: "${config_1.env.JWT_EXPIRES_IN}"`);
        }
        expiresInSeconds = Math.floor(expiresInMs / 1000);
    }
    catch (e) {
        logger_1.default.error(`Invalid JWT_EXPIRES_IN format: "${config_1.env.JWT_EXPIRES_IN}". Defaulting to 15 minutes.`, { error: e });
        expiresInSeconds = 15 * 60; // Default to 15 minutes (900 seconds) if conversion fails
    }
    // Explicitly type the options object using SignOptions
    const signOptions = {
        expiresIn: expiresInSeconds, // Use the numeric value (seconds)
        // algorithm: 'HS256' // Default is HS256, specify if needed
    };
    // Sign the token
    return jsonwebtoken_1.default.sign(payload, config_1.env.JWT_SECRET, signOptions);
};
/**
 * Generate a secure refresh token, hash it, and store it in the database.
 * @param {User} user - The user object.
 * @param {string} [ipAddress] - Optional IP address of the request.
 * @param {string} [userAgent] - Optional user agent string of the request.
 * @returns {Promise<string>} A promise that resolves with the raw (unhashed) refresh token.
 */
const generateAndStoreRefreshToken = async (user, ipAddress, userAgent) => {
    const rawRefreshToken = (0, token_utils_1.generateSecureToken)(64); // Generate a long random token
    const hashedToken = await (0, token_utils_1.hashToken)(rawRefreshToken);
    // Use ms() here for calculating the Date object - less problematic type-wise
    let expiryDate;
    try {
        const expiryMs = (0, ms_1.default)(`${config_1.env.JWT_REFRESH_EXPIRES_IN_DAYS}d`);
        if (typeof expiryMs !== 'number' || isNaN(expiryMs) || expiryMs <= 0) {
            throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN_DAYS format: "${config_1.env.JWT_REFRESH_EXPIRES_IN_DAYS}"`);
        }
        expiryDate = new Date(Date.now() + expiryMs);
    }
    catch (e) {
        const defaultDays = 7;
        logger_1.default.error(`Invalid JWT_REFRESH_EXPIRES_IN_DAYS format: "${config_1.env.JWT_REFRESH_EXPIRES_IN_DAYS}". Defaulting to ${defaultDays} days.`, { error: e });
        expiryDate = new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000); // Default fallback
    }
    await config_1.prisma.refreshToken.create({
        data: {
            userId: user.id,
            tokenHash: hashedToken,
            expiresAt: expiryDate,
            ipAddress: ipAddress, // Store requesting IP (optional)
            userAgent: userAgent, // Store user agent (optional)
        },
    });
    logger_1.default.debug(`Stored new refresh token for user ${user.id}`);
    return rawRefreshToken; // Return the raw token only once
};
/**
 * Find and validate a stored refresh token based on the raw token provided.
 * Checks hash match, expiry, and revocation status.
 * Note: This implementation iterates through potential tokens, which can be inefficient at large scale.
 * @param {string} rawRefreshToken - The raw refresh token provided by the client.
 * @returns {Promise<RefreshToken>} A promise that resolves with the valid RefreshToken record.
 * @throws {ApiError} If the token is not found, invalid, expired, or revoked.
 */
const findAndValidateRefreshToken = async (rawRefreshToken) => {
    // Find *all* non-revoked, non-expired tokens and check hash match.
    const potentialValidTokens = await config_1.prisma.refreshToken.findMany({
        where: {
            revokedAt: null,
            expiresAt: { gt: new Date() }
        }
    });
    let matchedTokenRecord = null;
    for (const tokenRecord of potentialValidTokens) {
        const isMatch = await (0, token_utils_1.compareToken)(rawRefreshToken, tokenRecord.tokenHash);
        if (isMatch) {
            matchedTokenRecord = tokenRecord;
            break;
        }
    }
    if (!matchedTokenRecord) {
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid refresh token or session expired.');
    }
    logger_1.default.debug(`Validated refresh token record ${matchedTokenRecord.id} for user ${matchedTokenRecord.userId}`);
    return matchedTokenRecord;
};
/**
 * Login with username and password, generate access and refresh tokens.
 * @param {string} email - User's email.
 * @param {string} password - User's password.
 * @param {string} [ipAddress] - Optional IP address.
 * @param {string} [userAgent] - Optional user agent.
 * @returns {Promise<{user: Omit<User, 'passwordHash'>; tokens: AuthTokens}>} User object and auth tokens.
 */
const loginUserWithEmailAndPassword = async (email, password, ipAddress, userAgent) => {
    const lowerCaseEmail = email.toLowerCase();
    const user = await config_1.prisma.user.findUnique({ where: { email: lowerCaseEmail } });
    // Define logContext upfront
    const logContext = { function: 'login', email: lowerCaseEmail, ipAddress, tenantId: user?.tenantId, userId: user?.id };
    if (!user) {
        logger_1.default.warn('Login failed: User not found', logContext);
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Incorrect email or password');
    }
    // Update context if user is found but other checks fail
    logContext.tenantId = user.tenantId;
    logContext.userId = user.id;
    const isPasswordMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!isPasswordMatch) {
        logger_1.default.warn('Login failed: Incorrect password', logContext);
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Incorrect email or password');
    }
    if (!user.isActive) {
        logger_1.default.warn('Login failed: User inactive', logContext);
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Your account is inactive.');
    }
    // Generate tokens
    const accessToken = generateAccessToken(user);
    const rawRefreshToken = await generateAndStoreRefreshToken(user, ipAddress, userAgent);
    logger_1.default.info('Login successful', logContext);
    // Exclude password hash from returned user object
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;
    return {
        user: userWithoutPassword,
        tokens: { accessToken, refreshToken: rawRefreshToken },
    };
};
/**
 * Refresh authentication tokens using a valid refresh token.
 * Implements refresh token rotation and basic reuse detection.
 * @param {string} oldRawRefreshToken - The raw refresh token from the client (e.g., cookie).
 * @param {string} [ipAddress] - Optional IP address.
 * @param {string} [userAgent] - Optional user agent.
 * @returns {Promise<AuthTokens>} New access and refresh tokens.
 */
const refreshAuthTokens = async (oldRawRefreshToken, ipAddress, userAgent) => {
    const logContext = { function: 'refreshAuthTokens', ipAddress };
    try {
        // Find the matching, valid, non-revoked token record
        const matchedTokenRecord = await findAndValidateRefreshToken(oldRawRefreshToken);
        logContext.userId = matchedTokenRecord.userId;
        logContext.tokenId = matchedTokenRecord.id;
        // **Reuse Detection / Rotation:**
        // Immediately mark the matched token as revoked *before* generating new ones.
        await config_1.prisma.refreshToken.update({
            where: { id: matchedTokenRecord.id },
            data: { revokedAt: new Date() },
        });
        logger_1.default.debug(`Revoked old refresh token ${matchedTokenRecord.id} during refresh`, logContext);
        // Get user associated with the token
        const user = await config_1.prisma.user.findUnique({ where: { id: matchedTokenRecord.userId } });
        if (!user || !user.isActive) {
            logger_1.default.warn(`Refresh token validation failed: User not found or inactive.`, logContext);
            throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'User associated with token not found or inactive.');
        }
        logContext.tenantId = user.tenantId; // Add tenantId
        // Generate a new pair of tokens
        const newAccessToken = generateAccessToken(user);
        const newRawRefreshToken = await generateAndStoreRefreshToken(user, ipAddress, userAgent);
        logger_1.default.info(`Auth tokens refreshed successfully`, logContext);
        return {
            accessToken: newAccessToken,
            refreshToken: newRawRefreshToken,
        };
    }
    catch (error) {
        logContext.error = error; // Add error to context for logging
        if (error instanceof ApiError_1.default && error.statusCode === http_status_1.default.UNAUTHORIZED) {
            logger_1.default.warn(`Refresh token validation failed: ${error.message}.`, logContext);
            throw error; // Re-throw the specific ApiError
        }
        logger_1.default.error(`Error during token refresh`, logContext);
        // Throw a generic server error for unexpected issues
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Could not refresh token due to an internal error.');
    }
};
/**
 * Logout user by revoking a specific refresh token hash found in the database.
 * @param {string} rawRefreshToken - The raw refresh token provided by the client.
 * @returns {Promise<void>}
 */
const logoutUser = async (rawRefreshToken) => {
    const logContext = { function: 'logoutUser' };
    try {
        // Find the matching token record to revoke it.
        const matchedTokenRecord = await findAndValidateRefreshToken(rawRefreshToken);
        logContext.userId = matchedTokenRecord.userId;
        logContext.tokenId = matchedTokenRecord.id;
        // Mark the specific token as revoked
        await config_1.prisma.refreshToken.update({
            where: { id: matchedTokenRecord.id },
            data: { revokedAt: new Date() },
        });
        logger_1.default.info(`User logout successful: Revoked refresh token`, logContext);
    }
    catch (error) {
        logContext.error = error; // Add error to context
        // If findAndValidateRefreshToken threw an error (token not found, expired, already revoked)
        if (error instanceof ApiError_1.default && error.statusCode === http_status_1.default.UNAUTHORIZED) {
            logger_1.default.warn(`Logout attempt with invalid/expired/revoked refresh token: ${error.message}`, logContext);
        }
        else {
            // Log unexpected errors during the process
            logger_1.default.error(`Error during logout process`, logContext);
        }
        // We don't throw an error here. Logout should succeed from the client's perspective
        // even if the token was already invalid server-side. Client should clear its tokens.
    }
};
/**
 * Initiate password reset process: Generate token, store hash, send email.
 * @param {string} email - The email address of the user requesting the reset.
 * @returns {Promise<void>}
 */
const forgotPassword = async (email) => {
    const lowerCaseEmail = email.toLowerCase();
    const user = await config_1.prisma.user.findUnique({ where: { email: lowerCaseEmail } });
    // Define context with all potential fields marked optional initially
    const logContext = { function: 'forgotPassword', email: lowerCaseEmail, userId: user?.id, tenantId: user?.tenantId };
    // IMPORTANT: Always return successfully to prevent email enumeration attacks.
    if (!user || !user.isActive) {
        logger_1.default.warn(`Forgot password request: User not found or inactive`, logContext);
        return; // Do nothing further visible to the user
    }
    // Update context now we know user exists
    logContext.userId = user.id;
    logContext.tenantId = user.tenantId;
    // Generate reset token
    const rawResetToken = (0, token_utils_1.generateSecureToken)(); // Use a different length if desired, e.g., 48
    const hashedToken = await (0, token_utils_1.hashToken)(rawResetToken);
    let expiryDate;
    try {
        const expiryMs = (0, ms_1.default)(config_1.env.PASSWORD_RESET_EXPIRES_IN);
        if (typeof expiryMs !== 'number' || isNaN(expiryMs) || expiryMs <= 0) {
            throw new Error(`Invalid time string format: "${config_1.env.PASSWORD_RESET_EXPIRES_IN}"`);
        }
        expiryDate = new Date(Date.now() + expiryMs);
    }
    catch (e) {
        logger_1.default.error(`Invalid PASSWORD_RESET_EXPIRES_IN format: "${config_1.env.PASSWORD_RESET_EXPIRES_IN}". Defaulting to 1 hour.`, { error: e });
        expiryDate = new Date(Date.now() + 60 * 60 * 1000); // Default to 1 hour
    }
    // Store hashed token in DB (consider removing old tokens)
    await config_1.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await config_1.prisma.passwordResetToken.create({
        data: {
            userId: user.id,
            tokenHash: hashedToken,
            expiresAt: expiryDate,
        }
    });
    logger_1.default.debug(`Stored password reset token`, logContext);
    // Construct reset URL (send RAW token in the link)
    const resetUrl = `${config_1.env.FRONTEND_URL}/reset-password?token=${rawResetToken}`;
    // Send email (using mock/real service)
    const emailSent = await email_service_1.emailService.sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Click the following link to reset your password:\n${resetUrl}\n\nIf you did not request this, please ignore this email. This link will expire in ${config_1.env.PASSWORD_RESET_EXPIRES_IN}.`,
        // html: `<p>You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password.</p><p>Link expires in ${env.PASSWORD_RESET_EXPIRES_IN}.</p>`
    });
    if (emailSent) {
        logger_1.default.info(`Password reset email initiated successfully`, logContext);
    }
    else {
        logger_1.default.error(`Password reset email failed to send`, logContext);
        // Silently fail from user perspective, but log the error.
    }
    // Always return void to the controller
};
/**
 * Reset user password using a valid token and new password.
 * @param {string} rawResetToken - The raw reset token from the URL/request.
 * @param {string} newPassword - The new password provided by the user.
 * @returns {Promise<void>}
 * @throws {ApiError} If token is invalid/expired or user not found/inactive, or update fails.
 */
const resetPassword = async (rawResetToken, newPassword) => {
    // Define context with all potential fields marked optional initially
    const logContext = { function: 'resetPassword', userId: null, tenantId: null, email: null, tokenId: null };
    // 1. Find potentially matching, unused, non-expired token records
    const potentialTokenRecords = await config_1.prisma.passwordResetToken.findMany({
        where: {
            usedAt: null, // Not already used
            expiresAt: { gt: new Date() } // Not expired
        }
    });
    let matchedTokenRecord = null;
    for (const tokenRecord of potentialTokenRecords) {
        // 2. Compare provided raw token with stored hash
        const isMatch = await (0, token_utils_1.compareToken)(rawResetToken, tokenRecord.tokenHash);
        if (isMatch) {
            matchedTokenRecord = tokenRecord;
            break;
        }
    }
    if (!matchedTokenRecord) {
        logger_1.default.warn(`Password reset attempt failed: Invalid or expired token provided.`, logContext);
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid or expired password reset token.');
    }
    // Update logContext properties now we have a match
    logContext.userId = matchedTokenRecord.userId;
    logContext.tokenId = matchedTokenRecord.id;
    // 3. Get the user associated with the valid token
    const user = await config_1.prisma.user.findUnique({ where: { id: matchedTokenRecord.userId } });
    if (!user || !user.isActive) {
        logger_1.default.error(`Password reset failed: User not found or inactive for a valid token.`, logContext);
        // Mark token as used even if user not found to prevent reuse
        await config_1.prisma.passwordResetToken.update({ where: { id: matchedTokenRecord.id }, data: { usedAt: new Date() } });
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Associated user account not found or inactive.');
    }
    // Update logContext properties
    logContext.tenantId = user.tenantId;
    logContext.email = user.email;
    // 4. Hash the new password
    const newPasswordHash = await bcryptjs_1.default.hash(newPassword, 10); // Use appropriate salt rounds (e.g., 10-12)
    // 5. Update user password, mark token as used, and revoke refresh tokens in a transaction
    try {
        // Use Prisma Transaction Client type for type safety within transaction
        await config_1.prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: user.id },
                data: { passwordHash: newPasswordHash },
            });
            await tx.passwordResetToken.update({
                where: { id: matchedTokenRecord.id }, // Use non-null assertion as we checked above
                data: { usedAt: new Date() }, // Mark reset token as used
            });
            // Security enhancement: Revoke all active refresh tokens for this user
            await tx.refreshToken.updateMany({
                where: { userId: user.id, revokedAt: null },
                data: { revokedAt: new Date() }
            });
        });
        logger_1.default.info(`Password reset successful`, logContext);
    }
    catch (error) {
        logContext.error = error; // Add error to context
        logger_1.default.error(`Password reset transaction failed`, logContext);
        // Provide a generic error message to the user
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to update password due to an internal error.');
    }
};
// Export the public service methods
exports.authService = {
    loginUserWithEmailAndPassword,
    refreshAuthTokens,
    logoutUser,
    forgotPassword,
    resetPassword,
};
//# sourceMappingURL=auth.service.js.map