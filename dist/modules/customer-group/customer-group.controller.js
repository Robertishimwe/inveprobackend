"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerGroupController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const customer_group_service_1 = require("./customer-group.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick"));
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
/** Controller to create a customer group */
const createGroup = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // req.body is validated CreateCustomerGroupDto
    const group = await customer_group_service_1.customerGroupService.createGroup(req.body, tenantId);
    res.status(http_status_1.default.CREATED).send(group);
});
/** Controller to get a list of customer groups */
const getGroups = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const filterParams = (0, pick_1.default)(req.query, ['name']); // Add other filters if needed
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    const filter = { tenantId };
    if (filterParams.name)
        filter.name = { contains: filterParams.name, mode: 'insensitive' };
    const orderBy = [];
    if (options.sortBy) {
        const [key, order] = options.sortBy.split(':');
        if (key && (order === 'asc' || order === 'desc')) {
            if (['name', 'createdAt'].includes(key)) { // Add sortable fields
                orderBy.push({ [key]: order });
            }
        }
    }
    if (orderBy.length === 0) {
        orderBy.push({ name: 'asc' });
    } // Default sort
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    const result = await customer_group_service_1.customerGroupService.queryGroups(filter, orderBy, limit, page);
    res.status(http_status_1.default.OK).send({
        results: result.groups,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});
/** Controller to get a single customer group by ID */
const getGroup = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const group = await customer_group_service_1.customerGroupService.getGroupById(req.params.groupId, tenantId);
    if (!group) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Customer group not found');
    }
    res.status(http_status_1.default.OK).send(group);
});
/** Controller to update a customer group by ID */
const updateGroup = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // req.body is validated UpdateCustomerGroupDto
    const group = await customer_group_service_1.customerGroupService.updateGroupById(req.params.groupId, req.body, tenantId);
    res.status(http_status_1.default.OK).send(group);
});
/** Controller to delete a customer group by ID */
const deleteGroup = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    await customer_group_service_1.customerGroupService.deleteGroupById(req.params.groupId, tenantId);
    res.status(http_status_1.default.NO_CONTENT).send();
});
exports.customerGroupController = {
    createGroup,
    getGroups,
    getGroup,
    updateGroup,
    deleteGroup,
};
//# sourceMappingURL=customer-group.controller.js.map