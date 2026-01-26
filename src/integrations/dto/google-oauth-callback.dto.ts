import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleOAuthCallbackDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  authuser?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsString()
  @IsNotEmpty()
  state!: string;
}
