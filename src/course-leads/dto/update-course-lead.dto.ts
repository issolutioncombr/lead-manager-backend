import { PartialType } from '@nestjs/mapped-types';

import { CreateCourseLeadDto } from './create-course-lead.dto';

export class UpdateCourseLeadDto extends PartialType(CreateCourseLeadDto) {}
