
import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app';
import { prisma } from '../../src/config';
import jwt from 'jsonwebtoken';
import { TenantStatus } from '@prisma/client';

describe('Tenant Module Integration Tests', () => {
    let superAdminToken: string;
    let superAdminUserId: string;
    let tenantAdminToken: string;
    let tenantAdminUserId: string;
    let testTenantId: string;
    let secondUserId: string;

    beforeAll(async () => {
        // Create a super admin tenant
        const superAdminTenant = await prisma.tenant.create({
            data: {
                name: `SuperAdmin Tenant ${Date.now()}`,
                status: TenantStatus.ACTIVE,
            },
        });

        // Create a super admin user
        const superAdmin = await prisma.user.create({
            data: {
                tenantId: superAdminTenant.id,
                email: `superadmin_${Date.now()}@example.com`,
                passwordHash: 'hashedpassword',
                firstName: 'Super',
                lastName: 'Admin',
            },
        });
        superAdminUserId = superAdmin.id;

        // Generate super admin token with super admin permissions
        superAdminToken = jwt.sign(
            { userId: superAdmin.id, tenantId: superAdminTenant.id, role: 'superadmin' },
            process.env.JWT_SECRET || 'test_secret',
            { expiresIn: '1h' }
        );

        // Create an initial tenant for testing tenant-admin operations
        const initialTenant = await prisma.tenant.create({
            data: {
                name: `Test Tenant ${Date.now()}`,
                status: TenantStatus.ACTIVE,
            },
        });
        testTenantId = initialTenant.id;

        // Create tenant admin user
        const tenantAdmin = await prisma.user.create({
            data: {
                tenantId: testTenantId,
                email: `tenantadmin_${Date.now()}@example.com`,
                passwordHash: 'hashedpassword',
                firstName: 'Tenant',
                lastName: 'Admin',
            },
        });
        tenantAdminUserId = tenantAdmin.id;

        // Create permissions
        const permissionKeys = [
            'tenant:create:any',
            'tenant:read:any',
            'tenant:update:any',
            'tenant:delete:any',
            'tenant:manage:admins',
            'tenant:config:read',
            'tenant:config:update',
        ];

        for (const key of permissionKeys) {
            await prisma.permission.upsert({
                where: { permissionKey: key },
                update: {},
                create: { permissionKey: key, description: `Permission for ${key}` },
            });
        }

        // Create super admin role with all permissions
        const allPermissions = await prisma.permission.findMany();
        const superAdminRole = await prisma.role.create({
            data: {
                tenantId: superAdminTenant.id,
                name: 'SuperAdmin',
                isSystemRole: true,
                permissions: {
                    create: allPermissions.map((p) => ({
                        permission: { connect: { id: p.id } },
                    })),
                },
            },
        });

        await prisma.userRole.create({
            data: { userId: superAdminUserId, roleId: superAdminRole.id },
        });

        // Create admin role for test tenant
        const tenantAdminRole = await prisma.role.create({
            data: {
                tenantId: testTenantId,
                name: 'Admin',
                isSystemRole: true,
                permissions: {
                    create: allPermissions
                        .filter((p) => p.permissionKey.includes('config'))
                        .map((p) => ({
                            permission: { connect: { id: p.id } },
                        })),
                },
            },
        });

        await prisma.userRole.create({
            data: { userId: tenantAdminUserId, roleId: tenantAdminRole.id },
        });

        // Generate tenant admin token
        tenantAdminToken = jwt.sign(
            { userId: tenantAdmin.id, tenantId: testTenantId, role: 'admin' },
            process.env.JWT_SECRET || 'test_secret',
            { expiresIn: '1h' }
        );

        // Create a second user for admin management tests
        const secondUser = await prisma.user.create({
            data: {
                tenantId: testTenantId,
                email: `user2_${Date.now()}@example.com`,
                passwordHash: 'hashedpassword',
                firstName: 'User',
                lastName: 'Two',
            },
        });
        secondUserId = secondUser.id;
    });

    afterAll(async () => {
        // Get all tenant IDs related to this test
        const superAdminUser = await prisma.user.findUnique({
            where: { id: superAdminUserId },
            select: { tenantId: true },
        });
        const superAdminTenantId = superAdminUser?.tenantId;

        // Cleanup
        await prisma.userRole.deleteMany({
            where: {
                userId: { in: [superAdminUserId, tenantAdminUserId, secondUserId] },
            },
        });
        await prisma.user.deleteMany({
            where: {
                id: { in: [superAdminUserId, tenantAdminUserId, secondUserId] },
            },
        });
        await prisma.rolePermission.deleteMany({
            where: {
                role: { tenantId: { in: [testTenantId, superAdminTenantId!] } },
            },
        });
        await prisma.role.deleteMany({
            where: {
                tenantId: { in: [testTenantId, superAdminTenantId!] },
            },
        });
        await prisma.tenant.deleteMany({
            where: { id: { in: [testTenantId, superAdminTenantId!] } },
        });
    });

    describe('Super Admin Operations', () => {
        let newTenantId: string;
        let newAdminUserId: string;

        beforeAll(async () => {
            // Create a user that will become admin of new tenant
            const newAdmin = await prisma.user.create({
                data: {
                    email: `newadmin_${Date.now()}@example.com`,
                    passwordHash: 'hashedpassword',
                    firstName: 'New',
                    lastName: 'Admin',
                    tenantId: null,
                },
            });
            newAdminUserId = newAdmin.id;
        });

        test('should create a new tenant', async () => {
            const res = await request(app)
                .post('/api/v1/tenants')
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    name: `New Tenant ${Date.now()}`,
                    initialAdminUserId: newAdminUserId,
                    companyPhone: '123-456-7890',
                    email: 'info@newtenant.com',
                });

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toContain('New Tenant');
            expect(res.body.status).toBe(TenantStatus.ACTIVE);
            newTenantId = res.body.id;

            // Verify admin user was assigned
            const user = await prisma.user.findUnique({
                where: { id: newAdminUserId },
            });
            expect(user?.tenantId).toBe(newTenantId);
        });

        test('should get list of tenants', async () => {
            const res = await request(app)
                .get('/api/v1/tenants')
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('results');
            expect(Array.isArray(res.body.results)).toBe(true);
            expect(res.body.results.length).toBeGreaterThan(0);
        });

        test('should get tenant by ID', async () => {
            const res = await request(app)
                .get(`/api/v1/tenants/${testTenantId}`)
                .set('Authorization', `Bearer ${superAdminToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(testTenantId);
        });

        test('should update tenant', async () => {
            const res = await request(app)
                .patch(`/api/v1/tenants/${testTenantId}`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    companyPhone: '555-1234',
                    website: 'https://updated.example.com',
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.companyPhone).toBe('555-1234');
            expect(res.body.website).toBe('https://updated.example.com');
        });

        test('should set tenant admins', async () => {
            const res = await request(app)
                .put(`/api/v1/tenants/${testTenantId}/admins`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    adminUserIds: [tenantAdminUserId, secondUserId],
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('message');
            expect(res.body.message).toContain('Successfully');
        });

        test('should deactivate tenant', async () => {
            const res = await request(app)
                .post(`/api/v1/tenants/${newTenantId}/deactivate`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .send({
                    notes: 'Test deactivation',
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.status).toBe(TenantStatus.DEACTIVATED);
            expect(res.body.deactivatedAt).toBeDefined();
        });

        afterAll(async () => {
            // Cleanup new tenant
            if (newTenantId) {
                await prisma.userRole.deleteMany({
                    where: { user: { tenantId: newTenantId } },
                });
                await prisma.user.deleteMany({
                    where: { tenantId: newTenantId },
                });
                await prisma.rolePermission.deleteMany({
                    where: { role: { tenantId: newTenantId } },
                });
                await prisma.role.deleteMany({
                    where: { tenantId: newTenantId },
                });
                await prisma.tenant.deleteMany({
                    where: { id: newTenantId },
                });
            }
        });
    });

    describe('Tenant Admin Self-Config Operations', () => {
        test('should get own tenant config', async () => {
            const res = await request(app)
                .get('/api/v1/tenants/self/config')
                .set('Authorization', `Bearer ${tenantAdminToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(testTenantId);
        });

        test('should update own tenant config', async () => {
            const res = await request(app)
                .patch('/api/v1/tenants/self/config')
                .set('Authorization', `Bearer ${tenantAdminToken}`)
                .send({
                    settings: {
                        theme: 'dark',
                        language: 'en',
                    },
                });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.configuration).toHaveProperty('settings');
            expect(res.body.configuration.settings.theme).toBe('dark');
        });
    });
});
