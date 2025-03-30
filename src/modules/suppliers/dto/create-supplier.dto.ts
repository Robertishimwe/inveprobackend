// src/modules/suppliers/dto/create-supplier.dto.ts
import {
    IsString, IsNotEmpty, MaxLength, IsOptional, IsEmail, IsObject, ValidateNested, IsJSON
  } from 'class-validator';
  import { Type } from 'class-transformer';
  import { AddressDto } from './address.dto';
  
  export class CreateSupplierDto {
    @IsString()
    @IsNotEmpty({ message: 'Supplier name cannot be empty.' })
    @MaxLength(255)
    name!: string;
  
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
  
    @IsJSON({ message: 'Custom attributes must be a valid JSON string.' })
    @IsOptional()
    customAttributes?: string; // Expecting JSON string
  
    // tenantId comes from context
    // isActive defaults true
  }
  