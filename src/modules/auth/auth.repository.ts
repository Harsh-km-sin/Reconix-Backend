import { prisma } from "../../config/index.js";
import type { Role } from "@prisma/client";

export const authRepository = {
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        userCompanyRoles: {
          include: { company: true },
          orderBy: { grantedAt: "desc" },
        },
      },
    });
  },

  async createInvitedUser(data: {
    email: string;
    name: string | null;
    inviteToken: string;
    inviteTokenExpiresAt: Date;
  }) {
    return prisma.user.create({
      data: {
        email: data.email.trim().toLowerCase(),
        name: data.name?.trim() || null,
        inviteToken: data.inviteToken,
        inviteTokenExpiresAt: data.inviteTokenExpiresAt,
      },
    });
  },

  async findByInviteToken(token: string) {
    return prisma.user.findFirst({
      where: { inviteToken: token, isActive: true },
      include: { userCompanyRoles: { include: { company: true } } },
    });
  },

  async setPasswordByInviteToken(token: string, passwordHash: string) {
    const user = await prisma.user.findFirst({
      where: { inviteToken: token },
    });
    if (!user) return null;
    return prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        inviteToken: null,
        inviteTokenExpiresAt: null,
      },
    });
  },

  async findById(id: string) {
    return prisma.user.findFirst({
      where: { id, isActive: true },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
  },

  async updatePassword(userId: string, passwordHash: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  },

  async addRoleToUser(data: {
    userId: string;
    companyId: string;
    role: Role;
    grantedByUserId?: string;
  }) {
    return prisma.userCompanyRole.create({
      data: {
        userId: data.userId,
        companyId: data.companyId,
        role: data.role,
        grantedByUserId: data.grantedByUserId,
        grantedAt: new Date(),
      },
    });
  },
};
