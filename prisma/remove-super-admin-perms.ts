// prisma/remove-super-admin-perms.ts
// One-time script to remove super admin permissions from all Admin roles
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUPER_ADMIN_ONLY_PERMISSIONS = [
    'tenant:create:any',
    'tenant:read:any',
    'tenant:update:any',
    'tenant:delete:any',
    'tenant:manage:admins',
    'user:create:any',
    'system:config:read',
    'system:config:update',
];

async function main() {
    console.log('Finding super admin permissions...');

    const permissions = await prisma.permission.findMany({
        where: { permissionKey: { in: SUPER_ADMIN_ONLY_PERMISSIONS } },
        select: { id: true, permissionKey: true }
    });

    console.log('Found permissions to remove:', permissions.map(p => p.permissionKey));

    // Find all Admin roles across all tenants
    const adminRoles = await prisma.role.findMany({
        where: { name: 'Admin' },
        select: { id: true, tenantId: true }
    });

    console.log(`Found ${adminRoles.length} Admin roles across tenants`);

    // Remove super admin permissions from each Admin role
    for (const role of adminRoles) {
        const result = await prisma.rolePermission.deleteMany({
            where: {
                roleId: role.id,
                permissionId: { in: permissions.map(p => p.id) }
            }
        });
        console.log(`Removed ${result.count} super admin permissions from Admin role in tenant ${role.tenantId}`);
    }

    console.log('Done! Tenant Admins no longer have super admin permissions.');
}

main()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
