import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { TenantService } from './services/tenant.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TenantService],
  exports: [TenantService]
})
export class CommonModule {}
