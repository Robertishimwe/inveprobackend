// src/modules/auth/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import ms from 'ms'; // npm i ms @types/ms
import httpStatus from 'http-status';
import { prisma, env } from '@/config';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';
import { User, RefreshToken } from '@prisma/client';
import { generateSecureToken, hashToken, compareToken } from '@/utils/token.utils';
import { emailService } from '@/utils/email.service'; // Import mock/real email service

interface AuthTokens {
    accessToken: string;
    refreshToken: string; // The raw refresh token (to send in cookie)
}

/**
 * Generate JWT access token.
 */
const generateAccessToken = (user: User): string => {
    const payload = {
        userId: user.id,
        tenantId: user.tenantId,
        // Consider adding a session ID or token ID if needed for granular revocation
    };
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
};

/**
 * Generate a secure refresh token, hash it, and store it.
 */
const generateAndStoreRefreshToken = async (user: User, ipAddress?: string, userAgent?: string): Promise<string> => {
    const rawRefreshToken = generateSecureToken(64); // Generate a long random token
    const hashedToken = await hashToken(rawRefreshToken);
    const expiryDate = new Date(Date.now() + ms(`${env.JWT_REFRESH_EXPIRES_IN_DAYS}d`));

    await prisma.refreshToken.create({
        data: {
            userId: user.id,
            tokenHash: hashedToken,
            expiresAt: expiryDate,
            ipAddress: ipAddress, // Store requesting IP (optional)
            userAgent: userAgent, // Store user agent (optional)
        },
    });
    return rawRefreshToken; // Return the raw token only once
};

/**
 * Find and validate a stored refresh token. Check for revocation and expiry.
 */
const findAndValidateRefreshToken = async (rawRefreshToken: string, userId: string): Promise<RefreshToken> => {
    // Find potential tokens for the user first (limits hash comparisons)
    const potentialTokens = await prisma.refreshToken.findMany({
        where: {
            userId: userId,
            revokedAt: null, // Only consider non-revoked tokens
            expiresAt: { gt: new Date() } // Only consider non-expired tokens
        }
    });

    if (!potentialTokens.length) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token not found or invalid');
    }

    // Iterate and compare hashes
    for (const tokenRecord of potentialTokens) {
        const isMatch = await compareToken(rawRefreshToken, tokenRecord.tokenHash);
        if (isMatch) {
            return tokenRecord; // Found a valid, matching token
        }
    }

    // If no match found after checking all potential tokens for the user
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token not found or invalid');
};


/**
 * Login with username and password, generate access and refresh tokens.
 */
