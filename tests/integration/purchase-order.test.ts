import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Purchase Order Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let createdPOId: string;
    let supplierId: string;
    let productId: string;
    let locationId: string;

    const adminEmail = `admin-po-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `PO Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'po:create',
            'po:read',
            'po:update',
            'po:delete',
            'po:submit',
            'po:approve',
            'po:send',
            'po:cancel',
            'po:receive'
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
                name: 'PO Admin',
                tenantId: tenant.id,
                description: 'PO Admin Role',
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
        // Supplier
        const supplier = await prisma.supplier.create({
            data: {
                tenantId,
                name: 'Test Supplier',
                email: 'supplier@test.com',
            },
        });
        supplierId = supplier.id;

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
                locationType: 'WAREHOUSE',
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
    });

    afterAll(async () => {
        await prisma.purchaseOrderItem.deleteMany({ where: { tenantId } });
        await prisma.purchaseOrder.deleteMany({ where: { tenantId } });
        await prisma.supplier.deleteMany({ where: { tenantId } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/purchase-orders', () => {
        test('should create a new purchase order', async () => {
            const newPO = {
                supplierId,
                locationId,
                items: [
                    {
                        productId,
                        quantityOrdered: 10,
                        unitCost: 50,
                    },
                ],
                notes: 'Test PO',
            };

            const res = await request(app)
                .post('/api/v1/purchase-orders')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newPO);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.supplierId).toBe(supplierId);
            expect(res.body.status).toBe('DRAFT');
            createdPOId = res.body.id;
        });

        test('should return 400 if items are missing', async () => {
            const invalidPO = {
                supplierId,
                locationId,
                items: [], // Empty items
            };

            const res = await request(app)
                .post('/api/v1/purchase-orders')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(invalidPO);

            expect(res.status).toBe(httpStatus.BAD_REQUEST);
        });
    });

    describe('GET /api/v1/purchase-orders', () => {
        test('should return list of purchase orders', async () => {
            const res = await request(app)
                .get('/api/v1/purchase-orders')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
            expect(res.body.results[0].poNumber).toBeDefined();
        });
    });

    describe('GET /api/v1/purchase-orders/:poId', () => {
        test('should return purchase order details', async () => {
            const res = await request(app)
                .get(`/api/v1/purchase-orders/${createdPOId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(createdPOId);
            expect(res.body.items.length).toBe(1);
        });

        test('should return 404 if PO not found', async () => {
            const res = await request(app)
                .get('/api/v1/purchase-orders/nonexistent-id')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/purchase-orders/:poId', () => {
        test('should update purchase order details', async () => {
            const updateData = {
                notes: 'Updated PO Notes',
            };

            const res = await request(app)
                .patch(`/api/v1/purchase-orders/${createdPOId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.notes).toBe(updateData.notes);
        });
    });

    // Optional: Test state transitions (Submit, Approve, etc.)
    describe('PO State Transitions', () => {
        test('should submit PO', async () => {
            const res = await request(app)
                .post(`/api/v1/purchase-orders/${createdPOId}/submit`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({});

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.status).toBe('PENDING_APPROVAL');
        });

        test('should approve PO', async () => {
            const res = await request(app)
                .post(`/api/v1/purchase-orders/${createdPOId}/approve`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send({});

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.status).toBe('APPROVED');
        });
    });
});
