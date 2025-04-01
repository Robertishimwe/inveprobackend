import {
  IsString,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
} from "class-validator";

export class UpdateUserDto {
  @IsString()
  @IsNotEmpty({ message: "First name cannot be empty if provided." })
  @MaxLength(100)
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsNotEmpty({ message: "Last name cannot be empty if provided." })
  @MaxLength(100)
  @IsOptional()
  lastName?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  phoneNumber?: string;

  // *** REMOVED roleIds property ***

  @IsBoolean()
  @IsOptional()
  isActive?: boolean; // Allow updating active status
}

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
