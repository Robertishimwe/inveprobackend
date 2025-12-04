import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app';
import { prisma } from '../../src/config';
import { createTestTenant, createTestUser, createTestToken, createTestLocation, createTestProduct } from '../utils/test-utils';

describe('Location-Based Access Control (LBAC)', () => {
    let tenantId: string;
    let adminToken: string;
    let userLocAToken: string;
    let userLocBToken: string;
    let userUnassignedToken: string;

    let locationAId: string;
    let locationBId: string;
    let productId: string;
    let regularRoleId: string;

    beforeAll(async () => {
        // 1. Setup Tenant
        const tenant = await createTestTenant();
        tenantId = tenant.id;

        // 2. Create Locations
        const locA = await createTestLocation(tenantId, { name: 'Location A' });
        locationAId = locA.id;
        const locB = await createTestLocation(tenantId, { name: 'Location B' });
        locationBId = locB.id;

        // 2.5 Create Permissions
        const productReadPerm = await prisma.permission.upsert({
            where: { permissionKey: 'product:read' },
            update: {},
            create: { permissionKey: 'product:read', description: 'Read products' }
        });
        const userCreatePerm = await prisma.permission.upsert({
            where: { permissionKey: 'user:create' },
            update: {},
            create: { permissionKey: 'user:create', description: 'Create users' }
        });

        // 3. Create Users
        const adminRole = await prisma.role.create({
            data: {
                name: 'Tenant Admin',
                tenantId: tenantId,
                permissions: {
                    create: [
                        { permissionId: productReadPerm.id },
                        { permissionId: userCreatePerm.id }
                    ]
                }
            }
        });
        const adminUser = await createTestUser(tenantId, { email: `admin-${Date.now()}@example.com`, roleId: adminRole.id });
        adminToken = createTestToken(adminUser.id, tenantId);

        const regularRole = await prisma.role.create({
            data: {
                name: 'Regular User',
                tenantId: tenantId,
                permissions: {
                    create: [
                        { permissionId: productReadPerm.id }
                    ]
                }
            }
        });
        regularRoleId = regularRole.id;

        const userA = await createTestUser(tenantId, { email: `userA-${Date.now()}@example.com`, roleId: regularRole.id });
        await prisma.userLocation.create({
            data: { userId: userA.id, locationId: locationAId }
        });
        userLocAToken = createTestToken(userA.id, tenantId);

        const userB = await createTestUser(tenantId, { email: `userB-${Date.now()}@example.com`, roleId: regularRole.id });
        await prisma.userLocation.create({
            data: { userId: userB.id, locationId: locationBId }
        });
        userLocBToken = createTestToken(userB.id, tenantId);

        const userUnassigned = await createTestUser(tenantId, { email: `unassigned-${Date.now()}@example.com`, roleId: regularRole.id });
        userUnassignedToken = createTestToken(userUnassigned.id, tenantId);

        // 4. Create Product and Inventory
        const product = await createTestProduct(tenantId);
        productId = product.id;

        await prisma.inventoryItem.create({
            data: {
                tenantId,
                locationId: locationAId,
                productId: productId,
                quantityOnHand: 10,
                quantityAllocated: 0,
                quantityIncoming: 0
            }
        });

        await prisma.inventoryItem.create({
            data: {
                tenantId,
                locationId: locationBId,
                productId: productId,
                quantityOnHand: 20,
                quantityAllocated: 0,
                quantityIncoming: 0
            }
        });
    });

    afterAll(async () => {
        await prisma.inventoryItem.deleteMany({ where: { tenantId } });
        await prisma.userLocation.deleteMany({ where: { user: { tenantId } } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });

    test('Admin should see inventory for all locations', async () => {
        const res = await request(app)
            .get('/api/v1/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ limit: 10 });

        expect(res.status).toBe(httpStatus.OK);
        const product = res.body.results.find((p: any) => p.id === productId);
        expect(product).toBeDefined();
        expect(product.inventoryItems).toHaveLength(2);
        const quantities = product.inventoryItems.map((i: any) => Number(i.quantityOnHand)).sort((a: number, b: number) => a - b);
        expect(quantities).toEqual([10, 20]);
    });

    test('User A should only see inventory for Location A', async () => {
        const res = await request(app)
            .get('/api/v1/products')
            .set('Authorization', `Bearer ${userLocAToken}`)
            .query({ limit: 10 });

        expect(res.status).toBe(httpStatus.OK);
        const product = res.body.results.find((p: any) => p.id === productId);
        expect(product).toBeDefined();
        expect(product.inventoryItems).toHaveLength(1);
        expect(product.inventoryItems[0].locationId).toBe(locationAId);
        expect(Number(product.inventoryItems[0].quantityOnHand)).toBe(10);
    });

    test('User B should only see inventory for Location B', async () => {
        const res = await request(app)
            .get('/api/v1/products')
            .set('Authorization', `Bearer ${userLocBToken}`)
            .query({ limit: 10 });

        expect(res.status).toBe(httpStatus.OK);
        const product = res.body.results.find((p: any) => p.id === productId);
        expect(product).toBeDefined();
        expect(product.inventoryItems).toHaveLength(1);
        expect(product.inventoryItems[0].locationId).toBe(locationBId);
        expect(Number(product.inventoryItems[0].quantityOnHand)).toBe(20);
    });

    test('Unassigned User should see NO inventory', async () => {
        const res = await request(app)
            .get('/api/v1/products')
            .set('Authorization', `Bearer ${userUnassignedToken}`)
            .query({ limit: 10 });

        expect(res.status).toBe(httpStatus.OK);
        const product = res.body.results.find((p: any) => p.id === productId);
        expect(product).toBeDefined();
        expect(product.inventoryItems).toHaveLength(0);
    });

    test('Create User with valid locations', async () => {
        const res = await request(app)
            .post('/api/v1/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                email: `newuser-${Date.now()}@example.com`,
                password: 'Password123!',
                firstName: 'New',
                lastName: 'User',
                roleIds: [regularRoleId],
                locationIds: [locationAId, locationBId]
            });

        expect(res.status).toBe(httpStatus.CREATED);
        expect(res.body.locations).toHaveLength(2);
        const locIds = res.body.locations.map((l: any) => l.location.id).sort();
        const expectedIds = [locationAId, locationBId].sort();
        expect(locIds).toEqual(expectedIds);
    });
});
