import { prisma } from "../config/index.js";
// import type { AuditAction } from "@prisma/client"; // AuditAction enum doesn't exist in schema currently

export async function logAudit(params: {
  action: string;
  userId?: string | null;
  companyId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  afterState?: any | null;
  ipAddress?: string | null;
}): Promise<void> {
  if (!params.companyId) return; // Audit logs must have a company context
  
  await prisma.auditLog.create({
    data: {
      action: params.action,
      userId: params.userId ?? undefined,
      companyId: params.companyId,
      resourceType: params.resourceType ?? undefined,
      resourceId: params.resourceId ?? undefined,
      afterState: params.afterState ? (params.afterState as any) : undefined,
      ipAddress: params.ipAddress ?? undefined,
    },
  });
}
