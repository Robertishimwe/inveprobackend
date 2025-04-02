import { IsString, IsOptional, MaxLength } from 'class-validator';

export class POActionDto {
    @IsString()
    @MaxLength(500) // Add a reasonable max length
    @IsOptional()
    notes?: string; // Optional notes for the action (e.g., cancellation reason, approval comments)
}
