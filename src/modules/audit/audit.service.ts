import { prisma, logger } from "../../config/index.js";

export interface CreateAuditLogParams {
  companyId: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  beforeState?: any;
  afterState?: any;
  xeroRequest?: any;
  xeroResponse?: any;
  ipAddress?: string;
  userAgent?: string;
}

export const auditService = {
  /**
   * Record a new audit log entry.
   * This is append-only and should never fail the main request flow.
   */
  async record(params: CreateAuditLogParams): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          companyId: params.companyId,
          userId: params.userId ?? null,
          action: params.action,
          resourceType: params.resourceType ?? null,
          resourceId: params.resourceId ?? null,
          beforeState: params.beforeState ?? null,
          afterState: params.afterState ?? null,
          xeroRequest: params.xeroRequest ?? null,
          xeroResponse: params.xeroResponse ?? null,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
    } catch (err) {
      // We log but don't throw to prevent audit failures from breaking business logic
      logger.error("Failed to write audit log", { err, action: params.action });
    }
  },

  /**
   * List audit logs with filters and pagination.
   */
  async list(filters: {
    companyId: string;
    userId?: string;
    action?: string;
    resourceId?: string;
    resourceType?: string;
    page?: number;
    limit?: number;
  }) {
    const { companyId, userId, action, resourceId, resourceType, page = 1, limit = 20 } = filters;
    
    const where: any = { companyId };
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (resourceId) where.resourceId = resourceId;
    if (resourceType) where.resourceType = resourceType;

    const [total, data] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      }),
    ]);

    return { total, page, limit, data };
  }
};
