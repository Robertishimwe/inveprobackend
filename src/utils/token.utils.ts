// src/utils/token.utils.ts
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Generates a secure random token string.
 * @param length The desired length of the token before hex encoding. Defaults to 32.
 * @returns A hex-encoded random token string.
 */
export const generateSecureToken = (length = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hashes a token using bcrypt.
 * @param token The plain text token.
 * @returns A promise that resolves with the hashed token.
 */
export const hashToken = async (token: string): Promise<string> => {
  // Use a moderate cost factor for tokens, less than passwords perhaps
  const saltRounds = 10;
  return bcrypt.hash(token, saltRounds);
};

/**
 * Compares a plain text token with a stored hash.
 * @param token The plain text token.
 * @param hash The stored hash.
 * @returns A promise that resolves with true if they match, false otherwise.
 */
export const compareToken = async (token: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(token, hash);
};
