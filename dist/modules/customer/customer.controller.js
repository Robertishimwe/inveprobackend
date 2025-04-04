"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const customer_service_1 = require("./customer.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick")); // For filtering/pagination query params
const tenant_middleware_1 = require("@/middleware/tenant.middleware"); // Helper to get tenantId
/**
 * Controller to handle customer creation.
 */
const createCustomer = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req); // Ensures tenantId is present from auth context
    // Request body is validated against CreateCustomerDto by middleware
    const customer = await customer_service_1.customerService.createCustomer(req.body, tenantId);
    res.status(http_status_1.default.CREATED).send(customer);
});
/**
 * Controller to handle querying multiple customers with filters and pagination.
 */
const getCustomers = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Define allowed filters from query parameters
    const filterParams = (0, pick_1.default)(req.query, [
        'firstName', // Filter by first name (contains)
        'lastName', // Filter by last name (contains)
        'name', // Filter by combined first/last name (contains)
        'email', // Filter by email (contains)
        'phone', // Filter by phone number (contains)
        'companyName', // Filter by company name (contains)
        'customerGroupId', // Filter by specific customer group ID
        'taxExempt' // Filter by tax-exempt status ('true' or 'false')
        // Add isActive filter if you add that field to the Customer model
    ]);
    // Define allowed options for sorting and pagination
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    // Build Prisma WhereInput object, always including the tenantId
    const filter = { tenantId }; // Automatically scope by tenant
    if (filterParams.firstName)
        filter.firstName = { contains: filterParams.firstName, mode: 'insensitive' };
    if (filterParams.lastName)
        filter.lastName = { contains: filterParams.lastName, mode: 'insensitive' };
    if (filterParams.email)
        filter.email = { contains: filterParams.email, mode: 'insensitive' };
    if (filterParams.phone)
        filter.phone = { contains: filterParams.phone };
    if (filterParams.companyName)
        filter.companyName = { contains: filterParams.companyName, mode: 'insensitive' };
    if (filterParams.customerGroupId)
        filter.customerGroupId = filterParams.customerGroupId;
    if (filterParams.taxExempt !== undefined)
        filter.taxExempt = filterParams.taxExempt === 'true';
    // Combined name search (example - searching first OR last name)
    if (filterParams.name) {
        const name = filterParams.name;
        filter.OR = [
            { firstName: { contains: name, mode: 'insensitive' } },
            { lastName: { contains: name, mode: 'insensitive' } },
            // Could add companyName here too if desired
            // { companyName: { contains: name, mode: 'insensitive' } },
        ];
        // Remove individual firstName/lastName filters if combined name search is used? Optional.
        // delete filter.firstName;
        // delete filter.lastName;
    }
    // Build Prisma OrderBy array
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                // Add valid sortable fields for Customer model
                if (['email', 'firstName', 'lastName', 'companyName', 'createdAt', 'updatedAt', 'loyaltyPoints'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
                // Example sorting by related field name
                // else if (key === 'groupName') { orderBy.push({ customerGroup: { name: order } }); }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ lastName: 'asc' }, { firstName: 'asc' }); // Default sort by name
    }
    // Parse pagination options
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    // Call the service with constructed filters and options
    const result = await customer_service_1.customerService.queryCustomers(filter, orderBy, limit, page);
    // Format and send the paginated response
    res.status(http_status_1.default.OK).send({
        results: result.customers,
        page: page,
        limit: limit,
        totalPages: Math.ceil(result.totalResults / limit),
        totalResults: result.totalResults,
    });
});
/**
 * Controller to handle fetching a single customer by ID.
 */
const getCustomer = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const customerId = req.params.customerId; // Customer ID from URL parameter
    // Optional: Permission checks (e.g., only specific roles can view customer details)
    // Middleware `checkPermissions(['customer:read'])` handles basic check
    const customer = await customer_service_1.customerService.getCustomerById(customerId, tenantId);
    if (!customer) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer not found');
    }
    res.status(http_status_1.default.OK).send(customer);
});
/**
 * Controller to handle updating a customer by ID.
 */
const updateCustomer = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const customerId = req.params.customerId;
    // req.body is validated UpdateCustomerDto by middleware
    // Optional: Permission checks (e.g., roles needed to update customer info)
    // Middleware `checkPermissions(['customer:update'])` handles basic check
    const customer = await customer_service_1.customerService.updateCustomerById(customerId, req.body, tenantId);
    res.status(http_status_1.default.OK).send(customer);
});
/**
 * Controller to handle deleting (or deactivating) a customer by ID.
 */
const deleteCustomer = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const customerId = req.params.customerId;
    // Optional: Permission checks
    // Middleware `checkPermissions(['customer:delete'])` handles basic check
    // Service layer performs dependency checks before deletion
    await customer_service_1.customerService.deleteCustomerById(customerId, tenantId);
    // Send 204 No Content on successful deletion/deactivation
    res.status(http_status_1.default.NO_CONTENT).send();
});
// Export all controller methods
exports.customerController = {
    createCustomer,
    getCustomers,
    getCustomer,
    updateCustomer,
    deleteCustomer,
};
//# sourceMappingURL=customer.controller.js.map