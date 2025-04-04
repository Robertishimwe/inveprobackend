"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/app.ts
require("reflect-metadata"); // Must be imported first for class-transformer/validator
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan")); // HTTP request logger
const http_status_1 = __importDefault(require("http-status"));
const config_1 = require("@/config"); // Ensure path alias is configured
const error_middleware_1 = require("@/middleware/error.middleware");
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const logger_1 = __importDefault(require("@/utils/logger"));
// --- Import Module Routers ---
// These should export the configured express.Router() instance for each module
const auth_routes_1 = __importDefault(require("@/modules/auth/auth.routes"));
const user_routes_1 = __importDefault(require("@/modules/users/user.routes"));
const product_routes_1 = __importDefault(require("@/modules/products/product.routes"));
const inventory_routes_1 = __importDefault(require("@/modules/inventory/inventory.routes"));
const order_routes_1 = __importDefault(require("@/modules/orders/order.routes"));
const pos_routes_1 = __importDefault(require("@/modules/pos/pos.routes"));
const customer_routes_1 = __importDefault(require("@/modules/customer/customer.routes"));
const customer_group_routes_1 = __importDefault(require("@/modules/customer-group/customer-group.routes"));
const supplier_routes_1 = __importDefault(require("@/modules/suppliers/supplier.routes"));
const location_routes_1 = __importDefault(require("@/modules/location/location.routes"));
const category_routes_1 = __importDefault(require("@/modules/category/category.routes"));
const permission_routes_1 = __importDefault(require("@/modules/permissions/permission.routes"));
const role_routes_1 = __importDefault(require("@/modules/roles/role.routes"));
const purchase_order_routes_1 = __importDefault(require("@/modules/purchase-order/purchase-order.routes"));
// Add imports for any other modules (e.g., reporting)
const app = (0, express_1.default)();
// --- Security Middleware ---
// Set various HTTP headers for security
app.set('trust proxy', 1);
app.use((0, helmet_1.default)());
// Enable CORS (Cross-Origin Resource Sharing)
// Configure origins specifically for production environments
app.use((0, cors_1.default)({
    origin: config_1.env.CORS_ORIGIN === '*' ? '*' : config_1.env.CORS_ORIGIN.split(','), // Allow multiple origins from env var
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // If you need to handle cookies or authorization headers
}));
// Handle CORS preflight requests
app.options('*', (0, cors_1.default)());
// --- Standard Middleware ---
// Parse JSON request bodies (with size limit)
app.use(express_1.default.json({ limit: '20kb' }));
// Parse URL-encoded request bodies (with size limit)
app.use(express_1.default.urlencoded({ extended: true, limit: '20kb' }));
// --- Logging Middleware ---
// Use Morgan for HTTP request logging. Log format depends on environment.
// Direct morgan output to Winston's http level logger
const morganFormat = config_1.env.NODE_ENV === 'development' ? 'dev' : 'short'; // 'combined' provides more info but is verbose
app.use((0, morgan_1.default)(morganFormat, {
    stream: { write: (message) => logger_1.default.http(message.trim()) },
    skip: (req, res) => config_1.env.NODE_ENV === 'test', // Optionally skip logging during tests
}));
// --- API Routes ---
// Simple health check endpoint
app.get('/health', (req, res) => {
    // Could add checks for DB/Redis connectivity here if needed
    res.status(http_status_1.default.OK).json({ status: 'UP', timestamp: new Date().toISOString() });
});
// Root endpoint (optional)
app.get('/', (req, res) => {
    res.status(http_status_1.default.OK).send('Inventory & POS System API is running.');
});
// Mount all module API routers under '/api/v1'
const apiRouter = express_1.default.Router();
apiRouter.use('/auth', auth_routes_1.default);
apiRouter.use('/users', user_routes_1.default);
apiRouter.use('/products', product_routes_1.default);
apiRouter.use('/inventory', inventory_routes_1.default);
apiRouter.use('/orders', order_routes_1.default);
apiRouter.use('/pos', pos_routes_1.default);
apiRouter.use('/customers', customer_routes_1.default);
apiRouter.use('/suppliers', supplier_routes_1.default);
// Mount other module routers here...
apiRouter.use('/locations', location_routes_1.default);
apiRouter.use('/categories', category_routes_1.default);
apiRouter.use('/customer-group', customer_group_routes_1.default);
apiRouter.use('/purchase-orders', purchase_order_routes_1.default);
apiRouter.use('/permissions', permission_routes_1.default);
apiRouter.use('/roles', role_routes_1.default);
app.use('/api/v1', apiRouter);
// --- 404 Handler ---
// Catch requests to routes that don't exist
app.use((req, res, next) => {
    next(new ApiError_1.default(http_status_1.default.NOT_FOUND, `Not Found - ${req.originalUrl}`));
});
// --- Global Error Handling ---
// Convert errors that are not instance of ApiError (e.g., Prisma errors)
app.use(error_middleware_1.errorConverter);
// Handle ApiError instances and send response
app.use(error_middleware_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map