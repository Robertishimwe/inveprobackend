// src/modules/pos/dto/cash-transaction.dto.ts
import { PosTransactionType } from '@prisma/client'; // Import the enum type directly
import {
    IsNumber,
    IsNotEmpty,
    Min,
    IsOptional,
    IsString,
    MaxLength,
    IsEnum,
    IsIn
} from 'class-validator';
import { Type } from 'class-transformer';

export class CashTransactionDto {
    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Amount must be a number.' })
    @Min(0.0001, { message: 'Amount must be positive.' })
    @IsNotEmpty({ message: 'Amount cannot be empty.'})
    @Type(() => Number)
    amount!: number;

    @IsEnum(PosTransactionType, { message: 'Invalid transaction type provided.' })
    @IsIn(
        [PosTransactionType.PAY_IN, PosTransactionType.PAY_OUT], // Check against specific enum *members*
        { message: 'Transaction type must be either PAY_IN or PAY_OUT for this operation.' }
    )
    @IsNotEmpty({ message: 'Transaction type is required.'})
    // --- FIX: Use the enum type for the annotation ---
    transactionType!: PosTransactionType;
    // -----------------------------------------------


    @IsString()
    @MaxLength(255)
    @IsOptional()
    notes?: string;

}
