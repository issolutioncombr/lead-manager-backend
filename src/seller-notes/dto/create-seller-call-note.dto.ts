import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSellerCallNoteDto {
  @IsString()
  appointmentId!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @MinLength(1)
  content!: string;
}

