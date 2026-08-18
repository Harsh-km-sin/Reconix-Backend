import { Request, Response } from "express";
import { validationService } from "./validation.service.js";
import { prisma, logger } from "../../config/index.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import type { AuthenticatedRequest } from "../../types/express.js";

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

      if (!authedReq.user?.companyId) {
        sendError(res, ErrorCode.UNAUTHORIZED, "No active company selected", HttpStatus.UNAUTHORIZED);
        return;
      }

      // Step 1: Resolve the company's Xero tenant ID from the DB (avoids stale JWT data issues)
      const company = await prisma.company.findUnique({
        where: { id: authedReq.user.companyId },
        select: { id: true, xeroTenantId: true, name: true }
      });

      if (!company) {
        sendError(res, ErrorCode.NOT_FOUND, "Company not found for the active session", HttpStatus.NOT_FOUND);
        return;
      }

      // Step 2: Find the XeroConnection by tenantId directly (most reliable lookup path)
      const connection = await prisma.xeroConnection.findFirst({
        where: {
          tenantId: company.xeroTenantId,
          isActive: true,
        }
      });

      if (!connection) {
        sendError(
          res,
          ErrorCode.VALIDATION_ERROR,
          `No active Xero connection found for company "${company.name}". Please reconnect to Xero.`,
          HttpStatus.BAD_REQUEST
        );
        return;
      }

      logger.info("Running validation", { 
        companyId: authedReq.user.companyId, 
        companyName: company.name,
        xeroTenantId: company.xeroTenantId,
        connectionTenantId: connection.tenantId,
        itemCount: itemsToValidate.length 
      });

      const report = await validationService.validateItems(connection.tenantId, itemsToValidate);
      
      sendSuccess(res, { report });
    } catch (err) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "Validation failed");
    }
  }
};
