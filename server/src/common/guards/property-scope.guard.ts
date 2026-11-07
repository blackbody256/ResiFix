// Runs after JwtAuthGuard and RolesGuard (registered in that order in AuthModule).
// Attaches req.scope so handlers can only build queries for the caller's own property, and
// rejects any request whose :propertyId route param names a different property.
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { forbidden } from '../app-exception';
import { IS_PUBLIC } from '../decorators';
import { PropertyScope } from '../property-scope';

@Injectable()
export class PropertyScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const propertyId = req.user?.propertyId;
    if (!propertyId) throw forbidden('User is not attached to a property');

    const routeProperty = req.params?.propertyId;
    if (routeProperty && routeProperty !== propertyId) throw forbidden();

    req.scope = new PropertyScope(propertyId);
    return true;
  }
}
