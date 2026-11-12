import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class PaymentAccountDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) branchId?: string;
  @IsIn(['BANK_TRANSFER', 'GCASH']) paymentMethod!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(150) bankName?: string;
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  accountName!: string;
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  accountNumber!: string;
  @IsOptional() @IsString() @MaxLength(1500000) qrCodeData?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  instructions?: string;
  @IsBoolean() isActive!: boolean;
  @IsBoolean() isDefault!: boolean;
}
export class PaymentPolicyDto {
  @IsInt() @Min(5) @Max(1440) holdMinutes!: number;
  @IsInt() @Min(5) @Max(10080) reviewMinutes!: number;
  @IsInt() @Min(0) @Max(1440) reminderMinutes!: number;
  @IsInt() @Min(1) @Max(100) depositPercent!: number;
}
export class PaymentProofDto {
  @IsUUID() paymentAccountId!: string;
  @Transform(trim)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,119}$/)
  transactionReference!: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  amount!: number;
  @IsDateString() paymentDateTime!: string;
  @IsIn(['image/jpeg', 'image/png', 'application/pdf']) mime!: string;
  @IsString() @MinLength(1) @MaxLength(150) fileName!: string;
  @IsString() @MinLength(4) @MaxLength(14000000) proofBase64!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) notes?: string;
}
export class PaymentDecisionDto {
  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 ._/-]{2,119}$/)
  refundReference?: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  verifiedAmount?: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(2000) notes!: string;
  @IsOptional() @IsBoolean() independentlyChecked?: boolean;
}
export class PaymentQueueDto {
  @IsOptional() @IsString() @MaxLength(100) branchId?: string;
  @IsOptional() @IsIn(['BANK_TRANSFER', 'GCASH']) method?: string;
  @IsOptional()
  @IsIn([
    'AWAITING_VERIFICATION',
    'VERIFIED',
    'REJECTED',
    'RESUBMISSION_REQUESTED',
    'REFUNDED',
  ])
  status?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
}
