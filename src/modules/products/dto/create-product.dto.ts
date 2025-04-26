// src/modules/products/dto/create-product.dto.ts
import {
    IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, Min, IsObject, IsArray,IsUUID,
    ValidateNested, IsEnum, MaxLength, IsJSON, Matches, IsLowercase
  } from 'class-validator';
  import { Type } from 'class-transformer';
  import { DimensionsDto } from './dimensions.dto'; // Import nested DTO
  import { ProductType } from '@prisma/client'; // Import enum from Prisma types
  
  export class CreateProductDto {
    @IsString()
    @IsNotEmpty({ message: 'SKU cannot be empty.' })
    @MaxLength(100)
    @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'SKU can only contain letters, numbers, underscores, and hyphens.'})
    // Consider forcing lowercase or uppercase via @Transform if needed
    sku!: string;
  
    @IsString()
    @IsNotEmpty({ message: 'Product name cannot be empty.' })
    @MaxLength(255)
    name!: string;
  
    @IsString()
    @IsOptional()
    description?: string;
  
    @IsEnum(ProductType)
    @IsOptional()
    productType?: ProductType = ProductType.STANDARD;
  
    @IsString()
    @IsOptional()
    @MaxLength(50)
    unitOfMeasure?: string = 'each';
  
    @IsString()
    @IsOptional()
    @MaxLength(100)
    brand?: string;

    @IsArray()
    @IsUUID('4', { each: true, message: 'Each category ID must be a valid UUID.' })
    @IsOptional() // Categories might be assigned later
    categoryIds?: string[];
  
    @IsBoolean()
    @IsOptional()
    isActive?: boolean = true;
  
    @IsBoolean()
    @IsOptional()
    isStockTracked?: boolean = true;
  
    @IsBoolean()
    @IsOptional()
    requiresSerialNumber?: boolean = false;
  
    @IsBoolean()
    @IsOptional()
    requiresLotTracking?: boolean = false;
  
    @IsBoolean()
    @IsOptional()
    requiresExpiryDate?: boolean = false;
  
    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Base price must be a number with up to 4 decimal places.'})
    @Min(0, { message: 'Base price cannot be negative.' })
    @Type(() => Number) // Transform string input from JSON to number
    @IsOptional()
    basePrice?: number;
  
    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Cost price must be a number with up to 4 decimal places.'})
    @Min(0, { message: 'Cost price cannot be negative.' })
    @Type(() => Number)
    @IsOptional()
    costPrice?: number;
  
    @IsBoolean()
    @IsOptional()
    taxable?: boolean = true;
  
    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Weight must be a number.' })
    @Min(0, { message: 'Weight cannot be negative.' })
    @Type(() => Number)
    @IsOptional()
    weight?: number;
  
    // Use lowercase "in" or "kg" for consistency? Or create enum?
    @IsString()
    @IsLowercase({message: 'Weight unit must be lowercase (e.g., kg, lb).'})
    @Matches(/^(kg|lb)$/, { message: 'Weight unit must be "kg" or "lb".'})
    @IsOptional()
    weightUnit?: string; // 'kg' or 'lb'
  
    @IsObject()
    @ValidateNested() // Validate the nested DimensionsDto object
    @Type(() => DimensionsDto) // Tell class-transformer which class to use for the nested object
    @IsOptional()
    dimensions?: DimensionsDto;
  
    @IsJSON({ message: 'Custom attributes must be a valid JSON string.' })
    @IsOptional()
    customAttributes?: string; // Expecting a JSON string from the client
  
    // categoryIds: Handled separately if needed via relations or dedicated endpoints
  }
