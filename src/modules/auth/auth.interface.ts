import type { Role } from "@prisma/client";

export type { Role };

export interface LoginBody {
  email: string;
  password: string;
}

export interface SetPasswordBody {
  token: string;
  password: string;
}

/** JWT payload; includes role and permissions for access control */
export interface AuthTokenPayload {
  userId: string;
  email: string;
  role?: Role;
  companyId?: string;
  permissions: string[];
}

/** Auth response: permissions are only in the JWT claims, not duplicated in body */
export interface AuthResponse {
  token: string;
  user: { id: string; email: string; name: string | null };
  role?: Role;
  companyId?: string;
  /** All companies/roles for this user (for company switcher) */
  companies?: { companyId: string; companyName: string; role: Role }[];
}
