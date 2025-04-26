// prisma/seed.ts
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load .env for potential seed-specific variables (like admin email/password)
// Ensure the path correctly points to your root .env file relative to prisma/seed.ts
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

// --- Define Core Permissions (Comprehensive List) ---
const CORE_PERMISSIONS = [
    // Core / General
    { permissionKey: 'system:config:read', description: 'View system-level configurations' },
    { permissionKey: 'system:config:update', description: 'Modify system-level configurations (Super Admin)' },
    { permissionKey: 'tenant:config:read', description: 'View tenant-specific configurations' },
    { permissionKey: 'tenant:config:update', description: 'Modify tenant-specific configurations' },
    { permissionKey: 'dashboard:view', description: 'Access to view main dashboards' },
    // User & Role Management
    { permissionKey: 'user:create', description: 'Create new users within the tenant' },
    { permissionKey: 'user:create:any', description: 'Create new users without tenant context (Super Admin)' },
    { permissionKey: 'user:read:own', description: 'View own user profile details' },
    { permissionKey: 'user:read:any', description: 'View profile details of any user within the tenant' },
    { permissionKey: 'user:update:own', description: 'Update own user profile (limited fields)' },
    { permissionKey: 'user:update:any', description: 'Update profile details of any user within the tenant' },
    { permissionKey: 'user:update:password:own', description: 'Change own password' },
    { permissionKey: 'user:update:password:any', description: 'Reset password for any user' },
    { permissionKey: 'user:update:activity', description: 'Activate or deactivate any user account' },
    { permissionKey: 'user:assign:roles', description: 'Assign or unassign roles to users' },
    { permissionKey: 'role:create', description: 'Create new custom roles' },
    { permissionKey: 'role:read', description: 'View available roles and their permissions' },
    { permissionKey: 'role:update', description: 'Modify custom roles and their assigned permissions' },
    { permissionKey: 'role:delete', description: 'Delete custom roles' },
    // Product Catalog
    { permissionKey: 'category:create', description: 'Create product categories' },
    { permissionKey: 'category:read', description: 'View product categories' },
    { permissionKey: 'category:update', description: 'Update product categories' },
    { permissionKey: 'category:delete', description: 'Delete product categories' },
    { permissionKey: 'product:create', description: 'Create new products' },
    { permissionKey: 'product:read', description: 'View product details and list products' },
    { permissionKey: 'product:update', description: 'Update product information' },
    { permissionKey: 'product:update:cost', description: 'Update product cost price' },
    { permissionKey: 'product:delete', description: 'Delete products' },
    { permissionKey: 'product:assign:category', description: 'Link products to categories' },
    { permissionKey: 'product:manage:variants', description: 'Manage product variants' },
    { permissionKey: 'product:manage:components', description: 'Define kit/bundle components' },
    // Location Management
    { permissionKey: 'location:create', description: 'Create new locations' },
    { permissionKey: 'location:read', description: 'View location details' },
    { permissionKey: 'location:update', description: 'Update location details' },
    { permissionKey: 'location:delete', description: 'Delete locations' },
    // Inventory Management
    { permissionKey: 'inventory:read', description: 'View current stock' },
    { permissionKey: 'inventory:read:levels', description: 'View current stock levels' },
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
    { permissionKey: 'inventory:count:read', description: 'Review stock counts' },
    { permissionKey: 'inventory:count:enter', description: 'Enter counted quantities' },
    { permissionKey: 'inventory:count:review', description: 'Review count variances' },
    { permissionKey: 'inventory:count:approve', description: 'Approve and post count variances' },
    { permissionKey: 'inventory:valuation:read', description: 'View inventory valuation reports' },
    { permissionKey: 'inventory:manage:serials', description: 'Manage serial numbers' },
    { permissionKey: 'inventory:manage:lots', description: 'Manage lot numbers and expiry dates' },
    // Supplier & Purchasing
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
    // Customer Management
    { permissionKey: 'customer:create', description: 'Create new customers' },
    { permissionKey: 'customer:read', description: 'View customer details and list customers' },
    { permissionKey: 'customer:update', description: 'Update customer information' },
    { permissionKey: 'customer:delete', description: 'Delete customers' },
    { permissionKey: 'group:create', description: 'Create customer groups' },
    { permissionKey: 'group:read', description: 'View customer groups' },
    { permissionKey: 'group:update', description: 'Update customer groups' },
    { permissionKey: 'group:delete', description: 'Delete customer groups' },
    { permissionKey: 'customer:assign:group', description: 'Assign customers to groups' },
    // Order Management (Sales)
    { permissionKey: 'order:create', description: 'Create new orders (non-POS)' },
    { permissionKey: 'order:read:own', description: 'View orders created by the current user' },
    { permissionKey: 'order:read:any', description: 'View any order within the tenant' },
    { permissionKey: 'order:read', description: 'View any order within the tenant' },
    { permissionKey: 'order:read:transactions', description: 'View transactions related to an order' },
    { permissionKey: 'order:update', description: 'Update order details' },
    { permissionKey: 'order:update:status', description: 'Change the status of an order' },
    { permissionKey: 'order:cancel', description: 'Cancel an order' },
    { permissionKey: 'order:manage:payments', description: 'Record or view payment information' },
    { permissionKey: 'order:manage:shipments', description: 'Create/update shipment details' },
    { permissionKey: 'order:manage:returns', description: 'Initiate or process customer returns/exchanges' },
    { permissionKey: 'return:read', description: 'View return details' },
    // Point of Sale (POS)
    { permissionKey: 'pos:session:start', description: 'Start a new POS session' },
    { permissionKey: 'pos:session:end', description: 'End own POS session' },
    { permissionKey: 'pos:session:reconcile', description: 'Reconcile a closed POS session' },
    { permissionKey: 'pos:session:read:own', description: 'View details of own POS sessions' },
    { permissionKey: 'pos:session:read:any', description: 'View details of any POS session' },
    { permissionKey: 'pos:session:read', description: 'View details of any POS session' },
    { permissionKey: 'pos:session:cash', description: 'Perform Pay In / Pay Out cash transactions' },
    { permissionKey: 'pos:checkout', description: 'Perform a sales transaction checkout' },
    { permissionKey: 'pos:return', description: 'Process returns/exchanges at the POS' },
    { permissionKey: 'pos:discount:apply', description: 'Apply manual discounts during POS checkout' },
    { permissionKey: 'pos:price:override', description: 'Override product prices during POS checkout' },
    { permissionKey: 'pos:sync', description: 'Trigger offline data synchronization' },
    { permissionKey: 'pos:manage:giftcards', description: 'Manage gift cards and loyalty programs' },
    { permissionKey: 'pos:manage:layaways', description: 'Manage layaway transactions' },
    { permissionKey: 'pos:manage:quotes', description: 'Create and manage quotes' },
    { permissionKey: 'pos:manage:kits', description: 'Manage kits and bundles at POS' },
    { permissionKey: 'pos:manage:tenders', description: 'Manage payment tenders and methods' },
    { permissionKey: 'pos:manage:gifts', description: 'Manage gift receipts and messages' },
    { permissionKey: 'pos:session:list', description: 'List all POS sessions' },

    // Reporting
    { permissionKey: 'report:view:sales', description: 'View sales reports' },
    { permissionKey: 'report:view:inventory', description: 'View inventory reports' },
    { permissionKey: 'report:view:pos', description: 'View POS specific reports' },
    { permissionKey: 'report:view:purchasing', description: 'View purchasing reports' },
    { permissionKey: 'report:view:customer', description: 'View customer reports' },
    { permissionKey: 'report:export', description: 'Export report data' },
    { permissionKey: 'report:custom:manage', description: 'Manage custom reports' },
    // Integration / Settings
    { permissionKey: 'integration:manage:payment', description: 'Configure payment processor integrations' },
    { permissionKey: 'integration:manage:shipping', description: 'Configure shipping provider integrations' },
    { permissionKey: 'integration:manage:accounting', description: 'Configure accounting software integrations' },
    { permissionKey: 'integration:manage:api_keys', description: 'Manage API keys for external system access' },
    { permissionKey: 'template:manage', description: 'Manage email, receipt, invoice templates' },
    // Tenant Management
    { permissionKey: 'tenant:create', description: 'Create new tenant accounts (Super Admin)' },
    { permissionKey: 'tenant:create:any', description: 'Create new tenant accounts without context (Super Admin)' },
    { permissionKey: 'tenant:read:any', description: 'View tenant details without context (Super Admin)' },
    { permissionKey: 'tenant:read', description: 'View tenant details' },
    { permissionKey: 'tenant:update:any', description: 'Update tenant details without context (Super Admin)' },
    { permissionKey: 'tenant:update', description: 'Update tenant details' },
    { permissionKey: 'tenant:delete:any', description: 'Delete tenant accounts without context (Super Admin)' },                    
    { permissionKey: 'tenant:read', description: 'View tenant details (Super Admin)' },
    { permissionKey: 'tenant:update', description: 'Update tenant details (Super Admin)' },
    { permissionKey: 'tenant:delete', description: 'Delete tenant accounts (Super Admin)' },
    //add tenant:manage:admins only
    { permissionKey: 'tenant:manage:admins', description: 'Manage tenant admin users (Super Admin)' },
    { permissionKey: 'tenant:manage:users', description: 'Manage tenant users' },
];

