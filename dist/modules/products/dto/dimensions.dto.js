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
exports.DimensionsDto = exports.DimensionUnit = void 0;
// src/modules/products/dto/dimensions.dto.ts
const class_validator_1 = require("class-validator");
// Optional: Define allowed dimension units
var DimensionUnit;
(function (DimensionUnit) {
    DimensionUnit["CM"] = "cm";
    DimensionUnit["IN"] = "in";
    DimensionUnit["MM"] = "mm";
    DimensionUnit["M"] = "m";
})(DimensionUnit || (exports.DimensionUnit = DimensionUnit = {}));
class DimensionsDto {
}
exports.DimensionsDto = DimensionsDto;
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Length must be a number.' }),
    (0, class_validator_1.Min)(0, { message: 'Length cannot be negative.' }),
    (0, class_validator_1.IsOptional)() // Make dimensions optional overall
    ,
    __metadata("design:type", Number)
], DimensionsDto.prototype, "length", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Width must be a number.' }),
    (0, class_validator_1.Min)(0, { message: 'Width cannot be negative.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], DimensionsDto.prototype, "width", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({ maxDecimalPlaces: 4 }, { message: 'Height must be a number.' }),
    (0, class_validator_1.Min)(0, { message: 'Height cannot be negative.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], DimensionsDto.prototype, "height", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(DimensionUnit, { message: 'Invalid dimension unit provided.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Dimension unit cannot be empty if dimensions are provided.' })
    // Custom validation might be needed here to make unit required ONLY if length/width/height are present
    // For simplicity with class-validator, we make unit optional but validated if present.
    // Logic in service can enforce unit presence if dimensions are set.
    ,
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], DimensionsDto.prototype, "unit", void 0);
//# sourceMappingURL=dimensions.dto.js.map