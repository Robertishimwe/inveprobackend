// src/modules/stock-counts/dto/review-item.dto.ts
import { StockCountItemStatus } from '@prisma/client';
import { IsNotEmpty, IsUUID, IsOptional, IsString, IsIn } from 'class-validator';

// DTO for a single item review action
export class ReviewItemDto {
    @IsUUID('4')
    @IsNotEmpty()
    stockCountItemId!: string; // The ID of the specific line item being reviewed

    // Allowed actions during review
    @IsIn([StockCountItemStatus.APPROVED, StockCountItemStatus.RECOUNT_REQUESTED, StockCountItemStatus.SKIPPED], {
        message: 'Review action must be APPROVED, RECOUNT_REQUESTED, or SKIPPED.'
    })
    @IsNotEmpty({ message: 'Review action is required.'})
    // action!: StockCountItemStatus.APPROVED | StockCountItemStatus.RECOUNT_REQUESTED | StockCountItemStatus.SKIPPED;
    action!: StockCountItemStatus;


    @IsString()
    @IsOptional()
    notes?: string; // Reviewer's notes
}
