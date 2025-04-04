"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/auth/auth.routes.ts
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser")); // Import cookie-parser
const auth_controller_1 = require("./auth.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const login_dto_1 = require("./dto/login.dto");
const forgot_password_dto_1 = require("./dto/forgot-password.dto");
const reset_password_dto_1 = require("./dto/reset-password.dto");
const rateLimit_middleware_1 = require("@/middleware/rateLimit.middleware"); // Import auth rate limiter
// Import generalRateLimiter if needed for other routes
const router = express_1.default.Router();
// Apply cookie parser middleware to this router to handle refresh token cookies
router.use((0, cookie_parser_1.default)());
// Apply auth-specific rate limiting to all auth routes
router.use(rateLimit_middleware_1.authRateLimiter);
// --- Define Authentication Routes ---
router.post('/login', (0, validate_middleware_1.default)(login_dto_1.LoginDto), // Defaults to 'body'
auth_controller_1.authController.login);
router.post('/refresh-token', auth_controller_1.authController.refreshTokens // Reads refresh token from cookie
);
router.post('/logout', auth_controller_1.authController.logout // Reads refresh token from cookie to invalidate server-side
);
router.post('/forgot-password', (0, validate_middleware_1.default)(forgot_password_dto_1.ForgotPasswordDto), auth_controller_1.authController.forgotPassword);
router.post('/reset-password', (0, validate_middleware_1.default)(reset_password_dto_1.ResetPasswordDto), auth_controller_1.authController.resetPassword);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map