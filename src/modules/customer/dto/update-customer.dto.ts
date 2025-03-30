// src/modules/customers/dto/update-customer.dto.ts
import { IsString, MaxLength, IsOptional, IsObject, ValidateNested, IsJSON, IsUUID, IsBoolean, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto } from './address.dto';

export class UpdateCustomerDto {
    // Email update typically requires verification - often excluded from general update
    // @IsEmail({}, { message: 'Please provide a valid email address.'})
    // @MaxLength(255)
    // @IsOptional()
    // email?: string;

    @IsString() @MaxLength(100) @IsOptional() firstName?: string;
    @IsString() @MaxLength(100) @IsOptional() lastName?: string;
    @IsString() @MaxLength(255) @IsOptional() companyName?: string;
    @IsString() @MaxLength(50) @IsOptional() phone?: string;

    @IsUUID('4') @IsOptional() customerGroupId?: string | null; // Allow changing/unsetting group

    @IsObject() @ValidateNested() @Type(() => AddressDto) @IsOptional() defaultBillingAddress?: AddressDto | null; // Allow clearing address
    @IsObject() @ValidateNested() @Type(() => AddressDto) @IsOptional() defaultShippingAddress?: AddressDto | null; // Allow clearing address

    @IsBoolean() @IsOptional() taxExempt?: boolean;
    @IsString() @IsOptional() notes?: string;
    @IsJSON({ message: 'Custom attributes must be a valid JSON string if provided.' }) @IsOptional() customAttributes?: string | null; // Allow clearing

    @IsInt() @Min(0) @IsOptional() loyaltyPoints?: number;
    @IsBoolean() @IsOptional() isActive?: boolean; // Allow activating/deactivating
}
