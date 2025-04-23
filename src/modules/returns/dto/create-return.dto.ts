// src/modules/returns/dto/create-return.dto.ts
import {
    IsString, IsNotEmpty, IsUUID, IsOptional, MaxLength, IsArray, ArrayNotEmpty, ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReturnItemInputDto } from './return-item-input.dto';
import { RefundPaymentInputDto } from './refund-payment-input.dto';
// Status is set internally, not by client on creation
export class CreateReturnDto {
    /** The ID of the original Order this return relates to. */
    @IsUUID('4')
    @IsNotEmpty({ message: 'Original Order ID is required.' })
    originalOrderId!: string;

    /** The ID of the Location where the return is being processed. */
    @IsUUID('4')
    @IsNotEmpty({ message: 'Processing Location ID is required.' })
    locationId!: string; // Usually the store/POS location

    /** Optional: The ID of the Customer making the return. */
    @IsUUID('4')
    @IsOptional()
    customerId?: string | null;

    /** Optional: Reason provided for the return. */
    @IsString()
    @MaxLength(500) // Limit reason length
    @IsOptional()
    reason?: string;

    /** Optional: General notes for the return. */
    @IsString()
    @IsOptional()
    notes?: string;

    /** Array of items being returned in this request. Must contain at least one. */
    @IsArray()
    @ArrayNotEmpty({ message: 'Return must include at least one item.' })
    @ValidateNested({ each: true })
    @Type(() => ReturnItemInputDto)
    items!: ReturnItemInputDto[];

    /**
     * Array detailing how the refund is being issued.
     * The sum of amounts should typically match the calculated refundable total.
     * Optional if the return doesn't involve an immediate refund (e.g., store credit issued later).
     */
    @IsArray()
    // @ArrayNotEmpty({ message: 'Refund payment details are required.' }) // Make optional? Depends on workflow
    @ValidateNested({ each: true })
    @Type(() => RefundPaymentInputDto)
    @IsOptional()
    refundPayments?: RefundPaymentInputDto[];

    /** Optional: ID of the POS session if return processed via POS */
    @IsUUID('4')
    @IsOptional()
    posSessionId?: string;

    // userId (processor), tenantId come from context
    // returnNumber, status, totalRefundAmount calculated/set by service
    // returnOrderId set if an exchange order is created
}
