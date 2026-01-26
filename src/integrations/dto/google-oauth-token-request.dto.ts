import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class GoogleOAuthTokenRequestDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  forceRefresh?: boolean;
}
