import * as XLSX from "xlsx";

/**
 * Robust Excel parsing with auto-detection of sheets and column mapping.
 * Aligned with Reconix Design Doc Phase 4.
 */

const COLUMN_ALIASES: Record<string, string> = {
  // Overpayments
  "supplier": "SupplierName",
  "supplier name": "SupplierName",
  "vendorname": "SupplierName",
  "payment date": "PaymentDate",
  "date of payment": "PaymentDate",
  "overpayment amount": "OverpaymentAmount",
  "amount": "OverpaymentAmount",
  "amount usd": "OverpaymentAmount",
  "bank": "BankAccount",
  "bank account": "BankAccount",

  // Bills
  "invoice date": "InvoiceDate",
  "date": "InvoiceDate",
  "invoice reference": "InvoiceReference",
  "reference": "InvoiceReference",
  "invoice ref": "InvoiceReference",
  "ref": "InvoiceReference",
  "pay amount": "PayAmount",
  "payment amount": "PayAmount",
  "amount to pay": "PayAmount",

  // Invoice Reversal
  "invoice total": "InvoiceTotal",
  "total": "InvoiceTotal",
  "unit price ex": "UnitPriceEx",
  "unit price (ex)": "UnitPriceEx",
  "unit price (ex) (source)": "UnitPriceEx",
  "tax": "TaxAmount",
  "tax amount": "TaxAmount",
  "tax (source)": "TaxAmount",
  "currency": "CurrencyCode",
  "currency code": "CurrencyCode",
  "reversal date": "ReversalDate",
};

export const normalizeHeader = (raw: string): string => {
  const clean = raw.trim().toLowerCase().replace(/\uFEFF/g, "");
  return COLUMN_ALIASES[clean] || raw.trim();
};

export const detectSheetType = (headers: string[]): "overpayments" | "bills" | "invoices" | "unknown" => {
  const normalized = headers.map(h => normalizeHeader(h));
  
  const has = (cols: string[]) => cols.every(c => normalized.includes(c));

  if (has(["SupplierName", "PaymentDate", "OverpaymentAmount", "BankAccount"])) return "overpayments";
  if (has(["SupplierName", "InvoiceDate", "InvoiceReference", "PayAmount"])) return "bills";
  if (has(["SupplierName", "InvoiceReference", "InvoiceDate", "InvoiceTotal", "UnitPriceEx", "TaxAmount"])) return "invoices";

  return "unknown";
};

export const autoMapSheets = (workbook: XLSX.WorkBook) => {
  const results: Record<string, string> = {}; // { type: sheetName }

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (data.length > 0) {
      const type = detectSheetType(data[0].map(h => String(h || "")));
      if (type !== "unknown" && !results[type]) {
        results[type] = name;
      }
    }
  }

  return results;
};
