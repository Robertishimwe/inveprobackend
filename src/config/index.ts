// src/config/index.ts

// Re-export environment variables (validated)
export * from './environment';

// Re-export Prisma client instance
export { default as prisma } from './prisma';

// Re-export Redis client instance
export { default as redisClient } from './redis';

// Export other config-related items if needed in the future
// e.g., export * from './aws-sdk-config';