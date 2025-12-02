import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Auth Routes', () => {
    let tenantId: string;
    const email = `test-${Date.now()}@example.com`;
    const password = 'password123';
    const hashedPassword = bcrypt.hashSync(password, 8);

    beforeAll(async () => {
        // Create a Tenant
        const tenant = await prisma.tenant.create({
            data: {
                name: `Test Tenant ${Date.now()}`,
                status: 'ACTIVE',
            },
        });
        tenantId = tenant.id;

        // Create a User
        await prisma.user.create({
            data: {
                email,
                passwordHash: hashedPassword,
                tenantId: tenant.id,
                firstName: 'Test',
                lastName: 'User',
                isActive: true,
            },
        });
    });

    afterAll(async () => {
        // Clean up
        await prisma.user.deleteMany({ where: { email } });
        await prisma.tenant.delete({ where: { id: tenantId } });
    });

    describe('POST /api/v1/auth/login', () => {
        test('should return 200 and tokens on valid credentials', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email, password });

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('accessToken');

            // Check for refresh token cookie
            const cookies = res.headers['set-cookie'] as unknown as string[];
            expect(cookies).toBeDefined();
            expect(cookies.some((c: string) => c.includes('refreshToken'))).toBe(true);
        });

        test('should return 401 on invalid password', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email, password: 'wrongpassword' });

            expect(res.status).toBe(httpStatus.UNAUTHORIZED);
        });
    });

    describe('POST /api/v1/auth/refresh-token', () => {
        test('should return 200 and new tokens on valid refresh token', async () => {
            // First login to get tokens
            const loginRes = await request(app)
                .post('/api/v1/auth/login')
                .send({ email, password });

            const cookies = loginRes.headers['set-cookie'] as unknown as string[];
            const refreshTokenCookie = cookies.find((c: string) => c.startsWith('refreshToken='));

            const res = await request(app)
                .post('/api/v1/auth/refresh-token')
                .set('Cookie', [refreshTokenCookie as string]);

            expect(res.status).toBe(httpStatus.OK);
            expect(res.body).toHaveProperty('accessToken');
        });

        test('should return 401 if no refresh token provided', async () => {
            const res = await request(app)
                .post('/api/v1/auth/refresh-token');

            expect(res.status).toBe(httpStatus.UNAUTHORIZED);
        });
    });

    describe('POST /api/v1/auth/logout', () => {
        test('should return 200 and clear refresh token', async () => {
            // First login to get tokens
            const loginRes = await request(app)
                .post('/api/v1/auth/login')
                .send({ email, password });

            const cookies = loginRes.headers['set-cookie'] as unknown as string[];
            const refreshTokenCookie = cookies.find((c: string) => c.startsWith('refreshToken='));

            const res = await request(app)
                .post('/api/v1/auth/logout')
                .set('Cookie', [refreshTokenCookie as string]);

            expect(res.status).toBe(httpStatus.OK);
            // Check if cookie is cleared (expires in the past)
            const resCookies = res.headers['set-cookie'] as unknown as string[];
            expect(resCookies.some((c: string) => c.includes('refreshToken=;'))).toBe(true);
        });
    });

    describe('POST /api/v1/auth/forgot-password', () => {
        test('should return 200 if email exists', async () => {
            const res = await request(app)
                .post('/api/v1/auth/forgot-password')
                .send({ email });

            expect(res.status).toBe(httpStatus.OK);
        });

        test('should return 200 even if email does not exist (security)', async () => {
            const res = await request(app)
                .post('/api/v1/auth/forgot-password')
                .send({ email: 'nonexistent@example.com' });

            expect(res.status).toBe(httpStatus.OK);
        });
    });
});
