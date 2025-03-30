// src/utils/logger.ts
import winston from 'winston';
import { env } from '@/config'; // Import environment config

// Define custom levels if needed, otherwise use default npm levels
// const customLevels = {
//   error: 0,
//   warn: 1,
//   info: 2,
//   http: 3,
//   verbose: 4,
//   debug: 5,
//   silly: 6
// };

// Format to handle Error objects correctly, showing stack trace
const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    // Copy error properties including stack to the log info object
    Object.assign(info, { message: info.stack });
  }
  return info;
});

// Define the Winston logger instance
const logger = winston.createLogger({
  // Use standard npm logging levels: error, warn, info, http, verbose, debug, silly
  level: env.LOG_LEVEL || (env.NODE_ENV === 'development' ? 'debug' : 'info'), // Default level based on env
  // levels: customLevels, // Uncomment if using custom levels

  // Format specification
  format: winston.format.combine(
    enumerateErrorFormat(), // Handle Error objects
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Add timestamp
    winston.format.splat(), // Enable string interpolation like %s, %d
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // Custom format: [Timestamp] LEVEL: Message {meta}
      let log = `[${timestamp}] ${level}: ${message}`;
      // Add metadata if present and not empty
      if (meta && Object.keys(meta).length > 0) {
        // Special handling for error stacks if not already in message
        if (meta.stack && typeof message === 'string' && !message.includes(meta.stack)) {
            log += `\nStack: ${meta.stack}`;
            delete meta.stack; // Avoid duplicate logging
        }
        // Add remaining meta, excluding potentially large objects in production
        if(env.NODE_ENV === 'development' || Object.keys(meta).length < 5){ // Simple heuristic
             log += ` ${JSON.stringify(meta)}`;
        }
      }
      return log;
    })
  ),

  // Define transports (where logs should go)
  transports: [
    // Always log to the console
    new winston.transports.Console({
      // Use colorization only in development for readability
      format: winston.format.combine(
        env.NODE_ENV === 'development'
          ? winston.format.colorize() // Add colors
          : winston.format.uncolorize(),
        winston.format.printf(({ level, message }) => `${level}: ${message}`) // Simpler format for console output after colorize/uncolorize
      ),
      stderrLevels: ['error'], // Log 'error' level messages to stderr
    }),

    // --- Optional: File Transports for Production ---
    // Add these if you want to log to files in production
    /*
    ...(env.NODE_ENV === 'production' ? [
      // Log errors to a separate file
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true,
        format: winston.format.combine(
            winston.format.uncolorize() // Ensure file logs are not colorized
        )
      }),
      // Log all levels (info and above) to a combined file
      new winston.transports.File({
        filename: 'logs/combined.log',
        level: 'info', // Or 'http' if you need request logs in file
        maxsize: 5242880, // 5MB
        maxFiles: 10,
        tailable: true,
         format: winston.format.combine(
            winston.format.uncolorize()
        )
      })
    ] : []),
    */
  ],

  // Optional: Don't exit on handled exceptions (Winston default is true)
  // exitOnError: false,
});

// Create a stream object with a 'write' function that will be used by `morgan`
// This directs morgan HTTP logs through our Winston logger
// logger.stream = {
//   write: (message: string): void => {
//     // Use the 'http' log level for request logs from morgan
//     logger.http(message.trim());
//   },
// };
// Morgan is now configured directly in app.ts to use logger.http

export default logger;
