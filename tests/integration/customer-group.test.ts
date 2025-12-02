import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Customer Group Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let createdGroupId: string;

    const adminEmail = `admin-group-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Customer Group Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'group:create',
            'group:read',
            'group:update',
            'group:delete',
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
                name: 'Group Admin',
                tenantId: tenant.id,
                description: 'Group Admin Role',
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
        await prisma.customerGroup.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/customer-group', () => {
        test('should create a new customer group', async () => {
            const newGroup = {
                name: 'VIP Customers',
                description: 'Very Important People',
            };

            const res = await request(app)
                .post('/api/v1/customer-group')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newGroup);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toBe(newGroup.name);
            createdGroupId = res.body.id;
        });

        test('should return 400 if name is missing', async () => {
            const invalidGroup = {
                description: 'No Name Group',
            };

            const res = await request(app)
                .post('/api/v1/customer-group')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(invalidGroup);

            expect(res.status).toBe(httpStatus.BAD_REQUEST);
        });
    });

    describe('GET /api/v1/customer-group', () => {
        test('should return list of customer groups', async () => {
            const res = await request(app)
                .get('/api/v1/customer-group')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
            expect(res.body.results[0].name).toBe('VIP Customers');
        });
    });

    describe('GET /api/v1/customer-group/:groupId', () => {
        test('should return customer group details', async () => {
            const res = await request(app)
                .get(`/api/v1/customer-group/${createdGroupId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(createdGroupId);
            expect(res.body.name).toBe('VIP Customers');
        });

        test('should return 404 if group not found', async () => {
            const res = await request(app)
                .get('/api/v1/customer-group/nonexistent-id')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/customer-group/:groupId', () => {
        test('should update customer group details', async () => {
            const updateData = {
                name: 'VVIP Customers',
            };

            const res = await request(app)
                .patch(`/api/v1/customer-group/${createdGroupId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.name).toBe(updateData.name);
        });
    });

    describe('DELETE /api/v1/customer-group/:groupId', () => {
        test('should delete customer group', async () => {
            const res = await request(app)
                .delete(`/api/v1/customer-group/${createdGroupId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NO_CONTENT);

            // Verify deletion
            const group = await prisma.customerGroup.findUnique({ where: { id: createdGroupId } });
            expect(group).toBeNull();
        });
    });
});
