import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Order Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let createdOrderId: string;
    let customerId: string;
    let productId: string;
    let locationId: string;

    const adminEmail = `admin-order-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Order Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'order:create',
            'order:read',
            'order:update',
            'order:delete',
            'order:cancel',
            'order:fulfill'
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
                name: 'Order Admin',
                tenantId: tenant.id,
                description: 'Order Admin Role',
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

        // 8. Create Dependencies
        // Customer
        const customer = await prisma.customer.create({
            data: {
                tenantId,
                firstName: 'Test',
                lastName: 'Customer',
                email: `customer-${Date.now()}@test.com`,
                phone: '1234567890',
            },
        });
        customerId = customer.id;

        // Product
        const product = await prisma.product.create({
            data: {
                tenantId,
                name: 'Test Product',
                sku: `SKU-${Date.now()}`,
                productType: 'STANDARD',
                basePrice: 100,
            },
        });
        productId = product.id;

        // Location
        const location = await prisma.location.create({
            data: {
                tenantId,
                name: 'Test Location',
                locationType: 'STORE',
            },
        });
        locationId = location.id;

        // 8.1 Assign User to Location
        await prisma.userLocation.create({
            data: {
                userId: adminUser.id,
                locationId: locationId
            }
        });

        // 9. Add Stock (InventoryItem)
        await prisma.inventoryItem.create({
            data: {
                tenantId,
                productId,
                locationId,
                quantityOnHand: 100,
                quantityAllocated: 0,
                quantityIncoming: 0,
            },
        });
    });

    afterAll(async () => {
        await prisma.inventoryTransaction.deleteMany({ where: { tenantId } });
        await prisma.inventoryItem.deleteMany({ where: { tenantId } });
        await prisma.orderItem.deleteMany({ where: { tenantId } });
        await prisma.order.deleteMany({ where: { tenantId } });
        await prisma.customer.deleteMany({ where: { tenantId } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/orders', () => {
        test('should create a new order', async () => {
            const newOrder = {
                locationId,
                customerId,
                items: [
                    {
                        productId,
                        quantity: 2,
                        unitPrice: 100,
                    },
                ],
                notes: 'Test Order',
            };

            const res = await request(app)
                .post('/api/v1/orders')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newOrder);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.customer.id).toBe(customerId);
            expect(res.body.status).toBe('PROCESSING');
            createdOrderId = res.body.id;
        });

        test('should return 400 if items are missing', async () => {
            const invalidOrder = {
                locationId,
                customerId,
                items: [], // Empty items
            };

            const res = await request(app)
                .post('/api/v1/orders')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(invalidOrder);

            expect(res.status).toBe(httpStatus.BAD_REQUEST);
        });
    });

    describe('GET /api/v1/orders', () => {
        test('should return list of orders', async () => {
            const res = await request(app)
                .get('/api/v1/orders')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
            expect(res.body.results[0].orderNumber).toBeDefined();
        });
    });

    describe('GET /api/v1/orders/:orderId', () => {
        test('should return order details', async () => {
            const res = await request(app)
                .get(`/api/v1/orders/${createdOrderId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(createdOrderId);
            expect(res.body.items.length).toBe(1);
        });

        test('should return 404 if order not found', async () => {
            const res = await request(app)
                .get('/api/v1/orders/nonexistent-id')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/orders/:orderId', () => {
        test('should update order details', async () => {
            const updateData = {
                notes: 'Updated Order Notes',
            };

            const res = await request(app)
                .patch(`/api/v1/orders/${createdOrderId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.notes).toBe(updateData.notes);
        });
    });

    describe('POST /api/v1/orders/:orderId/cancel', () => {
        test('should cancel order', async () => {
            const res = await request(app)
                .post(`/api/v1/orders/${createdOrderId}/cancel`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({ reason: 'Test Cancel' });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.status).toBe('CANCELLED');
        });
    });
});
