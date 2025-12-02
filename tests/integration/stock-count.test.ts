import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { StockCountType, StockCountItemStatus } from '@prisma/client';

describe('Stock Count Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let locationId: string;
    let productId: string;
    let stockCountId: string;
    let stockCountItemId: string;

    const adminEmail = `admin-stock-count-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Stock Count Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissionKeys = [
            'inventory:count:start',
            'inventory:count:read',
            'inventory:count:enter',
            'inventory:count:review',
            'inventory:count:approve'
        ];

        const permissionRecords = [];
        for (const perm of permissionKeys) {
            const p = await prisma.permission.upsert({
                where: { permissionKey: perm },
                update: {},
                create: { permissionKey: perm, description: `Test permission ${perm}` },
            });
            permissionRecords.push(p);
        }

        // 3. Create Admin Role
        const role = await prisma.role.create({
            data: {
                name: `Admin Role ${Date.now()}`,
                tenantId,
                permissions: {
                    create: permissionRecords.map(p => ({
                        permission: { connect: { id: p.id } }
                    }))
                }
            }
        });

        // 4. Create Admin User
        const admin = await prisma.user.create({
            data: {
                email: adminEmail,
                passwordHash: hashedPassword,
                firstName: 'Admin',
                lastName: 'User',
                tenantId,
                roles: {
                    create: [{ role: { connect: { id: role.id } } }]
                }
            }
        });


        // ... imports ...

        // ... inside beforeAll ...

        // 5. Generate Access Token (Bypass login to avoid auth issues in module test)
        const payload = {
            userId: admin.id,
            tenantId: admin.tenantId,
        };
        adminAccessToken = jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });

        // 6. Create Location
        const location = await prisma.location.create({
            data: {
                name: `Warehouse ${Date.now()}`,
                locationType: 'WAREHOUSE',
                tenantId,
                isActive: true
            }
        });
        locationId = location.id;

        // 7. Create Product
        const product = await prisma.product.create({
            data: {
                name: `Test Product ${Date.now()}`,
                sku: `SKU-${Date.now()}`,
                productType: 'STANDARD',
                tenantId,
                basePrice: 100
            }
        });
        productId = product.id;

        // 8. Create Initial Inventory (Optional, but good to verify snapshot)
        await prisma.inventoryItem.create({
            data: {
                tenantId,
                productId,
                locationId,
                quantityOnHand: 10
            }
        });
    });

    afterAll(async () => {
        // Cleanup
        await prisma.stockCountItem.deleteMany({ where: { tenantId } });
        await prisma.stockCount.deleteMany({ where: { tenantId } });
        await prisma.inventoryTransaction.deleteMany({ where: { tenantId } });
        await prisma.inventoryAdjustmentItem.deleteMany({ where: { tenantId } });
        await prisma.inventoryAdjustment.deleteMany({ where: { tenantId } });
        await prisma.inventoryItem.deleteMany({ where: { tenantId } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
        await prisma.$disconnect();
    });

    describe('POST /api/v1/stock-counts', () => {
        test('should initiate a new stock count', async () => {
            const initiateData = {
                locationId,
                type: StockCountType.FULL,
                notes: 'Initial Full Count'
            };

            const res = await request(app)
                .post('/api/v1/stock-counts')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(initiateData);

            if (res.status !== httpStatus.CREATED) {
                console.error('Initiate Stock Count Failed:', JSON.stringify(res.body, null, 2));
            }

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.status).toBe('PENDING');

            stockCountId = res.body.id;

            // Fetch details to get item ID
            const detailsRes = await request(app)
                .get(`/api/v1/stock-counts/${stockCountId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(detailsRes.status).toBe(httpStatus.OK);
            expect(detailsRes.body.items).toHaveLength(1);
            expect(detailsRes.body.items[0].snapshotQuantity).toBe('10');
            stockCountItemId = detailsRes.body.items[0].id;
        });
    });

    describe('GET /api/v1/stock-counts/:stockCountId', () => {
        test('should retrieve stock count details', async () => {
            const res = await request(app)
                .get(`/api/v1/stock-counts/${stockCountId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(stockCountId);
            expect(res.body.items).toBeDefined();
        });
    });

    describe('POST /api/v1/stock-counts/:stockCountId/count', () => {
        test('should submit counts', async () => {
            const countData = {
                items: [
                    {
                        stockCountItemId,
                        countedQuantity: 12 // Variance of +2
                    }
                ]
            };

            const res = await request(app)
                .post(`/api/v1/stock-counts/${stockCountId}/count`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(countData);

            expect(res.status).toBe(httpStatus.OK);
            // Verify item status updated?
        });
    });

    describe('POST /api/v1/stock-counts/:stockCountId/review', () => {
        test('should review counts', async () => {
            const reviewData = {
                items: [
                    {
                        stockCountItemId,
                        action: StockCountItemStatus.APPROVED,
                        notes: 'Found extra items'
                    }
                ]
            };

            const res = await request(app)
                .post(`/api/v1/stock-counts/${stockCountId}/review`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(reviewData);

            expect(res.status).toBe(httpStatus.OK);
        });
    });

    describe('POST /api/v1/stock-counts/:stockCountId/post', () => {
        test('should finalize stock count', async () => {
            const res = await request(app)
                .post(`/api/v1/stock-counts/${stockCountId}/post`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.success).toBe(true);

            // Verify status updated to COMPLETED
            const finalRes = await request(app)
                .get(`/api/v1/stock-counts/${stockCountId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(finalRes.body.status).toBe('COMPLETED');

            // Verify inventory updated
            const invItem = await prisma.inventoryItem.findFirst({
                where: { tenantId, productId, locationId }
            });
            expect(Number(invItem?.quantityOnHand)).toBe(12);
        });
    });
});
