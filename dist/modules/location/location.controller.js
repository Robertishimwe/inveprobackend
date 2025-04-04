"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.locationController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const location_service_1 = require("./location.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick"));
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const createLocation = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const location = await location_service_1.locationService.createLocation(req.body, tenantId);
    res.status(http_status_1.default.CREATED).send(location);
});
const getLocations = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const filterParams = (0, pick_1.default)(req.query, ['name', 'locationType', 'isActive']);
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    const filter = { tenantId };
    if (filterParams.name)
        filter.name = { contains: filterParams.name, mode: 'insensitive' };
    if (filterParams.locationType)
        filter.locationType = { equals: filterParams.locationType };
    if (filterParams.isActive !== undefined)
        filter.isActive = filterParams.isActive === 'true';
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['name', 'locationType', 'createdAt', 'isActive'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ name: 'asc' });
    }
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    const result = await location_service_1.locationService.queryLocations(filter, orderBy, limit, page);
    res.status(http_status_1.default.OK).send({
        results: result.locations,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});
const getLocation = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const location = await location_service_1.locationService.getLocationById(req.params.locationId, tenantId);
    if (!location) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Location not found');
    }
    res.status(http_status_1.default.OK).send(location);
});
const updateLocation = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const location = await location_service_1.locationService.updateLocationById(req.params.locationId, req.body, tenantId);
    res.status(http_status_1.default.OK).send(location);
});
const deleteLocation = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    await location_service_1.locationService.deleteLocationById(req.params.locationId, tenantId);
    res.status(http_status_1.default.NO_CONTENT).send();
});
exports.locationController = {
    createLocation,
    getLocations,
    getLocation,
    updateLocation,
    deleteLocation,
};
//# sourceMappingURL=location.controller.js.map