const loginUserWithEmailAndPassword = async (
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
): Promise<{ user: Omit<User, 'passwordHash'>; tokens: AuthTokens }> => {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const logContext = { email, ipAddress, tenantId: user?.tenantId, userId: user?.id };

    if (!user) {
        logger.warn('Login failed: User not found', logContext);
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
    }

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
 */
const refreshAuthTokens = async (
    oldRawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string
): Promise<AuthTokens> => {
    let userIdFromExpiredToken: string | undefined;
    let tenantIdFromExpiredToken: string | undefined;

     // 1. Decode expired access token *without* verifying expiry to get user context
    try {
         // This is slightly less secure than having the client send userId, but common.
         // Alternatively, the refresh token itself could contain userId/tenantId, but that increases its value if stolen.
         // Best practice often involves finding the token in DB first, then getting the user.
         // Let's stick to finding token in DB first based on a userId potentially sent by client or derived later.

         // We need the user ID to find the token efficiently.
         // How do we get it? The client should ideally store it securely (e.g., localStorage, NOT decoded from expired JWT).
         // For this example, let's assume the client *could* send userId, but that's not ideal.
         // Let's refine: We'll need to find the token record potentially matching the hash first. This is less efficient.
         // Okay, revised strategy: Assume client sends *only* the refresh token (from cookie).
         // We need a way to link the raw token back to the user *without* iterating all hashes.
         // Compromise: Decode the refresh token *if* it's a JWT (it shouldn't be, use opaque tokens).
         // Let's stick to the secure opaque token method: Find the matching hash first (less efficient but more secure).

         // Re-Revised Strategy: The most secure & common way involves the client sending the refresh token
         // AND the server finding the corresponding *hashed* token in the DB. We cannot efficiently find by hash.
         // THEREFORE, the refresh token record in the DB *must* contain the userId.
         // The client sends the *raw* refresh token (from cookie). The server needs to find the *hashed* version associated with a user.
         // This still requires iterating or a different storage mechanism (e.g., Redis lookup raw->userId).

         // Let's implement the DB iteration method for now, acknowledging its performance limitation on huge scale.
         // Find *all* non-revoked, non-expired tokens and check hash match.
         const potentialValidTokens = await prisma.refreshToken.findMany({
            where: {
                revokedAt: null,
                expiresAt: { gt: new Date() }
            }
         });

         let matchedTokenRecord: RefreshToken | null = null;
         for (const tokenRecord of potentialValidTokens) {
            const isMatch = await compareToken(oldRawRefreshToken, tokenRecord.tokenHash);
             if (isMatch) {
                matchedTokenRecord = tokenRecord;
                break;
             }
         }

         if (!matchedTokenRecord) {
            logger.warn(`Refresh token validation failed: No matching active token found for hash comparison. IP: ${ipAddress}`);
             throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid refresh token or session expired.');
         }

         // **Reuse Detection (Optional but Recommended):**
         // If found, immediately mark the matched token as revoked. If we later fail to create a new one,
         // the user has to log in again. This prevents reuse if the same token is presented again quickly.
         await prisma.refreshToken.update({
            where: { id: matchedTokenRecord.id },
            data: { revokedAt: new Date() },
         });


         // Get user associated with the token
         const user = await prisma.user.findUnique({ where: { id: matchedTokenRecord.userId } });

         if (!user || !user.isActive) {
            logger.warn(`Refresh token validation failed: User ${matchedTokenRecord.userId} not found or inactive. IP: ${ipAddress}`);
            throw new ApiError(httpStatus.UNAUTHORIZED, 'User associated with token not found or inactive.');
         }

         // Generate new pair of tokens
         const newAccessToken = generateAccessToken(user);
         const newRawRefreshToken = await generateAndStoreRefreshToken(user, ipAddress, userAgent);

          logger.info(`Auth tokens refreshed successfully for user: ${user.id}. IP: ${ipAddress}`);
         return {
            accessToken: newAccessToken,
            refreshToken: newRawRefreshToken,
         };

    } catch (error) {
        // Handle specific errors like token not found/invalid from findAndValidateRefreshToken
        if (error instanceof ApiError && error.statusCode === httpStatus.UNAUTHORIZED) {
             logger.warn(`Refresh token validation failed: ${error.message}. IP: ${ipAddress}`);
            throw error; // Re-throw the specific error
        }
        // Handle other potential errors (DB errors during revoke/create)
        logger.error(`Error during token refresh: ${error}. IP: ${ipAddress}`);
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not refresh token.');
    }
};

/**
 * Logout user by revoking a specific refresh token.
 */
const logoutUser = async (rawRefreshToken: string): Promise<void> => {
    // Similar to refresh, we need to find the matching token record to revoke it.
    const potentialValidTokens = await prisma.refreshToken.findMany({
        where: {
            revokedAt: null,
            expiresAt: { gt: new Date() }
        }
     });

     let matchedTokenRecord: RefreshToken | null = null;
     for (const tokenRecord of potentialValidTokens) {
         const isMatch = await compareToken(rawRefreshToken, tokenRecord.tokenHash);
         if (isMatch) {
            matchedTokenRecord = tokenRecord;
            break;
         }
     }

    if (matchedTokenRecord) {
        await prisma.refreshToken.update({
            where: { id: matchedTokenRecord.id },
            data: { revokedAt: new Date() },
        });
         logger.info(`User logout successful: Revoked refresh token for user ${matchedTokenRecord.userId}`);
    } else {
        // Log if the token presented was already invalid/expired/revoked, but don't fail the logout itself.
         logger.warn(`Logout attempt with invalid/expired/revoked refresh token.`);
    }
    // Client should clear its stored tokens/cookies regardless
};


/**
 * Initiate password reset process.
 */
const forgotPassword = async (email: string): Promise<void> => {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const logContext = { email, userId: user?.id, tenantId: user?.tenantId };

    // IMPORTANT: Always return a success-like message to prevent email enumeration attacks.
    // Perform actions only if user exists.
    if (!user) {
        logger.warn(`Forgot password request: User not found`, logContext);
        return; // Do nothing further, but don't signal failure to the requester
    }
     if (!user.isActive) {
        logger.warn(`Forgot password request: User inactive`, logContext);
        return; // Do nothing further
    }

    // Generate reset token
    const rawResetToken = generateSecureToken();
    const hashedToken = await hashToken(rawResetToken);
    const expiryDate = new Date(Date.now() + ms(env.PASSWORD_RESET_EXPIRES_IN));

    // Store hashed token in DB
    await prisma.passwordResetToken.create({
        data: {
            userId: user.id,
            tokenHash: hashedToken,
            expiresAt: expiryDate,
        }
    });

    // Construct reset URL
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawResetToken}`; // Send RAW token in link

    // Send email (using mock service here)
    const emailSent = await emailService.sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Click the following link to reset your password: ${resetUrl}\n\nIf you did not request this, please ignore this email. This link will expire in ${env.PASSWORD_RESET_EXPIRES_IN}.`,
        // html: `<p>...</p>` // Optional HTML version
    });

    if (emailSent) {
        logger.info(`Password reset email initiated successfully`, logContext);
    } else {
        // Log failure but don't expose error details unless necessary for debugging
        logger.error(`Password reset email failed to send`, logContext);
        // Depending on policy, you might still want the user to see a success message.
        // Or throw an internal server error if email sending is critical.
        // throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not send password reset email.');
    }
     // Always return void to the controller, regardless of user found or email success
};


