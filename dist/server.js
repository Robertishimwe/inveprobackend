"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const logger_1 = __importDefault(require("./utils/logger"));
const PORT = config_1.env.PORT || 5000;
const server = http_1.default.createServer(app_1.default);
const startServer = async () => {
    try {
        // Optional connection tests can go here
        server.listen(PORT, () => {
            logger_1.default.info(`=================================`);
            logger_1.default.info(`======= ENV: ${config_1.env.NODE_ENV} ========`);
            logger_1.default.info(`🚀 App listening on the port ${PORT}`);
            logger_1.default.info(`=================================`);
        });
    }
    catch (error) {
        logger_1.default.error('❌ Failed to start server:', error);
        await shutdown('SERVER_STARTUP_ERROR');
    }
};
// --- Graceful Shutdown Logic ---
let isShuttingDown = false;
const shutdown = async (signal) => {
    if (isShuttingDown) {
        logger_1.default.warn('Shutdown already in progress. Ignoring signal:', signal);
        return;
    }
    isShuttingDown = true;
    logger_1.default.warn(`Received ${signal}. Starting graceful shutdown...`);
    // 1. Stop accepting new connections
    server.close(async (serverCloseErr) => {
        // --- FIX: Declare error variables in this scope ---
        let prismaDisconnectError = null;
        let redisDisconnectError = null;
        // ---------------------------------------------------
        if (serverCloseErr) {
            logger_1.default.error('Error closing HTTP server:', serverCloseErr);
        }
        else {
            logger_1.default.info('HTTP server closed successfully.');
        }
        // 2. Disconnect from database
        try {
            await config_1.prisma.$disconnect();
            logger_1.default.info('Database connection closed successfully.');
        }
        catch (error) { // Use generic 'error' name inside catch block
            logger_1.default.error('Error disconnecting from database:', error);
            // --- FIX: Assign caught error to outer scope variable ---
            prismaDisconnectError = error instanceof Error ? error : new Error(String(error));
            // ---------------------------------------------------------
        }
        // 3. Disconnect from Redis
        try {
            await config_1.redisClient.quit();
            logger_1.default.info('Redis connection closed successfully.');
        }
        catch (error) { // Use generic 'error' name inside catch block
            logger_1.default.error('Error closing Redis connection:', error);
            // --- FIX: Assign caught error to outer scope variable ---
            redisDisconnectError = error instanceof Error ? error : new Error(String(error));
            // ---------------------------------------------------------
        }
        // 4. Exit process
        logger_1.default.info('Graceful shutdown completed.');
        // --- FIX: Check outer scope error variables ---
        const exitCode = serverCloseErr || prismaDisconnectError || redisDisconnectError ? 1 : 0;
        process.exit(exitCode); // Exit with 1 if any error occurred, 0 otherwise
        // ----------------------------------------------
    });
    // Force shutdown after a timeout
    setTimeout(() => {
        logger_1.default.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 10000);
};
// --- Signal Handling ---
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// --- Uncaught Exception / Unhandled Rejection Handling ---
process.on('uncaughtException', (error) => {
    logger_1.default.error('🚨 UNCAUGHT EXCEPTION! Shutting down...', error);
    shutdown('uncaughtException').catch(() => process.exit(1));
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.default.error('🚨 UNHANDLED REJECTION! Reason:', reason);
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
//# sourceMappingURL=server.js.map