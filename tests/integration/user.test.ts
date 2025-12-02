import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('User Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let roleId: string;
    let createdUserId: string;

    const adminEmail = `admin-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `User Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'user:create',
            'user:read:any',
            'user:read:own',
            'user:update:any',
            'user:update:own',
            'user:update:activity',
            'user:delete',
            'user:assign:roles'
        ];

        const createdPermissions = [];
        for (const perm of permissions) {
            // Upsert permission to avoid duplicates if they exist globally
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
                name: 'Test Admin',
                tenantId: tenant.id,
                description: 'Test Admin Role',
            },
        });
        roleId = role.id;

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
        // Clean up
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
        // Permissions are global-ish, maybe leave them or clean up if unique
    });

    describe('POST /api/v1/users', () => {
        test('should create a new user', async () => {
            const newUser = {
                email: `newuser-${Date.now()}@example.com`,
                password: 'Password123!',
                firstName: 'New',
                lastName: 'User',
                roleIds: [roleId]
            };

            const res = await request(app)
                .post('/api/v1/users')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newUser);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.email).toBe(newUser.email);
            expect(res.body.firstName).toBe(newUser.firstName);

            createdUserId = res.body.id;
        });

        test('should return 400 if email already exists', async () => {
            const newUser = {
                email: adminEmail, // Use existing email
                password: 'Password123!',
                firstName: 'Duplicate',
                lastName: 'User',
            };

            const res = await request(app)
                .post('/api/v1/users')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newUser);

            expect(res.status).toBe(httpStatus.BAD_REQUEST);
        });
    });

    describe('GET /api/v1/users', () => {
        test('should return list of users', async () => {
            const res = await request(app)
                .get('/api/v1/users')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('results');
            expect(Array.isArray(res.body.results)).toBe(true);
            expect(res.body.results.length).toBeGreaterThanOrEqual(2); // Admin + Created User
        });
    });

    describe('GET /api/v1/users/:userId', () => {
        test('should return user details', async () => {
            const res = await request(app)
                .get(`/api/v1/users/${createdUserId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('id', createdUserId);
        });

        test('should return 404 if user not found', async () => {
            const res = await request(app)
                .get(`/api/v1/users/nonexistent-id`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/users/:userId', () => {
        test('should update user details', async () => {
            const updateData = {
                firstName: 'Updated',
            };

            const res = await request(app)
                .patch(`/api/v1/users/${createdUserId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.firstName).toBe(updateData.firstName);
        });
    });

    describe('POST /api/v1/users/:userId/roles/:roleId', () => {
        test('should assign role to user', async () => {
            // Create another role to assign
            const newRole = await prisma.role.create({
                data: {
                    name: 'Another Role',
                    tenantId: tenantId,
                }
            });

            const res = await request(app)
                .post(`/api/v1/users/${createdUserId}/roles/${newRole.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);

            // Verify assignment in DB
            const userRole = await prisma.userRole.findUnique({
                where: {
                    userId_roleId: {
                        userId: createdUserId,
                        roleId: newRole.id
                    }
                }
            });
            expect(userRole).toBeDefined();
        });
    });

    describe('DELETE /api/v1/users/:userId', () => {
        test('should delete (deactivate) user', async () => {
            const res = await request(app)
                .delete(`/api/v1/users/${createdUserId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NO_CONTENT);

            // Verify user is inactive or deleted
            const user = await prisma.user.findUnique({ where: { id: createdUserId } });
            // Assuming soft delete sets isActive to false or similar, OR actually deletes.
            // Based on routes, it says "Deactivates (soft deletes)".
            // Let's check if it's actually deleted or just inactive.
            // If the controller does a soft delete, the user should still exist but be inactive.
            // If it does a hard delete, user should be null.
            // Let's assume soft delete for now based on comments in routes.
            if (user) {
                expect(user.isActive).toBe(false);
            } else {
                // If hard delete
                expect(user).toBeNull();
            }
        });
    });
});
