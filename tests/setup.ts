import { prisma, redisClient } from '../src/config';

beforeAll(async () => {
    // Connect to the database before running tests
    await prisma.$connect();
});

afterAll(async () => {
    // Disconnect from the database after running tests
    await prisma.$disconnect();
    // Disconnect from Redis
    await redisClient.quit();
});
