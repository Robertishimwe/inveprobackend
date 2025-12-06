// src/modules/auth/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken'; // Import SignOptions
import ms from 'ms'; // Import 'ms' for time string conversion
import httpStatus from 'http-status';
import { prisma, env } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { User, RefreshToken, PasswordResetToken, Prisma } from '@prisma/client'; // Import Prisma namespace for TransactionClient
import { generateSecureToken, hashToken, compareToken } from '@/utils/token.utils';
import { emailService } from '@/utils/email.service'; // Import mock/real email service

// --- Log Context Type Helper ---
// Define a type for log contexts for consistency
type LogContext = {
    function?: string;
    email?: string | null;
    userId?: string | null;
    tenantId?: string | null;
    ipAddress?: string | null;
    tokenId?: string | null; // Example for token IDs
    error?: any; // Optional error object
    [key: string]: any; // Allow other keys if needed
};

interface AuthTokens {
    accessToken: string;
    refreshToken: string; // The raw refresh token (to send in cookie)
}

/**
 * Generate JWT access token.
 * @param {User} user - The user object.
 * @returns {string} The generated JWT access token.
 */
const generateAccessToken = (user: User): string => {
    const payload = {
        userId: user.id,
        tenantId: user.tenantId,
    };

    // Convert expiresIn string from env to seconds (number)
    let expiresInSeconds: number;
    try {
        const expiresInMs = ms(env.JWT_EXPIRES_IN);
        if (typeof expiresInMs !== 'number' || isNaN(expiresInMs) || expiresInMs <= 0) {
            throw new Error(`Invalid time string format: "${env.JWT_EXPIRES_IN}"`);
        }
        expiresInSeconds = Math.floor(expiresInMs / 1000);
    } catch (e) {
        logger.error(`Invalid JWT_EXPIRES_IN format: "${env.JWT_EXPIRES_IN}". Defaulting to 15 minutes.`, { error: e });
        expiresInSeconds = 15 * 60; // Default to 15 minutes (900 seconds) if conversion fails
    }

    // Explicitly type the options object using SignOptions
    const signOptions: SignOptions = {
        expiresIn: expiresInSeconds, // Use the numeric value (seconds)
        // algorithm: 'HS256' // Default is HS256, specify if needed
    };

    // Sign the token
    return jwt.sign(payload, env.JWT_SECRET, signOptions);
};

/**
 * Generate a secure refresh token, hash it, and store it in the database.
 * @param {User} user - The user object.
 * @param {string} [ipAddress] - Optional IP address of the request.
 * @param {string} [userAgent] - Optional user agent string of the request.
 * @returns {Promise<string>} A promise that resolves with the raw (unhashed) refresh token.
 */
