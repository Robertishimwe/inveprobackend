// src/utils/logger.ts
import winston from 'winston';
// import { env } from '@/config'; // <<< REMOVE or DELAY using this import during setup

// --- Determine log level directly from process.env during setup ---
// Fallback logic if LOG_LEVEL or NODE_ENV are not set when logger is initialized
const initialLogLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');
// Ensure it's a valid level, default to 'info' if invalid
const validLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
const finalInitialLogLevel = validLevels.includes(initialLogLevel) ? initialLogLevel : 'info';
// --------------------------------------------------------------------


// Format to handle Error objects correctly
const enumerateErrorFormat = winston.format((info) => {
    if (info instanceof Error) {
        Object.assign(info, { message: info.stack });
    }
    return info;
});

// Define the Winston logger instance
const logger = winston.createLogger({
    // Use the level determined directly from process.env or defaults
    level: finalInitialLogLevel,
    format: winston.format.combine(
        enumerateErrorFormat(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.splat(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const messageString = typeof message === 'string' ? message : JSON.stringify(message);
            let log = `[${timestamp}] ${level}: ${messageString}`;

            if (meta && Object.keys(meta).length > 0) {
                 if (typeof meta.stack === 'string' && typeof message === 'string' && !message.includes(meta.stack)) {
                    log += `\nStack: ${meta.stack}`;
                 }
                const metaToLog = { ...meta };
                if(metaToLog.stack) delete metaToLog.stack;

                if (Object.keys(metaToLog).length > 0) {
                    // Use process.env here for NODE_ENV check during formatting
                    if(process.env.NODE_ENV === 'development' || Object.keys(metaToLog).length < 5){
                         try {
                             log += ` ${JSON.stringify(metaToLog)}`;
                         } catch (stringifyError) {
                            log += ` [meta serialization failed]`;
                         }
                    } else {
                        log += ` [meta omitted in prod]`;
                    }
                }
            }
            return log;
        })
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                // Use process.env here too
                process.env.NODE_ENV === 'development'
                    ? winston.format.colorize()
                    : winston.format.uncolorize(),
                winston.format.printf(({ level, message, ...meta }) => {
                    let consoleMsg = `${level}: ${typeof message === 'string' ? message : JSON.stringify(message)}`;
                    if(typeof meta.stack === 'string' && typeof message === 'string' && !message.includes(meta.stack)){
                        consoleMsg = `${level}: ${message}\nStack: ${meta.stack}`;
                    } else if (typeof meta.stack === 'string' && typeof message !== 'string'){
                         consoleMsg += `\nStack: ${meta.stack}`;
                    }
                    return consoleMsg;
                })
            ),
            stderrLevels: ['error'],
        }),
        // Optional File transports remain the same
    ],
});

// After the logger is created, you *could* potentially update its level
// if the validated env object becomes available later, but usually setting
// it initially from process.env is sufficient.
// Example (if needed later, perhaps in server.ts after config is loaded):
// import { env } from '@/config';
// logger.level = env.LOG_LEVEL;

export default logger;