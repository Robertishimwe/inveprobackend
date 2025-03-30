// src/modules/customer-groups/dto/create-customer-group.dto.ts
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateCustomerGroupDto {
    @IsString()
    @IsNotEmpty({ message: 'Group name cannot be empty.' })
    @MaxLength(100)
    name!: string;

    @IsString()
    @IsOptional()
    description?: string;
    // tenantId is added by service/context
}
