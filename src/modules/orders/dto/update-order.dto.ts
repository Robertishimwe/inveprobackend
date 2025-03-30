// src/modules/orders/dto/update-order.dto.ts
// Primarily used for status updates or adding tracking info
import { OrderStatus } from '@prisma/client';
import { IsString, MaxLength, IsOptional, IsEnum, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AddressDto } from '@/modules/customer/dto/address.dto'; // Reuse address DTO

export class UpdateOrderDto {
    @IsEnum(OrderStatus)
    @IsOptional()
    status?: OrderStatus;

    @IsObject() @ValidateNested() @Type(() => AddressDto) @IsOptional()
    shippingAddress?: AddressDto | null;

    @IsString() @MaxLength(100) @IsOptional() shippingMethod?: string;
    @IsString() @MaxLength(100) @IsOptional() trackingNumber?: string;
    @IsString() @IsOptional() notes?: string;

    // Other fields like items, customer, amounts are generally not updated via a simple PATCH.
    // Returns/exchanges would use separate flows/endpoints.
}
