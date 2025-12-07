import { IsString, MaxLength, IsOptional, IsEmail, IsObject, ValidateNested, IsJSON, IsUUID, IsBoolean, IsInt, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto } from './address.dto';

export class CreateCustomerDto {
    @ValidateIf(o => o.email !== undefined && o.email !== null && o.email !== '')
    @IsEmail({}, { message: 'Please provide a valid email address.' })
    @MaxLength(255)
    @IsOptional() // Email might be optional depending on business requirements
    email?: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    firstName?: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    lastName?: string;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    companyName?: string;

    // Require at least one identifying piece of info (e.g., email or phone or name) - custom validation might be needed
    @IsString()
    @MaxLength(50)
    @IsOptional()
    phone?: string;

    @IsUUID('4')
    @IsOptional()
    customerGroupId?: string | null;

    @IsObject()
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    defaultBillingAddress?: AddressDto;

    @IsObject()
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    defaultShippingAddress?: AddressDto;

    @IsBoolean()
    @IsOptional()
    taxExempt?: boolean = false;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsJSON({ message: 'Custom attributes must be a valid JSON string.' })
    @IsOptional()
    customAttributes?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    loyaltyPoints?: number = 0; // Default loyalty points

    // tenantId added by service
}