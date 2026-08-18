export interface LoginBody {
  email: string;
  password: string;
}

export interface SetPasswordBody {
  token: string;
  password: string;
}

export interface MFAVerifyBody {
  /** Short-lived pending token issued by /auth/login after the password check. */
  mfaToken: string;
  /** The 6-digit TOTP code from the user's authenticator app. */
  token: string;
}

export interface MFASetupResponse {
  secret: string;
  qrCodeUrl: string;
}

/** JWT payload; includes role identity and resolved permissions for access control */
export interface AuthTokenPayload {
  userId: string;
  email: string;
  roleId?: string;
  roleName?: string;
  companyId?: string;
  permissions: string[];
}

/** Auth response: permissions are only in the JWT claims, not duplicated in body */
export interface AuthResponse {
  token?: string; // Optional if MFA is required
  user: { id: string; email: string; name: string | null };
  mfaRequired?: boolean;
  /** Present only when mfaRequired: pass to /auth/mfa/login-verify to finish login. */
  mfaToken?: string;
  roleId?: string;
  /** Role name (display + coarse checks). Authorization uses the permissions[] in the JWT. */
  role?: string;
  companyId?: string;
  /** All companies/roles for this user (for company switcher) */
  companies?: { companyId: string; companyName: string; role: string }[];
}

/**
 * Purpose claim carried by the short-lived MFA-pending token. This type is the
 * source of truth; `MFA_PENDING_PURPOSE` in auth.service.ts is annotated with it.
 */
export type MfaPendingPurpose = "mfa_pending";

/** Claims on the token proving the password step passed and a TOTP is owed. */
export interface MfaPendingClaims {
  userId: string;
  purpose: MfaPendingPurpose;
}

/** A user's role assignment at one company, with both entities resolved. */
export interface RoleWithCompany {
  companyId: string;
  roleId: string;
  company: { id: string; name: string };
  role: { id: string; name: string };
}

/** The company/role context activated for a session. */
export interface SessionContext {
  roleId: string;
  roleName: string;
  companyId: string;
}
