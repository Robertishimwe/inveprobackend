// src/modules/inventory/dto/create-adjustment.dto.ts
import { IsString, IsNotEmpty, IsUUID, IsOptional, MaxLength, IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AdjustmentItemDto } from './adjustment-item.dto';

export class CreateAdjustmentDto {
    @IsUUID('4')
    @IsNotEmpty()
    locationId!: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    reasonCode?: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => AdjustmentItemDto)
    items!: AdjustmentItemDto[];
}
