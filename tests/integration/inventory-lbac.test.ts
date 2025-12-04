import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app';
import { prisma } from '../../src/config';
import { createTestTenant, createTestUser, createTestToken, createTestLocation, createTestProduct } from '../utils/test-utils';

describe('Inventory Location-Based Access Control (LBAC)', () => {
    let tenantId: string;
    let adminToken: string;
    let userLocAToken: string;
    let userLocBToken: string;
    let userUnassignedToken: string;

    let locationAId: string;
    let locationBId: string;
    let productId: string;

    beforeAll(async () => {
        // 1. Setup Tenant
        const tenant = await createTestTenant();
        tenantId = tenant.id;

        // 2. Create Locations
        const locA = await createTestLocation(tenantId, { name: 'Location A' });
        locationAId = locA.id;
        const locB = await createTestLocation(tenantId, { name: 'Location B' });
        locationBId = locB.id;

        // 3. Create Permissions
        const permissions = [
            'inventory:read',
            'inventory:adjust',
            'inventory:transfer'
        ];
        const createdPermissions = [];
        for (const perm of permissions) {
            const p = await prisma.permission.upsert({
                where: { permissionKey: perm },
                update: {},
                create: { permissionKey: perm, description: `Test permission ${perm}` }
            });
            createdPermissions.push(p);
        }

        // 4. Create Roles
        const adminRole = await prisma.role.create({
            data: {
                name: 'Tenant Admin',
                tenantId: tenantId,
                permissions: {
                    create: createdPermissions.map(p => ({ permissionId: p.id }))
                }
            }
        });

        const regularRole = await prisma.role.create({
            data: {
                name: 'Regular User',
                tenantId: tenantId,
                permissions: {
                    create: createdPermissions.map(p => ({ permissionId: p.id }))
                }
            }
        });

        // 5. Create Users
        const adminUser = await createTestUser(tenantId, { email: `admin-inv-${Date.now()}@example.com`, roleId: adminRole.id });
        adminToken = createTestToken(adminUser.id, tenantId);

        const userA = await createTestUser(tenantId, { email: `userA-inv-${Date.now()}@example.com`, roleId: regularRole.id });
        await prisma.userLocation.create({ data: { userId: userA.id, locationId: locationAId } });
        userLocAToken = createTestToken(userA.id, tenantId);

        const userB = await createTestUser(tenantId, { email: `userB-inv-${Date.now()}@example.com`, roleId: regularRole.id });
        await prisma.userLocation.create({ data: { userId: userB.id, locationId: locationBId } });
        userLocBToken = createTestToken(userB.id, tenantId);

        const userUnassigned = await createTestUser(tenantId, { email: `unassigned-inv-${Date.now()}@example.com`, roleId: regularRole.id });
        userUnassignedToken = createTestToken(userUnassigned.id, tenantId);

        // 6. Create Product and Inventory
        const product = await createTestProduct(tenantId);
        productId = product.id;

        // Inventory Items
        await prisma.inventoryItem.create({
            data: { tenantId, locationId: locationAId, productId, quantityOnHand: 10, quantityAllocated: 0, quantityIncoming: 0 }
        });
        await prisma.inventoryItem.create({
            data: { tenantId, locationId: locationBId, productId, quantityOnHand: 20, quantityAllocated: 0, quantityIncoming: 0 }
        });

        // 7. Create Adjustments
        // Adjustment in Location A
        await prisma.inventoryAdjustment.create({
            data: {
                tenantId,
                locationId: locationAId,
                reasonCode: 'Test Adjustment A',
                createdByUserId: adminUser.id,
                items: {
                    create: {
                        tenantId,
                        productId,
                        quantityChange: 5
                    }
                }
            }
        });

        // Adjustment in Location B
        await prisma.inventoryAdjustment.create({
            data: {
                tenantId,
                locationId: locationBId,
                reasonCode: 'Test Adjustment B',
                createdByUserId: adminUser.id,
                items: {
                    create: {
                        tenantId,
                        productId,
                        quantityChange: -2
                    }
                }
            }
        });

        // 8. Create Transfers
        // Transfer from A to B
        await prisma.inventoryTransfer.create({
            data: {
                tenantId,
                sourceLocationId: locationAId,
                destinationLocationId: locationBId,
                status: 'COMPLETED',
                trackingNumber: 'TR-001',
                createdByUserId: adminUser.id,
                items: {
                    create: {
                        tenantId,
                        productId,
                        quantityRequested: 3,
                        quantityReceived: 3
                    }
                }
            }
        });
    });

    afterAll(async () => {
        await prisma.inventoryAdjustmentItem.deleteMany({ where: { adjustment: { tenantId } } });
        await prisma.inventoryAdjustment.deleteMany({ where: { tenantId } });
        await prisma.inventoryTransferItem.deleteMany({ where: { transfer: { tenantId } } });
        await prisma.inventoryTransfer.deleteMany({ where: { tenantId } });
        await prisma.inventoryItem.deleteMany({ where: { tenantId } });
        await prisma.userLocation.deleteMany({ where: { user: { tenantId } } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.userRole.deleteMany({ where: { user: { tenantId } } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.rolePermission.deleteMany({ where: { role: { tenantId } } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.permission.deleteMany({ where: { description: { contains: 'Test permission' } } }); // Cleanup perms carefully
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('GET /api/v1/inventory/items', () => {
        test('Admin should see inventory items from all locations', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/items')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(2);
        });

        test('User A should only see inventory items from Location A', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/items')
                .set('Authorization', `Bearer ${userLocAToken}`);
            expect(res.status).toBe(httpStatus.OK);
            const items = res.body.results;
            expect(items.every((i: any) => i.locationId === locationAId)).toBe(true);
            expect(items.find((i: any) => i.locationId === locationBId)).toBeUndefined();
        });

        test('User B should only see inventory items from Location B', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/items')
                .set('Authorization', `Bearer ${userLocBToken}`);
            expect(res.status).toBe(httpStatus.OK);
            const items = res.body.results;
            expect(items.every((i: any) => i.locationId === locationBId)).toBe(true);
            expect(items.find((i: any) => i.locationId === locationAId)).toBeUndefined();
        });

        test('Unassigned User should see NO inventory items', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/items')
                .set('Authorization', `Bearer ${userUnassignedToken}`);
            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results).toHaveLength(0);
        });
    });

    describe('GET /api/v1/inventory/adjustments', () => {
        test('Admin should see adjustments from all locations', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/adjustments')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(2);
        });

        test('User A should only see adjustments from Location A', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/adjustments')
                .set('Authorization', `Bearer ${userLocAToken}`);
            expect(res.status).toBe(httpStatus.OK);
            const adjustments = res.body.results;
            expect(adjustments.length).toBeGreaterThanOrEqual(1);
            expect(adjustments.every((a: any) => a.locationId === locationAId)).toBe(true);
        });

        test('User B should only see adjustments from Location B', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/adjustments')
                .set('Authorization', `Bearer ${userLocBToken}`);
            expect(res.status).toBe(httpStatus.OK);
            const adjustments = res.body.results;
            expect(adjustments.length).toBeGreaterThanOrEqual(1);
            expect(adjustments.every((a: any) => a.locationId === locationBId)).toBe(true);
        });
    });

    describe('GET /api/v1/inventory/transfers', () => {
        test('Admin should see transfers from all locations', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/transfers')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
        });

        test('User A should see transfers where Location A is source OR destination', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/transfers')
                .set('Authorization', `Bearer ${userLocAToken}`);
            expect(res.status).toBe(httpStatus.OK);
            const transfers = res.body.results;
            expect(transfers.length).toBeGreaterThanOrEqual(1);
            // In our test case, A is source, B is destination. A should see it.
            const transfer = transfers.find((t: any) => t.sourceLocationId === locationAId || t.destinationLocationId === locationAId);
            expect(transfer).toBeDefined();
        });

        test('User B should see transfers where Location B is source OR destination', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/transfers')
                .set('Authorization', `Bearer ${userLocBToken}`);
            expect(res.status).toBe(httpStatus.OK);
            const transfers = res.body.results;
            expect(transfers.length).toBeGreaterThanOrEqual(1);
            // In our test case, A is source, B is destination. B should see it.
            const transfer = transfers.find((t: any) => t.sourceLocationId === locationBId || t.destinationLocationId === locationBId);
            expect(transfer).toBeDefined();
        });

        test('Unassigned User should see NO transfers', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/transfers')
                .set('Authorization', `Bearer ${userUnassignedToken}`);
            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results).toHaveLength(0);
        });
    });
});
