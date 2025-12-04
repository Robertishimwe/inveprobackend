import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app';
import { prisma } from '../../src/config';
import { createTestTenant, createTestUser, createTestToken, createTestLocation } from '../utils/test-utils';

describe('POS Location-Based Access Control (LBAC)', () => {
    let tenantId: string;
    let locationAId: string;
    let locationBId: string;
    let userAToken: string;

    beforeAll(async () => {
        // 1. Setup Tenant
        const tenant = await createTestTenant();
        tenantId = tenant.id;

        // 2. Create Locations
        const locA = await createTestLocation(tenantId, { name: 'Location A' });
        locationAId = locA.id;
        const locB = await createTestLocation(tenantId, { name: 'Location B' });
        locationBId = locB.id;

        // 3. Create Permissions
        const permissions = ['pos:session:start'];
        const createdPermissions = [];
        for (const perm of permissions) {
            const p = await prisma.permission.upsert({
                where: { permissionKey: perm },
                update: {},
                create: { permissionKey: perm, description: `Test permission ${perm}` }
            });
            createdPermissions.push(p);
        }

        // 4. Create Role
        const role = await prisma.role.create({
            data: {
                name: 'POS User',
                tenantId: tenantId,
                permissions: {
                    create: createdPermissions.map(p => ({ permissionId: p.id }))
                }
            }
        });

        // 5. Create Users
        // User A assigned to Location A
        const userA = await createTestUser(tenantId, { email: `usera-pos-${Date.now()}@example.com`, roleId: role.id });
        await prisma.userLocation.create({ data: { userId: userA.id, locationId: locationAId } });
        userAToken = createTestToken(userA.id, tenantId);

        // User B assigned to Location B
        const userB = await createTestUser(tenantId, { email: `userb-pos-${Date.now()}@example.com`, roleId: role.id });
        await prisma.userLocation.create({ data: { userId: userB.id, locationId: locationBId } });
        // userBToken = createTestToken(userB.id, tenantId);
    });

    afterAll(async () => {
        await prisma.posSession.deleteMany({ where: { tenantId } });
        await prisma.userLocation.deleteMany({ where: { user: { tenantId } } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.location.deleteMany({ where: { tenantId } });
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });

    test('should allow user to start session in assigned location', async () => {
        const res = await request(app)
            .post('/api/v1/pos/sessions/start')
            .set('Authorization', `Bearer ${userAToken}`)
            .set('X-Location-Id', locationAId)
            .set('X-Terminal-Id', 'TERM-A')
            .send({ startingCash: 100 });

        expect(res.status).toBe(httpStatus.CREATED);
        expect(res.body.locationId).toBe(locationAId);
    });

    test('should DENY user starting session in unassigned location', async () => {
        const res = await request(app)
            .post('/api/v1/pos/sessions/start')
            .set('Authorization', `Bearer ${userAToken}`)
            .set('X-Location-Id', locationBId) // User A trying to access Location B
            .set('X-Terminal-Id', 'TERM-B')
            .send({ startingCash: 100 });

        expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test('should DENY user starting session with invalid location ID', async () => {
        const res = await request(app)
            .post('/api/v1/pos/sessions/start')
            .set('Authorization', `Bearer ${userAToken}`)
            .set('X-Location-Id', 'invalid-uuid')
            .set('X-Terminal-Id', 'TERM-A')
            .send({ startingCash: 100 });

        // Depending on validation order, this might be 400 (UUID validation) or 403.
        // Since we check header presence then LBAC, and LBAC check uses string comparison, 
        // it likely hits the LBAC check first or UUID validation if it exists in middleware.
        // But our controller check is manual.
        // Actually, if it's not in allowedLocationIds, it throws 403.
        expect(res.status).toBe(httpStatus.FORBIDDEN);
    });
});
