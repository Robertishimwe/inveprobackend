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
exports.UpdateUserDto = void 0;
const class_validator_1 = require("class-validator");
class UpdateUserDto {
}
exports.UpdateUserDto = UpdateUserDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: "First name cannot be empty if provided." }),
    (0, class_validator_1.MaxLength)(100),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "firstName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: "Last name cannot be empty if provided." }),
    (0, class_validator_1.MaxLength)(100),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "lastName", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "phoneNumber", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], UpdateUserDto.prototype, "isActive", void 0);
// // src/modules/users/dto/update-user.dto.ts
// import {
//     IsString,
//     MaxLength,
//     IsOptional,
//     IsArray,
//     ArrayNotEmpty,
//     IsUUID,
//     IsBoolean,
//     IsNotEmpty
//   } from 'class-validator';
//   // import { PartialType } from '@nestjs/mapped-types'; // Can use this if installed
//   // import { CreateUserDto } from './create-user.dto';
//   // export class UpdateUserDto extends PartialType(CreateUserDto) {
//   //   // Password and email changes should likely have dedicated endpoints/flows
//   //   // Exclude them here if using PartialType, or define manually:
//   // }
//   // Manual definition for more control:
//   export class UpdateUserDto {
//     @IsString()
//     @IsNotEmpty({ message: 'First name cannot be empty if provided.' })
//     @MaxLength(100)
//     @IsOptional() // Make all fields optional for update
//     firstName?: string;
//     @IsString()
//     @IsNotEmpty({ message: 'Last name cannot be empty if provided.' })
//     @MaxLength(100)
//     @IsOptional()
//     lastName?: string;
//     @IsString()
//     @MaxLength(50)
//     @IsOptional()
//     phoneNumber?: string;
//     // Optionally allow updating roles (requires specific permission check in controller/service)
//     @IsArray()
//     @ArrayNotEmpty({ message: 'Roles array cannot be empty if provided.'})
//     @IsUUID('4', { each: true, message: 'Each role must be a valid UUID.' })
//     @IsOptional()
//     roleIds?: string[]; // Array of Role UUIDs to *set* for the user
//     // Optionally allow updating active status (requires specific permission)
//     @IsBoolean()
//     @IsOptional()
//     isActive?: boolean;
//     // Excluded fields not typically updatable via a general profile update:
//     // - email: Changing primary identifier is complex. Requires dedicated flow.
//     // - password: Requires current password verification and dedicated endpoint.
//     // - tenantId: Cannot be changed.
//   }
//# sourceMappingURL=update-user.dto.js.map