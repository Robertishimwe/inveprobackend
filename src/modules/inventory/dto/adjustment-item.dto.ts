// src/modules/inventory/dto/adjustment-item.dto.ts
import { IsNotEmpty, IsString, IsUUID, IsNumber, IsOptional, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AdjustmentItemDto {
    @IsUUID('4')
    @IsNotEmpty()
    productId!: string;

    @IsNumber({ maxDecimalPlaces: 4 })
    @IsNotEmpty()
    @Type(() => Number)
    quantityChange!: number; // Can be positive or negative

    @IsNumber({ maxDecimalPlaces: 4 })
    @IsOptional()
    @Type(() => Number)
    unitCost?: number; // Optional: For valuation adjustments

    @IsString()
    @MaxLength(100)
    @IsOptional()
    lotNumber?: string;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    serialNumber?: string;
}
