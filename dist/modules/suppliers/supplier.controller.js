"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supplierController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const supplier_service_1 = require("./supplier.service");
const catchAsync_1 = __importDefault(require("@/utils/catchAsync"));
const ApiError_1 = __importDefault(require("@/utils/ApiError"));
const pick_1 = __importDefault(require("@/utils/pick"));
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const createSupplier = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // req.body is validated CreateSupplierDto
    const supplier = await supplier_service_1.supplierService.createSupplier(req.body, tenantId);
    res.status(http_status_1.default.CREATED).send(supplier);
});
const getSuppliers = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const filterParams = (0, pick_1.default)(req.query, ['name', 'email', 'phone', 'isActive']);
    const options = (0, pick_1.default)(req.query, ['sortBy', 'limit', 'page']);
    const filter = { tenantId };
    if (filterParams.name)
        filter.name = { contains: filterParams.name, mode: 'insensitive' };
    if (filterParams.email)
        filter.email = { contains: filterParams.email, mode: 'insensitive' };
    if (filterParams.phone)
        filter.phone = { contains: filterParams.phone };
    if (filterParams.isActive !== undefined)
        filter.isActive = filterParams.isActive === 'true';
    const orderBy = [];
    if (options.sortBy) {
        options.sortBy.split(',').forEach(sortOption => {
            const [key, order] = sortOption.split(':');
            if (key && (order === 'asc' || order === 'desc')) {
                if (['name', 'email', 'createdAt', 'isActive'].includes(key)) {
                    orderBy.push({ [key]: order });
                }
            }
        });
    }
    if (orderBy.length === 0) {
        orderBy.push({ name: 'asc' });
    } // Default sort
    const limit = parseInt(options.limit) || 10;
    const page = parseInt(options.page) || 1;
    const result = await supplier_service_1.supplierService.querySuppliers(filter, orderBy, limit, page);
    res.status(http_status_1.default.OK).send({
        results: result.suppliers,
        page: page, limit: limit, totalPages: Math.ceil(result.totalResults / limit), totalResults: result.totalResults,
    });
});
const getSupplier = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    const supplier = await supplier_service_1.supplierService.getSupplierById(req.params.supplierId, tenantId);
    if (!supplier) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Supplier not found');
    }
    res.status(http_status_1.default.OK).send(supplier);
});
const updateSupplier = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // req.body is validated UpdateSupplierDto
    const supplier = await supplier_service_1.supplierService.updateSupplierById(req.params.supplierId, req.body, tenantId);
    res.status(http_status_1.default.OK).send(supplier);
});
const deleteSupplier = (0, catchAsync_1.default)(async (req, res) => {
    const tenantId = (0, tenant_middleware_1.getTenantIdFromRequest)(req);
    // Service performs soft delete (deactivation)
    await supplier_service_1.supplierService.deleteSupplierById(req.params.supplierId, tenantId);
    // Send 204 No Content for successful deactivation/deletion
    res.status(http_status_1.default.NO_CONTENT).send();
});
exports.supplierController = {
    createSupplier,
    getSuppliers,
    getSupplier,
    updateSupplier,
    deleteSupplier,
};
//# sourceMappingURL=supplier.controller.js.map