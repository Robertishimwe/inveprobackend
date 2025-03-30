// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load .env for potential seed-specific variables (like admin email/password)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

// --- Configuration for the initial seed ---
const SEED_TENANT_NAME = process.env.SEED_TENANT_NAME || 'Default Tenant';
const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'StrongP@ssw0rd!'; // Use a strong default or env var
const SEED_ADMIN_FIRSTNAME = process.env.SEED_ADMIN_FIRSTNAME || 'Admin';
const SEED_ADMIN_LASTNAME = process.env.SEED_ADMIN_LASTNAME || 'User';

const ADMIN_ROLE_NAME = 'Admin';
const ADMIN_ROLE_SYSTEM = true; // Mark as a system role

// Define core permissions your system needs
const CORE_PERMISSIONS = [
    { permissionKey: 'user:create', description: 'Can create new users' },
    { permissionKey: 'user:read', description: 'Can read user information' },
    { permissionKey: 'user:update', description: 'Can update user information' },
    { permissionKey: 'user:delete', description: 'Can deactivate users' },
    { permissionKey: 'role:assign', description: 'Can assign roles to users' }, // Might be part of user:update
    { permissionKey: 'product:create', description: 'Can create products' },
    { permissionKey: 'product:read', description: 'Can view products' },
    { permissionKey: 'product:update', description: 'Can update products' },
    { permissionKey: 'product:delete', description: 'Can delete products' },
    { permissionKey: 'inventory:adjust', description: 'Can adjust inventory levels' },
    { permissionKey: 'inventory:transfer', description: 'Can create inventory transfers' },
    { permissionKey: 'order:create', description: 'Can create orders/POS transactions' },
    { permissionKey: 'order:read', description: 'Can view orders' },
    { permissionKey: 'order:update', description: 'Can update order status/details' },
    { permissionKey: 'report:view', description: 'Can view reports' },
    // ... add ALL permissions your system uses
];

async function main() {
    console.log(`🌱 Starting seed process...`);

    // 1. Upsert Core Permissions (Create if not exist)
    console.log(`Ensuring core permissions exist...`);
    await prisma.$transaction(
        CORE_PERMISSIONS.map((perm) =>
            prisma.permission.upsert({
                where: { permissionKey: perm.permissionKey },
                update: { description: perm.description }, // Update description if needed
                create: perm,
            })
        )
    );
    const allPermissions = await prisma.permission.findMany();
    console.log(`✅ ${allPermissions.length} core permissions ensured.`);

    // 2. Create or Find the Default Tenant
    console.log(`Ensuring tenant '${SEED_TENANT_NAME}' exists...`);
    let tenant = await prisma.tenant.findFirst({
        where: { name: SEED_TENANT_NAME },
    });
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: {
                name: SEED_TENANT_NAME,
                status: 'ACTIVE',
            },
        });
        console.log(`✅ Tenant '${tenant.name}' created with ID: ${tenant.id}`);
    } else {
        console.log(`✅ Tenant '${tenant.name}' already exists with ID: ${tenant.id}`);
    }

    // 3. Create or Find the Admin Role (scoped to the tenant)
    console.log(`Ensuring role '${ADMIN_ROLE_NAME}' exists for tenant ${tenant.id}...`);
    let adminRole = await prisma.role.findUnique({
         where: { tenantId_name: { tenantId: tenant.id, name: ADMIN_ROLE_NAME } },
    });
    if (!adminRole) {
        adminRole = await prisma.role.create({
            data: {
                name: ADMIN_ROLE_NAME,
                description: 'Administrator with full system access',
                tenantId: tenant.id,
                isSystemRole: ADMIN_ROLE_SYSTEM,
                // Grant ALL permissions to the Admin role
                permissions: {
                    create: allPermissions.map(perm => ({
                        permission: { connect: { id: perm.id } }
                    }))
                }
            },
        });
        console.log(`✅ Role '${adminRole.name}' created for tenant ${tenant.id}`);
    } else {
        console.log(`✅ Role '${adminRole.name}' already exists for tenant ${tenant.id}. Ensuring all permissions are assigned...`);
        // Optional: Ensure existing admin role has all permissions (can be slow if many perms)
         await prisma.role.update({
             where: { id: adminRole.id },
             data: {
                 permissions: {
                     // Use connectOrCreate to add missing permissions without disconnecting existing ones
                     connectOrCreate: allPermissions.map(perm => ({
                         where: { roleId_permissionId: { roleId: adminRole!.id, permissionId: perm.id } },
                         create: { permission: { connect: { id: perm.id } } }
                     }))
                 }
             }
         });
          console.log(`✅ Ensured all permissions assigned to role '${adminRole.name}'.`);
    }

    // 4. Create the Initial Admin User (if they don't exist IN THIS TENANT)
    console.log(`Ensuring admin user '${SEED_ADMIN_EMAIL}' exists for tenant ${tenant.id}...`);
    let adminUser = await prisma.user.findFirst({
        where: {
            email: SEED_ADMIN_EMAIL.toLowerCase(),
            tenantId: tenant.id,
        },
    });

    if (!adminUser) {
        if (!SEED_ADMIN_PASSWORD) {
            console.error('❌ SEED_ADMIN_PASSWORD environment variable is not set. Cannot create admin user.');
            throw new Error('Admin password not set for seeding.');
        }
        const hashedPassword = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
        adminUser = await prisma.user.create({
            data: {
                email: SEED_ADMIN_EMAIL.toLowerCase(),
                passwordHash: hashedPassword,
                firstName: SEED_ADMIN_FIRSTNAME,
                lastName: SEED_ADMIN_LASTNAME,
                isActive: true,
                tenantId: tenant.id,
                roles: {
                    create: [{
                         role: { connect: { id: adminRole.id } }
                    }]
                }
            },
        });
        console.log(`✅ Admin user '${adminUser.email}' created for tenant ${tenant.id}`);
    } else {
        console.log(`✅ Admin user '${adminUser.email}' already exists for tenant ${tenant.id}`);
    }

    console.log(`🌱 Seed process finished.`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
