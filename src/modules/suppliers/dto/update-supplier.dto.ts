// src/modules/suppliers/dto/update-supplier.dto.ts
import {
    IsString, MaxLength, IsOptional, IsEmail, IsObject, ValidateNested, IsJSON, IsBoolean, IsNotEmpty
  } from 'class-validator';
  import { Type } from 'class-transformer';
  import { AddressDto } from './address.dto';
  
  export class UpdateSupplierDto {
    @IsString()
    @IsNotEmpty({ message: 'Supplier name cannot be empty if provided.' })
    @MaxLength(255)
    @IsOptional()
    name?: string;
  
    @IsString()
    @MaxLength(255)
    @IsOptional()
    contactName?: string;
  
    @IsEmail({}, { message: 'Please provide a valid email address.'})
    @MaxLength(255)
    @IsOptional()
    email?: string;
  
    @IsString()
    @MaxLength(50)
    @IsOptional()
    phone?: string;
  
    @IsObject()
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    address?: AddressDto;
  
    @IsString()
    @MaxLength(100)
    @IsOptional()
    paymentTerms?: string;
  
    @IsJSON({ message: 'Custom attributes must be a valid JSON string if provided.' })
    @IsOptional()
    customAttributes?: string | null; // Allow null to clear attributes
  
    @IsBoolean()
    @IsOptional()
    isActive?: boolean; // Allow activating/deactivating
  }
  