import { prisma } from '../../src/config';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../../src/config';

export const createTestTenant = async (overrides = {}) => {
    return prisma.tenant.create({
        data: {
            name: `Test Tenant ${Date.now()}`,
            status: 'ACTIVE',
            ...overrides,
        },
    });
};

export const createTestUser = async (tenantId: string, overrides: any = {}) => {
    const passwordHash = bcrypt.hashSync(overrides.password || 'password123', 8);
    const user = await prisma.user.create({
        data: {
            email: overrides.email || `user-${Date.now()}@example.com`,
            passwordHash,
            tenantId,
            firstName: overrides.firstName || 'Test',
            lastName: overrides.lastName || 'User',
            isActive: true,
        },
    });

    if (overrides.roleId) {
        await prisma.userRole.create({
            data: { userId: user.id, roleId: overrides.roleId },
        });
    }
    return user;
};

export const createTestToken = (userId: string, tenantId: string) => {
    return jwt.sign({ userId, tenantId }, env.JWT_SECRET, { expiresIn: '1h' });
};

export const createTestLocation = async (tenantId: string, overrides = {}) => {
    return prisma.location.create({
        data: {
            tenantId,
            name: `Test Location ${Date.now()}`,
            address: '123 Test St',
            ...overrides,
        },
    });
};

export const createTestProduct = async (tenantId: string, overrides = {}) => {
    return prisma.product.create({
        data: {
            tenantId,
            sku: `SKU-${Date.now()}`,
            name: `Test Product ${Date.now()}`,
            productType: 'STANDARD',
            basePrice: 100,
            isActive: true,
            isStockTracked: true,
            ...overrides,
        },
    });
};
