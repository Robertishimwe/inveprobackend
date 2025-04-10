// src/server.ts
import http from 'http';
import app from './app';
import { env, prisma, redisClient } from './config';
import logger from './utils/logger';

const PORT = env.PORT || 5000;
const server = http.createServer(app);

const startServer = async () => {
    try {
        // Optional connection tests can go here
        server.listen(PORT, () => {
            logger.info(`=================================`);
            logger.info(`======= ENV: ${env.NODE_ENV} ========`);
            logger.info(`🚀 App listening on the port ${PORT}`);
            logger.info(`=================================`);
        });
    } catch (error) {
        logger.error('❌ Failed to start server:', error);
        await shutdown('SERVER_STARTUP_ERROR');
    }
};

// --- Graceful Shutdown Logic ---
let isShuttingDown = false;

const shutdown = async (signal: string) => {
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress. Ignoring signal:', signal);
        return;
    }
    isShuttingDown = true;
    logger.warn(`Received ${signal}. Starting graceful shutdown...`);

    // 1. Stop accepting new connections
    server.close(async (serverCloseErr) => { // Renamed initial error for clarity
        // --- FIX: Declare error variables in this scope ---
        let prismaDisconnectError: Error | null = null;
        let redisDisconnectError: Error | null = null;
        // ---------------------------------------------------

        if (serverCloseErr) {
            logger.error('Error closing HTTP server:', serverCloseErr);
        } else {
            logger.info('HTTP server closed successfully.');
        }

        // 2. Disconnect from database
        try {
            await prisma.$disconnect();
            logger.info('Database connection closed successfully.');
        } catch (error) { // Use generic 'error' name inside catch block
            logger.error('Error disconnecting from database:', error);
            // --- FIX: Assign caught error to outer scope variable ---
            prismaDisconnectError = error instanceof Error ? error : new Error(String(error));
            // ---------------------------------------------------------
        }

        // 3. Disconnect from Redis
        try {
            await redisClient.quit();
            logger.info('Redis connection closed successfully.');
        } catch (error) { // Use generic 'error' name inside catch block
            logger.error('Error closing Redis connection:', error);
            // --- FIX: Assign caught error to outer scope variable ---
            redisDisconnectError = error instanceof Error ? error : new Error(String(error));
            // ---------------------------------------------------------
        }

        // 4. Exit process
        logger.info('Graceful shutdown completed.');
        // --- FIX: Check outer scope error variables ---
        const exitCode = serverCloseErr || prismaDisconnectError || redisDisconnectError ? 1 : 0;
        process.exit(exitCode); // Exit with 1 if any error occurred, 0 otherwise
        // ----------------------------------------------
    });

    // Force shutdown after a timeout
    setTimeout(() => {
        logger.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 10000);
};

// --- Signal Handling ---
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// --- Uncaught Exception / Unhandled Rejection Handling ---
process.on('uncaughtException', (error: Error) => {
    logger.error('🚨 UNCAUGHT EXCEPTION! Shutting down...', error);
    shutdown('uncaughtException').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason: Error | any, promise: Promise<any>) => {
    logger.error('🚨 UNHANDLED REJECTION! Reason:', reason);
    throw reason; // Re-throw to trigger uncaughtException handler
});

// --- Start the Server ---
startServer();


























// // src/server.ts
// import http from 'http'; // Use the native http module
// import app from './app'; // Import the configured Express app
// import { env, prisma, redisClient } from './config'; // Import config (env vars, db, cache clients)
// import logger from './utils/logger';

// const PORT = env.PORT || 5000; // Use port from env or default

// // Create HTTP server using the Express app
// const server = http.createServer(app);

// // Function to start the server
// const startServer = async () => {
//     try {
//         // Optional: Explicitly connect to Prisma. Prisma usually connects lazily on first query.
//         // await prisma.$connect();
//         // logger.info('Database connected successfully.');

//         // Optional: Ping Redis to check connection early. ioredis connects automatically.
//         // await redisClient.ping();
//         // logger.info('Redis connected successfully.');

//         server.listen(PORT, () => {
//             logger.info(`=================================`);
//             logger.info(`======= ENV: ${env.NODE_ENV} ========`);
//             logger.info(`🚀 App listening on the port ${PORT}`);
//             logger.info(`=================================`);
//         });

//     } catch (error) {
//         logger.error('❌ Failed to start server:', error);
//         await shutdown('SERVER_STARTUP_ERROR'); // Attempt graceful shutdown on startup failure
//     }
// };

// // --- Graceful Shutdown Logic ---
// let isShuttingDown = false; // Flag to prevent multiple shutdowns

// const shutdown = async (signal: string) => {
//     if (isShuttingDown) {
//         logger.warn('Shutdown already in progress. Ignoring signal:', signal);
//         return;
//     }
//     isShuttingDown = true;
//     logger.warn(`Received ${signal}. Starting graceful shutdown...`);

//     // 1. Stop accepting new connections
//     server.close(async (err) => {
//         if (err) {
//             logger.error('Error closing HTTP server:', err);
//         } else {
//             logger.info('HTTP server closed successfully.');
//         }

//         // 2. Disconnect from database
//         try {
//             await prisma.$disconnect();
//             logger.info('Database connection closed successfully.');
//         } catch (dbError) {
//             logger.error('Error disconnecting from database:', dbError);
//         }

//         // 3. Disconnect from Redis
//         try {
//             await redisClient.quit(); // or .disconnect() depending on desired behavior
//             logger.info('Redis connection closed successfully.');
//         } catch (redisError) {
//             logger.error('Error closing Redis connection:', redisError);
//         }

//         // 4. Exit process
//         logger.info('Graceful shutdown completed.');
//         process.exit(err || dbError || redisError ? 1 : 0); // Exit with error code if any step failed
//     });

//     // Force shutdown after a timeout if graceful shutdown takes too long
//     setTimeout(() => {
//         logger.error('Graceful shutdown timed out. Forcing exit.');
//         process.exit(1);
//     }, 10000); // 10 second timeout (adjust as needed)
// };

// // --- Signal Handling ---
// process.on('SIGTERM', () => shutdown('SIGTERM'));
// process.on('SIGINT', () => shutdown('SIGINT')); // Commonly used for Ctrl+C

// // --- Uncaught Exception / Unhandled Rejection Handling ---
// // These should ideally not happen if code is well-tested, but act as a final safety net.
// process.on('uncaughtException', (error: Error) => {
//     logger.error('🚨 UNCAUGHT EXCEPTION! Shutting down...', error);
//     // It's generally unsafe to continue after an uncaught exception.
//     // Attempt graceful shutdown, but it might fail if state is corrupted.
//     shutdown('uncaughtException').catch(() => process.exit(1)); // Force exit if shutdown itself fails
// });

// process.on('unhandledRejection', (reason: Error | any, promise: Promise<any>) => {
//     logger.error('🚨 UNHANDLED REJECTION! Reason:', reason);
//     // Throwing the error ensures it's treated like an uncaughtException
//     // which triggers our handler above for a consistent shutdown process.
//     throw reason;
// });

// // --- Start the Server ---
// startServer();
