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

export interface MFAVerifyBody {
  userId: string;
  token: string;
}

export interface MFASetupResponse {
  secret: string;
  qrCodeUrl: string;
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
  token?: string; // Optional if MFA is required
  user: { id: string; email: string; name: string | null };
  mfaRequired?: boolean;
  role?: Role;
  companyId?: string;
  /** All companies/roles for this user (for company switcher) */
  companies?: { companyId: string; companyName: string; role: Role }[];
}
