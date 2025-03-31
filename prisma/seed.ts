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
// const CORE_PERMISSIONS = [
//     { permissionKey: 'user:create', description: 'Can create new users' },
//     { permissionKey: 'user:read', description: 'Can read user information' },
//     { permissionKey: 'user:update', description: 'Can update user information' },
//     { permissionKey: 'user:delete', description: 'Can deactivate users' },
//     { permissionKey: 'role:assign', description: 'Can assign roles to users' }, // Might be part of user:update
//     { permissionKey: 'product:create', description: 'Can create products' },
//     { permissionKey: 'product:read', description: 'Can view products' },
//     { permissionKey: 'product:update', description: 'Can update products' },
//     { permissionKey: 'product:delete', description: 'Can delete products' },
//     { permissionKey: 'inventory:adjust', description: 'Can adjust inventory levels' },
//     { permissionKey: 'inventory:transfer', description: 'Can create inventory transfers' },
//     { permissionKey: 'order:create', description: 'Can create orders/POS transactions' },
//     { permissionKey: 'order:read', description: 'Can view orders' },
//     { permissionKey: 'order:update', description: 'Can update order status/details' },
//     { permissionKey: 'report:view', description: 'Can view reports' },
//     // ... add ALL permissions your system uses
// ];


const CORE_PERMISSIONS = [
    // --- Core / General ---
    { permissionKey: 'system:config:read', description: 'View system-level configurations' },
    { permissionKey: 'system:config:update', description: 'Modify system-level configurations (Super Admin)' },
    { permissionKey: 'tenant:config:read', description: 'View tenant-specific configurations' },
    { permissionKey: 'tenant:config:update', description: 'Modify tenant-specific configurations' },
    { permissionKey: 'dashboard:view', description: 'Access to view main dashboards' },

    // --- User & Role Management ---
    { permissionKey: 'user:create', description: 'Create new users within the tenant' },
    { permissionKey: 'user:read:own', description: 'View own user profile details' },
    { permissionKey: 'user:read:any', description: 'View profile details of any user within the tenant' },
    { permissionKey: 'user:update:own', description: 'Update own user profile (limited fields)' },
    { permissionKey: 'user:update:any', description: 'Update profile details of any user within the tenant' },
    { permissionKey: 'user:update:password:own', description: 'Change own password' },
    { permissionKey: 'user:update:password:any', description: 'Reset password for any user' },
    { permissionKey: 'user:update:activity', description: 'Activate or deactivate any user account' },
    // { permissionKey: 'user:delete', description: 'Hard delete user accounts (Use with caution)' }, // Often omitted for safety
    { permissionKey: 'user:assign:roles', description: 'Assign or unassign roles to users' },
    { permissionKey: 'role:create', description: 'Create new custom roles' },
    { permissionKey: 'role:read', description: 'View available roles and their permissions' },
    { permissionKey: 'role:update', description: 'Modify custom roles and their assigned permissions' },
    { permissionKey: 'role:delete', description: 'Delete custom roles' },

    // --- Product Catalog ---
    { permissionKey: 'category:create', description: 'Create product categories' },
    { permissionKey: 'category:read', description: 'View product categories' },
    { permissionKey: 'category:update', description: 'Update product categories' },
    { permissionKey: 'category:delete', description: 'Delete product categories' },
    { permissionKey: 'product:create', description: 'Create new products' },
    { permissionKey: 'product:read', description: 'View product details and list products' },
    { permissionKey: 'product:update', description: 'Update product information (pricing, details, attributes)' },
    { permissionKey: 'product:update:cost', description: 'Update product cost price' },
    { permissionKey: 'product:delete', description: 'Delete products' },
    { permissionKey: 'product:assign:category', description: 'Link products to categories' },
    { permissionKey: 'product:manage:variants', description: 'Manage product variants' },
    { permissionKey: 'product:manage:components', description: 'Define kit/bundle components' },

    // --- Location Management ---
    { permissionKey: 'location:create', description: 'Create new locations (stores, warehouses)' },
    { permissionKey: 'location:read', description: 'View location details' },
    { permissionKey: 'location:update', description: 'Update location details' },
    { permissionKey: 'location:delete', description: 'Delete locations' },

    // --- Inventory Management ---
    { permissionKey: 'inventory:read:levels', description: 'View current stock levels (Inventory Items)' },
    { permissionKey: 'inventory:read:transactions', description: 'View historical inventory transaction logs' },
    { permissionKey: 'inventory:adjust', description: 'Create inventory adjustments' },
    { permissionKey: 'inventory:adjust:approve', description: 'Approve inventory adjustments' },
    { permissionKey: 'inventory:adjust:read', description: 'View adjustment history' },
    { permissionKey: 'inventory:transfer:create', description: 'Create inventory transfer requests' },
    { permissionKey: 'inventory:transfer:ship', description: 'Mark a transfer as shipped' },
    { permissionKey: 'inventory:transfer:receive', description: 'Mark a transfer as received' },
    { permissionKey: 'inventory:transfer:read', description: 'View transfer history and details' },
    { permissionKey: 'inventory:transfer:cancel', description: 'Cancel a pending inventory transfer' },
    { permissionKey: 'inventory:count:start', description: 'Initiate a stock count process' },
    { permissionKey: 'inventory:count:enter', description: 'Enter counted quantities' },
    { permissionKey: 'inventory:count:review', description: 'Review count variances' },
    { permissionKey: 'inventory:count:approve', description: 'Approve and post count variances' },
    { permissionKey: 'inventory:valuation:read', description: 'View inventory valuation reports' },
    { permissionKey: 'inventory:manage:serials', description: 'Manage serial numbers' },
    { permissionKey: 'inventory:manage:lots', description: 'Manage lot numbers and expiry dates' },

    // --- Supplier & Purchasing ---
    { permissionKey: 'supplier:create', description: 'Create new suppliers' },
    { permissionKey: 'supplier:read', description: 'View supplier details' },
    { permissionKey: 'supplier:update', description: 'Update supplier information' },
    { permissionKey: 'supplier:delete', description: 'Deactivate/delete suppliers' },
    { permissionKey: 'po:create', description: 'Create new purchase orders' },
    { permissionKey: 'po:read', description: 'View purchase order details' },
    { permissionKey: 'po:update', description: 'Update purchase orders' },
    { permissionKey: 'po:approve', description: 'Approve purchase orders' },
    { permissionKey: 'po:send', description: 'Mark a PO as sent to the supplier' },
    { permissionKey: 'po:receive', description: 'Receive items against a purchase order' },
    { permissionKey: 'po:cancel', description: 'Cancel a purchase order' },
    // { permissionKey: 'po:delete', description: 'Hard delete draft purchase orders' }, // Often omitted

    // --- Customer Management ---
    { permissionKey: 'customer:create', description: 'Create new customers' },
    { permissionKey: 'customer:read', description: 'View customer details and list customers' },
    { permissionKey: 'customer:update', description: 'Update customer information' },
    { permissionKey: 'customer:delete', description: 'Delete customers' },
    { permissionKey: 'group:create', description: 'Create customer groups' },
    { permissionKey: 'group:read', description: 'View customer groups' },
    { permissionKey: 'group:update', description: 'Update customer groups' },
    { permissionKey: 'group:delete', description: 'Delete customer groups' },
    { permissionKey: 'customer:assign:group', description: 'Assign customers to groups' },

    // --- Order Management (Sales) ---
    { permissionKey: 'order:create', description: 'Create new orders (non-POS)' },
    { permissionKey: 'order:read:own', description: 'View orders created by the current user' },
    { permissionKey: 'order:read:any', description: 'View any order within the tenant' },
    { permissionKey: 'order:update', description: 'Update order details (e.g., notes, shipping info before shipping)' },
    { permissionKey: 'order:update:status', description: 'Change the status of an order' },
    { permissionKey: 'order:cancel', description: 'Cancel an order' },
    { permissionKey: 'order:manage:payments', description: 'Record or view payment information against an order' },
    { permissionKey: 'order:manage:shipments', description: 'Create/update shipment details' },
    { permissionKey: 'order:manage:returns', description: 'Initiate or process customer returns/exchanges' },

    // --- Point of Sale (POS) ---
    { permissionKey: 'pos:session:start', description: 'Start a new POS session' },
    { permissionKey: 'pos:session:end', description: 'End own POS session' },
    { permissionKey: 'pos:session:reconcile', description: 'Reconcile a closed POS session' },
    { permissionKey: 'pos:session:read:own', description: 'View details of own POS sessions' },
    { permissionKey: 'pos:session:read:any', description: 'View details of any POS session' },
    { permissionKey: 'pos:session:cash', description: 'Perform Pay In / Pay Out cash transactions' },
    { permissionKey: 'pos:checkout', description: 'Perform a sales transaction checkout' },
    { permissionKey: 'pos:return', description: 'Process returns/exchanges at the POS' },
    { permissionKey: 'pos:discount:apply', description: 'Apply manual discounts during POS checkout' },
    { permissionKey: 'pos:price:override', description: 'Override product prices during POS checkout' },
    { permissionKey: 'pos:sync', description: 'Trigger offline data synchronization' },

    // --- Reporting ---
    { permissionKey: 'report:view:sales', description: 'View sales reports' },
    { permissionKey: 'report:view:inventory', description: 'View inventory reports' },
    { permissionKey: 'report:view:pos', description: 'View POS specific reports' },
    { permissionKey: 'report:view:purchasing', description: 'View purchasing reports' },
    { permissionKey: 'report:view:customer', description: 'View customer reports' },
    { permissionKey: 'report:export', description: 'Export report data' },
    { permissionKey: 'report:custom:manage', description: 'Manage custom reports' },

    // --- Integration / Settings ---
    { permissionKey: 'integration:manage:payment', description: 'Configure payment processor integrations' },
    { permissionKey: 'integration:manage:shipping', description: 'Configure shipping provider integrations' },
    { permissionKey: 'integration:manage:accounting', description: 'Configure accounting software integrations' },
    { permissionKey: 'integration:manage:api_keys', description: 'Manage API keys for external system access' },
    { permissionKey: 'template:manage', description: 'Manage email, receipt, invoice templates' },
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
