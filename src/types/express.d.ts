import type { Role } from "@prisma/client";

export interface AuthUser {
  userId: string;
  email: string;
  role?: Role;
  companyId?: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
