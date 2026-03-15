import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { generateSecret, verify, generateURI } from "otplib";
import qrcode from "qrcode";
import type { Role } from "@prisma/client";
import { env } from "../../config/index.js";
import { prisma } from "../../config/index.js";
import { authRepository } from "./auth.repository.js";
import type { 
  LoginBody, 
  SetPasswordBody, 
  AuthResponse, 
  AuthTokenPayload,
  MFAVerifyBody,
  MFASetupResponse
} from "./auth.interface.js";
import { getPermissionsForRole } from "../../types/permissions.js";

const SALT_ROUNDS = 10;

type RoleWithCompany = { companyId: string; company: { id: string; name: string }; role: Role };

async function getCompaniesForResponse(
  role: Role | undefined,
  assignedRoles: RoleWithCompany[]
): Promise<{ companyId: string; companyName: string; role: Role }[]> {
  if (role === "ADMIN") {
    const all = await prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return all.map((c) => ({ companyId: c.id, companyName: c.name, role: "ADMIN" as Role }));
  }
  return assignedRoles.map((r) => ({
    companyId: r.companyId,
    companyName: r.company.name,
    role: r.role,
  }));
}

function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
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

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      return {
        user: { id: user.id, email: user.email, name: user.name ?? user.email.split("@")[0] },
        mfaRequired: true
      };
    }

    const firstRole = user.userCompanyRoles?.[0];
    const permissions = getPermissionsForRole(firstRole?.role);
    const payload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
      role: firstRole?.role,
      companyId: firstRole?.companyId,
      permissions,
    };
    const companies = await getCompaniesForResponse(firstRole?.role, user.userCompanyRoles ?? []);
    const token = signToken(payload);
    const displayName = user.name?.trim() || user.email.split("@")[0] || "User";
    
    return {
      token,
      user: { id: user.id, email: user.email, name: displayName },
      role: firstRole?.role,
      companyId: firstRole?.companyId,
      companies,
    };
  },

  async verifyMFALogin(body: MFAVerifyBody): Promise<AuthResponse> {
    const user = await authRepository.findById(body.userId);
    if (!user || !(user as any).mfaEnabled || !(user as any).mfaSecret) {
        throw new Error("MFA not enabled or user not found");
    }

    const isValid = verify({ token: body.token, secret: (user as any).mfaSecret });
    if (!isValid) {
        throw new Error("Invalid MFA code");
    }

    // Refresh user with roles
    const fullUser = await authRepository.findByEmail(user.email);
    const firstRole = fullUser?.userCompanyRoles?.[0];
    const permissions = getPermissionsForRole(firstRole?.role);
    
    const payload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
      role: firstRole?.role,
      companyId: firstRole?.companyId,
      permissions,
    };
    
    const companies = await getCompaniesForResponse(firstRole?.role, fullUser?.userCompanyRoles ?? []);
    const token = signToken(payload);
    const displayName = user.name?.trim() || user.email.split("@")[0] || "User";

    return {
      token,
      user: { id: user.id, email: user.email, name: displayName },
      role: firstRole?.role,
      companyId: firstRole?.companyId,
      companies,
    };
  },

  async setupMFA(userId: string): Promise<MFASetupResponse> {
    const user = await authRepository.findById(userId);
    if (!user) throw new Error("User not found");

    const secret = generateSecret();
    const otpauth = generateURI({ secret, label: user.email, issuer: "Reconix" });
    const qrCodeUrl = await qrcode.toDataURL(otpauth);
    
    // Store secret temporarily but don't enable yet
    await authRepository.updateMFASecret(userId, secret);

    return { secret, qrCodeUrl };
  },

  async verifyAndEnableMFA(userId: string, token: string): Promise<void> {
    const user = (await authRepository.findById(userId)) as any;
    if (!user || !user.mfaSecret) throw new Error("MFA setup not initiated");

    const isValid = verify({ token, secret: user.mfaSecret });
    if (!isValid) throw new Error("Invalid code. Please try again.");

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
    const firstRole = withRoles?.userCompanyRoles?.[0];
    const permissions = getPermissionsForRole(firstRole?.role);
    const payload: AuthTokenPayload = {
      userId: updated.id,
      email: updated.email,
      role: firstRole?.role,
      companyId: firstRole?.companyId,
      permissions,
    };
    const companies = await getCompaniesForResponse(firstRole?.role, withRoles?.userCompanyRoles ?? []);
    const token = signToken(payload);
    const displayName = updated.name?.trim() || updated.email.split("@")[0] || "User";
    return {
      token,
      user: { id: updated.id, email: updated.email, name: displayName },
      role: firstRole?.role,
      companyId: firstRole?.companyId,
      companies,
    };
  },

  generateInviteToken(): { token: string; expiresAt: Date } {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    return { token, expiresAt };
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
