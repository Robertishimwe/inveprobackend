// src/modules/users/dto/create-user.dto.ts
import {
    IsEmail,
    IsNotEmpty,
    IsString,
    MinLength,
    MaxLength,
    IsOptional,
    IsArray,
    ArrayNotEmpty,
    IsUUID,
    Matches
  } from 'class-validator';
  
  export class CreateUserDto {
    @IsEmail({}, { message: 'Please provide a valid email address.' })
    @IsNotEmpty({ message: 'Email cannot be empty.' })
    @MaxLength(255)
    email!: string; // Definite assignment assertion
  
    @IsString()
    @IsNotEmpty({ message: 'Password cannot be empty.' })
    @MinLength(8, { message: 'Password must be at least 8 characters long.' })
    @MaxLength(100, { message: 'Password cannot be longer than 100 characters.' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
        message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).'
    })
    password!: string; // Definite assignment assertion
  
    @IsString()
    @IsNotEmpty({ message: 'First name cannot be empty.' })
    @MaxLength(100)
    firstName!: string; // Definite assignment assertion
  
    @IsString()
    @IsNotEmpty({ message: 'Last name cannot be empty.' })
    @MaxLength(100)
    lastName!: string; // Definite assignment assertion
  
    @IsString()
    @IsOptional()
    @MaxLength(50)
    phoneNumber?: string;
  
    // Roles are typically assigned via UUIDs in the request
    @IsArray()
    @ArrayNotEmpty({ message: 'At least one role must be assigned.'})
    @IsUUID('4', { each: true, message: 'Each role must be a valid UUID.' })
    roleIds!: string[]; // Array of Role UUIDs
  
    // tenantId is added by the service/context, not expected in request body
    // isActive defaults to true in the service/schema
  }