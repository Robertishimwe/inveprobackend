// src/modules/orders/dto/create-order.dto.ts
import { OrderType, OrderStatus } from '@prisma/client'; // Import enums
import { IsString, IsNotEmpty, IsUUID, IsOptional, MaxLength, IsArray, ArrayNotEmpty, ValidateNested, IsEnum, IsObject, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './order-item.dto';
import { AddressDto } from '@/modules/customer/dto/address.dto'; // Reuse address DTO

export class CreateOrderDto {
    @IsUUID('4')
    @IsNotEmpty({ message: 'Location ID is required.'})
    locationId!: string; // Where the sale/fulfillment happens

    @IsUUID('4')
    @IsOptional() // Allow guest checkout
    customerId?: string | null;

    @IsEnum(OrderType)
    @IsOptional()
    orderType?: OrderType = OrderType.POS;

    // Initial status - might be determined by payment status or workflow
    @IsEnum(OrderStatus)
    @IsOptional()
    status?: OrderStatus = OrderStatus.PROCESSING; // Default to Processing, adjust as needed

    @IsString() @MaxLength(100) @IsOptional() posTerminalId?: string;

    @IsObject() @ValidateNested() @Type(() => AddressDto) @IsOptional()
    shippingAddress?: AddressDto | null;

    @IsString() @MaxLength(100) @IsOptional() shippingMethod?: string;
    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional() shippingCost?: number = 0;

    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional() discountAmount?: number = 0; // Order-level discount

    // Tax is typically calculated server-side based on location/items
    // @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional() taxAmount?: number;

    @IsString() @IsOptional() notes?: string;

    @IsArray()
    @ArrayNotEmpty({ message: 'Order must have at least one item.' })
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    items!: CreateOrderItemDto[];

    // userId (salesperson) comes from context (req.user)
    // tenantId comes from context
    // currencyCode usually determined by tenant/location settings
    // orderNumber generated server-side
    // subtotal, totalAmount calculated server-side
}