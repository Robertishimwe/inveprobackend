import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'postgresql://myuser:mypassword@localhost:5434/myappdb',
        },
    },
});

async function main() {
    try {
        await prisma.$connect();
        console.log('Connected to DB');

        // List tables
        const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`;
        console.log('Tables in public schema:', tables);

        // Check tenants table specifically
        try {
            const count = await prisma.tenant.count();
            console.log('Tenant count:', count);
        } catch (e) {
            console.log('Error querying tenant table:', (e as any).message);
        }

    } catch (e) {
        console.error('Connection error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
