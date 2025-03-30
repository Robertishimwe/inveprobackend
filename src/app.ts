// src/app.ts
import 'reflect-metadata'; // Must be imported first for class-transformer/validator
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan'; // HTTP request logger
import httpStatus from 'http-status';
import { env } from '@/config'; // Ensure path alias is configured
import { errorHandler, errorConverter } from '@/middleware/error.middleware';
import ApiError from '@/utils/ApiError';
import logger from '@/utils/logger';

// --- Import Module Routers ---
// These should export the configured express.Router() instance for each module
import authRoutes from '@/modules/auth/auth.routes';
import userRoutes from '@/modules/users/user.routes';
import productRoutes from '@/modules/products/product.routes';
import inventoryRoutes from '@/modules/inventory/inventory.routes';
import orderRoutes from '@/modules/orders/order.routes';
import posRoutes from '@/modules/pos/pos.routes';
import customerRoutes from '@/modules/customers/customer.routes';
import supplierRoutes from '@/modules/suppliers/supplier.routes';
// Add imports for any other modules (e.g., categories, locations, reporting)

const app: Express = express();

// --- Security Middleware ---
// Set various HTTP headers for security
app.use(helmet());

// Enable CORS (Cross-Origin Resource Sharing)
// Configure origins specifically for production environments
app.use(cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','), // Allow multiple origins from env var
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // If you need to handle cookies or authorization headers
}));
// Handle CORS preflight requests
app.options('*', cors());

// --- Standard Middleware ---
// Parse JSON request bodies (with size limit)
app.use(express.json({ limit: '20kb' }));

// Parse URL-encoded request bodies (with size limit)
app.use(express.urlencoded({ extended: true, limit: '20kb' }));

// --- Logging Middleware ---
// Use Morgan for HTTP request logging. Log format depends on environment.
// Direct morgan output to Winston's http level logger
const morganFormat = env.NODE_ENV === 'development' ? 'dev' : 'short'; // 'combined' provides more info but is verbose
app.use(morgan(morganFormat, {
    stream: { write: (message) => logger.http(message.trim()) },
    skip: (req, res) => env.NODE_ENV === 'test', // Optionally skip logging during tests
}));


// --- API Routes ---
// Simple health check endpoint
app.get('/health', (req: Request, res: Response) => {
    // Could add checks for DB/Redis connectivity here if needed
    res.status(httpStatus.OK).json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Root endpoint (optional)
app.get('/', (req: Request, res: Response) => {
    res.status(httpStatus.OK).send('Inventory & POS System API is running.');
});


// Mount all module API routers under '/api/v1'
const apiRouter = express.Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/products', productRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/pos', posRoutes);
apiRouter.use('/customers', customerRoutes);
apiRouter.use('/suppliers', supplierRoutes);
// Mount other module routers here...
// apiRouter.use('/locations', locationRoutes);
// apiRouter.use('/categories', categoryRoutes);

app.use('/api/v1', apiRouter);


// --- 404 Handler ---
// Catch requests to routes that don't exist
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(httpStatus.NOT_FOUND, `Not Found - ${req.originalUrl}`));
});

// --- Global Error Handling ---
// Convert errors that are not instance of ApiError (e.g., Prisma errors)
app.use(errorConverter);

// Handle ApiError instances and send response
app.use(errorHandler);

export default app;
