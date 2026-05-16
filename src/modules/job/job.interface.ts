import type { JobType, JobItemType } from "@prisma/client";

/**
 * Request body for creating a new job.
 */
export interface CreateJobBody {
    jobType: JobType;  // "INVOICE_REVERSAL" | "OVERPAYMENT_ALLOCATION" | "OVERPAYMENT_CREATION"
    reversalDate?: string; // ISO date string, required for INVOICE_REVERSAL
    notes?: string;
}

/**
 * Configuration for a single line item in a partial reversal.
 */
export interface ReversalLineConfig {
    lineItemId?: string;
    description?: string;
    quantity?: number;      // Overriden quantity for partial reversal
    unitAmount?: number;    // Override unit amount for partial reversal
}

/**
 * Reversal configuration attached to a JobItem for INVOICE_REVERSAL jobs.
 * Controls FX, date, partial line items, and audit memo.
 */
export interface ReversalConfig {
    reversalType: "FULL" | "PARTIAL";
    creditNoteNumber?: string;   // Manual override; auto-generated if omitted
    reason?: string;             // Memo for audit: "Vendor dispute", "Duplicate bill", etc.
    // Exchange rate is always sourced from the original bill (never overridden)
    partialAmount?: number;      // For partial by total amount: scales all lines proportionally
    lineConfigs?: ReversalLineConfig[];  // For partial by line item (advanced)
}

/**
 * A single item to add to a job.
 * For INVOICE_REVERSAL: provide xeroInvoiceId.
 * For OVERPAYMENT_ALLOCATION: provide xeroOverpaymentId.
 */
export interface JobItemInput {
    itemType: JobItemType;        // "INVOICE" | "OVERPAYMENT"
    xeroInvoiceId?: string;       // DB id (xeroInvoice.id), for INVOICE_REVERSAL
    xeroOverpaymentId?: string;   // DB id (xeroOverpayment.id), for OVERPAYMENT_ALLOCATION
    invoiceNumber?: string;
    contactName?: string;
    expectedAmount?: number;
    actualAmountDue?: number;
    reversalConfig?: ReversalConfig; // Optional config for partial reversals
}

/**
 * Request body for bulk-adding items to a job.
 */
export interface AddItemsBody {
    items: JobItemInput[];
}

/**
 * BullMQ job payload for the automation-job-queue.
 */
export interface AutomationJobPayload {
    jobId: string;
    companyId: string;
    tenantId: string; // Xero tenantId (from xeroConnection)
}
