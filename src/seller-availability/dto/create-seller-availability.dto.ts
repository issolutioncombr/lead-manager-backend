import { WeekDay } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateSellerAvailabilityDto {
  @IsEnum(WeekDay)
  day!: WeekDay;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number | null;

  @Matches(TIME_REGEX, { message: 'startTime must be in HH:MM format' })
  startTime!: string;

  @Matches(TIME_REGEX, { message: 'endTime must be in HH:MM format' })
  endTime!: string;

  @IsOptional()
  @IsDateString()
  specificDate?: string | null;
}
