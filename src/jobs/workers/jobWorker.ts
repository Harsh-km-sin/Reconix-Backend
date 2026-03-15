import { Worker, Job } from "bullmq";
import { env, logger, prisma } from "../../config/index.js";
import { getXeroClient } from "../../config/xeroClient.js";
import type { AutomationJobPayload } from "../../modules/job/job.interface.js";
import { type JsonValue } from "@prisma/client/runtime/library";

interface XeroInvoiceRawJson {
    Contact?: {
        ContactID: string;
    };
    LineItems?: Array<{
        Description?: string;
        Quantity?: number;
        UnitAmount?: number;
        AccountCode?: string;
        TaxType?: string;
        Tracking?: any;
    }>;
}

const connection = {
    host: env.redisHost,
    port: env.redisPort,
};

/**
 * Worker to process bulk accounting operations (Invoice Reversals, Overpayment Allocations).
 */
export const jobWorker = new Worker(
    "automation-job-queue",
    async (job: Job<AutomationJobPayload>) => {
        const { jobId, companyId, tenantId } = job.data;
        logger.info(`Starting Job execution [${jobId}] for company [${companyId}]`);

        try {
            const fullJob = await prisma.job.findUnique({
                where: { id: jobId },
                include: {
                    jobItems: {
                        include: {
                            xeroInvoice: true,
                            xeroOverpayment: true,
                        },
                    },
                },
            });

            if (!fullJob) throw new Error("Job record not found");

            const xero = await getXeroClient(tenantId);
            let processed = 0, failed = 0, skipped = 0;
            const total = fullJob.jobItems.length;

            for (let i = 0; i < total; i++) {
                const item = fullJob.jobItems[i];
                try {
                    if (fullJob.jobType === "INVOICE_REVERSAL") {
                        if (!item.xeroInvoice) {
                            throw new Error("Missing linked invoice for reversal");
                        }

                        // 1. Create Credit Note to reverse the invoice
                        const rawJson = item.xeroInvoice.rawXeroJson as unknown as XeroInvoiceRawJson;

                        const cnResponse = await xero.post("/CreditNotes", {
                            Type: "ACCPAYCREDIT",
                            Contact: { ContactID: rawJson?.Contact?.ContactID },
                            Date: fullJob.reversalDate ? fullJob.reversalDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
                            LineItems: rawJson?.LineItems?.map((li: any) => ({
                                Description: `Reversal of ${item.invoiceNumber}: ${li.Description}`,
                                Quantity: li.Quantity,
                                UnitAmount: li.UnitAmount,
                                AccountCode: li.AccountCode,
                                TaxType: li.TaxType,
                                Tracking: li.Tracking,
                            })),
                            Status: "AUTHORISED",
                        });

                        const xeroCn = cnResponse.data.CreditNotes[0];

                        // 2. Allocate Credit Note to Invoice
                        await xero.put(`/CreditNotes/${xeroCn.CreditNoteID}/Allocations`, {
                            Allocations: [{
                                Invoice: { InvoiceID: item.xeroInvoice.xeroInvoiceId },
                                Amount: item.xeroInvoice.amountDue,
                                Date: new Date().toISOString().split("T")[0],
                            }]
                        });

                        await prisma.jobItem.update({
                            where: { id: item.id },
                            data: {
                                status: "PROCESSED",
                                xeroCreditNoteId: xeroCn.CreditNoteID,
                                creditNoteNumber: xeroCn.CreditNoteNumber,
                                executedAt: new Date(),
                            },
                        });
                        processed++;

                    } else if (fullJob.jobType === "OVERPAYMENT_ALLOCATION") {
                        if (!item.xeroOverpayment || !item.xeroInvoice) {
                            throw new Error("Missing linked overpayment or invoice for allocation");
                        }

                        // Allocate Overpayment to Invoice
                        const amountToAllocate = Math.min(
                            Number(item.xeroOverpayment.remainingCredit),
                            Number(item.xeroInvoice.amountDue)
                        );

                        const allocResponse = await xero.put(`/Overpayments/${item.xeroOverpayment.xeroOverpaymentId}/Allocations`, {
                            Allocations: [{
                                Invoice: { InvoiceID: item.xeroInvoice.xeroInvoiceId },
                                Amount: amountToAllocate,
                                Date: new Date().toISOString().split("T")[0],
                            }]
                        });

                        const alloc = allocResponse.data.Allocations[0];

                        await prisma.jobItem.update({
                            where: { id: item.id },
                            data: {
                                status: "PROCESSED",
                                xeroAllocationId: alloc.AllocationID,
                                allocatedAmount: amountToAllocate,
                                executedAt: new Date(),
                            },
                        });
                        processed++;

                    } else {
                        throw new Error(`Unsupported job type: ${fullJob.jobType}`);
                    }

                } catch (itemErr: any) {
                    failed++;
                    const errorMessage = itemErr.response?.data?.Elements?.[0]?.ValidationErrors?.[0]?.Message
                        || itemErr.response?.data?.Message
                        || itemErr.message;

                    await prisma.jobItem.update({
                        where: { id: item.id },
                        data: {
                            status: "FAILED",
                            failureReason: errorMessage,
                            failureRawError: itemErr.response?.data || { message: itemErr.message },
                        },
                    });
                    logger.error(`JobItem ${item.id} failed`, { error: errorMessage });
                }

                // Update Job Progress
                await job.updateProgress(Math.round(((i + 1) / total) * 100));
                await prisma.job.update({
                    where: { id: jobId },
                    data: { processedCount: processed, failedCount: failed, skippedCount: skipped },
                });
            }

            // Final Job Update
            const finalStatus = failed === 0 ? "COMPLETED" : (processed > 0 ? "PARTIAL" : "FAILED");
            await prisma.job.update({
                where: { id: jobId },
                data: {
                    status: finalStatus,
                    completedAt: new Date(),
                },
            });

            logger.info(`Job ${jobId} finished with status ${finalStatus} [P:${processed}, F:${failed}, S:${skipped}]`);

        } catch (err) {
            logger.error(`Job worker execution failed for Job ${jobId}`, { err });
            await prisma.job.update({
                where: { id: jobId },
                data: { status: "FAILED", completedAt: new Date() },
            });
            throw err;
        }
    },
    { connection, concurrency: 2 }
);

jobWorker.on("failed", (job, err) => {
    logger.error(`BullMQ Job ${job?.id} failed`, { err });
});
