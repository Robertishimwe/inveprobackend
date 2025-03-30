// src/modules/inventory/dto/receive-item.dto.ts
// Used for the receive endpoint payload
import { IsNotEmpty, IsString, IsUUID, IsNumber, Min, IsOptional, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveItemDto {
    @IsUUID('4')
    @IsNotEmpty()
    productId!: string; // Identify which product line is being received

    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0.0001) // Must receive at least something
    @IsNotEmpty()
    @Type(() => Number)
    quantityReceived!: number;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    lotNumber?: string; // Specify lot if applicable

    @IsString()
    @MaxLength(255)
    @IsOptional()
    serialNumber?: string; // Specify serial if applicable

    // Add expiryDate if needed
}
