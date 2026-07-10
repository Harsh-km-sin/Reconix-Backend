import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { generateSecret, verify, generateURI } from "otplib";
import qrcode from "qrcode";
import { env } from "../../config/index.js";
import { prisma } from "../../config/index.js";
import { cryptoUtils } from "../../utils/crypto.js";
import { authRepository } from "./auth.repository.js";
import type {
  LoginBody,
  SetPasswordBody,
  AuthResponse,
  AuthTokenPayload,
  MFAVerifyBody,
  MFASetupResponse
} from "./auth.interface.js";
import { permissionService } from "../permission/permission.service.js";

const SALT_ROUNDS = 10;

/** Short-lived token proving a user passed the password step and now owes a TOTP. */
const MFA_PENDING_PURPOSE = "mfa_pending";
const MFA_PENDING_TTL = "5m";

interface MfaPendingClaims {
  userId: string;
  purpose: typeof MFA_PENDING_PURPOSE;
}

/** Issue a signed token that authorises ONLY the second-factor (TOTP) step. */
function signMfaPendingToken(userId: string): string {
  return jwt.sign({ userId, purpose: MFA_PENDING_PURPOSE }, env.jwtSecret, {
    expiresIn: MFA_PENDING_TTL,
  });
}

/** Verify an MFA pending token and return the userId it was issued for. */
function verifyMfaPendingToken(token: string): string {
  let claims: MfaPendingClaims;
  try {
    claims = jwt.verify(token, env.jwtSecret) as MfaPendingClaims;
  } catch {
    throw new Error("MFA session expired. Please sign in again.");
  }
  if (claims.purpose !== MFA_PENDING_PURPOSE || !claims.userId) {
    throw new Error("Invalid MFA session token");
  }
  return claims.userId;
}

/**
 * Encrypt a TOTP secret for storage at rest (AES-256-GCM).
 */
function encryptSecret(plain: string): string {
  return cryptoUtils.encrypt(plain, env.tokenEncryptionKey);
}

/**
 * Decrypt a stored TOTP secret. Tolerates legacy plaintext secrets (those not
 * in the `iv:tag:ciphertext` format) so pre-existing rows keep working.
 */
function decryptSecret(stored: string): string {
  const looksEncrypted = stored.split(":").length === 3;
  if (!looksEncrypted) return stored;
  return cryptoUtils.decrypt(stored, env.tokenEncryptionKey);
}

type RoleWithCompany = {
  companyId: string;
  roleId: string;
  company: { id: string; name: string };
  role: { id: string; name: string };
};

type SessionContext = { roleId: string; roleName: string; companyId: string };

function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Pick the company/role context to activate: the user's last active company if
 * they still hold a role there, else their first assigned role. Access is always
 * tied to an explicit UserCompanyRole entry.
 */
function determineInitialCompanyContext(user: any): SessionContext | null {
  const prefs = user.preferences as Record<string, any> | null;
  const lastActiveCompanyId = prefs?.lastActiveCompanyId;
  const roles = (user.userCompanyRoles || []) as RoleWithCompany[];
  const pick = (r: RoleWithCompany): SessionContext => ({
    roleId: r.roleId,
    roleName: r.role.name,
    companyId: r.companyId,
  });

  if (lastActiveCompanyId) {
    const roleEntry = roles.find((r) => r.companyId === lastActiveCompanyId);
    if (roleEntry) return pick(roleEntry);
  }
  const firstRole = roles[0];
  return firstRole ? pick(firstRole) : null;
}

/**
 * Build the full authenticated session response: resolve the role's permissions
 * (DB-driven), bake { roleId, roleName, companyId, permissions } into the JWT,
 * and list the companies the user can switch between.
 */
async function buildAuthResponse(
  user: { id: string; email: string; name: string | null },
  ctx: SessionContext | null,
  roles: RoleWithCompany[]
): Promise<AuthResponse> {
  const permissions = await permissionService.resolvePermissions(ctx?.roleId);
  const payload: AuthTokenPayload = {
    userId: user.id,
    email: user.email,
    roleId: ctx?.roleId,
    roleName: ctx?.roleName,
    companyId: ctx?.companyId,
    permissions,
  };
  const token = signToken(payload);
  const displayName = user.name?.trim() || user.email.split("@")[0] || "User";
  return {
    token,
    user: { id: user.id, email: user.email, name: displayName },
    roleId: ctx?.roleId,
    role: ctx?.roleName,
    companyId: ctx?.companyId,
    companies: roles.map((r) => ({
      companyId: r.companyId,
      companyName: r.company.name,
      role: r.role.name,
    })),
  };
}

