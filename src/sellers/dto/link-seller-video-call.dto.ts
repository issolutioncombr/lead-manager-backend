import { IsDateString, IsOptional, IsString } from 'class-validator';

export class LinkSellerVideoCallDto {
  @IsOptional()
  @IsString()
  appointmentId?: string | null;

  @IsOptional()
  @IsString()
  leadId?: string | null;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