/**
 * Reset user password using a valid token.
 */
const resetPassword = async (rawResetToken: string, newPassword: string): Promise<void> => {
    // 1. Find potentially matching tokens (hashed) - cannot search by hash directly efficiently
     const potentialTokenRecords = await prisma.passwordResetToken.findMany({
        where: {
            usedAt: null, // Not already used
            expiresAt: { gt: new Date() } // Not expired
        }
     });

     let matchedTokenRecord: PasswordResetToken | null = null;
     for (const tokenRecord of potentialTokenRecords) {
         const isMatch = await compareToken(rawResetToken, tokenRecord.tokenHash);
         if (isMatch) {
            matchedTokenRecord = tokenRecord;
            break;
         }
     }

    if (!matchedTokenRecord) {
        logger.warn(`Password reset attempt failed: Invalid or expired token provided.`);
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or expired password reset token.');
    }

    // 2. Get the user associated with the token
    const user = await prisma.user.findUnique({ where: { id: matchedTokenRecord.userId } });
    if (!user || !user.isActive) {
        // This case should be rare if token exists, but handle it.
        logger.error(`Password reset failed: User ${matchedTokenRecord.userId} not found or inactive for a valid token.`);
         // Mark token as used to prevent retries with the same token
        await prisma.passwordResetToken.update({ where: { id: matchedTokenRecord.id }, data: { usedAt: new Date() }});
        throw new ApiError(httpStatus.BAD_REQUEST, 'User not found or inactive.');
    }
    const logContext = { userId: user.id, tenantId: user.tenantId, email: user.email };


    // 3. Hash the new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10); // Use appropriate salt rounds

    // 4. Update user password and mark token as used (in a transaction)
    try {
        await prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: newPasswordHash },
            }),
            prisma.passwordResetToken.update({
                where: { id: matchedTokenRecord.id },
                data: { usedAt: new Date() }, // Mark token as used
            }),
            // Optional: Revoke all active refresh tokens for this user upon password reset
            prisma.refreshToken.updateMany({
                where: { userId: user.id, revokedAt: null },
                data: { revokedAt: new Date() }
            })
        ]);
         logger.info(`Password reset successful`, logContext);
    } catch (error) {
         logger.error(`Password reset transaction failed: ${error}`, logContext);
         throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update password.');
    }
};


export const authService = {
  loginUserWithEmailAndPassword,
  refreshAuthTokens,
  logoutUser,
  forgotPassword,
  resetPassword,
};
