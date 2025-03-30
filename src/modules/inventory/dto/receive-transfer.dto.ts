// src/modules/inventory/dto/receive-transfer.dto.ts
import { IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ReceiveItemDto } from './receive-item.dto';

export class ReceiveTransferDto {
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ReceiveItemDto)
    items!: ReceiveItemDto[]; // Array of items being received in this action
}