// --- Helper Function to create/update a Role with specific permissions ---
async function upsertRoleWithPermissions(
    tenantId: string,
    roleName: string,
    description: string,
    isSystemRole: boolean,
    permissionKeys: string[] // Array of permissionKey strings
) {
    console.log(`Ensuring role '${roleName}' exists for tenant ${tenantId}...`);

    // Find the IDs for the given permission keys
    const permissionsToAssign = await prisma.permission.findMany({
        where: { permissionKey: { in: permissionKeys } },
        select: { id: true, permissionKey: true } // Select key for warning message
    });
    const permissionIdsToAssign = permissionsToAssign.map(p => p.id);
    const foundPermissionKeys = permissionsToAssign.map(p => p.permissionKey);

    if(permissionIdsToAssign.length !== permissionKeys.length) {
        const missingKeys = permissionKeys.filter(key => !foundPermissionKeys.includes(key));
        console.warn(`⚠️ Could not find all permissions for role '${roleName}'. Missing/Invalid keys: ${missingKeys.join(', ')}. Ensure they are in CORE_PERMISSIONS array.`);
    }

    // Upsert the role itself
    const role = await prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenantId, name: roleName } },
        update: { description: description, isSystemRole: isSystemRole }, // Update description/system status if it exists
        create: {
            name: roleName,
            description: description,
            tenantId: tenantId,
            isSystemRole: isSystemRole,
        },
        select: { id: true } // Select only ID
    });

    // Set exactly the specified permissions (delete old, create new) using a transaction
    // This ensures atomicity for permission assignment.
    await prisma.$transaction([
        // Delete existing permissions links for this role first
        prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
        // Create new permissions links if any valid IDs were found
        ...(permissionIdsToAssign.length > 0 ? [prisma.rolePermission.createMany({
            data: permissionIdsToAssign.map(permissionId => ({
                roleId: role.id,
                permissionId: permissionId,
            })),
            skipDuplicates: true // Skip if somehow duplicate is attempted (shouldn't happen after deleteMany)
        })] : [])
    ]);

    console.log(`✅ Role '${roleName}' ensured/updated with ${permissionIdsToAssign.length} permissions for tenant ${tenantId}.`);
    return role; // Return role ID
}


