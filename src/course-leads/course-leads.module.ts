import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CourseLeadsController } from './course-leads.controller';
import { CourseLeadsRepository } from './course-leads.repository';
import { CourseLeadsService } from './course-leads.service';

@Module({
  imports: [PrismaModule],
  controllers: [CourseLeadsController],
  providers: [CourseLeadsService, CourseLeadsRepository],
  exports: [CourseLeadsService]
})
export class CourseLeadsModule {}
