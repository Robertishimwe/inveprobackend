// src/config/prisma.ts
import { PrismaClient, Prisma } from '@prisma/client'; // Ensure 'Prisma' namespace is imported
import { env } from './environment';
import logger from '@/utils/logger';

// Define Prisma Client logging options based on environment
// Use the Prisma namespace for these types
const logOptions: Array<Prisma.LogLevel | Prisma.LogDefinition> =
  env.NODE_ENV === 'development'
    ? [
        { emit: 'event', level: 'query' }, // <<< This config enables the 'query' event
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ]
    : [
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ];


// Declare the global prisma instance
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Initialize Prisma Client
const prisma = globalThis.prisma || new PrismaClient({
  log: logOptions,
});

// --- Event Listener ---
// This code block should only run if the 'query' event is enabled via logOptions
if (env.NODE_ENV === 'development') {
  // Ensure the type 'Prisma.QueryEvent' is correctly recognized after generation
  try {
      prisma.$on('query', (e: Prisma.QueryEvent) => { // Use Prisma.QueryEvent from the namespace
        logger.debug(`Prisma Query: ${e.query}`);
        logger.debug(`Params: ${e.params}`);
        logger.debug(`Duration: ${e.duration}ms`);
      });
  } catch (subscribeError) {
      // Log an error if subscribing fails - might happen if types are severely broken
      logger.error("Failed to subscribe to Prisma 'query' event. Check Prisma Client generation.", subscribeError);
  }

  // Assign to globalThis only once
  if (!globalThis.prisma) {
      globalThis.prisma = prisma;
  }
}

// Optional Connection Test (remains the same)
/*
async function testDbConnection() { ... }
// testDbConnection();
*/

export default prisma; // Export only the client instance by default