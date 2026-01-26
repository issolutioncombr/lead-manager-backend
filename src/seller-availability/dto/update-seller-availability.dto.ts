import { PartialType } from '@nestjs/mapped-types';

import { CreateSellerAvailabilityDto } from './create-seller-availability.dto';

export class UpdateSellerAvailabilityDto extends PartialType(CreateSellerAvailabilityDto) {}
