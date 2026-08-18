/** One item submitted for pre-flight validation against Xero. */
export interface ValidationItem {
  id: string; // Temporary ID from frontend or DB ID
  itemType: "INVOICE_REVERSAL" | "OVERPAYMENT_ALLOCATION";
  invoiceNumber?: string;
  xeroInvoiceId?: string;
  xeroOverpaymentId?: string;
  expectedAmount?: number;
  contactName?: string;
}

/** The verdict for a single validated item. */
export interface ValidationReport {
  id: string;
  status: "VALID" | "WARNING" | "INVALID" | "ERROR";
  warnings: string[];
  errors: string[];
}
