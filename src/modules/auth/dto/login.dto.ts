// src/modules/auth/dto/login.dto.ts
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @IsNotEmpty({ message: 'Email cannot be empty.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password cannot be empty.' })
  @MinLength(6, { message: 'Password must be at least 6 characters long.' }) // Adjust min length as needed
  password!: string;

  // Optional: Include tenant identifier if login needs to be explicitly scoped upfront
  // (e.g., if emails are NOT unique across tenants). If email is unique globally,
  // we can derive the tenant from the found user.
  // @IsString()
  // @IsOptional()
  // tenantIdentifier?: string; // e.g., subdomain or explicit ID
}