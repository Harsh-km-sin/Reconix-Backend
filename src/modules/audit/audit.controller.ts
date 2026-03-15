import { Request, Response } from "express";
import { auditService } from "./audit.service.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import { AuthUser } from "../../types/express.js";

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export const auditController = {
  /**
   * GET /api/v1/audit
   * List audit logs for the company. Only ADMIN can access.
   */
  async listLogs(req: Request, res: Response): Promise<void> {
    const authedReq = req as AuthenticatedRequest;
    try {
      if (!authedReq.user?.companyId) {
        sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
        return;
      }

      if (authedReq.user.role !== "ADMIN") {
        sendError(res, ErrorCode.FORBIDDEN, "Only ADMIN can view audit logs", HttpStatus.FORBIDDEN);
        return;
      }

      const {
        userId,
        action,
        resourceId,
        resourceType,
        page = "1",
        limit = "20",
      } = req.query as Record<string, string>;

      const result = await auditService.list({
        companyId: authedReq.user.companyId,
        userId,
        action,
        resourceId,
        resourceType,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      sendSuccess(res, result);
    } catch (err) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to fetch audit logs");
    }
  },
};