// --- Main Seeding Function ---
async function main() {
    console.log(`🌱 Starting seed process...`);

    // 1. Upsert Core Permissions
    console.log(`Ensuring core permissions exist...`);
    await prisma.$transaction(
        CORE_PERMISSIONS.map((perm) =>
            prisma.permission.upsert({
                where: { permissionKey: perm.permissionKey },
                update: { description: perm.description },
                create: perm,
            })
        )
    );
    const allPermissions = await prisma.permission.findMany(); // Get all for Admin role
    console.log(`✅ ${allPermissions.length} core permissions ensured.`);

    // 2. Create or Find the Default Tenant
    console.log(`Ensuring tenant '${SEED_TENANT_NAME}' exists...`);
    const tenant = await prisma.tenant.upsert({
        where: { name: SEED_TENANT_NAME }, // Assumes tenant name is unique
        update: {}, // No updates needed if tenant exists for this basic seed
        create: { name: SEED_TENANT_NAME, status: 'ACTIVE' },
    });
    console.log(`✅ Tenant '${tenant.name}' ensured with ID: ${tenant.id}`);

    // 3. Upsert Roles and Assign Permissions using the helper function
    // Admin Role (All Permissions)
    const adminPermissionKeys = allPermissions.map(p => p.permissionKey);
    const adminRole = await upsertRoleWithPermissions(tenant.id, ADMIN_ROLE_NAME, 'Administrator with full system access', ADMIN_ROLE_SYSTEM, adminPermissionKeys);

    // Manager Role
    const managerPermissionKeys = [
        'dashboard:view', 'user:create', 'user:read:any', 'user:update:any', 'user:update:activity', 'user:assign:roles',
        'role:read', 'category:create', 'category:read', 'category:update', 'category:delete',
        'product:create', 'product:read', 'product:update', 'product:delete', 'product:assign:category',
        'location:read', 'location:update',
        'inventory:read:levels', 'inventory:read:transactions', 'inventory:adjust', 'inventory:transfer:create', 'inventory:transfer:read', 'inventory:count:start', 'inventory:count:enter', 'inventory:count:review', 'inventory:count:approve', 'inventory:adjust:read', 'inventory:transfer:ship', 'inventory:transfer:receive', 'inventory:transfer:cancel',
        'supplier:read', 'supplier:create', 'supplier:update',
        'po:create', 'po:read', 'po:update', 'po:approve', 'po:receive', 'po:cancel',
        'customer:create', 'customer:read', 'customer:update', 'customer:delete', 'group:read', 'customer:assign:group',
        'order:create', 'order:read:any', 'order:update', 'order:update:status', 'order:cancel', 'order:manage:returns', 'return:read',
        'pos:session:read:any', 'pos:session:reconcile',
        'report:view:sales', 'report:view:inventory', 'report:view:pos', 'report:view:purchasing', 'report:view:customer', 'report:export',
        'template:manage',
    ];
    await upsertRoleWithPermissions(tenant.id, 'Manager', 'Manages store operations, staff, and inventory', true, managerPermissionKeys);

    // Cashier/Sales Associate Role
    const cashierPermissionKeys = [
        'dashboard:view', 'user:read:own', 'user:update:own', 'user:update:password:own',
        'product:read', 'customer:read', 'customer:create',
        'inventory:read:levels', // Check stock
        'order:read:own', // View own sales
        'pos:session:start', 'pos:session:end', 'pos:session:read:own', 'pos:session:cash',
        'pos:checkout', 'pos:return',
        'pos:discount:apply', // Standard discounts perhaps
    ];
    await upsertRoleWithPermissions(tenant.id, 'Cashier', 'Handles point-of-sale transactions and customer interactions', true, cashierPermissionKeys);

    // Warehouse Staff Role
    const warehousePermissionKeys = [
         'dashboard:view', 'user:read:own', 'user:update:own', 'user:update:password:own',
         'product:read', 'location:read',
         'inventory:read:levels', 'inventory:read:transactions', 'inventory:adjust',
         'inventory:transfer:create', 'inventory:transfer:ship', 'inventory:transfer:receive', 'inventory:transfer:read', 'inventory:transfer:cancel',
         'inventory:count:start', 'inventory:count:enter',
         'inventory:manage:serials', 'inventory:manage:lots',
         'po:read', 'po:receive',
    ];
    await upsertRoleWithPermissions(tenant.id, 'Warehouse Staff', 'Manages warehouse stock, receiving, and transfers', true, warehousePermissionKeys);

    // Read Only Analyst Role
    const analystPermissionKeys = [
        'dashboard:view', 'user:read:own',
        'category:read', 'product:read', 'location:read',
        'inventory:read:levels', 'inventory:read:transactions', 'inventory:adjust:read', 'inventory:transfer:read', 'inventory:valuation:read',
        'supplier:read', 'po:read',
        'customer:read', 'group:read',
        'order:read:any',
        'pos:session:read:any',
        'report:view:sales', 'report:view:inventory', 'report:view:pos', 'report:view:purchasing', 'report:view:customer', 'report:export',
    ];
    await upsertRoleWithPermissions(tenant.id, 'Analyst', 'Read-only access to view data and reports', true, analystPermissionKeys);


    // 4. Ensure Initial Admin User exists and has Admin role for this Tenant
    console.log(`Ensuring admin user '${SEED_ADMIN_EMAIL}' exists for tenant ${tenant.id}...`);
    let adminUser = await prisma.user.findFirst({
        where: { email: SEED_ADMIN_EMAIL.toLowerCase(), tenantId: tenant.id },
        include: { roles: { select: { roleId: true } } }
    });

    if (!adminUser) {
         // Create user if not found for this tenant
         console.log(`Admin user not found for this tenant. Creating...`);
         if (!SEED_ADMIN_PASSWORD) { throw new Error('Admin password not set for seeding.'); }
         const hashedPassword = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
         adminUser = await prisma.user.create({
             data: {
                 email: SEED_ADMIN_EMAIL.toLowerCase(), passwordHash: hashedPassword,
                 firstName: SEED_ADMIN_FIRSTNAME, lastName: SEED_ADMIN_LASTNAME,
                 isActive: true, tenantId: tenant.id,
                 roles: { create: [{ roleId: adminRole.id }] } // Assign Admin role via join table
             },
             include: { roles: { select: { roleId: true } } }
         });
         console.log(`✅ Admin user '${adminUser.email}' created for tenant ${tenant.id} and assigned Admin role.`);
    } else {
         // User exists, ensure Admin role is assigned
         console.log(`✅ Admin user '${adminUser.email}' already exists for tenant ${tenant.id}. Ensuring Admin role assignment...`);
         const hasAdminRole = adminUser.roles.some(userRole => userRole.roleId === adminRole.id);
         if (!hasAdminRole) {
             console.log(`Admin user found but missing Admin role assignment for this tenant. Assigning...`);
             await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });
             console.log(`✅ Assigned Admin role to existing user '${adminUser.email}' for this tenant.`);
         } else {
             console.log(`✅ Existing admin user '${adminUser.email}' already has Admin role for this tenant.`);
         }
         // Optionally update other fields like name/activity status
         await prisma.user.update({
            where: { id: adminUser.id },
            data: { isActive: true, firstName: SEED_ADMIN_FIRSTNAME, lastName: SEED_ADMIN_LASTNAME }
         });
    }

    console.log(`🌱 Seed process finished.`);
}

// --- Execute Main Function ---
main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(`Prisma Error Code: ${e.code}`);
        if(e.meta) console.error(`Meta: ${JSON.stringify(e.meta)}`);
    }
    process.exit(1);
  })
  .finally(async () => {
    console.log('Disconnecting Prisma Client...');
    await prisma.$disconnect();
  });
