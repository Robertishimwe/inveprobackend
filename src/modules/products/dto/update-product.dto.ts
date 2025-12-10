// src/modules/products/dto/update-product.dto.ts
import {
  IsString, IsOptional, IsBoolean, IsNumber, Min, IsObject, IsArray, IsUUID,
  ValidateNested, IsEnum, MaxLength, IsJSON, Matches, IsLowercase, IsNotEmpty
} from 'class-validator';
import { Type } from 'class-transformer';
import { DimensionsDto } from './dimensions.dto';
import { ProductType } from '@prisma/client';

// Note: Does NOT allow updating SKU. Use a dedicated process for SKU changes if ever needed.
export class UpdateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Product name cannot be empty if provided.' })
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  unitOfMeasure?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  brand?: string;

  @IsArray()
  @IsUUID('4', { each: true, message: 'Each category ID must be a valid UUID.' })
  @IsOptional() // Categories might be assigned later
  categoryIds?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isStockTracked?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresSerialNumber?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresLotTracking?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresExpiryDate?: boolean;

  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional()
  basePrice?: number;

  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional()
  costPrice?: number;

  @IsBoolean()
  @IsOptional()
  taxable?: boolean;

  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional()
  weight?: number;

  @IsString() @IsLowercase() @Matches(/^(kg|lb)$/) @IsOptional()
  weightUnit?: string;

  @IsObject() @ValidateNested() @Type(() => DimensionsDto) @IsOptional()
  dimensions?: DimensionsDto;

  @IsJSON({ message: 'Custom attributes must be a valid JSON string if provided.' })
  @IsOptional()
  customAttributes?: string; // Still expecting JSON string for updates

  @IsString()
  @IsOptional()
  imageUrl?: string;
}
