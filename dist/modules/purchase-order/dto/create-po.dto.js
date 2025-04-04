"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePurchaseOrderDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const po_item_dto_1 = require("./po-item.dto");
class CreatePurchaseOrderDto {
    constructor() {
        this.shippingCost = 0;
        // Totals (subtotal, taxAmount, totalAmount) are calculated server-side
    }
}
exports.CreatePurchaseOrderDto = CreatePurchaseOrderDto;
__decorate([
    (0, class_validator_1.IsUUID)('4', { message: 'Supplier ID must be a valid UUID.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Supplier ID is required.' }),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "supplierId", void 0);
__decorate([
    (0, class_validator_1.IsUUID)('4', { message: 'Location ID must be a valid UUID.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Delivery Location ID is required.' }),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "locationId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "poNumber", void 0);
__decorate([
    (0, class_validator_1.IsDateString)({}, { message: 'Expected delivery date must be a valid date string (ISO 8601 format) or null.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreatePurchaseOrderDto.prototype, "expectedDeliveryDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Shipping cost must be a number.' }),
    (0, class_validator_1.Min)(0, { message: 'Shipping cost cannot be negative.' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatePurchaseOrderDto.prototype, "shippingCost", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)({ message: 'Purchase order must have at least one item.' }),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => po_item_dto_1.CreatePOItemDto),
    __metadata("design:type", Array)
], CreatePurchaseOrderDto.prototype, "items", void 0);
//# sourceMappingURL=create-po.dto.js.map