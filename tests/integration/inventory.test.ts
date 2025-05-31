import request from 'supertest';
import { app } from '@/app'; // Assuming your Express app is exported from @/app
import { prisma } from '@/config'; // Assuming your Prisma client is exported from @/config
import { Tenant, User, Location, Product, InventoryItem } from '@prisma/client';
import { generateToken } from '@/utils/auth'; // Assuming a token generation utility

describe('Inventory API - /api/v1/inventory/items', () => {
  let tenant: Tenant;
  let user: User;
  let token: string;
  let location: Location;
  let product: Product;
  let inventoryItem: InventoryItem;

  const testTenantData = {
    name: 'Test Tenant Inventory',
    subdomain: `test-inventory-${Date.now()}`,
  };

  const testUserData = {
    email: `testuser-inventory-${Date.now()}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    password: 'Password123!',
  };

  const testLocationData = {
    name: 'Test Location Inventory',
    address: '123 Test St',
  };

  const testProductData = {
    name: 'Test Product Inventory',
    sku: `SKU-INV-${Date.now()}`,
    description: 'A product for inventory testing',
    basePrice: 10.99, // Ensure basePrice is included
    isStockTracked: true,
  };

  beforeAll(async () => {
    // 1. Create Tenant
    tenant = await prisma.tenant.create({ data: testTenantData });

    // 2. Create User
    user = await prisma.user.create({
      data: {
        ...testUserData,
        tenantId: tenant.id,
        // Add other required fields for user creation if any
        role: 'ADMIN', // Assuming a role is needed
        isEmailVerified: true,
      },
    });

    // 3. Generate Token (assuming a simple utility or direct creation)
    // In a real app, this might involve a login step or a more complex token generation
    token = generateToken({ userId: user.id, tenantId: tenant.id, role: user.role });


    // 4. Create Location
    location = await prisma.location.create({
      data: {
        ...testLocationData,
        tenantId: tenant.id,
      },
    });

    // 5. Create Product
    product = await prisma.product.create({
      data: {
        ...testProductData,
        tenantId: tenant.id,
      },
    });

    // 6. Create Inventory Item
    inventoryItem = await prisma.inventoryItem.create({
      data: {
        tenantId: tenant.id,
        productId: product.id,
        locationId: location.id,
        quantityOnHand: 100,
        quantityAllocated: 10,
        quantityIncoming: 5,
        // averageCost: 9.50, // Example value if needed
      },
    });
  });

  afterAll(async () => {
    // Clean up in reverse order of creation to avoid foreign key constraints
    await prisma.inventoryItem.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.product.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.location.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  describe('GET /api/v1/inventory/items', () => {
    it('should return a list of inventory items including product basePrice', async () => {
      const response = await request(app)
        .get('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenant.id) // Assuming tenant ID is passed in a header
        .query({ page: 1, limit: 10 }); // Add pagination params if required by endpoint

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThanOrEqual(1);

      const foundItem = response.body.items.find(
        (item: any) => item.id === inventoryItem.id
      );

      expect(foundItem).toBeDefined();
      expect(foundItem).toHaveProperty('id', inventoryItem.id);
      expect(foundItem).toHaveProperty('quantityOnHand'); // Check for Decimal by its string representation
      // Note: Prisma Decimal fields are often returned as strings in JSON to preserve precision.
      // Adjust assertion if your setup serializes them as numbers.
      expect(foundItem.quantityOnHand.toString()).toBe(inventoryItem.quantityOnHand.toString());


      expect(foundItem).toHaveProperty('product');
      expect(foundItem.product).toHaveProperty('id', product.id);
      expect(foundItem.product).toHaveProperty('sku', product.sku);
      expect(foundItem.product).toHaveProperty('name', product.name);
      // Critical Assertion: Check for basePrice
      expect(foundItem.product).toHaveProperty('basePrice');
      expect(foundItem.product.basePrice.toString()).toBe(product.basePrice.toString());


      expect(foundItem).toHaveProperty('location');
      expect(foundItem.location).toHaveProperty('id', location.id);
      expect(foundItem.location).toHaveProperty('name', location.name);
    });

    it('should return 401 if no token is provided', async () => {
        const response = await request(app)
            .get('/api/v1/inventory/items')
            .set('X-Tenant-ID', tenant.id);

        expect(response.status).toBe(401);
    });

    it('should return 400 or 404 if tenant ID is missing or invalid (depending on middleware)', async () => {
        // This test's expected status might vary based on how tenant validation is implemented.
        // It could be 400 (Bad Request) or 404 (Not Found) or even 500 if not handled gracefully.
        const response = await request(app)
            .get('/api/v1/inventory/items')
            .set('Authorization', `Bearer ${token}`);
            // No X-Tenant-ID header

        // Common outcomes are 400 or 401/403 if tenant middleware runs after auth
        expect([400, 401, 403, 404]).toContain(response.status);
    });
  });
});
