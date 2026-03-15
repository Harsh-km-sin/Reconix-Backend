import * as XLSX from "xlsx";
import { prisma } from "../../config/index.js";
import { storage } from "../../lib/storage.js";
import { autoMapSheets, normalizeHeader } from "./excel.parser.js";

export const excelService = {
  /**
   * Parse an uploaded Excel file to extract metadata (sheets, headers).
   */
  async getMetadata(uploadId: string) {
    const upload = await prisma.excelUpload.findUnique({
      where: { id: uploadId },
    });

    if (!upload) throw new Error("Upload not found");

    const buffer = await storage.readFile(upload.s3Key);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    
    const autoMappings = autoMapSheets(workbook);
    
    const sheetsMeta = workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
      const headers: string[] = [];
      
      const firstRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as any[];
      const detectedHeaders = (firstRow || []).map(h => normalizeHeader(String(h || "")));

      return { 
        name, 
        rowCount: range.e.r - range.s.r,
        headers: detectedHeaders,
        isAutoDetected: Object.values(autoMappings).includes(name)
      };
    });

    return {
      fileName: upload.originalName,
      sheets: sheetsMeta,
      autoMappings
    };
  },

  /**
   * Extract data from a specific sheet.
   */
  async getSheetData(uploadId: string, sheetName: string) {
    const upload = await prisma.excelUpload.findUnique({
      where: { id: uploadId },
    });

    if (!upload) throw new Error("Upload not found");

    const buffer = await storage.readFile(upload.s3Key);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[sheetName];
    
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  },

  /**
   * Save a field mapping template for a company.
   */
  async saveMappingTemplate(params: {
    companyId: string;
    userId: string;
    name: string;
    jobType: string;
    mapping: any;
  }) {
    return prisma.fieldMappingTemplate.upsert({
      where: {
        companyId_name: {
          companyId: params.companyId,
          name: params.name
        }
      },
      update: {
        mapping: params.mapping,
        jobType: params.jobType,
        updatedAt: new Date()
      },
      create: {
        companyId: params.companyId,
        createdById: params.userId,
        name: params.name,
        jobType: params.jobType,
        mapping: params.mapping
      }
    });
  },

  /**
   * List mapping templates for a company.
   */
  async listMappingTemplates(companyId: string, jobType?: string) {
    return prisma.fieldMappingTemplate.findMany({
      where: {
        companyId,
        ...(jobType ? { jobType } : {})
      },
      orderBy: { lastUsedAt: "desc" }
    });
  }
};
