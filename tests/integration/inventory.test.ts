import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Inventory Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let productId: string;
    let sourceLocationId: string;
    let destinationLocationId: string;

    const adminEmail = `admin-inv-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Inventory Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'inventory:adjust',
            'inventory:read',
            'inventory:transfer:create',
            'inventory:transfer:ship',
            'inventory:transfer:receive',
        ];

        const createdPermissions = [];
        for (const perm of permissions) {
            const p = await prisma.permission.upsert({
                where: { permissionKey: perm },
                update: {},
                create: { permissionKey: perm, description: `Test permission ${perm}` },
            });
            createdPermissions.push(p);
        }

        // 3. Create Admin Role
        const role = await prisma.role.create({
            data: {
                name: 'Inventory Admin',
                tenantId: tenant.id,
                description: 'Inventory Admin Role',
            },
        });

        // 4. Assign Permissions to Role
        for (const perm of createdPermissions) {
            await prisma.rolePermission.create({
                data: {
                    roleId: role.id,
                    permissionId: perm.id,
                },
            });
        }

        // 5. Create Admin User
        const adminUser = await prisma.user.create({
            data: {
                email: adminEmail,
                passwordHash: hashedPassword,
                tenantId: tenant.id,
                firstName: 'Admin',
                lastName: 'User',
                isActive: true,
            },
        });

        // 6. Assign Role to Admin User
        await prisma.userRole.create({
            data: {
                userId: adminUser.id,
                roleId: role.id,
            },
        });

        // 7. Generate Access Token
        const payload = {
            userId: adminUser.id,
            tenantId: adminUser.tenantId,
        };
        adminAccessToken = jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });

        // 8. Create Test Product
        const product = await prisma.product.create({
            data: {
                tenantId,
                sku: `INV-PROD-${Date.now()}`,
                name: 'Inventory Test Product',
                productType: 'STANDARD',
                basePrice: 100,
            },
        });
        productId = product.id;

        // 9. Create Test Locations
        const loc1 = await prisma.location.create({
            data: {
                tenantId,
                name: 'Source Warehouse',
                locationType: 'WAREHOUSE',
            },
        });
        sourceLocationId = loc1.id;

        const loc2 = await prisma.location.create({
            data: {
                tenantId,
                name: 'Dest Store',
                locationType: 'STORE',
            },
        });
        destinationLocationId = loc2.id;
    });

    afterAll(async () => {
        await prisma.inventoryAdjustmentItem.deleteMany({ where: { tenantId } });
        await prisma.inventoryAdjustment.deleteMany({ where: { tenantId } });
        await prisma.inventoryTransferItem.deleteMany({ where: { tenantId } });
        await prisma.inventoryTransfer.deleteMany({ where: { tenantId } });
        await prisma.inventoryTransaction.deleteMany({ where: { tenantId } });
        await prisma.inventoryItem.deleteMany({ where: { tenantId } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/inventory/adjustments', () => {
        test('should create a stock adjustment (increase)', async () => {
            const adjustmentDto = {
                locationId: sourceLocationId,
                reasonCode: 'INITIAL_STOCK',
                items: [
                    {
                        productId: productId,
                        quantityChange: 100,
                    },
                ],
            };

            const res = await request(app)
                .post('/api/v1/inventory/adjustments')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(adjustmentDto);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('adjustmentId');
            // The service returns { adjustmentId: ..., transactionIds: ... }
        });
    });

    describe('GET /api/v1/inventory/items', () => {
        test('should return inventory items with correct quantity', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/items')
                .query({ locationId: sourceLocationId, productId: productId })
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
            const item = res.body.results.find((i: any) => i.productId === productId && i.locationId === sourceLocationId);
            expect(item).toBeDefined();
            expect(Number(item.quantityOnHand)).toBe(100);
        });
    });

    describe('POST /api/v1/inventory/transfers', () => {
        test('should create an inventory transfer', async () => {
            const transferDto = {
                sourceLocationId: sourceLocationId,
                destinationLocationId: destinationLocationId,
                notes: 'Test Transfer',
                items: [
                    {
                        productId: productId,
                        quantityRequested: 10,
                    },
                ],
            };

            const res = await request(app)
                .post('/api/v1/inventory/transfers')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(transferDto);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('transferId');
            // The service returns { transferId: ... }, not the full object
        });
    });

    describe('GET /api/v1/inventory/transfers', () => {
        test('should return list of transfers', async () => {
            const res = await request(app)
                .get('/api/v1/inventory/transfers')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
        });
    });
});
