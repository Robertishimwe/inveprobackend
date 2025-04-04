"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/suppliers/supplier.routes.ts
const express_1 = __importDefault(require("express"));
const supplier_controller_1 = require("./supplier.controller");
const validate_middleware_1 = __importDefault(require("@/middleware/validate.middleware"));
const create_supplier_dto_1 = require("./dto/create-supplier.dto");
const update_supplier_dto_1 = require("./dto/update-supplier.dto");
const auth_middleware_1 = require("@/middleware/auth.middleware");
const tenant_middleware_1 = require("@/middleware/tenant.middleware");
const rbac_middleware_1 = require("@/middleware/rbac.middleware");
const router = express_1.default.Router();
// Apply auth & tenant context to all supplier routes
router.use(auth_middleware_1.authMiddleware);
router.use(tenant_middleware_1.ensureTenantContext);
// Define Supplier Routes
router.route('/')
    /** POST /api/v1/suppliers */
    .post((0, rbac_middleware_1.checkPermissions)(['supplier:create']), // Define permission
(0, validate_middleware_1.default)(create_supplier_dto_1.CreateSupplierDto), supplier_controller_1.supplierController.createSupplier)
    /** GET /api/v1/suppliers */
    .get((0, rbac_middleware_1.checkPermissions)(['supplier:read']), // Define permission
supplier_controller_1.supplierController.getSuppliers);
router.route('/:supplierId')
    /** GET /api/v1/suppliers/:supplierId */
    .get((0, rbac_middleware_1.checkPermissions)(['supplier:read']), supplier_controller_1.supplierController.getSupplier)
    /** PATCH /api/v1/suppliers/:supplierId */
    .patch((0, rbac_middleware_1.checkPermissions)(['supplier:update']), // Define permission
(0, validate_middleware_1.default)(update_supplier_dto_1.UpdateSupplierDto), supplier_controller_1.supplierController.updateSupplier)
    /** DELETE /api/v1/suppliers/:supplierId */
    .delete((0, rbac_middleware_1.checkPermissions)(['supplier:delete']), // Define permission (for deactivation)
supplier_controller_1.supplierController.deleteSupplier);
exports.default = router;
//# sourceMappingURL=supplier.routes.js.map