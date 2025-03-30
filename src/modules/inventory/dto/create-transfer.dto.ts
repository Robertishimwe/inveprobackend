// src/modules/inventory/dto/create-transfer.dto.ts
import { IsString, IsNotEmpty, IsUUID, IsOptional, IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TransferItemDto } from './transfer-item.dto';

export class CreateTransferDto {
    @IsUUID('4')
    @IsNotEmpty()
    sourceLocationId!: string;

    @IsUUID('4')
    @IsNotEmpty()
    destinationLocationId!: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => TransferItemDto)
    items!: TransferItemDto[];
}
