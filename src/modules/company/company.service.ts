import { prisma } from "../../config/index.js";
import { hasModuleAccess } from "../../types/permissions.js";

type UserContext = { userId: string; permissions: readonly string[] };

function userCanAccessCompany(ctx: UserContext, companyId: string): Promise<boolean> {
  const isAdmin = hasModuleAccess(ctx.permissions, "admin");
  if (isAdmin) return Promise.resolve(true);
  return prisma.userCompanyRole
    .findFirst({ where: { userId: ctx.userId, companyId } })
    .then((r) => !!r);
}

/**
 * Returns all companies for admin, otherwise only companies the user is assigned to.
 */
export const companyService = {
  async list(ctx: UserContext): Promise<{ companyId: string; companyName: string; role?: string }[]> {
    const isAdmin = hasModuleAccess(ctx.permissions, "admin");
    if (isAdmin) {
      const companies = await prisma.company.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return companies.map((c) => ({ companyId: c.id, companyName: c.name }));
    }
    const roles = await prisma.userCompanyRole.findMany({
      where: { userId: ctx.userId },
      include: { company: { select: { id: true, name: true } } },
    });
    return roles.map((r) => ({
      companyId: r.companyId,
      companyName: r.company.name,
      role: r.role,
    }));
  },

  async getOne(companyId: string, ctx: UserContext) {
    const can = await userCanAccessCompany(ctx, companyId);
    if (!can) return null;
    return prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        xeroTenantId: true,
        baseCurrency: true,
        defaultBankAccountId: true,
        defaultCnNumberFormat: true,
        defaultLineAmountType: true,
      },
    });
  },

  async update(
    companyId: string,
    body: {
      baseCurrency?: string | null;
      defaultBankAccountId?: string | null;
      defaultCnNumberFormat?: string | null;
      defaultLineAmountType?: string | null;
    },
    ctx: UserContext
  ) {
    const can = await userCanAccessCompany(ctx, companyId);
    if (!can) return null;
    return prisma.company.update({
      where: { id: companyId },
      data: {
        ...(body.baseCurrency !== undefined && { baseCurrency: body.baseCurrency }),
        ...(body.defaultBankAccountId !== undefined && { defaultBankAccountId: body.defaultBankAccountId }),
        ...(body.defaultCnNumberFormat !== undefined && { defaultCnNumberFormat: body.defaultCnNumberFormat }),
        ...(body.defaultLineAmountType !== undefined && { defaultLineAmountType: body.defaultLineAmountType }),
      },
      select: {
        id: true,
        name: true,
        baseCurrency: true,
        defaultBankAccountId: true,
        defaultCnNumberFormat: true,
        defaultLineAmountType: true,
      },
    });
  },
};
