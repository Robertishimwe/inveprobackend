import { IsNumber, IsOptional, Min } from 'class-validator';

/**
 * DTO for updating an inventory item's reorder settings.
 * Only reorderPoint and reorderQuantity can be updated directly.
 * Other fields like quantityOnHand are modified through transactions.
 */
export class UpdateInventoryItemDto {
    @IsOptional()
    @IsNumber()
    @Min(0)
    reorderPoint?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    reorderQuantity?: number;
}
