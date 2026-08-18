import { Request, Response } from "express";
import { excelService } from "./excel.service.js";
import { prisma, logger } from "../../config/index.js";
import { storage } from "../../lib/storage.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import type { AuthenticatedRequest } from "../../types/express.js";
import { auditService } from "../audit/audit.service.js";

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

      // Parse up front. The client needs the sheet list to render its picker,
      // and a file we cannot read should fail here rather than one call later.
      let sheetsFound: string[];
      try {
        sheetsFound = await excelService.listSheetNames(file.buffer, file.originalname);
      } catch {
        sendError(
          res,
          ErrorCode.VALIDATION_ERROR,
          "Could not read that file. Upload a .xlsx, .xls or .csv.",
          HttpStatus.BAD_REQUEST
        );
        return;
      }

      if (sheetsFound.length === 0) {
        sendError(
          res,
          ErrorCode.VALIDATION_ERROR,
          "That file has no sheets.",
          HttpStatus.BAD_REQUEST
        );
        return;
      }

      const record = await prisma.excelUpload.create({
        data: {
          companyId: authedReq.user.companyId!,
          uploadedById: authedReq.user.userId,
          originalName: file.originalname,
          sizeBytes: file.size,
          s3Key: filePath,
          status: "UPLOADED",
          sheetsFound,
        }
      });

      await auditService.record({
        companyId: authedReq.user.companyId!,
        userId: authedReq.user.userId,
        action: "EXCEL_UPLOADED",
        resourceType: "ExcelUpload",
        resourceId: record.id,
        afterState: { originalName: record.originalName, sizeBytes: record.sizeBytes },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendSuccess(res, await excelService.getMetadata(record.id), HttpStatus.CREATED);
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload not found";
      sendError(res, ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
    }
  },

  /**
   * GET /api/v1/excel/:uploadId/sheet/:sheetName
   * The parsed rows of one sheet. This is what replaced the client-side xlsx
   * parse in the job upload builder.
   */
  async getSheetData(req: Request, res: Response): Promise<void> {
    try {
      const { uploadId, sheetName } = req.params;
      sendSuccess(res, await excelService.getSheetData(uploadId, decodeURIComponent(sheetName)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sheet not found";
      sendError(res, ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
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
      await auditService.record({
        companyId: authedReq.user.companyId!,
        userId: authedReq.user.userId,
        action: "MAPPING_TEMPLATE_SAVED",
        resourceType: "FieldMappingTemplate",
        resourceId: result.id,
        afterState: result,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
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
