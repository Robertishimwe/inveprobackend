import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Purchase Order Close Feature', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let supplierId: string;
    let productId: string;
    let locationId: string;

    const adminEmail = `admin-po-close-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `PO Close Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'po:create',
            'po:read',
            'po:update',
            'po:submit',
            'po:approve',
            'po:send',
            'po:cancel',
            'po:receive',
            'po:close' // Required for this feature
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
        const supplier = await prisma.supplier.create({
            data: { tenantId, name: 'Test Supplier', email: 'supplier@test.com' },
        });
        supplierId = supplier.id;

        const product = await prisma.product.create({
            data: { tenantId, name: 'Test Product', sku: `SKU-${Date.now()}`, productType: 'STANDARD', basePrice: 100 },
        });
        productId = product.id;

        const location = await prisma.location.create({
            data: { tenantId, name: 'Test Location', locationType: 'WAREHOUSE' },
        });
        locationId = location.id;
    });

    afterAll(async () => {
        // Delete inventory transactions first due to foreign key constraints (Restrict)
        await prisma.inventoryTransaction.deleteMany({ where: { tenantId } });
        await prisma.purchaseOrderItem.deleteMany({ where: { tenantId } });
        await prisma.purchaseOrder.deleteMany({ where: { tenantId } });
        await prisma.supplier.deleteMany({ where: { tenantId } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    const createAndSendPO = async () => {
        // Create
        const resCreate = await request(app)
            .post('/api/v1/purchase-orders')
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({
                supplierId,
                locationId,
                items: [{ productId, quantityOrdered: 10, unitCost: 50 }],
                notes: 'Test PO',
            });
        const poId = resCreate.body.id;

        // Submit
        await request(app).post(`/api/v1/purchase-orders/${poId}/submit`).set('Authorization', `Bearer ${adminAccessToken}`);
        // Approve
        await request(app).post(`/api/v1/purchase-orders/${poId}/approve`).set('Authorization', `Bearer ${adminAccessToken}`);
        // Send
        await request(app).post(`/api/v1/purchase-orders/${poId}/send`).set('Authorization', `Bearer ${adminAccessToken}`);

        return poId;
    };

    test('should close a SENT purchase order', async () => {
        const poId = await createAndSendPO();

        const res = await request(app)
            .post(`/api/v1/purchase-orders/${poId}/close`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({ notes: 'Closing short' });

        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.status).toBe('CLOSED');
    });

    test('should close a PARTIALLY_RECEIVED purchase order', async () => {
        const poId = await createAndSendPO();

        // Get PO items to find the line item ID
        const poRes = await request(app)
            .get(`/api/v1/purchase-orders/${poId}`)
            .set('Authorization', `Bearer ${adminAccessToken}`);
        const poItemId = poRes.body.items[0].id;

        // Receive 5 items
        await request(app)
            .post(`/api/v1/purchase-orders/${poId}/receive`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({
                items: [{ poItemId, quantityReceived: 5 }]
            });

        const res = await request(app)
            .post(`/api/v1/purchase-orders/${poId}/close`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({ notes: 'Closing remaining 5' });

        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.status).toBe('CLOSED');
    });

    test('should NOT close a DRAFT purchase order', async () => {
        const resCreate = await request(app)
            .post('/api/v1/purchase-orders')
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({
                supplierId,
                locationId,
                items: [{ productId, quantityOrdered: 10, unitCost: 50 }],
            });
        const poId = resCreate.body.id;

        const res = await request(app)
            .post(`/api/v1/purchase-orders/${poId}/close`)
            .set('Authorization', `Bearer ${adminAccessToken}`);

        expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test('should NOT close a FULLY_RECEIVED purchase order', async () => {
        const poId = await createAndSendPO();

        // Get PO items to find the line item ID
        const poRes = await request(app)
            .get(`/api/v1/purchase-orders/${poId}`)
            .set('Authorization', `Bearer ${adminAccessToken}`);
        const poItemId = poRes.body.items[0].id;

        // Receive all 10 items
        const resReceive = await request(app)
            .post(`/api/v1/purchase-orders/${poId}/receive`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({
                items: [{ poItemId, quantityReceived: 10 }]
            });

        expect(resReceive.status).toBe(httpStatus.OK);
        expect(resReceive.body.updatedStatus).toBe('FULLY_RECEIVED');

        const res = await request(app)
            .post(`/api/v1/purchase-orders/${poId}/close`)
            .set('Authorization', `Bearer ${adminAccessToken}`);

        expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });
});
