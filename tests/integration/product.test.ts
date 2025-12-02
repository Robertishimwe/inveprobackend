import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Product Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let createdProductId: string;

    const adminEmail = `admin-prod-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Product Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'product:create',
            'product:read',
            'product:update',
            'product:delete',
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
                name: 'Product Admin',
                tenantId: tenant.id,
                description: 'Product Admin Role',
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
    });

    afterAll(async () => {
        await prisma.product.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/products', () => {
        test('should create a new product', async () => {
            const newProduct = {
                sku: `SKU-${Date.now()}`,
                name: 'Test Product',
                description: 'A test product',
                basePrice: 100.50,
                costPrice: 50.00,
                isActive: true,
                isStockTracked: true,
            };

            const res = await request(app)
                .post('/api/v1/products')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newProduct);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.sku).toBe(newProduct.sku);
            expect(res.body.name).toBe(newProduct.name);
            expect(res.body.tenantId).toBe(tenantId);

            createdProductId = res.body.id;
        });

        test('should return 400 if SKU is missing', async () => {
            const newProduct = {
                name: 'Product without SKU',
            };

            const res = await request(app)
                .post('/api/v1/products')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newProduct);

            expect(res.status).toBe(httpStatus.BAD_REQUEST);
        });
    });

    describe('GET /api/v1/products', () => {
        test('should return list of products', async () => {
            const res = await request(app)
                .get('/api/v1/products')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('results');
            expect(Array.isArray(res.body.results)).toBe(true);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
        });

        test('should filter products by name', async () => {
            const res = await request(app)
                .get('/api/v1/products?name=Test')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
            expect(res.body.results[0].name).toContain('Test');
        });
    });

    describe('GET /api/v1/products/:productId', () => {
        test('should return product details', async () => {
            const res = await request(app)
                .get(`/api/v1/products/${createdProductId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(createdProductId);
            expect(res.body.name).toBe('Test Product');
        });

        test('should return 404 if product not found', async () => {
            const res = await request(app)
                .get('/api/v1/products/nonexistent-id')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/products/:productId', () => {
        test('should update product details', async () => {
            const updateData = {
                name: 'Updated Product Name',
                basePrice: 150.00,
            };

            const res = await request(app)
                .patch(`/api/v1/products/${createdProductId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.name).toBe(updateData.name);
            expect(Number(res.body.basePrice)).toBe(updateData.basePrice);
        });
    });

    describe('DELETE /api/v1/products/:productId', () => {
        test('should delete product', async () => {
            const res = await request(app)
                .delete(`/api/v1/products/${createdProductId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NO_CONTENT);

            // Verify deletion
            const product = await prisma.product.findUnique({ where: { id: createdProductId } });
            expect(product).toBeNull();
        });
    });
});