export const authService = {
  async login(body: LoginBody): Promise<AuthResponse> {
    const user = (await authRepository.findByEmail(body.email)) as any;
    if (!user || !user.isActive) {
      throw new Error("Invalid email or password");
    }
    if (!user.passwordHash) {
      throw new Error("Please set your password using the link from your invite email");
    }
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    // Check if MFA is enabled. The password has now been verified, so we issue a
    // short-lived pending token that the client must present to complete the
    // second factor. We do NOT expose a bare userId — otherwise the TOTP step
    // could be driven without ever proving knowledge of the password.
    if (user.mfaEnabled) {
      return {
        user: { id: user.id, email: user.email, name: user.name ?? user.email.split("@")[0] },
        mfaRequired: true,
        mfaToken: signMfaPendingToken(user.id),
      };
    }

    const context = determineInitialCompanyContext(user);
    return buildAuthResponse(user, context, user.userCompanyRoles ?? []);
  },

  async verifyMFALogin(body: MFAVerifyBody): Promise<AuthResponse> {
    // Derive the user from the signed pending token, never from client input.
    const userId = verifyMfaPendingToken(body.mfaToken);

    const user = await authRepository.findById(userId);
    if (!user || !(user as any).mfaEnabled || !(user as any).mfaSecret) {
        throw new Error("MFA not enabled or user not found");
    }

    const { valid } = await verify({
      token: body.token,
      secret: decryptSecret((user as any).mfaSecret),
    });
    if (!valid) {
        throw new Error("Invalid MFA code");
    }

    // Refresh user with roles
    const fullUser = await authRepository.findByEmail(user.email);
    const context = determineInitialCompanyContext(fullUser);
    return buildAuthResponse(
      { id: user.id, email: user.email, name: user.name },
      context,
      (fullUser?.userCompanyRoles as RoleWithCompany[]) ?? []
    );
  },

  async setupMFA(userId: string): Promise<MFASetupResponse> {
    const user = await authRepository.findById(userId);
    if (!user) throw new Error("User not found");

    const secret = generateSecret();
    const otpauth = generateURI({ secret, label: user.email, issuer: "Reconix" });
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    // Store the secret encrypted at rest; not enabled until the user verifies a code.
    await authRepository.updateMFASecret(userId, encryptSecret(secret));

    // The plaintext secret is returned once, for the user's authenticator app.
    return { secret, qrCodeUrl };
  },

  async verifyAndEnableMFA(userId: string, token: string): Promise<void> {
    const user = (await authRepository.findById(userId)) as any;
    if (!user || !user.mfaSecret) throw new Error("MFA setup not initiated");

    const { valid } = await verify({ token, secret: decryptSecret(user.mfaSecret) });
    if (!valid) throw new Error("Invalid code. Please try again.");

    await authRepository.setMFAEnabled(userId, true);
  },

  async disableMFA(userId: string): Promise<void> {
    await authRepository.setMFAEnabled(userId, false);
    await authRepository.updateMFASecret(userId, null);
  },

  async setPassword(body: SetPasswordBody): Promise<AuthResponse> {
    const user = await authRepository.findByInviteToken(body.token);
    if (!user) {
      throw new Error("Invalid or expired invite link");
    }
    if (user.inviteTokenExpiresAt && user.inviteTokenExpiresAt < new Date()) {
      throw new Error("Invite link has expired");
    }
    const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);
    const updated = await authRepository.setPasswordByInviteToken(body.token, passwordHash);
    if (!updated) {
      throw new Error("Invalid or expired invite link");
    }
    const withRoles = await authRepository.findByEmail(updated.email);
    const context = determineInitialCompanyContext(withRoles);
    return buildAuthResponse(
      updated,
      context,
      (withRoles?.userCompanyRoles as RoleWithCompany[]) ?? []
    );
  },

  generateInviteToken(): { token: string; expiresAt: Date } {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    return { token, expiresAt };
  },

  async switchCompany(userId: string, targetCompanyId: string): Promise<AuthResponse> {
    const user = await authRepository.findByIdWithRoles(userId);
    if (!user) throw new Error("User not found");

    const roles = (user.userCompanyRoles ?? []) as RoleWithCompany[];
    const roleEntry = roles.find((r) => r.companyId === targetCompanyId);

    // Access requires an explicit role for the target company.
    if (!roleEntry) {
      throw new Error("Access denied to this company");
    }

    // Confirm company exists
    const company = await prisma.company.findUnique({ where: { id: targetCompanyId } });
    if (!company) throw new Error("Company not found");

    // Persist to user preferences
    const prefs = (user.preferences as Record<string, any>) || {};
    await authRepository.updatePreferences(userId, { ...prefs, lastActiveCompanyId: targetCompanyId });

    return buildAuthResponse(
      user,
      { roleId: roleEntry.roleId, roleName: roleEntry.role.name, companyId: targetCompanyId },
      roles
    );
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await authRepository.findById(userId);
    if (!user || !user.passwordHash) {
      throw new Error("Invalid or missing password");
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error("Current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await authRepository.updatePassword(userId, passwordHash);
  },
};
