import { PartialType } from '@nestjs/mapped-types';
import { LeadStage } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

import { CreateAppointmentDto } from './create-appointment.dto';

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {
  @IsOptional()
  @IsEnum(LeadStage)
  leadStage?: LeadStage;
}
