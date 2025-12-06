
import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app';
import { prisma } from '../../src/config';
import jwt from 'jsonwebtoken';
import { OrderStatus } from '@prisma/client';

describe('POS Suspend/Resume Integration Tests', () => {
    let adminAccessToken: string;
    let tenantId: string;
    let locationId: string;
    let productId: string;
    let posTerminalId = 'TERM-SUSPEND-001';
    let sessionId: string;

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: 'POS Suspend Test Tenant_' + Date.now(),
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'pos:session:start',
            'pos:session:read',
            'pos:checkout', // Suspend uses this permission
        ];

        const createdPermissions = [];
        for (const perm of permissions) {
            const p = await prisma.permission.upsert({
                where: { permissionKey: perm },
                update: {},
                create: { permissionKey: perm, description: `Permission for ${perm}` },
            });
            createdPermissions.push(p);
        }

        // 3. Create Role & User
        const role = await prisma.role.create({
            data: {
                tenantId,
                name: 'Tenant Admin',
                permissions: {
                    create: createdPermissions.map((p) => ({
                        permission: { connect: { id: p.id } },
                    })),
                },
            },
        });

        const admin = await prisma.user.create({
            data: {
                tenantId,
                email: `pos_suspend_${Date.now()}@example.com`,
                passwordHash: 'hashedpassword',
                firstName: 'POS',
                lastName: 'Suspend',
                roles: {
                    create: { roleId: role.id },
                },
            },
        });

        adminAccessToken = jwt.sign(
            { userId: admin.id, tenantId: tenant.id, role: 'admin' },
            process.env.JWT_SECRET || 'test_secret',
            { expiresIn: '1h' }
        );

        // 4. Create Location
        const location = await prisma.location.create({
            data: {
                tenantId,
                name: 'POS Suspend Store',
                locationType: 'STORE',
            },
        });
        locationId = location.id;

        // 5. Create Product
        const product = await prisma.product.create({
            data: {
                tenantId,
                name: 'Suspendable Item',
                sku: 'SUSP-001',
                basePrice: 50.0,
                isStockTracked: true,
                isActive: true,
            },
        });
        productId = product.id;

        // 6. Start Session
        const res = await request(app)
            .post('/api/v1/pos/sessions/start')
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('X-Location-Id', locationId)
            .set('X-Terminal-Id', posTerminalId)
            .send({ startingCash: 200.0 });

        sessionId = res.body.id;
    });

    afterAll(async () => {
        // Cleanup order matter matters
        await prisma.posSessionTransaction.deleteMany({ where: { tenantId } });
        await prisma.posSession.deleteMany({ where: { tenantId } });
        await prisma.orderItem.deleteMany({ where: { tenantId } });
        await prisma.payment.deleteMany({ where: { tenantId } });
        await prisma.order.deleteMany({ where: { tenantId } });
        await prisma.inventoryItem.deleteMany({ where: { tenantId } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.userRole.deleteMany({ where: { user: { tenantId } } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.rolePermission.deleteMany({ where: { role: { tenantId } } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });

    test('should suspended an active order', async () => {
        const checkoutData = {
            customerId: null,
            items: [
                {
                    productId,
                    quantity: 1,
                    unitPrice: 50.0,
                },
            ],
            notes: 'Customer left wallet in car',
        };

        const res = await request(app)
            .post(`/api/v1/pos/sessions/${sessionId}/suspend`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('X-Location-Id', locationId)
            .set('X-Terminal-Id', posTerminalId)
            .send(checkoutData);

        expect(res.status).toBe(httpStatus.CREATED);
        expect(res.body.status).toBe(OrderStatus.SUSPENDED);
        expect(res.body.totalAmount).toBe('50'); // 50 * 1
    });

    test('should retrieve suspended orders', async () => {
        const res = await request(app)
            .get('/api/v1/pos/sales/suspended')
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('X-Location-Id', locationId)
            .set('X-Terminal-Id', posTerminalId);

        expect(res.status).toBe(httpStatus.OK);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body[0].status).toBe(OrderStatus.SUSPENDED);
        expect(res.body[0].notes).toBe('Customer left wallet in car');
    });
});
