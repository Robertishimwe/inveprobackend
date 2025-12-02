import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Supplier Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let createdSupplierId: string;

    const adminEmail = `admin-supp-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Supplier Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'supplier:create',
            'supplier:read',
            'supplier:update',
            'supplier:delete',
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
                name: 'Supplier Admin',
                tenantId: tenant.id,
                description: 'Supplier Admin Role',
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
        await prisma.supplier.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/suppliers', () => {
        test('should create a new supplier', async () => {
            const newSupplier = {
                name: 'Test Supplier Inc.',
                contactName: 'John Doe',
                email: 'john@testsupplier.com',
                phone: '123-456-7890',
                address: {
                    street: '123 Supply St',
                    city: 'Supply City',
                    country: 'USA',
                },
            };

            const res = await request(app)
                .post('/api/v1/suppliers')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newSupplier);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toBe(newSupplier.name);
            expect(res.body.contactName).toBe(newSupplier.contactName);
            createdSupplierId = res.body.id;
        });

        test('should return 400 if name is missing', async () => {
            const invalidSupplier = {
                contactName: 'Jane Doe',
            };

            const res = await request(app)
                .post('/api/v1/suppliers')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(invalidSupplier);

            expect(res.status).toBe(httpStatus.BAD_REQUEST);
        });
    });

    describe('GET /api/v1/suppliers', () => {
        test('should return list of suppliers', async () => {
            const res = await request(app)
                .get('/api/v1/suppliers')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
            expect(res.body.results[0].name).toContain('Test Supplier');
        });

        test('should filter suppliers by name', async () => {
            const res = await request(app)
                .get('/api/v1/suppliers')
                .query({ name: 'Test Supplier' })
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('GET /api/v1/suppliers/:supplierId', () => {
        test('should return supplier details', async () => {
            const res = await request(app)
                .get(`/api/v1/suppliers/${createdSupplierId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(createdSupplierId);
            expect(res.body.name).toBe('Test Supplier Inc.');
        });

        test('should return 404 if supplier not found', async () => {
            const res = await request(app)
                .get('/api/v1/suppliers/nonexistent-id')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/suppliers/:supplierId', () => {
        test('should update supplier details', async () => {
            const updateData = {
                name: 'Updated Supplier Inc.',
                contactName: 'Jane Smith',
            };

            const res = await request(app)
                .patch(`/api/v1/suppliers/${createdSupplierId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.name).toBe(updateData.name);
            expect(res.body.contactName).toBe(updateData.contactName);
        });
    });

    describe('DELETE /api/v1/suppliers/:supplierId', () => {
        test('should delete supplier', async () => {
            const res = await request(app)
                .delete(`/api/v1/suppliers/${createdSupplierId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NO_CONTENT);

            // Verify deletion (soft delete)
            const supplier = await prisma.supplier.findUnique({ where: { id: createdSupplierId } });
            expect(supplier).not.toBeNull();
            expect(supplier?.isActive).toBe(false);
        });
    });
});
