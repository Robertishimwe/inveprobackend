// src/modules/returns/dto/update-return.dto.ts
import { ReturnStatus } from '@prisma/client';
import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';

export class UpdateReturnDto {
    @IsEnum(ReturnStatus)
    @IsOptional()
    status?: ReturnStatus;

    @IsString()
    @MaxLength(500)
    @IsOptional()
    notes?: string; // Add internal processing notes

    // Other fields are generally not updated after creation
}
