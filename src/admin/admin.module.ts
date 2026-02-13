import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [AdminController]
})
export class AdminModule {}
