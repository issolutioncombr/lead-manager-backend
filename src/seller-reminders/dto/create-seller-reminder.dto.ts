import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSellerReminderDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsDateString()
  remindAt!: string;
}

