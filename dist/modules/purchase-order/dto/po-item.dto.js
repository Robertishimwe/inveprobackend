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
exports.CreatePOItemDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class CreatePOItemDto {
    constructor() {
        this.taxRate = 0; // Optional input, default 0
        // taxAmount and lineTotal are calculated in the service
    }
}
exports.CreatePOItemDto = CreatePOItemDto;
__decorate([
    (0, class_validator_1.IsUUID)('4', { message: 'Product ID must be a valid UUID.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Product ID is required.' }),
    __metadata("design:type", String)
], CreatePOItemDto.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Quantity must be a number.' }),
    (0, class_validator_1.Min)(0.0001, { message: 'Quantity ordered must be positive.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Quantity ordered is required.' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], CreatePOItemDto.prototype, "quantityOrdered", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Unit cost must be a number.' }),
    (0, class_validator_1.Min)(0, { message: 'Unit cost cannot be negative.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Unit cost is required.' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], CreatePOItemDto.prototype, "unitCost", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreatePOItemDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Tax rate must be a number.' }),
    (0, class_validator_1.Min)(0, { message: 'Tax rate cannot be negative.' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreatePOItemDto.prototype, "taxRate", void 0);
//# sourceMappingURL=po-item.dto.js.map