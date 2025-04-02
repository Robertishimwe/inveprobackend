import { IsString, IsOptional, IsDateString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePurchaseOrderDto {
    @IsDateString({}, { message: 'Expected delivery date must be a valid date string (ISO 8601 format) or null.'})
    @IsOptional()
    expectedDeliveryDate?: string | null;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Shipping cost must be a number.'})
    @Min(0, { message: 'Shipping cost cannot be negative.'})
    @Type(() => Number)
    @IsOptional()
    shippingCost?: number; // Only editable in DRAFT status (enforced by service)

    // Status is updated via dedicated action endpoints
}
