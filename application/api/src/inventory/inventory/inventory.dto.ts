import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export const INVENTORY_ITEM_TYPES = [
  'CONSUMABLE','EQUIPMENT','FURNITURE','TOOL','ASSET','SPARE_PART','OTHER',
] as const;
export const INVENTORY_TRACKING_METHODS = [
  'QUANTITY','SERIALIZED','BATCH','EXPIRATION','REUSABLE','RESERVABLE',
] as const;

export class InventoryListQueryDto {
  @IsOptional() @IsString() @Length(1, 100) branchId?: string;
  @IsOptional() @IsString() @Length(1, 100) categoryId?: string;
  @IsOptional() @IsString() @Length(1, 40) @IsIn([...INVENTORY_ITEM_TYPES]) itemType?: string;
  @IsOptional() @IsString() @Length(1, 20) @IsIn(['ACTIVE','INACTIVE','ARCHIVED','ALL']) status?: string;
  @IsOptional() @IsString() @Length(1, 200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 50;
}

export class CreateInventoryCategoryDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
}

export class UpdateInventoryCategoryDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string | null;
}

export class CreateInventoryItemDto {
  @IsString() @Length(1, 200) name!: string;
  @IsString() @Length(1, 100) sku!: string;
  @IsOptional() @IsString() @Length(0, 5000) description?: string;
  @IsString() @Length(1, 100) categoryId!: string;
  @IsString() @IsIn([...INVENTORY_ITEM_TYPES]) itemType!: typeof INVENTORY_ITEM_TYPES[number];
  @IsString() @IsIn([...INVENTORY_TRACKING_METHODS]) trackingMethod!: typeof INVENTORY_TRACKING_METHODS[number];
  @IsString() @Length(1, 50) unit!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) reorderThreshold!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) maximumStockThreshold?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) purchasePrice?: number | null;
  @IsString() @Length(1, 100) branchId!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) openingStock!: number;
}

export class UpdateInventoryItemDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() @Length(1, 100) sku?: string;
  @IsOptional() @IsString() @Length(0, 5000) description?: string | null;
  @IsOptional() @IsString() @Length(1, 100) categoryId?: string;
  @IsOptional() @IsString() @IsIn([...INVENTORY_ITEM_TYPES]) itemType?: typeof INVENTORY_ITEM_TYPES[number];
  @IsOptional() @IsString() @IsIn([...INVENTORY_TRACKING_METHODS]) trackingMethod?: typeof INVENTORY_TRACKING_METHODS[number];
  @IsOptional() @IsString() @Length(1, 50) unit?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) reorderThreshold?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) maximumStockThreshold?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) purchasePrice?: number | null;
  @IsOptional() @IsString() @IsIn(['ACTIVE','INACTIVE','ARCHIVED']) status?: string;
}

export class InventoryStockMovementDto {
  @IsString() @Length(1, 100) branchId!: string;
  @IsOptional() @IsString() @Length(0, 200) storageLocation?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) quantity!: number;
  @IsString() @Length(1, 1000) reason!: string;
}

export class InventoryMovementQueryDto {
  @IsOptional() @IsString() @Length(1, 100) branchId?: string;
  @IsOptional() @IsString() @Length(1, 100) itemId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 50;
}

export class RegisterInventoryBranchDto {
  @IsString() @Length(1, 100) branchId!: string;
  @IsOptional() @IsString() @Length(0, 200) storageLocation?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) openingStock = 0;
}
