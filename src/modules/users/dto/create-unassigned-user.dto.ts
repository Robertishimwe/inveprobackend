// src/modules/users/dto/create-unassigned-user.dto.ts
import {
    IsEmail,
    IsNotEmpty,
    IsString,
    MinLength,
    MaxLength,
    IsOptional,
    Matches
  } from 'class-validator';
  
  // DTO specifically for Super Admin creating a user NOT initially assigned to a tenant
  export class CreateUnassignedUserDto {
    @IsEmail({}, { message: 'Please provide a valid email address.' })
    @IsNotEmpty({ message: 'Email cannot be empty.' })
    @MaxLength(255)
    email!: string;
  
    @IsString()
    @IsNotEmpty({ message: 'Password cannot be empty.' })
    @MinLength(8, { message: 'Password must be at least 8 characters long.' })
    @MaxLength(100, { message: 'Password cannot be longer than 100 characters.' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
        message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).'
    })
    password!: string;
  
    @IsString()
    @IsNotEmpty({ message: 'First name cannot be empty.' })
    @MaxLength(100)
    firstName!: string;
  
    @IsString()
    @IsNotEmpty({ message: 'Last name cannot be empty.' })
    @MaxLength(100)
    lastName!: string;
  
    @IsString()
    @IsOptional()
    @MaxLength(50)
    phoneNumber?: string;
  
    // No roleIds or tenantId here
    // isActive defaults true in service
  }
  