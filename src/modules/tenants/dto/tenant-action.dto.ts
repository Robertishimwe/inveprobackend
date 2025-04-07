// src/modules/tenants/dto/tenant-action.dto.ts (NEW - Optional)
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class TenantActionDto {
    @IsString()
    @MaxLength(500)
    @IsNotEmpty({ message: 'Note cannot be empty; provide reason for deactivation/suspension.' })
    notes!: string;
}