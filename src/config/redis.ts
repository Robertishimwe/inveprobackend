import Redis, { RedisOptions } from 'ioredis'; // Import Redis and RedisOptions type
import { env } from './environment';
import logger from '@/utils/logger';

// Define Redis connection options
const redisOptions: RedisOptions = {
  // Standard options from URL are usually sufficient, but overrides can go here
  maxRetriesPerRequest: 3, // Example: Retry commands up to 3 times
  enableReadyCheck: true, // Check if server is ready before sending commands
  // --- TLS Configuration (Example - uncomment and configure if needed for production) ---
  // tls: env.NODE_ENV === 'production' ? {
  //   // Add necessary TLS options if connecting to a secured Redis instance
  //   // e.g., rejectUnauthorized: false (use with caution), ca, cert, key
  //   servername: new URL(env.REDIS_URL).hostname, // Important for SNI
  // } : undefined,
  // --- Sentinel Configuration (Example - uncomment if using Redis Sentinel) ---
  // sentinels: [
  //   { host: 'redis-sentinel-1', port: 26379 },
  //   { host: 'redis-sentinel-2', port: 26379 },
  // ],
  // name: 'mymaster', // Name of the Sentinel master group
  // --- Cluster Configuration (Example - uncomment if using Redis Cluster) ---
  // cluster nodes would typically be passed in the URL or an array of nodes
  // redisOptions.cluster = true; // Or specific cluster options
};

// Declare global redis client (for preventing re-initialization in dev hot-reload)
declare global {
  var redisClient: Redis | undefined;
}

// Initialize Redis client using the URL from environment variables
// Use globalThis to prevent multiple instances during hot-reloading
const redisClient = globalThis.redisClient || new Redis(env.REDIS_URL, redisOptions);

// Add listeners for connection events
redisClient.on('connect', () => {
  logger.info('Redis connected successfully.');
});

redisClient.on('ready', () => {
    logger.info('Redis client ready.');
});

redisClient.on('error', (error: Error) => {
  // Log Redis errors. Consider more robust error handling for production
  // (e.g., circuit breaker pattern, attempt reconnection strategies)
  logger.error('Redis connection error:', error);
});

redisClient.on('reconnecting', (delay: number) => {
    logger.warn(`Redis reconnecting in ${delay}ms`);
});

redisClient.on('close', () => {
    logger.info('Redis connection closed.');
});

redisClient.on('end', () => {
    logger.warn('Redis connection ended. No more reconnections will be attempted.');
});

// --- Optional: Explicit Connection Test ---
async function testRedisConnection() {
  try {
    const pong = await redisClient.ping();
    if (pong === 'PONG') {
      logger.info('✅ Redis connection successful (PING/PONG).');
    } else {
      throw new Error('Redis ping did not return PONG');
    }
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    // Decide if Redis failure is critical for startup
    // process.exit(1);
  }
}

// Uncomment the line below to run the connection test on startup
testRedisConnection();

// Assign to globalThis for hot-reloading check
if(env.NODE_ENV === 'development') {
    globalThis.redisClient = redisClient;
}

export default redisClient;
