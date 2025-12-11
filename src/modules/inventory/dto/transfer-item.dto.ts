// src/modules/inventory/dto/transfer-item.dto.ts
import { IsNotEmpty, IsUUID, IsNumber, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class TransferItemDto {
    @IsUUID('4')
    @IsNotEmpty()
    productId!: string;

    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0.0001) // Must request at least something
    @IsNotEmpty()
    @Type(() => Number)
    quantityRequested!: number;

    @IsUUID('4')
    @IsOptional()
    uomId?: string;

    // Lot/Serial selection might happen during 'ship' phase, not creation
}
