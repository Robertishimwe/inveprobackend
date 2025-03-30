#!/bin/bash

echo "Creating project structure for inventory-pos-system-backend..."

# Create root level files
echo "Creating root files..."
touch .env .env.example .gitignore .dockerignore Dockerfile docker-compose.yml package.json tsconfig.json

# Create root level directories
echo "Creating root directories..."
mkdir -p prisma src tests

# --- Prisma ---
echo "Creating prisma files..."
touch prisma/schema.prisma

# --- Src Directory ---
echo "Creating src core files..."
touch src/app.ts src/server.ts

echo "Creating src subdirectories..."
mkdir -p src/config \
         src/modules \
         src/middleware \
         src/utils \
         src/types/express \
         src/interfaces

# --- Src/Config ---
echo "Creating config files..."
touch src/config/index.ts \
      src/config/environment.ts \
      src/config/prisma.ts \
      src/config/redis.ts

# --- Src/Modules ---
echo "Creating modules structure..."

# Auth Module
mkdir -p src/modules/auth/dto
touch src/modules/auth/auth.controller.ts \
      src/modules/auth/auth.service.ts \
      src/modules/auth/auth.routes.ts \
      src/modules/auth/dto/login.dto.ts

# Users Module
mkdir -p src/modules/users/dto
touch src/modules/users/user.controller.ts \
      src/modules/users/user.service.ts \
      src/modules/users/user.repository.ts \
      src/modules/users/user.routes.ts \
      src/modules/users/dto/create-user.dto.ts \
      src/modules/users/dto/update-user.dto.ts

# Products Module
mkdir -p src/modules/products/dto
touch src/modules/products/product.controller.ts \
      src/modules/products/product.service.ts \
      src/modules/products/product.routes.ts \
      src/modules/products/dto/create-product.dto.ts \
      src/modules/products/dto/update-product.dto.ts

# Inventory Module
mkdir -p src/modules/inventory/dto
touch src/modules/inventory/inventory.controller.ts \
      src/modules/inventory/inventory.service.ts \
      src/modules/inventory/inventory.routes.ts \
      src/modules/inventory/dto/index.ts

# Orders Module
mkdir -p src/modules/orders/dto
touch src/modules/orders/order.controller.ts \
      src/modules/orders/order.service.ts \
      src/modules/orders/order.routes.ts \
      src/modules/orders/dto/index.ts

# POS Module
mkdir -p src/modules/pos/dto
touch src/modules/pos/pos.controller.ts \
      src/modules/pos/pos.service.ts \
      src/modules/pos/pos.routes.ts \
      src/modules/pos/dto/index.ts

# Customers Module
mkdir -p src/modules/customers/dto
touch src/modules/customers/customer.controller.ts \
      src/modules/customers/customer.service.ts \
      src/modules/customers/customer.routes.ts \
      src/modules/customers/dto/index.ts

# Suppliers Module
mkdir -p src/modules/suppliers/dto
touch src/modules/suppliers/supplier.controller.ts \
      src/modules/suppliers/supplier.service.ts \
      src/modules/suppliers/supplier.routes.ts \
      src/modules/suppliers/dto/index.ts

# --- Src/Middleware ---
echo "Creating middleware files..."
touch src/middleware/auth.middleware.ts \
      src/middleware/error.middleware.ts \
      src/middleware/validate.middleware.ts \
      src/middleware/tenant.middleware.ts

# --- Src/Utils ---
echo "Creating util files..."
touch src/utils/ApiError.ts \
      src/utils/catchAsync.ts \
      src/utils/logger.ts \
      src/utils/pick.ts

# --- Src/Types ---
echo "Creating type definition files..."
touch src/types/express/index.d.ts

# --- Src/Interfaces ---
echo "Creating interfaces placeholder..."
touch src/interfaces/.gitkeep

# --- Tests ---
echo "Creating tests structure..."
mkdir -p tests/integration tests/unit
touch tests/integration/products.test.ts \
      tests/unit/product.service.test.ts


echo "Project structure created successfully!"
echo "Next steps:"
echo "1. Run 'npm init -y' (or copy existing package.json)"
echo "2. Run 'npm install' for dependencies"
echo "3. Configure '.env', 'tsconfig.json', 'prisma/schema.prisma', etc."
echo "4. Start coding!"

exit 0