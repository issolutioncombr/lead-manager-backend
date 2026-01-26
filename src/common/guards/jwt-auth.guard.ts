import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TenantService } from '../services/tenant.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector, private readonly tenantService: TenantService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantHeader = request.headers['x-tenant-key'];
    const tenantKey = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
    const authHeader = request.headers['authorization'];
    const hasBearerAuth = !!(Array.isArray(authHeader) ? authHeader[0] : authHeader);

    if (tenantKey && !hasBearerAuth) {
      return this.tenantService.resolveByApiKey(tenantKey).then((tenant) => {
        request.user = {
          userId: tenant.userId,
          email: tenant.email
        };
        return true;
      });
    }

    return super.canActivate(context);
  }
}
