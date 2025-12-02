import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Location Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let createdLocationId: string;

    const adminEmail = `admin-loc-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Location Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'location:create',
            'location:read',
            'location:update',
            'location:delete',
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
                name: 'Location Admin',
                tenantId: tenant.id,
                description: 'Location Admin Role',
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
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/locations', () => {
        test('should create a new location', async () => {
            const newLocation = {
                name: 'Main Warehouse',
                locationType: 'WAREHOUSE',
                address: {
                    street: '123 Storage Lane',
                    city: 'Logistics City',
                    state: 'NY',
                    postalCode: '10001',
                    country: 'USA',
                },
            };

            const res = await request(app)
                .post('/api/v1/locations')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newLocation);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toBe(newLocation.name);
            expect(res.body.locationType).toBe(newLocation.locationType);
            expect(res.body.address).toMatchObject(newLocation.address);
            expect(res.body.tenantId).toBe(tenantId);

            createdLocationId = res.body.id;
        });

        test('should return 400 if name is missing', async () => {
            const newLocation = {
                locationType: 'STORE',
            };

            const res = await request(app)
                .post('/api/v1/locations')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newLocation);

            expect(res.status).toBe(httpStatus.BAD_REQUEST);
        });
    });

    describe('GET /api/v1/locations', () => {
        test('should return list of locations', async () => {
            const res = await request(app)
                .get('/api/v1/locations')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('results');
            expect(Array.isArray(res.body.results)).toBe(true);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
        });

        test('should filter locations by name', async () => {
            const res = await request(app)
                .get('/api/v1/locations?name=Main')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
            expect(res.body.results[0].name).toContain('Main');
        });
    });

    describe('GET /api/v1/locations/:locationId', () => {
        test('should return location details', async () => {
            const res = await request(app)
                .get(`/api/v1/locations/${createdLocationId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(createdLocationId);
            expect(res.body.name).toBe('Main Warehouse');
        });

        test('should return 404 if location not found', async () => {
            const res = await request(app)
                .get('/api/v1/locations/nonexistent-id')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/locations/:locationId', () => {
        test('should update location details', async () => {
            const updateData = {
                name: 'Updated Warehouse Name',
                address: {
                    city: 'New Logistics City',
                },
            };

            const res = await request(app)
                .patch(`/api/v1/locations/${createdLocationId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.name).toBe(updateData.name);
            expect(res.body.address.city).toBe(updateData.address.city);
        });
    });

    describe('DELETE /api/v1/locations/:locationId', () => {
        test('should delete location', async () => {
            const res = await request(app)
                .delete(`/api/v1/locations/${createdLocationId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NO_CONTENT);

            // Verify deletion
            const location = await prisma.location.findUnique({ where: { id: createdLocationId } });
            expect(location).toBeNull();
        });
    });
});
