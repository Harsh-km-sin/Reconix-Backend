import { Request, Response } from "express";
import { excelService } from "./excel.service.js";
import { prisma, logger } from "../../config/index.js";
import { storage } from "../../lib/storage.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import { AuthUser } from "../../types/express.js";

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export const excelController = {
  /**
   * POST /api/v1/excel/upload
   * Handles multipart file upload and records metadata.
   */
  async uploadFile(req: Request, res: Response): Promise<void> {
    const authedReq = req as AuthenticatedRequest;
    try {
      const file = req.file;
      if (!file) {
        sendError(res, ErrorCode.VALIDATION_ERROR, "No file uploaded", HttpStatus.BAD_REQUEST);
        return;
      }

      const filePath = await storage.saveFile(`${Date.now()}-${file.originalname}`, file.buffer);

      const record = await prisma.excelUpload.create({
        data: {
          companyId: authedReq.user.companyId!,
          uploadedById: authedReq.user.userId,
          originalName: file.originalname,
          sizeBytes: file.size,
          s3Key: filePath,
          status: "UPLOADED",
          sheetsFound: [], // Will be filled on parse
        }
      });

      sendSuccess(res, record, HttpStatus.CREATED);
    } catch (err) {
      logger.error("Excel upload failed", { err });
      sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to upload file");
    }
  },

  /**
   * GET /api/v1/excel/:uploadId/metadata
   */
  async getMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { uploadId } = req.params;
      const metadata = await excelService.getMetadata(uploadId);
      sendSuccess(res, metadata);
    } catch (err: any) {
      sendError(res, ErrorCode.NOT_FOUND, err.message, HttpStatus.NOT_FOUND);
    }
  },

  /**
   * POST /api/v1/excel/mapping
   */
  async saveMapping(req: Request, res: Response): Promise<void> {
    const authedReq = req as AuthenticatedRequest;
    try {
      const { name, jobType, mapping } = req.body;
      const result = await excelService.saveMappingTemplate({
        companyId: authedReq.user.companyId!,
        userId: authedReq.user.userId,
        name,
        jobType,
        mapping
      });
      sendSuccess(res, result);
    } catch (err) {
       sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to save mapping template");
    }
  },

  /**
   * GET /api/v1/excel/mapping
   */
  async listMappings(req: Request, res: Response): Promise<void> {
    const authedReq = req as AuthenticatedRequest;
    try {
      const { jobType } = req.query as Record<string, string>;
      const results = await excelService.listMappingTemplates(authedReq.user.companyId!, jobType);
      sendSuccess(res, results);
    } catch (err) {
       sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to list mapping templates");
    }
  }
};
