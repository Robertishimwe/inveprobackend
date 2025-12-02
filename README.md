# InvePro Backend API Documentation

This document provides a detailed reference for the InvePro Backend API.

## Base URL
`http://localhost:5000/api/v1`

## Authentication
The API uses **Bearer Token** authentication.
1.  **Login** to get an `accessToken`.
2.  Include the token in the `Authorization` header of subsequent requests:
    ```
    Authorization: Bearer <your_access_token>
    ```

## Error Response Format
All errors follow a standard format:
```json
{
  "code": 400,
  "message": "Error description",
  "stack": "Error stack trace (development only)"
}
```

---

## Modules

### 1. Authentication (`/auth`)
Manage user sessions and credentials.

#### Login
- **POST** `/auth/login`
- **Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Response**:
  ```json
  {
    "user": { "id": "...", "email": "..." },
    "tokens": {
      "access": { "token": "...", "expires": "..." },
      "refresh": { "token": "...", "expires": "..." }
    }
  }
  ```

#### Refresh Token
- **POST** `/auth/refresh-token`
- **Description**: Refreshes the access token using a valid refresh token (usually stored in cookies).

#### Logout
- **POST** `/auth/logout`
- **Description**: Invalidates the current session.

#### Password Management
- **POST** `/auth/forgot-password`: Request a password reset link.
- **POST** `/auth/reset-password`: Reset password using a token.

---

### 2. Tenants (`/tenants`)
Manage multi-tenancy configurations.

#### Create Tenant (Super Admin)
- **POST** `/tenants`
- **Body**:
  ```json
  {
    "name": "New Tenant",
    "adminEmail": "admin@newtenant.com",
    "adminPassword": "password123"
  }
  ```

#### Get Tenants (Super Admin)
- **GET** `/tenants`
- **Query Params**: `page`, `limit`, `sortBy`, `name`

#### Get Tenant Details
- **GET** `/tenants/:tenantId`

#### Update Tenant
- **PATCH** `/tenants/:tenantId`
- **Body**: `{ "name": "Updated Name", "status": "ACTIVE" }`

#### Deactivate Tenant
- **POST** `/tenants/:tenantId/deactivate`

#### Manage Admins
- **PUT** `/tenants/:tenantId/admins`
- **Body**: `{ "adminUserIds": ["uuid1", "uuid2"] }`

---

### 3. Users (`/users`)
Manage system users.

#### Create User
- **POST** `/users`
- **Body**:
  ```json
  {
    "email": "employee@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe",
    "roleId": "uuid-of-role"
  }
  ```

#### Get Users
- **GET** `/users`
- **Query Params**: `role`, `name`, `page`, `limit`

#### Get User Details
- **GET** `/users/:userId`

#### Update User
- **PATCH** `/users/:userId`
- **Body**: `{ "firstName": "Jane", "isActive": true }`

#### Delete User
- **DELETE** `/users/:userId`

#### Assign Role
- **POST** `/users/:userId/roles/:roleId`

#### Remove Role
- **DELETE** `/users/:userId/roles/:roleId`

---

### 4. Roles (`/roles`)
Manage roles and permissions.

#### Create Role
- **POST** `/roles`
- **Body**: `{ "name": "Manager", "description": "Store Manager" }`

#### Get Roles
- **GET** `/roles`

#### Update Role
- **PATCH** `/roles/:roleId`

#### Delete Role
- **DELETE** `/roles/:roleId`

#### Manage Permissions
- **POST** `/roles/:roleId/permissions`: Assign single permission.
- **DELETE** `/roles/:roleId/permissions/:permissionId`: Remove single permission.
- **POST** `/roles/:roleId/permissions/batch-add`: Assign multiple permissions.
- **POST** `/roles/:roleId/permissions/batch-remove`: Remove multiple permissions.

---

### 5. Permissions (`/permissions`)
- **GET** `/permissions`: List all available permissions.

---

### 6. Products (`/products`)
Manage inventory items.

#### Create Product
- **POST** `/products`
- **Body**:
  ```json
  {
    "name": "T-Shirt",
    "sku": "TSHIRT-001",
    "price": 19.99,
    "categoryId": "uuid",
    "isStockTracked": true
  }
  ```

#### Get Products
- **GET** `/products`
- **Query Params**: `search`, `category`, `page`, `limit`

#### Get Product Details
- **GET** `/products/:productId`

#### Update Product
- **PATCH** `/products/:productId`

#### Delete Product
- **DELETE** `/products/:productId`

---

### 7. Categories (`/categories`)
Organize products.

#### Create Category
- **POST** `/categories`
- **Body**: `{ "name": "Clothing", "parentId": "optional-uuid" }`

#### Get Categories
- **GET** `/categories`

#### Update Category
- **PATCH** `/categories/:categoryId`

#### Delete Category
- **DELETE** `/categories/:categoryId`

---

### 8. Inventory (`/inventory`)
Manage stock levels and movements.

