import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSellerReminderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string | null;

  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
