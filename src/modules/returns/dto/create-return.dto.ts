// src/modules/returns/dto/create-return.dto.ts
import { IsString, IsUUID, IsOptional, MaxLength, IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ReturnItemDto } from './return-item.dto';
import { ReturnPaymentDto } from './return-payment.dto';

// Main DTO for creating a return request/transaction
export class CreateReturnDto {
    @IsUUID('4', { message: 'Original Order ID must be a valid UUID if provided.'})
    @IsOptional() // Optional for blind returns
    originalOrderId?: string;

    @IsUUID('4', { message: 'Customer ID must be a valid UUID if provided.'})
    @IsOptional() // Optional: Link customer if known (especially for blind returns)
    customerId?: string | null;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    reason?: string; // Return reason

    @IsString()
    @IsOptional()
    notes?: string; // Additional internal notes

    // Items being returned
    @IsArray()
    @ArrayNotEmpty({ message: 'Return must include at least one item.'})
    @ValidateNested({ each: true })
    @Type(() => ReturnItemDto)
    items!: ReturnItemDto[];

    // How the refund is being issued
    @IsArray()
    @ArrayNotEmpty({ message: 'At least one refund payment method is required.'})
    @ValidateNested({ each: true })
    @Type(() => ReturnPaymentDto)
    refundPayments!: ReturnPaymentDto[];

    // --- Contextual Info (added by controller/service) ---
    // locationId: string; // Where return is processed
    // userId: string; // Who processed it
    // posSessionId?: string | null; // Optional link to POS session
}
