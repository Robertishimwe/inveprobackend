"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/config/prisma.ts
const client_1 = require("@prisma/client");
const environment_1 = require("./environment");
const logger_1 = __importDefault(require("@/utils/logger"));
// Define Prisma Client logging options based on environment
const logOptions = environment_1.env.NODE_ENV === "development"
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
// Initialize Prisma Client with the correct type for events
const prisma = globalThis.prisma ||
    new client_1.PrismaClient({
        log: logOptions,
    });
// Event Listener
if (environment_1.env.NODE_ENV === "development") {
    // Type assertion to make TypeScript recognize the extended client
    prisma.$on("query", (e) => {
        logger_1.default.debug(`Prisma Query: ${e.query}`);
        logger_1.default.debug(`Params: ${e.params}`);
        logger_1.default.debug(`Duration: ${e.duration}ms`);
    });
    // Assign to globalThis only once
    if (!globalThis.prisma) {
        globalThis.prisma = prisma;
    }
}
async function testDbConnection() {
    try {
        await prisma.$connect();
        logger_1.default.info("✅ Database connection successful.");
        await prisma.$disconnect(); // Disconnect after test
    }
    catch (error) {
        logger_1.default.error("❌ Database connection failed:", error);
        process.exit(1); // Exit if DB connection fails on startup
    }
}
// Uncomment the line below to run the connection test on startup
testDbConnection();
exports.default = prisma;
//# sourceMappingURL=prisma.js.map