#### Adjust Stock
- **POST** `/inventory/adjustments`
- **Body**:
  ```json
  {
    "locationId": "uuid",
    "items": [
      { "productId": "uuid", "quantityChange": 10, "reason": "Restock" }
    ]
  }
  ```

#### Transfers
- **POST** `/inventory/transfers`: Create transfer.
- **POST** `/inventory/transfers/:transferId/ship`: Mark as shipped.
- **POST** `/inventory/transfers/:transferId/receive`: Receive items.

#### Get Stock Levels
- **GET** `/inventory/items`: List stock by location/product.
- **GET** `/inventory/items/:itemId`: Specific stock item details.

---

### 9. Locations (`/locations`)
Manage physical stores or warehouses.

#### Create Location
- **POST** `/locations`
- **Body**: `{ "name": "Main Store", "type": "STORE", "address": "..." }`

#### Get Locations
- **GET** `/locations`

#### Update Location
- **PATCH** `/locations/:locationId`

#### Delete Location
- **DELETE** `/locations/:locationId`

---

### 10. Suppliers (`/suppliers`)
Manage vendors.

#### Create Supplier
- **POST** `/suppliers`
- **Body**: `{ "name": "Supplier Inc", "email": "contact@supplier.com" }`

#### Get Suppliers
- **GET** `/suppliers`

#### Update Supplier
- **PATCH** `/suppliers/:supplierId`

#### Delete Supplier
- **DELETE** `/suppliers/:supplierId`

---

### 11. Purchase Orders (`/purchase-orders`)
Manage procurement.

#### Create PO
- **POST** `/purchase-orders`
- **Body**:
  ```json
  {
    "supplierId": "uuid",
    "locationId": "uuid",
    "items": [
      { "productId": "uuid", "quantity": 100, "unitCost": 5.00 }
    ]
  }
  ```

#### Get POs
- **GET** `/purchase-orders`

#### PO Actions
- **POST** `/purchase-orders/:poId/submit`: Submit for approval.
- **POST** `/purchase-orders/:poId/approve`: Approve PO.
- **POST** `/purchase-orders/:poId/send`: Mark as sent.

---

### 12. Customers (`/customers`)
Manage customer profiles.

#### Create Customer
- **POST** `/customers`
- **Body**: `{ "firstName": "Alice", "email": "alice@example.com" }`

#### Get Customers
- **GET** `/customers`

#### Update Customer
- **PATCH** `/customers/:customerId`

#### Delete Customer
- **DELETE** `/customers/:customerId`

---

### 13. Customer Groups (`/customer-groups`)
Segment customers.

#### Create Group
- **POST** `/customer-groups`
- **Body**: `{ "name": "VIP", "discountPercent": 10 }`

#### Get Groups
- **GET** `/customer-groups`

---

### 14. Orders (`/orders`)
Manage sales orders.

#### Create Order
- **POST** `/orders`
- **Body**:
  ```json
  {
    "customerId": "uuid",
    "items": [
      { "productId": "uuid", "quantity": 2 }
    ]
  }
  ```

#### Get Orders
- **GET** `/orders`

#### Cancel Order
- **POST** `/orders/:orderId/cancel`

---

### 15. Returns (`/returns`)
Handle product returns.

#### Create Return
- **POST** `/returns`
- **Body**:
  ```json
  {
    "orderId": "uuid",
    "items": [
      { "orderItemId": "uuid", "quantity": 1, "reason": "Damaged" }
    ]
  }
  ```

#### Get Returns
- **GET** `/returns`

---

### 16. POS (`/pos`)
Point of Sale operations.

#### Sessions
- **POST** `/pos/sessions/start`: Start a register session.
- **POST** `/pos/sessions/:sessionId/end`: Close session.
- **POST** `/pos/sessions/:sessionId/cash`: Record cash in/out.

#### Checkout
- **POST** `/pos/sessions/:sessionId/checkout`
- **Body**:
  ```json
  {
    "items": [{ "productId": "uuid", "quantity": 1 }],
    "paymentMethods": [{ "method": "CASH", "amount": 20.00 }]
  }
  ```

---

### 17. Stock Counts (`/stock-counts`)
Physical inventory counting.

#### Initiate Count
- **POST** `/stock-counts`
- **Body**: `{ "type": "FULL", "locationId": "uuid" }`

#### Enter Counts
- **POST** `/stock-counts/:id/count`

#### Review & Post
- **POST** `/stock-counts/:id/review`: Approve/Reject variances.
- **POST** `/stock-counts/:id/post`: Finalize count.

---

### 18. Reports (`/reports`)
Analytics and reporting.

#### Dashboard
- **GET** `/reports/dashboard-kpi`

#### Sales
- **GET** `/reports/sales-summary`
- **GET** `/reports/sales-by-product`
- **GET** `/reports/sales-by-category`
- **GET** `/reports/sales-by-location`
- **GET** `/reports/payment-methods-summary`

#### Inventory
- **GET** `/reports/inventory-on-hand`
- **GET** `/reports/inventory-valuation`
- **GET** `/reports/low-stock`