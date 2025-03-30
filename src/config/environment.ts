// // src/config/environment.ts
// import dotenv from 'dotenv';
// import path from 'path';
// import { z } from 'zod';
// import logger from '@/utils/logger'; // Use logger for potential warnings/errors

// // Determine which .env file to load based on NODE_ENV
// // Defaults to '.env' if NODE_ENV is not 'test' or 'production' etc.
// const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
// const envPath = path.resolve(process.cwd(), envFile);

// // Load environment variables from the determined file path
// const loadEnvResult = dotenv.config({ path: envPath });

// if (loadEnvResult.error) {
//   // Only treat missing .env as critical if not in production/test (where env vars might be injected)
//   if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
//     logger.warn(`⚠️ Could not find ${envFile} file. Relying on system environment variables.`);
//   }
//   // If parsing failed for an existing file, log the error
//   if (loadEnvResult.error.message.includes('Failed to load')) {
//     logger.error(`❌ Error loading ${envFile}: ${loadEnvResult.error.message}`);
//   }
// }

// // Define the schema for environment variables using Zod
// const envSchema = z.object({
//   // Node Environment
//   NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

//   // Server Configuration
//   PORT: z.coerce.number().int().positive().default(5000), // Coerce string to number, ensure integer > 0

//   // Database Configuration (using connection string)
//   DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid PostgreSQL connection string URL" }),

//   // Redis Configuration
//   REDIS_URL: z.string().url({ message: "REDIS_URL must be a valid Redis connection string URL" }),

//   // JWT Configuration
//   JWT_SECRET: z.string().min(32, { message: "JWT_SECRET must be at least 32 characters long for security" }),
//   JWT_EXPIRES_IN: z.string().nonempty({ message: "JWT_EXPIRES_IN (e.g., '1d', '2h') cannot be empty" }).default('1d'),
//   // Optional: Refresh token configuration
//   // JWT_REFRESH_SECRET: z.string().min(32),
//   // JWT_REFRESH_EXPIRES_IN: z.string().nonempty(),

//   // CORS Configuration
//   CORS_ORIGIN: z.string().default('*'), // Be specific in production (e.g., "https://app.example.com,https://admin.example.com")

//   // Logging Configuration
//   LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),

//   // Add other environment variables as needed (e.g., API keys, rate limits)
//   // EXAMPLE_API_KEY: z.string().optional(),
// });

// // Validate process.env against the schema
// const parsedEnv = envSchema.safeParse(process.env);

// if (!parsedEnv.success) {
//   // Log detailed validation errors
//   logger.error('❌ Invalid environment variables:');
//   // Iterate through Zod errors for better formatting
//   parsedEnv.error.errors.forEach((err) => {
//     logger.error(`  - ${err.path.join('.')}: ${err.message}`);
//   });
//   // Exit the process if validation fails, as the app cannot run correctly
//   process.exit(1);
// }

// // Export the validated and typed environment variables
// export const env = parsedEnv.data;

// // Log loaded environment (optional, be careful not to log secrets)
// // logger.debug('Environment variables loaded:', {
// //   NODE_ENV: env.NODE_ENV,
// //   PORT: env.PORT,
// //   LOG_LEVEL: env.LOG_LEVEL,
// //   // Avoid logging sensitive URLs or secrets here
// // });


// src/config/environment.ts
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
// import logger from '@/utils/logger'; // <<< REMOVE THIS IMPORT

// Determine which .env file to load based on NODE_ENV
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
const envPath = path.resolve(process.cwd(), envFile);

// Load environment variables from the determined file path
const loadEnvResult = dotenv.config({ path: envPath });

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
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().url({ message: "DATABASE_URL must be a valid PostgreSQL connection string URL" }),
  REDIS_URL: z.string().url({ message: "REDIS_URL must be a valid Redis connection string URL" }),
  JWT_SECRET: z.string().min(32, { message: "JWT_SECRET must be at least 32 characters long for security" }),
  JWT_EXPIRES_IN: z.string().nonempty({ message: "JWT_EXPIRES_IN (e.g., '1d', '2h') cannot be empty" }).default('1d'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
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
export const env = parsedEnv.data;

// Optional: Log *after* validation is complete (still using console)
// console.debug('[ENV] Environment variables loaded:', {
//   NODE_ENV: env.NODE_ENV,
//   PORT: env.PORT,
//   LOG_LEVEL: env.LOG_LEVEL,
// });