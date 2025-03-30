# ---- Base Stage ----
# Use a specific Node.js LTS version on Alpine Linux for smaller image size
FROM node:18-alpine AS base

# Set working directory
WORKDIR /usr/src/app

# Install necessary OS packages:
# libc6-compat: For Prisma compatibility on Alpine
# openssl: Often needed for secure connections
RUN apk add --no-cache libc6-compat openssl

# Set Node environment to production by default for subsequent stages
ENV NODE_ENV production

# ---- Dependencies Stage ----
# Focus on installing only production dependencies efficiently
FROM base AS dependencies

# Copy package.json and lock files
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

# Install only production dependencies.
# --omit=dev: Skips devDependencies
# --ignore-scripts: Skips potentially unnecessary postinstall scripts
# --prefer-offline: Uses cache if possible
# --no-audit: Skips vulnerability audit during install (can be slow)
RUN npm install --omit=dev --ignore-scripts --prefer-offline --no-audit

# ---- Build Stage ----
# Installs all dependencies, copies source, generates Prisma client, and builds TypeScript
FROM base AS build

# Install ALL dependencies (including devDependencies needed for build and prisma generate)
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
# Using 'ci' might be more reliable if you have a lock file: npm ci
RUN npm install --ignore-scripts --prefer-offline --no-audit

# Copy the rest of the application source code
COPY . .

# Copy Prisma schema directory
# Ensure prisma schema is copied *before* generating the client
COPY prisma ./prisma

# Generate Prisma Client based on the schema
# This needs devDependencies (like 'prisma') installed
RUN npx prisma generate

# Build the TypeScript application
# This runs the 'build' script defined in package.json (tsc && prisma generate again just in case)
RUN npm run build
# If 'build' script doesn't include prisma generate, add: RUN npx prisma generate

# Optional: Prune devDependencies after build if space is critical,
# but we copy from the 'dependencies' stage later anyway.
# RUN npm prune --omit=dev

# ---- Production Stage ----
# Creates the final lean production image
FROM base AS production

# Set NODE_ENV explicitly to production (redundant due to base stage but good practice)
ENV NODE_ENV production

# Copy essential configuration files (adjust if you have more)
COPY package.json ./

# Copy production node_modules from the 'dependencies' stage
COPY --from=dependencies /usr/src/app/node_modules ./node_modules

# Copy compiled JavaScript code from the 'build' stage
COPY --from=build /usr/src/app/dist ./dist

# Copy Prisma schema and the generated client runtime files from the 'build' stage
# These are required by the Prisma Client at runtime
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Expose the port the application will run on.
# Use environment variable defined during runtime or default to 5000.
EXPOSE ${PORT:-5000}

# Define the command to run the application
# Uses the 'start' script from package.json which should point to the compiled server entry point
CMD ["npm", "run", "start"]
# Alternatively, run node directly: CMD ["node", "dist/server.js"]