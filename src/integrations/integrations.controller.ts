import { Body, Controller, Headers, Post } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { TenantService } from '../common/services/tenant.service';
import { GoogleFormsPayloadDto } from './dto/google-forms.dto';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly tenantService: TenantService
  ) {}

  @Public()
  @Post('forms/google')
  async syncGoogleForms(@Headers('x-tenant-key') tenantKey: string, @Body() dto: GoogleFormsPayloadDto) {
    const tenant = await this.tenantService.resolveByApiKey(tenantKey);
    return this.integrationsService.syncGoogleForms(tenant.userId, dto);
  }
}
