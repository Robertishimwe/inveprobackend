"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
// import logger from '@/utils/logger'; // <<< REMOVE THIS IMPORT
// Determine which .env file to load based on NODE_ENV
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
const envPath = path_1.default.resolve(process.cwd(), envFile);
// Load environment variables from the determined file path
const loadEnvResult = dotenv_1.default.config({ path: envPath });
if (loadEnvResult.error) {
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
        // Use console here as logger might not be ready
        console.warn(`⚠️ [ENV] Could not find ${envFile} file. Relying on system environment variables.`);
    }
    if (loadEnvResult.error.message.includes('Failed to load')) {
        console.error(`❌ [ENV] Error loading ${envFile}: ${loadEnvResult.error.message}`);
    }
}
// Define the schema for environment variables using Zod
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.coerce.number().int().positive().default(5000),
    DATABASE_URL: zod_1.z.string().url({ message: "DATABASE_URL must be a valid PostgreSQL connection string URL" }),
    REDIS_URL: zod_1.z.string().url({ message: "REDIS_URL must be a valid Redis connection string URL" }),
    JWT_SECRET: zod_1.z.string().min(32, { message: "JWT_SECRET must be at least 32 characters long for security" }),
    // JWT_EXPIRES_IN: z.string().nonempty({ message: "JWT_EXPIRES_IN (e.g., '1d', '2h') cannot be empty" }).default('1d'),
    JWT_EXPIRES_IN: zod_1.z.coerce.number().int().positive(),
    CORS_ORIGIN: zod_1.z.string().default('*'),
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
    JWT_REFRESH_SECRET: zod_1.z.string().min(32, { message: "JWT_REFRESH_SECRET must be at least 32 characters long" }),
    JWT_REFRESH_EXPIRES_IN_DAYS: zod_1.z.coerce.number().int().positive().default(7),
    PASSWORD_RESET_SECRET: zod_1.z.string().min(32, { message: "PASSWORD_RESET_SECRET must be at least 32 characters long" }),
    // PASSWORD_RESET_EXPIRES_IN: z.string().nonempty({ message: "PASSWORD_RESET_EXPIRES_IN cannot be empty" }).default('1h'),
    PASSWORD_RESET_EXPIRES_IN: zod_1.z.coerce.number().int().positive(),
    REFRESH_TOKEN_COOKIE_NAME: zod_1.z.string().default('refreshToken'),
    RATE_LIMIT_WINDOW_MINUTES: zod_1.z.coerce.number().int().positive().optional(),
    RATE_LIMIT_MAX_REQUESTS: zod_1.z.coerce.number().int().positive().optional(),
    FRONTEND_URL: zod_1.z.string().url({ message: "FRONTEND_URL must be a valid URL" }).default('http://localhost:3000'),
    EMAIL_FROM_ADDRESS: zod_1.z.string().email(),
});
// Validate process.env against the schema
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
    // Use console here
    console.error('❌ [ENV] Invalid environment variables:');
    parsedEnv.error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
}
// Export the validated and typed environment variables
exports.env = parsedEnv.data;
// Optional: Log *after* validation is complete (still using console)
// console.debug('[ENV] Environment variables loaded:', {
//   NODE_ENV: env.NODE_ENV,
//   PORT: env.PORT,
//   LOG_LEVEL: env.LOG_LEVEL,
// });
//# sourceMappingURL=environment.js.map