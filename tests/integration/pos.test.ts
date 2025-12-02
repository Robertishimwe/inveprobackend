
import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app';
import { prisma } from '../../src/config';
import jwt from 'jsonwebtoken';
import { PosTransactionType, PosSessionStatus, PaymentMethod } from '@prisma/client';

describe('POS Module Integration Tests', () => {
    let adminAccessToken: string;
    let tenantId: string;
    // adminId removed
    let locationId: string;
    let productId: string;
    let posTerminalId = 'TERM-001';
    let sessionId: string;

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: 'POS Test Tenant_' + Date.now(),
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'pos:session:start',
            'pos:session:read',
            'pos:session:end',
            'pos:session:reconcile',
            'pos:session:cash',
            'pos:session:list',
            'pos:checkout',
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

        // 3. Create Role
        const role = await prisma.role.create({
            data: {
                tenantId,
                name: 'POS Admin',
                permissions: {
                    create: createdPermissions.map((p) => ({
                        permission: { connect: { id: p.id } },
                    })),
                },
            },
        });

        // 4. Create User
        const admin = await prisma.user.create({
            data: {
                tenantId,
                email: `pos_admin_${Date.now()}@example.com`,
                passwordHash: 'hashedpassword',
                firstName: 'POS',
                lastName: 'Admin',
                roles: {
                    create: { roleId: role.id },
                },
            },
        });
        // adminId assignment removed

        // 5. Generate Token
        adminAccessToken = jwt.sign(
            { userId: admin.id, tenantId: tenant.id, role: 'admin' },
            process.env.JWT_SECRET || 'test_secret',
            { expiresIn: '1h' }
        );

        // 6. Create Location
        const location = await prisma.location.create({
            data: {
                tenantId,
                name: 'POS Store',
                locationType: 'STORE',
            },
        });
        locationId = location.id;

        // 7. Create Product & Inventory
        const product = await prisma.product.create({
            data: {
                tenantId,
                name: 'POS Item',
                sku: 'POS-001',
                basePrice: 10.0,
                isStockTracked: true,
                isActive: true,
            },
        });
        productId = product.id;

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
        // Cleanup
        await prisma.posSessionTransaction.deleteMany({ where: { tenantId } });
        await prisma.posSession.deleteMany({ where: { tenantId } });
        await prisma.orderItem.deleteMany({ where: { tenantId } });
        await prisma.payment.deleteMany({ where: { tenantId } });
        await prisma.order.deleteMany({ where: { tenantId } });
        await prisma.inventoryTransaction.deleteMany({ where: { tenantId } });
        await prisma.inventoryItem.deleteMany({ where: { tenantId } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.userRole.deleteMany({ where: { user: { tenantId } } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.rolePermission.deleteMany({ where: { role: { tenantId } } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });

    describe('POS Session Routes', () => {
        test('should start a new POS session', async () => {
            const res = await request(app)
                .post('/api/v1/pos/sessions/start')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('X-Location-Id', locationId)
                .set('X-Terminal-Id', posTerminalId)
                .send({
                    startingCash: 100.0,
                });

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.status).toBe(PosSessionStatus.OPEN);
            expect(res.body.startingCash).toBe('100');
            sessionId = res.body.id;
        });

        test('should get current active session', async () => {
            const res = await request(app)
                .get('/api/v1/pos/sessions/current')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('X-Location-Id', locationId)
                .set('X-Terminal-Id', posTerminalId);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(sessionId);
        });

        test('should record cash pay-in', async () => {
            const res = await request(app)
                .post(`/api/v1/pos/sessions/${sessionId}/cash`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('X-Location-Id', locationId)
                .set('X-Terminal-Id', posTerminalId)
                .send({
                    transactionType: PosTransactionType.PAY_IN,
                    amount: 50.0,
                    notes: 'Mid-day float add',
                });

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body.amount).toBe('50');
            expect(res.body.transactionType).toBe(PosTransactionType.PAY_IN);
        });
    });

    describe('POS Checkout Routes', () => {
        test('should process a checkout', async () => {
            const checkoutData = {
                customerId: null, // Walk-in customer
                items: [
                    {
                        productId,
                        quantity: 2,
                        unitPrice: 10.0,
                    },
                ],
                payments: [
                    {
                        paymentMethod: PaymentMethod.CASH,
                        amount: 20.0,
                    },
                ],
                notes: 'Test Sale',
            };

            const res = await request(app)
                .post(`/api/v1/pos/sessions/${sessionId}/checkout`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('X-Location-Id', locationId)
                .set('X-Terminal-Id', posTerminalId)
                .send(checkoutData);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.orderNumber).toBeDefined();
            expect(res.body.totalAmount).toBe('20');
            expect(res.body.status).toBe('COMPLETED');

            // Verify Inventory Update
            const invItem = await prisma.inventoryItem.findFirst({
                where: { tenantId, productId, locationId },
            });
            expect(Number(invItem?.quantityOnHand)).toBe(98); // 100 - 2
        });
    });

    describe('POS Session End & Reconcile', () => {
        test('should end the session', async () => {
            // Starting: 100
            // Pay In: 50
            // Sale: 20
            // Expected: 170

            const res = await request(app)
                .post(`/api/v1/pos/sessions/${sessionId}/end`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('X-Location-Id', locationId)
                .set('X-Terminal-Id', posTerminalId)
                .send({
                    endingCash: 170.0,
                    notes: 'Closing shift',
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.status).toBe(PosSessionStatus.CLOSED);
            expect(res.body.difference).toBe('0');
        });

        test('should reconcile the session', async () => {
            const res = await request(app)
                .post(`/api/v1/pos/sessions/${sessionId}/reconcile`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.status).toBe(PosSessionStatus.RECONCILED);
        });
    });
});
