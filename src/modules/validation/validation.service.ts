import { prisma, redis, logger } from "../../config/index.js";
import { getXeroClient } from "../../config/xeroClient.js";

export interface ValidationItem {
    id: string; // Temporary ID from frontend or DB ID
    itemType: "INVOICE_REVERSAL" | "OVERPAYMENT_ALLOCATION";
    invoiceNumber?: string;
    xeroInvoiceId?: string;
    xeroOverpaymentId?: string;
    expectedAmount?: number;
    contactName?: string;
}

export interface ValidationReport {
    id: string;
    status: "VALID" | "WARNING" | "INVALID" | "ERROR";
    warnings: string[];
    errors: string[];
}

/**
 * Simple similarity function (Dice Coefficient) for fuzzy contact name matching.
 */
function getSimilarity(s1: string, s2: string): number {
    const string1 = s1.toLowerCase().replace(/[^a-z0-9]/g, "");
    const string2 = s2.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (string1 === string2) return 1.0;
    if (string1.length < 2 || string2.length < 2) return 0;

    const bigrams1 = new Set();
    for (let i = 0; i < string1.length - 1; i++) bigrams1.add(string1.substring(i, i + 2));

    let intersection = 0;
    for (let i = 0; i < string2.length - 1; i++) {
        if (bigrams1.has(string2.substring(i, i + 2))) intersection++;
    }

    return (2.0 * intersection) / (string1.length + string2.length - 2);
}

const CACHE_TTL = 60 * 15; // 15 minutes

export const validationService = {
    /**
     * Validate a list of items against live Xero data.
     * Uses batching and caching to optimize performance.
     */
    async validateItems(tenantId: string, items: ValidationItem[]): Promise<ValidationReport[]> {
        const xero = await getXeroClient(tenantId);
        const reports: ValidationReport[] = [];
        
        // 1. Check Cache First
        const cacheKey = `validation:${tenantId}:${Buffer.from(JSON.stringify(items)).toString('base64').substring(0, 32)}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            logger.info("Returning cached validation reports");
            return JSON.parse(cached);
        }

        // 2. Batch Fetching Logic
        // We separate items by type and gather IDs/Numbers
        const invoiceItemMap = new Map<string, ValidationItem>();
        const overpaymentItemMap = new Map<string, ValidationItem>();
        
        items.forEach(item => {
            if (item.xeroInvoiceId) invoiceItemMap.set(item.xeroInvoiceId, item);
            else if (item.invoiceNumber) invoiceItemMap.set(item.invoiceNumber, item);

            if (item.xeroOverpaymentId) overpaymentItemMap.set(item.xeroOverpaymentId, item);
        });

        // Fetch Invoices in batches of 100
        const xeroInvoices: any[] = [];
        const invoiceIds = Array.from(invoiceItemMap.keys());
        
        for (let i = 0; i < invoiceIds.length; i += 100) {
            const chunk = invoiceIds.slice(i, i + 100);
            const whereClause = chunk.map(id => id.startsWith('INV-') ? `InvoiceNumber=="${id}"` : `InvoiceID==Guid("${id}")`).join(" OR ");
            try {
                const response = await xero.get(`/Invoices?Where=${encodeURIComponent(whereClause)}`);
                xeroInvoices.push(...(response.data.Invoices || []));
            } catch (err) {
                logger.error("Xero batch invoice fetch failed", { err });
            }
        }

        // Fetch Overpayments
        const xeroOverpayments: any[] = [];
        const opIds = Array.from(overpaymentItemMap.keys());
        for (let i = 0; i < opIds.length; i += 100) {
           const chunk = opIds.slice(i, i + 100);
           const whereClause = chunk.map(id => `OverpaymentID==Guid("${id}")`).join(" OR ");
           try {
               const response = await xero.get(`/Overpayments?Where=${encodeURIComponent(whereClause)}`);
               xeroOverpayments.push(...(response.data.Overpayments || []));
           } catch (err) {
               logger.error("Xero batch overpayment fetch failed", { err });
           }
        }

        // 3. Process Reports
        for (const item of items) {
            const report: ValidationReport = { id: item.id, status: "VALID", warnings: [], errors: [] };
            
            // Link back to fetched data
            const xeroInv = xeroInvoices.find(inv => 
                inv.InvoiceID === item.xeroInvoiceId || inv.InvoiceNumber === item.invoiceNumber
            );
            const xeroOp = xeroOverpayments.find(op => op.OverpaymentID === item.xeroOverpaymentId);

            try {
                if (item.itemType === "INVOICE_REVERSAL") {
                    if (!xeroInv) {
                        report.status = "INVALID";
                        report.errors.push("Invoice not found in Xero or inaccessible");
                    } else {
                        // Check Status
                        if (["VOIDED", "DELETED", "PAID"].includes(xeroInv.Status)) {
                           report.status = "INVALID";
                           report.errors.push(`Invoice is already ${xeroInv.Status}`);
                        }
                        
                        // Float-safe balance check (within 1 cent)
                        if (xeroInv.AmountDue < 0.01) {
                            report.status = "INVALID";
                            report.errors.push("Invoice has no remaining balance to reverse");
                        }

                        // Fuzzy Contact Check
                        if (item.contactName && xeroInv.Contact?.Name) {
                            const similarity = getSimilarity(item.contactName, xeroInv.Contact.Name);
                            if (similarity < 0.9 && similarity > 0.6) {
                                report.status = report.status === "VALID" ? "WARNING" : report.status;
                                report.warnings.push(`Contact name mismatch: "${item.contactName}" vs "${xeroInv.Contact.Name}"`);
                            } else if (similarity <= 0.6) {
                                report.status = "INVALID";
                                report.errors.push(`Significant contact mismatch. Reference for "${xeroInv.Contact.Name}" but file says "${item.contactName}"`);
                            }
                        }

                        // Expected Amount Check
                        if (item.expectedAmount !== undefined) {
                            const diff = Math.abs(xeroInv.AmountDue - item.expectedAmount);
                            if (diff > 0.01) {
                                report.status = report.status === "VALID" ? "WARNING" : report.status;
                                report.warnings.push(`Amount mismatch: Xero shows $${xeroInv.AmountDue} but expected $${item.expectedAmount}`);
                            }
                        }
                    }
                } else if (item.itemType === "OVERPAYMENT_ALLOCATION") {
                    if (!xeroOp) {
                        report.status = "INVALID";
                        report.errors.push("Overpayment not found in Xero");
                    } else if (xeroOp.RemainingCredit < 0.01) {
                        report.status = "INVALID";
                        report.errors.push("Overpayment has no remaining credit");
                    }

                    if (!xeroInv) {
                        report.status = "INVALID";
                        report.errors.push("Target invoice for allocation not found");
                    } else if (xeroInv.AmountDue < 0.01) {
                        report.status = "INVALID";
                        report.errors.push("Target invoice is already fully paid");
                    }
                }
            } catch (err: any) {
                report.status = "ERROR";
                report.errors.push(`Internal validation error: ${err.message}`);
            }

            reports.push(report);
        }

        // 4. Cache Results
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(reports));

        return reports;
    }
};
