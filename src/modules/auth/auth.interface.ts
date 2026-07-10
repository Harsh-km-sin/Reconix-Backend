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
