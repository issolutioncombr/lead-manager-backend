import { IsOptional, IsString } from 'class-validator';

import { ListSellerRemindersDto } from './list-seller-reminders.dto';

export class ListSellerRemindersOverviewDto extends ListSellerRemindersDto {
  @IsOptional()
  @IsString()
  sellerId?: string;
}

