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
exports.UpdateLocationDto = void 0;
// src/modules/locations/dto/update-location.dto.ts
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const create_location_dto_1 = require("./create-location.dto"); // Reuse AddressDto
class UpdateLocationDto {
}
exports.UpdateLocationDto = UpdateLocationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Location name cannot be empty if provided.' }),
    (0, class_validator_1.MaxLength)(255),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLocationDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(client_1.LocationType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLocationDto.prototype, "locationType", void 0);
__decorate([
    (0, class_validator_1.IsUUID)('4', { message: 'Parent location ID must be a valid UUID.' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], UpdateLocationDto.prototype, "parentLocationId", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => create_location_dto_1.AddressDto),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", create_location_dto_1.AddressDto)
], UpdateLocationDto.prototype, "address", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdateLocationDto.prototype, "isActive", void 0);
//# sourceMappingURL=update-location.dto.js.map