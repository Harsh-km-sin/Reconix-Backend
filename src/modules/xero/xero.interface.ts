/**
 * Shapes for the raw Xero API payloads we persist verbatim in
 * `XeroInvoice.rawXeroJson` (a Prisma `Json` column).
 *
 * These describe what our code *reads* back out — they are not an exhaustive
 * model of Xero's Invoice resource. Because the column is untyped JSON, values
 * are asserted into these types at the read site rather than validated.
 */

/** A single line on a raw Xero invoice. */
export interface XeroRawLineItem {
  LineItemID?: string;
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  AccountCode?: string;
  ItemCode?: string;
  TaxType?: string;
  TaxAmount?: number;
  LineAmount?: number;
  /** Xero tracking categories; shape varies by org configuration. */
  Tracking?: unknown[];
}

/** The persisted raw Xero invoice payload. */
export interface XeroInvoiceRawJson {
  /** Absent on malformed payloads; read sites must guard before dereferencing. */
  Contact?: {
    ContactID: string;
  };
  LineItems?: XeroRawLineItem[];
  /** FX rate on the original bill; reused on the credit note for exact matching. */
  CurrencyRate?: number;
  CurrencyCode?: string;
  LineAmountTypes?: string;
  TotalTax?: number;
}
