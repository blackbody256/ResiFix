import type { User } from '@prisma/client';

/** What JwtAuthGuard puts on req.user. Loaded from the DB on every request. */
export type AuthUser = Pick<User, 'id' | 'propertyId' | 'phone' | 'name' | 'role'>;

export const AUTH_USER_SELECT = {
  id: true,
  propertyId: true,
  phone: true,
  name: true,
  role: true,
  isActive: true,
} as const;
