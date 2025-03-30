// src/modules/products/dto/dimensions.dto.ts
import { IsNumber, Min, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

// Optional: Define allowed dimension units
export enum DimensionUnit {
    CM = 'cm',
    IN = 'in',
    MM = 'mm',
    M = 'm',
}

export class DimensionsDto {
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Length must be a number.' })
  @Min(0, { message: 'Length cannot be negative.' })
  @IsOptional() // Make dimensions optional overall
  length?: number;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Width must be a number.' })
  @Min(0, { message: 'Width cannot be negative.' })
  @IsOptional()
  width?: number;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Height must be a number.' })
  @Min(0, { message: 'Height cannot be negative.' })
  @IsOptional()
  height?: number;

  // Require unit only if any dimension is provided
  @IsEnum(DimensionUnit, { message: 'Invalid dimension unit provided.' })
  @IsNotEmpty({ message: 'Dimension unit cannot be empty if dimensions are provided.' })
  // Custom validation might be needed here to make unit required ONLY if length/width/height are present
  // For simplicity with class-validator, we make unit optional but validated if present.
  // Logic in service can enforce unit presence if dimensions are set.
  @IsOptional()
  unit?: DimensionUnit;
}
