import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PhoneInstancesController } from './phone-instances.controller';
import { PhoneInstancesService } from './phone-instances.service';

@Module({
  imports: [PrismaModule],
  controllers: [PhoneInstancesController],
  providers: [PhoneInstancesService],
  exports: [PhoneInstancesService]
})
export class PhoneInstancesModule {}
