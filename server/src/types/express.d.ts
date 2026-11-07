import type { AuthUser } from '../auth/auth-user';
import type { PropertyScope } from '../common/property-scope';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: AuthUser;
      scope?: PropertyScope;
    }
  }
}

export {};
