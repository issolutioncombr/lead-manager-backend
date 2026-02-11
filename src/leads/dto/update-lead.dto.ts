import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

import { CreateLeadDto } from './create-lead.dto';

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  purchaseValue?: number;

  @IsOptional()
  @IsString()
  purchaseContentName?: string;
}
