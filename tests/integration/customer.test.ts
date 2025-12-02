import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Customer Routes', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let createdCustomerId: string;
    let customerGroupId: string;

    const adminEmail = `admin-cust-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Customer Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // 2. Create Permissions
        const permissions = [
            'customer:create',
            'customer:read',
            'customer:update',
            'customer:delete',
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
                name: 'Customer Admin',
                tenantId: tenant.id,
                description: 'Customer Admin Role',
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

        // 8. Create a Customer Group for testing
        const group = await prisma.customerGroup.create({
            data: {
                tenantId,
                name: 'Test Group',
            },
        });
        customerGroupId = group.id;
    });

    afterAll(async () => {
        await prisma.customer.deleteMany({ where: { tenantId } });
        await prisma.customerGroup.deleteMany({ where: { tenantId } });
        await prisma.user.deleteMany({ where: { tenantId } });
        await prisma.role.deleteMany({ where: { tenantId } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/customers', () => {
        test('should create a new customer', async () => {
            const newCustomer = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com',
                phone: '555-0101',
                customerGroupId: customerGroupId,
                defaultBillingAddress: {
                    street: '123 Main St',
                    city: 'Anytown',
                    country: 'USA',
                },
            };

            const res = await request(app)
                .post('/api/v1/customers')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(newCustomer);

            expect(res.status).toBe(httpStatus.CREATED);
            expect(res.body).toHaveProperty('id');
            expect(res.body.firstName).toBe(newCustomer.firstName);
            expect(res.body.customerGroupId).toBe(customerGroupId);
            createdCustomerId = res.body.id;
        });

        test('should return 400 if required fields are missing', async () => {
            const invalidCustomer = {
                notes: 'Just notes, no name or email',
            };

            const res = await request(app)
                .post('/api/v1/customers')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(invalidCustomer);

            expect(res.status).toBe(httpStatus.BAD_REQUEST);
        });
    });

    describe('GET /api/v1/customers', () => {
        test('should return list of customers', async () => {
            const res = await request(app)
                .get('/api/v1/customers')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.results.length).toBeGreaterThanOrEqual(1);
            expect(res.body.results[0].email).toBe('john.doe@example.com');
        });
    });

    describe('GET /api/v1/customers/:customerId', () => {
        test('should return customer details', async () => {
            const res = await request(app)
                .get(`/api/v1/customers/${createdCustomerId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.id).toBe(createdCustomerId);
            expect(res.body.firstName).toBe('John');
        });

        test('should return 404 if customer not found', async () => {
            const res = await request(app)
                .get('/api/v1/customers/nonexistent-id')
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NOT_FOUND);
        });
    });

    describe('PATCH /api/v1/customers/:customerId', () => {
        test('should update customer details', async () => {
            const updateData = {
                firstName: 'Johnny',
            };

            const res = await request(app)
                .patch(`/api/v1/customers/${createdCustomerId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .send(updateData);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body.firstName).toBe(updateData.firstName);
        });
    });

    describe('DELETE /api/v1/customers/:customerId', () => {
        test('should delete customer', async () => {
            const res = await request(app)
                .delete(`/api/v1/customers/${createdCustomerId}`)
                .set('Authorization', `Bearer ${adminAccessToken}`);

            expect(res.status).toBe(httpStatus.NO_CONTENT);

            // Verify deletion (hard delete)
            const customer = await prisma.customer.findUnique({ where: { id: createdCustomerId } });
            expect(customer).toBeNull();
        });
    });
});
