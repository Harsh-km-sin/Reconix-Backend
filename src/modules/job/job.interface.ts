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
