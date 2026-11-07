// Global guard. Enforces @Roles(...) on a handler or controller (handler wins).
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../../common/app-exception';
import { ROLES } from '../../common/decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;

    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user) throw unauthorized();
    if (!roles.includes(user.role)) throw forbidden(`Requires role: ${roles.join(' or ')}`);
    return true;
  }
}
