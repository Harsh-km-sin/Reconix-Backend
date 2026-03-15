import { Request, Response } from "express";
import { validationService } from "./validation.service.js";
import { prisma } from "../../config/index.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import { AuthUser } from "../../types/express.js";

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export const validationController = {
  /**
   * POST /api/v1/validation/run
   * Validates a set of items or an entire PENDING job.
   */
  async runValidation(req: Request, res: Response): Promise<void> {
    const authedReq = req as AuthenticatedRequest;
    try {
      const { jobId, items } = req.body;
      
      let itemsToValidate = items;

      if (jobId) {
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          include: { jobItems: true }
        });
        if (!job) {
          sendError(res, ErrorCode.NOT_FOUND, "Job not found", HttpStatus.NOT_FOUND);
          return;
        }
        itemsToValidate = job.jobItems;
      }

      if (!itemsToValidate || itemsToValidate.length === 0) {
        sendError(res, ErrorCode.VALIDATION_ERROR, "No items to validate", HttpStatus.BAD_REQUEST);
        return;
      }

      // Get tenant ID from active connection
      const connection = await prisma.xeroConnection.findFirst({
        where: { userId: authedReq.user.userId, isActive: true }
      });

      if (!connection) {
        sendError(res, ErrorCode.VALIDATION_ERROR, "No active Xero connection", HttpStatus.BAD_REQUEST);
        return;
      }

      const report = await validationService.validateItems(connection.tenantId, itemsToValidate);
      
      sendSuccess(res, { report });
    } catch (err) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "Validation failed");
    }
  }
};
