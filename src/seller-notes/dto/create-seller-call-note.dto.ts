import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSellerCallNoteDto {
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(1)
  content!: string;
}
