
import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app';
import { prisma } from '../../src/config';
import jwt from 'jsonwebtoken';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';

describe('Reports Module Integration Tests', () => {
    let accessToken: string;
    let tenantId: string;
    let locationId: string;
    let productId: string;
    let categoryId: string;

    beforeAll(async () => {
        // Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Reports Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // Create Permissions
        const permissionKeys = [
            'dashboard:view',
            'report:view:sales',
            'report:view:inventory',
            'report:view:purchasing',
            'report:view:customer',
            'report:view:pos',
            'inventory:read:transactions',
            'po:read',
            'customer:read',
            'pos:session:read:any',
            'inventory:valuation:read',
        ];

        for (const key of permissionKeys) {
            await prisma.permission.upsert({
                where: { permissionKey: key },
                update: {},
                create: { permissionKey: key, description: `Permission for ${key}` },
            });
        }

        // Create Role with all report permissions
        const allPermissions = await prisma.permission.findMany({
            where: { permissionKey: { in: permissionKeys } },
        });

        const role = await prisma.role.create({
            data: {
                tenantId,
                name: 'Report Viewer',
                permissions: {
                    create: allPermissions.map((p) => ({
                        permission: { connect: { id: p.id } },
                    })),
                },
            },
        });

        // Create User
        const user = await prisma.user.create({
            data: {
                tenantId,
                email: `reporter_${Date.now()}@example.com`,
                passwordHash: 'hashedpassword',
                firstName: 'Report',
                lastName: 'Viewer',
                roles: {
                    create: { roleId: role.id },
                },
            },
        });

        // Generate Token
        accessToken = jwt.sign(
            { userId: user.id, tenantId: tenant.id, role: 'reporter' },
            process.env.JWT_SECRET || 'test_secret',
            { expiresIn: '1h' }
        );

        // Create Location
        const location = await prisma.location.create({
            data: {
                tenantId,
                name: 'Test Location',
                locationType: 'STORE',
            },
        });
        locationId = location.id;

        // Create Category
        const category = await prisma.category.create({
            data: {
                tenantId,
                name: 'Test Category',
            },
        });
        categoryId = category.id;

        // Create Product
        const product = await prisma.product.create({
            data: {
                tenantId,
                name: 'Test Product',
                sku: 'TEST-SKU-001',
                basePrice: 100.0,
                isActive: true,
                categories: {
                    create: {
                        categoryId,
                    },
                },
            },
        });
        productId = product.id;

        // Create Inventory Item
        await prisma.inventoryItem.create({
            data: {
                tenantId,
                productId,
                locationId,
                quantityOnHand: 50,
                quantityAllocated: 0,
                quantityIncoming: 0,
            },
        });

        // Create Test Order for Sales Reports
        await prisma.order.create({
            data: {
                tenantId,
                orderNumber: `ORD-${Date.now()}`,
                status: OrderStatus.COMPLETED,
                locationId,
                subtotal: 100.0,
                taxAmount: 10.0,
                shippingCost: 5.0,
                discountAmount: 0,
                totalAmount: 115.0,
                currencyCode: 'USD',
                orderDate: new Date(),
                items: {
                    create: {
                        tenantId,
                        productId,
                        quantity: 2,
                        unitPrice: 50.0,
                        lineTotal: 100.0,
                        taxAmount: 10.0,
                    },
                },
                payments: {
                    create: {
                        tenantId,
                        paymentMethod: PaymentMethod.CASH,
                        amount: 115.0,
                        currencyCode: 'USD',
                        status: PaymentStatus.COMPLETED,
                        paymentDate: new Date(),
                    },
                },
            },
        });
    });

    afterAll(async () => {
        // Cleanup
        await prisma.payment.deleteMany({ where: { tenantId } });
        await prisma.orderItem.deleteMany({ where: { tenantId } });
        await prisma.order.deleteMany({ where: { tenantId } });
        await prisma.inventoryItem.deleteMany({ where: { tenantId } });
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.category.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.userRole.deleteMany({ where: { user: { tenantId } } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.rolePermission.deleteMany({ where: { role: { tenantId } } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });

    describe('Dashboard KPI Reports', () => {
        test('should get dashboard KPIs', async () => {
            const res = await request(app)
                .get('/api/v1/reports/dashboard-kpi')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('netSales');
            expect(res.body).toHaveProperty('transactions');
        });
    });

    describe('Sales Reports', () => {
        test('should get sales summary', async () => {
            const res = await request(app)
                .get('/api/v1/reports/sales-summary')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('period');
            expect(res.body).toHaveProperty('totalOrders');
            expect(res.body).toHaveProperty('grossSales');
        });

        test('should get sales by product', async () => {
            const res = await request(app)
                .get('/api/v1/reports/sales-by-product')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(Array.isArray(res.body)).toBe(true);
        });

        test('should get sales by category', async () => {
            const res = await request(app)
                .get('/api/v1/reports/sales-by-category')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(Array.isArray(res.body)).toBe(true);
        });

        test('should get sales by location', async () => {
            const res = await request(app)
                .get('/api/v1/reports/sales-by-location')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(Array.isArray(res.body)).toBe(true);
        });

        test('should get payment methods summary', async () => {
            const res = await request(app)
                .get('/api/v1/reports/payment-methods-summary')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('Inventory Reports', () => {
        test('should get inventory on hand', async () => {
            const res = await request(app)
                .get('/api/v1/reports/inventory-on-hand')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({ locationId });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('results');
            expect(res.body).toHaveProperty('totalResults');
            expect(res.body).toHaveProperty('page');
            expect(res.body).toHaveProperty('limit');
            expect(Array.isArray(res.body.results)).toBe(true);
        });

        test('should get inventory valuation', async () => {
            const res = await request(app)
                .get('/api/v1/reports/inventory-valuation')
                .set('Authorization', `Bearer ${accessToken}`)
                .query({ locationId });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('results');
            expect(res.body).toHaveProperty('totalResults');
            expect(res.body).toHaveProperty('page');
            expect(res.body).toHaveProperty('limit');
            expect(Array.isArray(res.body.results)).toBe(true);
        });

        test('should get low stock report', async () => {
            const res = await request(app)
                .get('/api/v1/reports/low-stock')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('results');
            expect(res.body).toHaveProperty('totalResults');
            expect(res.body).toHaveProperty('page');
            expect(res.body).toHaveProperty('limit');
            expect(Array.isArray(res.body.results)).toBe(true);
        });
    });
});