const generateAndStoreRefreshToken = async (user: User, ipAddress?: string, userAgent?: string): Promise<string> => {
    const rawRefreshToken = generateSecureToken(64); // Generate a long random token
    const hashedToken = await hashToken(rawRefreshToken);
    // Use ms() here for calculating the Date object - less problematic type-wise
    let expiryDate: Date;
    try {
        const expiryMs = ms(`${env.JWT_REFRESH_EXPIRES_IN_DAYS}d`);
        if (typeof expiryMs !== 'number' || isNaN(expiryMs) || expiryMs <= 0) {
            throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN_DAYS format: "${env.JWT_REFRESH_EXPIRES_IN_DAYS}"`);
        }
        expiryDate = new Date(Date.now() + expiryMs);
    } catch (e) {
        const defaultDays = 7;
        logger.error(`Invalid JWT_REFRESH_EXPIRES_IN_DAYS format: "${env.JWT_REFRESH_EXPIRES_IN_DAYS}". Defaulting to ${defaultDays} days.`, { error: e });
        expiryDate = new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000); // Default fallback
    }


    const refreshTokenRecord = await prisma.refreshToken.create({
        data: {
            userId: user.id,
            tokenHash: hashedToken,
            expiresAt: expiryDate,
            ipAddress: ipAddress, // Store requesting IP (optional)
            userAgent: userAgent, // Store user agent (optional)
        },
    });
    logger.debug(`Stored new refresh token for user ${user.id}`);

    // Return composite token: id.rawToken
    return `${refreshTokenRecord.id}.${rawRefreshToken}`;
};

/**
 * Find and validate a stored refresh token based on the raw token provided.
 * Checks hash match, expiry, and revocation status.
 * Uses ID lookup for O(1) performance.
 * @param {string} rawRefreshToken - The raw refresh token provided by the client (format: id.token).
 * @returns {Promise<RefreshToken>} A promise that resolves with the valid RefreshToken record.
 * @throws {ApiError} If the token is not found, invalid, expired, or revoked.
 */
const findAndValidateRefreshToken = async (rawRefreshToken: string): Promise<RefreshToken> => {
    // Split the token to get ID and raw token
    const parts = rawRefreshToken.split('.');

    // Backward compatibility or invalid format check
    if (parts.length !== 2) {
        // Fallback to old O(N) method if it doesn't look like a composite token
        // This is useful if there are existing tokens in the wild (though we can't easily distinguish a random string from random.random)
        // But for security and performance, we should probably just reject if it's not the new format, 
        // unless we are sure we need to support old tokens. 
        // Given this is a fix for a test timeout, let's assume we can enforce the new format.
        // But to be safe against "random string that happens to have a dot", we'll just try to use the first part as ID.
        // If it's not a UUID, findUnique will fail or return null.

        // Actually, let's just reject invalid formats to be strict.
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid refresh token format.');
    }

    const [tokenId, tokenSecret] = parts;

    const tokenRecord = await prisma.refreshToken.findUnique({
        where: { id: tokenId }
    });

    if (!tokenRecord) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid refresh token.');
    }

    // Check revocation
    if (tokenRecord.revokedAt) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token revoked.');
    }

    // Check expiry
    if (new Date() > tokenRecord.expiresAt) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token expired.');
    }

    // Check hash
    const isMatch = await compareToken(tokenSecret, tokenRecord.tokenHash);
    if (!isMatch) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid refresh token.');
    }

    logger.debug(`Validated refresh token record ${tokenRecord.id} for user ${tokenRecord.userId}`);
    return tokenRecord;
};


/**
 * Login with username and password, generate access and refresh tokens.
 * @param {string} email - User's email.
 * @param {string} password - User's password.
 * @param {string} [ipAddress] - Optional IP address.
 * @param {string} [userAgent] - Optional user agent.
 * @returns {Promise<{user: Omit<User, 'passwordHash'>; tokens: AuthTokens}>} User object and auth tokens.
 */
const loginUserWithEmailAndPassword = async (
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
): Promise<{ user: Omit<User, 'passwordHash' | 'createdAt' | 'updatedAt'>; tokens: AuthTokens }> => {
    const lowerCaseEmail = email.toLowerCase();
    const user = await prisma.user.findUnique({
        where: { email: lowerCaseEmail },
        include: {
            roles: {
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {
                                    permission: true
                                }
                            }
                        }
                    }
                }
            },
            locations: {
                select: {
                    location: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            }
        }
    });
    // Define logContext upfront
    const logContext: LogContext = { function: 'login', email: lowerCaseEmail, ipAddress, tenantId: user?.tenantId, userId: user?.id };

    if (!user) {
        logger.warn('Login failed: User not found', logContext);
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
    }
    // Update context if user is found but other checks fail
    logContext.tenantId = user.tenantId;
    logContext.userId = user.id;

    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordMatch) {
        logger.warn('Login failed: Incorrect password', logContext);
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
    }

    if (!user.isActive) {
        logger.warn('Login failed: User inactive', logContext);
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Your account is inactive.');
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const rawRefreshToken = await generateAndStoreRefreshToken(user, ipAddress, userAgent);

    logger.info('Login successful', logContext);

    // Exclude password hash and timestamps from returned user object
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, createdAt, updatedAt, ...userWithoutSensitiveData } = user;

    return {
        user: userWithoutSensitiveData,
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
const refreshAuthTokens = async (
    oldRawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string
): Promise<AuthTokens> => {
    const logContext: LogContext = { function: 'refreshAuthTokens', ipAddress };
    try {
        // Find the matching, valid, non-revoked token record
        const matchedTokenRecord = await findAndValidateRefreshToken(oldRawRefreshToken);
        logContext.userId = matchedTokenRecord.userId;
        logContext.tokenId = matchedTokenRecord.id;

        // **Reuse Detection / Rotation:**
        // Immediately mark the matched token as revoked *before* generating new ones.
        await prisma.refreshToken.update({
            where: { id: matchedTokenRecord.id },
            data: { revokedAt: new Date() },
        });
        logger.debug(`Revoked old refresh token ${matchedTokenRecord.id} during refresh`, logContext);

        // Get user associated with the token
        const user = await prisma.user.findUnique({ where: { id: matchedTokenRecord.userId } });

        if (!user || !user.isActive) {
            logger.warn(`Refresh token validation failed: User not found or inactive.`, logContext);
            throw new ApiError(httpStatus.UNAUTHORIZED, 'User associated with token not found or inactive.');
        }
        logContext.tenantId = user.tenantId; // Add tenantId

        // Generate a new pair of tokens
        const newAccessToken = generateAccessToken(user);
        const newRawRefreshToken = await generateAndStoreRefreshToken(user, ipAddress, userAgent);

        logger.info(`Auth tokens refreshed successfully`, logContext);
        return {
            accessToken: newAccessToken,
            refreshToken: newRawRefreshToken,
        };

    } catch (error) {
        logContext.error = error; // Add error to context for logging
        if (error instanceof ApiError && error.statusCode === httpStatus.UNAUTHORIZED) {
            logger.warn(`Refresh token validation failed: ${error.message}.`, logContext);
            throw error; // Re-throw the specific ApiError
        }
        logger.error(`Error during token refresh`, logContext);
        // Throw a generic server error for unexpected issues
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not refresh token due to an internal error.');
    }
};

/**
 * Logout user by revoking a specific refresh token hash found in the database.
 * @param {string} rawRefreshToken - The raw refresh token provided by the client.
 * @returns {Promise<void>}
 */
const logoutUser = async (rawRefreshToken: string): Promise<void> => {
    const logContext: LogContext = { function: 'logoutUser' };
    try {
        // Find the matching token record to revoke it.
        const matchedTokenRecord = await findAndValidateRefreshToken(rawRefreshToken);
        logContext.userId = matchedTokenRecord.userId;
        logContext.tokenId = matchedTokenRecord.id;

        // Mark the specific token as revoked
        await prisma.refreshToken.update({
            where: { id: matchedTokenRecord.id },
            data: { revokedAt: new Date() },
        });
        logger.info(`User logout successful: Revoked refresh token`, logContext);

    } catch (error) {
        logContext.error = error; // Add error to context
        // If findAndValidateRefreshToken threw an error (token not found, expired, already revoked)
        if (error instanceof ApiError && error.statusCode === httpStatus.UNAUTHORIZED) {
            logger.warn(`Logout attempt with invalid/expired/revoked refresh token: ${error.message}`, logContext);
        } else {
            // Log unexpected errors during the process
            logger.error(`Error during logout process`, logContext);
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
const forgotPassword = async (email: string): Promise<void> => {
    const lowerCaseEmail = email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: lowerCaseEmail } });
    // Define context with all potential fields marked optional initially
    const logContext: LogContext = { function: 'forgotPassword', email: lowerCaseEmail, userId: user?.id, tenantId: user?.tenantId };

    // IMPORTANT: Always return successfully to prevent email enumeration attacks.
    if (!user || !user.isActive) {
        logger.warn(`Forgot password request: User not found or inactive`, logContext);
        return; // Do nothing further visible to the user
    }
    // Update context now we know user exists
    logContext.userId = user.id;
    logContext.tenantId = user.tenantId;

    // Generate reset token
    const rawResetToken = generateSecureToken(); // Use a different length if desired, e.g., 48
    const hashedToken = await hashToken(rawResetToken);
    let expiryDate: Date;
    try {
        const expiryMs = ms(env.PASSWORD_RESET_EXPIRES_IN);
        if (typeof expiryMs !== 'number' || isNaN(expiryMs) || expiryMs <= 0) {
            throw new Error(`Invalid time string format: "${env.PASSWORD_RESET_EXPIRES_IN}"`);
        }
        expiryDate = new Date(Date.now() + expiryMs);
    } catch (e) {
        logger.error(`Invalid PASSWORD_RESET_EXPIRES_IN format: "${env.PASSWORD_RESET_EXPIRES_IN}". Defaulting to 1 hour.`, { error: e });
        expiryDate = new Date(Date.now() + 60 * 60 * 1000); // Default to 1 hour
    }

    // Store hashed token in DB (consider removing old tokens)
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await prisma.passwordResetToken.create({
        data: {
            userId: user.id,
            tokenHash: hashedToken,
            expiresAt: expiryDate,
        }
    });
    logger.debug(`Stored password reset token`, logContext);

    // Construct reset URL (send RAW token in the link)
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawResetToken}`;

    // Send email (using mock/real service)
    const emailSent = await emailService.sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Click the following link to reset your password:\n${resetUrl}\n\nIf you did not request this, please ignore this email. This link will expire in ${env.PASSWORD_RESET_EXPIRES_IN}.`,
        // html: `<p>You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password.</p><p>Link expires in ${env.PASSWORD_RESET_EXPIRES_IN}.</p>`
    });

    if (emailSent) {
        logger.info(`Password reset email initiated successfully`, logContext);
    } else {
        logger.error(`Password reset email failed to send`, logContext);
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
const resetPassword = async (rawResetToken: string, newPassword: string): Promise<void> => {
    // Define context with all potential fields marked optional initially
    const logContext: LogContext = { function: 'resetPassword', userId: null, tenantId: null, email: null, tokenId: null };

    // 1. Find potentially matching, unused, non-expired token records
    const potentialTokenRecords = await prisma.passwordResetToken.findMany({
        where: {
            usedAt: null, // Not already used
            expiresAt: { gt: new Date() } // Not expired
        }
    });

    let matchedTokenRecord: PasswordResetToken | null = null;
    for (const tokenRecord of potentialTokenRecords) {
        // 2. Compare provided raw token with stored hash
        const isMatch = await compareToken(rawResetToken, tokenRecord.tokenHash);
        if (isMatch) {
            matchedTokenRecord = tokenRecord;
            break;
        }
    }

    if (!matchedTokenRecord) {
        logger.warn(`Password reset attempt failed: Invalid or expired token provided.`, logContext);
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or expired password reset token.');
    }
    // Update logContext properties now we have a match
    logContext.userId = matchedTokenRecord.userId;
    logContext.tokenId = matchedTokenRecord.id;

    // 3. Get the user associated with the valid token
    const user = await prisma.user.findUnique({ where: { id: matchedTokenRecord.userId } });
    if (!user || !user.isActive) {
        logger.error(`Password reset failed: User not found or inactive for a valid token.`, logContext);
        // Mark token as used even if user not found to prevent reuse
        await prisma.passwordResetToken.update({ where: { id: matchedTokenRecord.id }, data: { usedAt: new Date() } });
        throw new ApiError(httpStatus.BAD_REQUEST, 'Associated user account not found or inactive.');
    }
    // Update logContext properties
    logContext.tenantId = user.tenantId;
    logContext.email = user.email;


    // 4. Hash the new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10); // Use appropriate salt rounds (e.g., 10-12)

    // 5. Update user password, mark token as used, and revoke refresh tokens in a transaction
    try {
        // Use Prisma Transaction Client type for type safety within transaction
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.user.update({
                where: { id: user.id },
                data: { passwordHash: newPasswordHash },
            });
            await tx.passwordResetToken.update({
                where: { id: matchedTokenRecord!.id }, // Use non-null assertion as we checked above
                data: { usedAt: new Date() }, // Mark reset token as used
            });
            // Security enhancement: Revoke all active refresh tokens for this user
            await tx.refreshToken.updateMany({
                where: { userId: user.id, revokedAt: null },
                data: { revokedAt: new Date() }
            });
        });
        logger.info(`Password reset successful`, logContext);
    } catch (error) {
        logContext.error = error; // Add error to context
        logger.error(`Password reset transaction failed`, logContext);
        // Provide a generic error message to the user
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update password due to an internal error.');
    }
};


// Export the public service methods
export const authService = {
    loginUserWithEmailAndPassword,
    refreshAuthTokens,
    logoutUser,
    forgotPassword,
    resetPassword,
};
