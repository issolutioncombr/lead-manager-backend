import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator';

const TRANSACTION_STATUSES = ['S', 'V', 'P', 'F', 'C', 'D'] as const;

export type PaypalTransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export class PaypalTransactionsQueryDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @IsIn(TRANSACTION_STATUSES)
  transactionStatus?: PaypalTransactionStatus;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}

