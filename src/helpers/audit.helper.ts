import { prisma } from "../config/index.js";
import type { AuditAction } from "@prisma/client";

export async function logAudit(params: {
  action: AuditAction;
  userId?: string | null;
  companyId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  afterState?: object | null;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      userId: params.userId ?? undefined,
      companyId: params.companyId ?? undefined,
      entityType: params.entityType ?? undefined,
      entityId: params.entityId ?? undefined,
      afterState: params.afterState ?? undefined,
      ipAddress: params.ipAddress ?? undefined,
    },
  });
}
