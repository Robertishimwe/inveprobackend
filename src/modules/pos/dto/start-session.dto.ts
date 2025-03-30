// src/modules/pos/dto/start-session.dto.ts
import { IsNumber, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StartSessionDto {
    @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Starting cash must be a number.' })
    @Min(0, { message: 'Starting cash cannot be negative.' })
    @IsNotEmpty({ message: 'Starting cash amount is required.' })
    @Type(() => Number) // Ensure transformation if needed
    startingCash!: number;

    // locationId, posTerminalId, userId will come from context/request path/auth
}
