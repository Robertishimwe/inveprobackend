import request from 'supertest';
import httpStatus from 'http-status';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { prisma } from '../../src/config';
import bcrypt from 'bcryptjs';

describe('Mutli-UOM Transfer Integration', () => {
    let tenantId: string;
    let adminAccessToken: string;
    let productId: string;
    let uomId: string;
    let sourceLocationId: string;
    let destinationLocationId: string;
    let transferId: string;

    const adminEmail = `admin-uom-${Date.now()}@example.com`;
    const adminPassword = 'password123';
    const hashedPassword = bcrypt.hashSync(adminPassword, 8);
    const BUNDLE_FACTOR = 10;

    beforeAll(async () => {
        // 1. Create Tenant
        const tenant = await prisma.tenant.create({
            data: { name: `UOM Transfer Tenant ${Date.now()}`, status: 'ACTIVE' },
        });
        tenantId = tenant.id;

        // 2. Setup Auth & Permissions
        const permissions = ['inventory:adjust', 'inventory:read', 'inventory:transfer:create', 'inventory:transfer:ship', 'inventory:transfer:receive'];
        const role = await prisma.role.create({ data: { name: 'Admin', tenantId } });
        for (const p of permissions) {
            const perm = await prisma.permission.upsert({ where: { permissionKey: p }, update: {}, create: { permissionKey: p } });
            await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
        }
        const user = await prisma.user.create({
            data: { email: adminEmail, passwordHash: hashedPassword, tenantId, firstName: 'Admin', lastName: 'User', isActive: true },
        });
        await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
        adminAccessToken = jwt.sign({ userId: user.id, tenantId }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

        // 3. Create Locations
        const loc1 = await prisma.location.create({ data: { tenantId, name: 'Source', locationType: 'WAREHOUSE' } });
        sourceLocationId = loc1.id;
        const loc2 = await prisma.location.create({ data: { tenantId, name: 'Destination', locationType: 'STORE' } });
        destinationLocationId = loc2.id;
        await prisma.userLocation.createMany({ data: [{ userId: user.id, locationId: loc1.id }, { userId: user.id, locationId: loc2.id }] });

        // 4. Create Product & Unit
        const product = await prisma.product.create({
            data: { tenantId, sku: `UOM-PROD-${Date.now()}`, name: 'Bundle Item', basePrice: 10, isStockTracked: true },
        });
        productId = product.id;

        const unit = await prisma.productUnit.create({
            data: { productId, name: 'Case', conversionFactor: BUNDLE_FACTOR },
        });
        uomId = unit.id;

        // 5. Initial Stock (100 Base Units)
        await request(app)
            .post('/api/v1/inventory/adjustments')
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({
                locationId: sourceLocationId,
                reasonCode: 'INITIAL',
                items: [{ productId, quantityChange: 100 }]
            });
    });

    afterAll(async () => {
        // Cleanup not strictly necessary in test env if DB is reset, but good practice
        const deleteTenant = prisma.tenant.delete({ where: { id: tenantId } });
        await deleteTenant.catch(() => { });
    });

    test('1. Create Transfer with UOM (1 Case)', async () => {
        const res = await request(app)
            .post('/api/v1/inventory/transfers')
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({
                sourceLocationId,
                destinationLocationId,
                items: [{ productId, quantityRequested: 1, uomId }] // Requesting 1 Case
            });

        expect(res.status).toBe(httpStatus.CREATED);
        transferId = res.body.transferId;

        // Verify DB storage
        const transfer = await prisma.inventoryTransfer.findUnique({
            where: { id: transferId },
            include: { items: true }
        });
        expect(transfer?.items[0].uomId).toBe(uomId);
        expect(Number(transfer?.items[0].quantityRequested)).toBe(1);
        expect(Number(transfer?.items[0].conversionFactor)).toBe(BUNDLE_FACTOR);
    });

    test('2. Ship Transfer (Should deduct 10 Base Units)', async () => {
        const res = await request(app)
            .post(`/api/v1/inventory/transfers/${transferId}/ship`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({});

        expect(res.status).toBe(httpStatus.OK);

        // Verify Stock at Source: 100 - 10 = 90
        const stockRes = await request(app)
            .get('/api/v1/inventory/items')
            .query({ locationId: sourceLocationId, productId })
            .set('Authorization', `Bearer ${adminAccessToken}`);

        const item = stockRes.body.results[0];
        expect(Number(item.quantityOnHand)).toBe(90);
    });

    test('3. Receive Transfer (Should add 10 Base Units)', async () => {
        // const transfer = await prisma.inventoryTransfer.findUnique({ where: { id: transferId }, include: { items: true } });

        const res = await request(app)
            .post(`/api/v1/inventory/transfers/${transferId}/receive`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .send({
                items: [{
                    productId,
                    quantityReceived: 1, // Receiving 1 Case
                    // uomId support in receive DTO optional, assumes matching transfer line
                }]
            });

        expect(res.status).toBe(httpStatus.OK);

        // Verify Stock at Dest: 0 + 10 = 10
        const stockRes = await request(app)
            .get('/api/v1/inventory/items')
            .query({ locationId: destinationLocationId, productId })
            .set('Authorization', `Bearer ${adminAccessToken}`);

        const item = stockRes.body.results[0];
        expect(Number(item.quantityOnHand)).toBe(10);
    });
});
