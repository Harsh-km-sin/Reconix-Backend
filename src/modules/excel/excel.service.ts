import * as XLSX from "xlsx";
import Papa from "papaparse";
import { prisma } from "../../config/index.js";
import { storage } from "../../lib/storage.js";
import { autoMapSheets, normalizeHeader } from "./excel.parser.js";
import type {
  SheetData,
  SheetMeta,
  SheetRow,
  UploadMetadata,
} from "./excel.interface.js";

/** The single sheet a CSV is presented as, so clients have one code path. */
const CSV_SHEET_NAME = "Sheet1";

const isCsv = (fileName: string): boolean => /\.csv$/i.test(fileName);

/**
 * Read a CSV into the same row shape `sheet_to_json` produces: objects keyed by
 * the raw header text, with empty cells as "" rather than undefined.
 */
function parseCsv(buffer: Buffer): { headers: string[]; rows: SheetRow[] } {
  const parsed = Papa.parse<Record<string, string>>(buffer.toString("utf8"), {
    header: true,
    skipEmptyLines: "greedy",
    // Leave values as text. Coercing here would guess at currency and dates
    // differently from how the Excel path does it.
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const rows: SheetRow[] = parsed.data.map((row) => {
    const filled: SheetRow = {};
    for (const header of headers) filled[header] = row[header] ?? "";
    return filled;
  });

  return { headers, rows };
}

/** Header cells of a worksheet, exactly as written in the file. */
function rawHeaders(sheet: XLSX.WorkSheet): string[] {
  const firstRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as unknown[];
  return (firstRow ?? []).map((h) => String(h ?? "").trim());
}

async function loadUpload(uploadId: string) {
  const upload = await prisma.excelUpload.findUnique({ where: { id: uploadId } });
  if (!upload) throw new Error("Upload not found");
  const buffer = await storage.readFile(upload.s3Key);
  return { upload, buffer };
}

export const excelService = {
  /**
   * Parse an upload and describe its sheets: names, row counts, and the headers
   * the client will map columns against.
   */
  async getMetadata(uploadId: string): Promise<UploadMetadata> {
    const { upload, buffer } = await loadUpload(uploadId);

    if (isCsv(upload.originalName)) {
      const { headers, rows } = parseCsv(buffer);
      const normalizedHeaders = headers.map(normalizeHeader);
      return {
        uploadId: upload.id,
        fileName: upload.originalName,
        sizeBytes: upload.sizeBytes,
        kind: "csv",
        sheets: [
          {
            name: CSV_SHEET_NAME,
            rowCount: rows.length,
            headers,
            normalizedHeaders,
            isAutoDetected: false,
          },
        ],
        autoMappings: {},
      };
    }

    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const autoMappings = autoMapSheets(workbook);

    const sheets: SheetMeta[] = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
      const headers = rawHeaders(sheet);

      return {
        name,
        rowCount: Math.max(0, range.e.r - range.s.r),
        headers,
        normalizedHeaders: headers.map(normalizeHeader),
        isAutoDetected: Object.values(autoMappings).includes(name),
      };
    });

    return {
      uploadId: upload.id,
      fileName: upload.originalName,
      sizeBytes: upload.sizeBytes,
      kind: "excel",
      sheets,
      autoMappings,
    };
  },

  /**
   * The rows of one sheet, keyed by raw header text.
   *
   * For a CSV, `sheetName` is ignored beyond validation — there is only one.
   */
  async getSheetData(uploadId: string, sheetName: string): Promise<SheetData> {
    const { upload, buffer } = await loadUpload(uploadId);

    if (isCsv(upload.originalName)) {
      const { headers, rows } = parseCsv(buffer);
      return { sheetName: CSV_SHEET_NAME, headers, rowCount: rows.length, rows };
    }

    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

    const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: "" });
    return { sheetName, headers: rawHeaders(sheet), rowCount: rows.length, rows };
  },

  /**
   * Sheet names for an upload, used to stamp `sheetsFound` at upload time so a
   * client can show the sheet picker without a second round trip.
   */
  async listSheetNames(buffer: Buffer, fileName: string): Promise<string[]> {
    if (isCsv(fileName)) return [CSV_SHEET_NAME];
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames;
  },

  /**
   * Save a field mapping template for a company.
   */
  async saveMappingTemplate(params: {
    companyId: string;
    userId: string;
    name: string;
    jobType: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mapping: any;
  }) {
    return prisma.fieldMappingTemplate.upsert({
      where: {
        companyId_name: {
          companyId: params.companyId,
          name: params.name,
        },
      },
      update: {
        mapping: params.mapping,
        jobType: params.jobType,
        updatedAt: new Date(),
      },
      create: {
        companyId: params.companyId,
        createdById: params.userId,
        name: params.name,
        jobType: params.jobType,
        mapping: params.mapping,
      },
    });
  },

  /**
   * List mapping templates for a company.
   */
  async listMappingTemplates(companyId: string, jobType?: string) {
    return prisma.fieldMappingTemplate.findMany({
      where: {
        companyId,
        ...(jobType ? { jobType } : {}),
      },
      orderBy: { lastUsedAt: "desc" },
    });
  },
};
