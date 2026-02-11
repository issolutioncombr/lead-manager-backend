import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class LeadsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsString()
  @IsIn(['instagram', 'facebook', 'indicacao', 'site', 'whatsapp'])
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  source?: 'instagram' | 'facebook' | 'indicacao' | 'site' | 'whatsapp';

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  includeLastMessage?: boolean;
}
