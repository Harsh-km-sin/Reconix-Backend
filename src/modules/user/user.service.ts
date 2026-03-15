import { prisma, env } from "../../config/index.js";
import { authRepository } from "../auth/auth.repository.js";
import { authService } from "../auth/auth.service.js";
import { emailService } from "../../services/email.service.js";
import { logAudit } from "../../helpers/audit.helper.js";
import type { InviteUserInput, UpdateProfileInput } from "./user.validation.js";
import type { Role } from "@prisma/client";
import type { Prisma } from "@prisma/client";

/** Select for User profile (Settings). Schema has phoneNumber, timezone, dateFormat, preferences. Run `npx prisma generate` if TypeScript errors. */
const userProfileSelect = {
  id: true,
  email: true,
  name: true,
  phoneNumber: true,
  timezone: true,
  dateFormat: true,
  preferences: true,
} as Prisma.UserSelect;

/** Return display name: prefer user.name, else part before @ in email, else "User". */
function displayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const beforeAt = email.split("@")[0]?.trim();
  return beforeAt || "User";
}

export const userService = {
  async getMe(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: userProfileSelect,
    });
    if (!user) return null;
    return { ...user, name: displayName(user.name, user.email) };
  },

  async updateMe(userId: string, body: UpdateProfileInput) {
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phoneNumber !== undefined) data.phoneNumber = body.phoneNumber;
    if (body.timezone !== undefined) data.timezone = body.timezone;
    if (body.dateFormat !== undefined) data.dateFormat = body.dateFormat;
    if (body.preferences !== undefined) data.preferences = body.preferences;
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: userProfileSelect,
    });
    return { ...updated, name: displayName(updated.name, updated.email) };
  },

  async invite(
    body: InviteUserInput,
    grantedByUserId: string,
    inviterEmail: string,
    inviterName?: string | null,
    ipAddress?: string
  ): Promise<{ userId: string; email: string; inviteLink: string }> {
    const existing = await authRepository.findByEmail(body.email);
    if (existing) {
      throw new Error("A user with this email already exists");
    }
    for (const a of body.assignments) {
      const company = await prisma.company.findUnique({ where: { id: a.companyId } });
      if (!company) {
        throw new Error(`Company not found: ${a.companyId}`);
      }
    }
    const { token, expiresAt } = authService.generateInviteToken();
    const user = await authRepository.createInvitedUser({
      email: body.email,
      name: body.name ?? null,
      inviteToken: token,
      inviteTokenExpiresAt: expiresAt,
    });
    for (const a of body.assignments) {
      await authRepository.addRoleToUser({
        userId: user.id,
        companyId: a.companyId,
        role: a.role as Role,
        grantedByUserId,
      });
    }
    const baseUrl = env.frontendOrigin;
    const inviteLink = `${baseUrl}/set-password?token=${encodeURIComponent(token)}`;
    await emailService.sendInvite(user.email, inviteLink, inviterName ?? inviterEmail);
    await logAudit({
      action: "USER_INVITED",
      userId: grantedByUserId,
      resourceType: "User",
      resourceId: user.id,
      afterState: { email: user.email, assignments: body.assignments },
      ipAddress: ipAddress ?? undefined,
    });
    return { userId: user.id, email: user.email, inviteLink };
  },
};
