/**
 * Parameters for appending a single audit-log entry.
 *
 * The four state/payload fields land in Prisma `Json?` columns. They stay
 * `any` deliberately: Prisma's nullable-Json input rejects a bare `null`
 * (it wants `Prisma.JsonNull`), so tightening these is its own change.
 */
export interface CreateAuditLogParams {
  companyId: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  beforeState?: any;
  afterState?: any;
  xeroRequest?: any;
  xeroResponse?: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  ipAddress?: string;
  userAgent?: string;
}
