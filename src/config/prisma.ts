// src/config/prisma.ts
import { PrismaClient, Prisma } from "@prisma/client";
import { env } from "./environment";
import logger from "@/utils/logger";

// Define Prisma Client logging options based on environment
const logOptions: Prisma.PrismaClientOptions["log"] =
  env.NODE_ENV === "development"
    ? [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "info" },
      { emit: "stdout", level: "warn" },
      { emit: "stdout", level: "error" },
    ]
    : [
      { emit: "stdout", level: "warn" },
      { emit: "stdout", level: "error" },
    ];

// Declare the global prisma instance
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Initialize Prisma Client with the correct type for events
const prisma =
  globalThis.prisma ||
  new PrismaClient({
    log: logOptions,
  });

// Event Listener
if (env.NODE_ENV === "development") {
  // Type assertion to make TypeScript recognize the extended client
  (
    prisma as PrismaClient & {
      $on(event: "query", callback: (event: Prisma.QueryEvent) => void): void;
    }
  ).$on("query", (e) => {
    logger.debug(`Prisma Query: ${e.query}`);
    logger.debug(`Params: ${e.params}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });

  // Assign to globalThis only once
  if (!globalThis.prisma) {
    globalThis.prisma = prisma;
  }
}

async function testDbConnection() {
  try {
    await prisma.$connect();
    logger.info("✅ Database connection successful.");
    await prisma.$disconnect(); // Disconnect after test
  } catch (error) {
    logger.error("❌ Database connection failed:", error);
    process.exit(1); // Exit if DB connection fails on startup
  }
}
// Uncomment the line below to run the connection test on startup
testDbConnection();

export default prisma;
