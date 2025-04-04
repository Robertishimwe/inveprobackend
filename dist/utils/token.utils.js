"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareToken = exports.hashToken = exports.generateSecureToken = void 0;
// src/utils/token.utils.ts
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
/**
 * Generates a secure random token string.
 * @param length The desired length of the token before hex encoding. Defaults to 32.
 * @returns A hex-encoded random token string.
 */
const generateSecureToken = (length = 32) => {
    return crypto_1.default.randomBytes(length).toString('hex');
};
exports.generateSecureToken = generateSecureToken;
/**
 * Hashes a token using bcrypt.
 * @param token The plain text token.
 * @returns A promise that resolves with the hashed token.
 */
const hashToken = async (token) => {
    // Use a moderate cost factor for tokens, less than passwords perhaps
    const saltRounds = 10;
    return bcryptjs_1.default.hash(token, saltRounds);
};
exports.hashToken = hashToken;
/**
 * Compares a plain text token with a stored hash.
 * @param token The plain text token.
 * @param hash The stored hash.
 * @returns A promise that resolves with true if they match, false otherwise.
 */
const compareToken = async (token, hash) => {
    return bcryptjs_1.default.compare(token, hash);
};
exports.compareToken = compareToken;
//# sourceMappingURL=token.utils.js.map