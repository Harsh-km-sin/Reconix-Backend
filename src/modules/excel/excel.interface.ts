/**
 * The upload/parse contract the job builder consumes.
 *
 * The client used to read spreadsheets itself with a bundled copy of `xlsx`.
 * These shapes exist so it does not have to: everything the builder needs to
 * pick a sheet and map its columns is returned by the API.
 */

/** One row of a sheet, keyed by its raw header text. */
export type SheetRow = Record<string, string | number | boolean | null>;

/** What we can tell about a sheet without the user choosing it yet. */
export interface SheetMeta {
  name: string;
  /** Data rows, excluding the header row. */
  rowCount: number;
  /**
   * Header cells exactly as they appear in the file. These are the keys of
   * every object in `rows`, so the column mapper can line them up.
   */
  headers: string[];
  /**
   * The same headers run through the alias table (e.g. "Supplier Name" ->
   * "SupplierName"). Offered as mapping hints; never used as row keys.
   */
  normalizedHeaders: string[];
  /** True when this sheet matched one of the known layouts. */
  isAutoDetected: boolean;
}

/** Everything known about an upload once it has been parsed. */
export interface UploadMetadata {
  uploadId: string;
  fileName: string;
  sizeBytes: number;
  /** `csv` files are presented as a single sheet so clients need one code path. */
  kind: "excel" | "csv";
  sheets: SheetMeta[];
  /** Detected layout -> sheet name, e.g. `{ bills: "Sheet1" }`. */
  autoMappings: Record<string, string>;
}

/** The parsed contents of one sheet. */
export interface SheetData {
  sheetName: string;
  /** Raw header cells; the keys of each object in `rows`. */
  headers: string[];
  rowCount: number;
  rows: SheetRow[];
}
