// src/modules/customer-groups/dto/update-customer-group.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class UpdateCustomerGroupDto {
    @IsString()
    @IsNotEmpty({ message: 'Group name cannot be empty if provided.' })
    @MaxLength(100)
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;
}
