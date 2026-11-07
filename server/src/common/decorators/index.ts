import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Request } from 'express';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Skip JWT auth (and property scoping) for this route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only these roles may call the route/controller. Checked by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** The authenticated user (loaded from the DB by JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request>().user!,
);

/** The caller's PropertyScope (attached by PropertyScopeGuard). */
export const Scope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request>().scope!,
);
