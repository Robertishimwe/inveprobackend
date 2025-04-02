// src/modules/purchase-orders/dto/receive-po.dto.ts
import { IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ReceivePOItemDto } from './receive-po-item.dto'; // Ensure this import path is correct

/**
 * Data Transfer Object for receiving items against a Purchase Order.
 * Contains an array of items being received in this specific receiving action.
 */
export class ReceivePurchaseOrderDto {
    /**
     * An array detailing each item line being received.
     * Must contain at least one item.
     */
    @IsArray()
    @ArrayNotEmpty({ message: 'At least one item must be specified for receiving.'})
    @ValidateNested({ each: true }) // Validate each object in the array using ReceivePOItemDto rules
    @Type(() => ReceivePOItemDto) // Tell class-transformer to instantiate ReceivePOItemDto for validation
    items!: ReceivePOItemDto[]; // Definite assignment assertion
}