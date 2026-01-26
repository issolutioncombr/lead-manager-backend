import { IsOptional, IsString } from 'class-validator';

export class PaypalOAuthCallbackDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsString()
  state!: string;
}

