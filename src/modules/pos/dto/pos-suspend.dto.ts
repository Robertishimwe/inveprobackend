
import { IsUUID, IsOptional, IsArray, ArrayNotEmpty, ValidateNested, IsObject, IsNumber, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from '@/modules/orders/dto/order-item.dto';
import { AddressDto } from '@/modules/customer/dto/address.dto';

export class PosSuspendDto {
    @IsUUID('4')
    @IsOptional()
    customerId?: string | null;

    @IsArray()
    @ArrayNotEmpty({ message: 'Cart must contain at least one item.' })
    @ValidateNested({ each: true })
    @Type(() => CreateOrderItemDto)
    items!: CreateOrderItemDto[];

    @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number) @IsOptional()
    discountAmount?: number = 0;

    @IsObject() @ValidateNested() @Type(() => AddressDto) @IsOptional()
    shippingAddress?: AddressDto | null;

    @IsString() @IsOptional() notes?: string;
}
