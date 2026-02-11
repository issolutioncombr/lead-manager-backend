import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSellerReminderDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsDateString()
  remindAt!: string;
}
