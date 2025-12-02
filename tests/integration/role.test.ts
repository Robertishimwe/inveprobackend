import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Role Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let createdRoleId: string;
    let permissionId: string;

    const adminEmail = `admin-role-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Role Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'role:create',
            'role:read',
            'role:update',
            'role:delete',
            'test:permission'
        ];

        const createdPermissions = [];
        for (const perm of permissions) {
            const p = await prisma.permission.upsert({
                where: { permissionKey: perm },
                update: {},
                create: { permissionKey: perm, description: `Test permission ${perm}` },
            });
            createdPermissions.push(p);
            if (perm === 'test:permission') permissionId = p.id;
        }

        // 3. Create Admin Role
        const role = await prisma.role.create({
            data: {
                name: 'Role Admin',
                tenantId: tenant.id,
                description: 'Role Admin Role',
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
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/roles', () => {
        test('should create a new role', async () => {
            const payload = {
                name: 'Manager',
                description: 'Manager Role',
                permissionIds: [permissionId]
            };

            const res = await request(app)
                .post('/api/v1/roles')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(payload);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toBe(payload.name);
            createdRoleId = res.body.id;
        });

        test('should return 400 if name is missing', async () => {
            const invalidRole = {
                description: 'No Name Role',
            };

            const res = await request(app)
                .post('/api/v1/roles')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(invalidRole);

            expect(res.status).toBe(httpStatus.BAD_REQUEST);
        });
    });

    describe('GET /api/v1/roles', () => {
        test('should return list of roles', async () => {
            const res = await request(app)
                .get('/api/v1/roles')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
            expect(res.body.results[0].name).toBeDefined();
        });
    });

    describe('GET /api/v1/roles/:roleId', () => {
        test('should return role details', async () => {
            const res = await request(app)
                .get(`/api/v1/roles/${createdRoleId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(createdRoleId);
            expect(res.body.name).toBe('Manager');
        });

        test('should return 404 if role not found', async () => {
            const res = await request(app)
                .get('/api/v1/roles/nonexistent-id')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/roles/:roleId', () => {
        test('should update role details', async () => {
            const updateData = {
                name: 'Senior Manager',
            };

            const res = await request(app)
                .patch(`/api/v1/roles/${createdRoleId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.name).toBe(updateData.name);
        });
    });

    describe('DELETE /api/v1/roles/:roleId', () => {
        test('should delete role', async () => {
            const res = await request(app)
                .delete(`/api/v1/roles/${createdRoleId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NO_CONTENT);

            // Verify deletion
            const role = await prisma.role.findUnique({ where: { id: createdRoleId } });
            expect(role).toBeNull();
        });
    });
});
