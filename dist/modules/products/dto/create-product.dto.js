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
exports.CreateProductDto = void 0;
// src/modules/products/dto/create-product.dto.ts
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const dimensions_dto_1 = require("./dimensions.dto"); // Import nested DTO
const client_1 = require("@prisma/client"); // Import enum from Prisma types
class CreateProductDto {
    constructor() {
        this.productType = client_1.ProductType.STANDARD;
        this.unitOfMeasure = 'each';
        this.isActive = true;
        this.isStockTracked = true;
        this.requiresSerialNumber = false;
        this.requiresLotTracking = false;
        this.requiresExpiryDate = false;
        this.taxable = true;
        // categoryIds: Handled separately if needed via relations or dedicated endpoints
    }
}
exports.CreateProductDto = CreateProductDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'SKU cannot be empty.' }),
    (0, class_validator_1.MaxLength)(100),
    (0, class_validator_1.Matches)(/^[a-zA-Z0-9_-]+$/, { message: 'SKU can only contain letters, numbers, underscores, and hyphens.' })
    // Consider forcing lowercase or uppercase via @Transform if needed
    ,
    __metadata("design:type", String)
], CreateProductDto.prototype, "sku", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Product name cannot be empty.' }),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], CreateProductDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateProductDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.ProductType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateProductDto.prototype, "productType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], CreateProductDto.prototype, "unitOfMeasure", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateProductDto.prototype, "brand", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateProductDto.prototype, "isActive", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateProductDto.prototype, "isStockTracked", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateProductDto.prototype, "requiresSerialNumber", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateProductDto.prototype, "requiresLotTracking", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateProductDto.prototype, "requiresExpiryDate", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Base price must be a number with up to 4 decimal places.' }),
    (0, class_validator_1.Min)(0, { message: 'Base price cannot be negative.' }),
    (0, class_transformer_1.Type)(() => Number) // Transform string input from JSON to number
    ,
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateProductDto.prototype, "basePrice", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Cost price must be a number with up to 4 decimal places.' }),
    (0, class_validator_1.Min)(0, { message: 'Cost price cannot be negative.' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateProductDto.prototype, "costPrice", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateProductDto.prototype, "taxable", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Weight must be a number.' }),
    (0, class_validator_1.Min)(0, { message: 'Weight cannot be negative.' }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateProductDto.prototype, "weight", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsLowercase)({ message: 'Weight unit must be lowercase (e.g., kg, lb).' }),
    (0, class_validator_1.Matches)(/^(kg|lb)$/, { message: 'Weight unit must be "kg" or "lb".' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateProductDto.prototype, "weightUnit", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)() // Validate the nested DimensionsDto object
    ,
    (0, class_transformer_1.Type)(() => dimensions_dto_1.DimensionsDto) // Tell class-transformer which class to use for the nested object
    ,
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", dimensions_dto_1.DimensionsDto)
], CreateProductDto.prototype, "dimensions", void 0);
__decorate([
    (0, class_validator_1.IsJSON)({ message: 'Custom attributes must be a valid JSON string.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateProductDto.prototype, "customAttributes", void 0);
//# sourceMappingURL=create-product.dto.js.map