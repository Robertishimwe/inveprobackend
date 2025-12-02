import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Category Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let createdCategoryId: string;
    let childCategoryId: string;

    const adminEmail = `admin-cat-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Category Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'category:create',
            'category:read',
            'category:update',
            'category:delete',
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
                name: 'Category Admin',
                tenantId: tenant.id,
                description: 'Category Admin Role',
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
        await prisma.category.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/categories', () => {
        test('should create a new category', async () => {
            const newCategory = {
                name: 'Electronics',
                description: 'Gadgets and devices',
            };

            const res = await request(app)
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newCategory);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toBe(newCategory.name);
            expect(res.body.description).toBe(newCategory.description);
            expect(res.body.tenantId).toBe(tenantId);

            createdCategoryId = res.body.id;
        });

        test('should create a child category', async () => {
            const childCategory = {
                name: 'Laptops',
                description: 'Portable computers',
                parentCategoryId: createdCategoryId,
            };

            const res = await request(app)
                .post('/api/v1/categories')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(childCategory);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body.name).toBe(childCategory.name);
            expect(res.body.parentCategoryId).toBe(createdCategoryId);

            // Store child ID for cleanup/deletion test
            childCategoryId = res.body.id;
        });
    });

    describe('GET /api/v1/categories', () => {
        test('should return list of categories', async () => {
            const res = await request(app)
                .get('/api/v1/categories')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThanOrEqual(2); // Electronics + Laptops
        });

        test('should filter by top level', async () => {
            const res = await request(app)
                .get('/api/v1/categories?topLevel=true')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(Array.isArray(res.body)).toBe(true);
            // Should contain Electronics but NOT Laptops
            const names = res.body.map((c: any) => c.name);
            expect(names).toContain('Electronics');
            expect(names).not.toContain('Laptops');
        });
    });

    describe('GET /api/v1/categories/:categoryId', () => {
        test('should return category details', async () => {
            const res = await request(app)
                .get(`/api/v1/categories/${createdCategoryId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(createdCategoryId);
            expect(res.body.name).toBe('Electronics');
        });

        test('should return 404 if category not found', async () => {
            const res = await request(app)
                .get('/api/v1/categories/nonexistent-id')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/categories/:categoryId', () => {
        test('should update category details', async () => {
            const updateData = {
                name: 'Consumer Electronics',
            };

            const res = await request(app)
                .patch(`/api/v1/categories/${createdCategoryId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.name).toBe(updateData.name);
        });
    });

    describe('DELETE /api/v1/categories/:categoryId', () => {
        test('should delete category', async () => {
            // 1. Delete Child First
            const resChild = await request(app)
                .delete(`/api/v1/categories/${childCategoryId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);
            expect(resChild.status).toBe(httpStatus.NO_CONTENT);

            // 2. Delete Parent
            const res = await request(app)
                .delete(`/api/v1/categories/${createdCategoryId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NO_CONTENT);

            // Verify deletion
            const category = await prisma.category.findUnique({ where: { id: createdCategoryId } });
            expect(category).toBeNull();
        });
    });
});
