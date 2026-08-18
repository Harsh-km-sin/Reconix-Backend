import type { Request } from "express";

export interface AuthUser {
  userId: string;
  email: string;
  roleId?: string;
  roleName?: string;
  companyId?: string;
  permissions: string[];
}

declare global {
  // Augmenting Express's Request is only expressible through the global
  // `Express` namespace; there is no module-syntax equivalent.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    export interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * A request that has passed through `authenticate`, so `user` is guaranteed
 * present. Controllers behind the auth middleware should type their handlers
 * with this instead of re-declaring it locally.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
