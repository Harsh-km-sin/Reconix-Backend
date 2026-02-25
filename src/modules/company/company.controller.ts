import { Request, Response } from "express";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import { companyService } from "./company.service.js";

export const companyController = {
  async list(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
      return;
    }
    const companies = await companyService.list({
      userId: req.user.userId,
      permissions: req.user.permissions,
    });
    sendSuccess(res, companies);
  },

  async getOne(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
      return;
    }
    const companyId = req.params.id as string;
    const company = await companyService.getOne(companyId, {
      userId: req.user.userId,
      permissions: req.user.permissions,
    });
    if (!company) {
      sendError(res, ErrorCode.NOT_FOUND, "Company not found", HttpStatus.NOT_FOUND);
      return;
    }
    sendSuccess(res, company);
  },

  async update(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Authentication required", HttpStatus.UNAUTHORIZED);
      return;
    }
    const companyId = req.params.id as string;
    const body = req.body as {
      baseCurrency?: string | null;
      defaultBankAccountId?: string | null;
      defaultCnNumberFormat?: string | null;
      defaultLineAmountType?: string | null;
    };
    const company = await companyService.update(companyId, body, {
      userId: req.user.userId,
      permissions: req.user.permissions,
    });
    if (!company) {
      sendError(res, ErrorCode.FORBIDDEN, "Company not found or access denied", HttpStatus.FORBIDDEN);
      return;
    }
    sendSuccess(res, company);
  },
};
