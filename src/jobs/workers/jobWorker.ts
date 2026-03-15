import { Worker, Job } from "bullmq";
import { env, logger, prisma } from "../../config/index.js";
import { getXeroClient } from "../../config/xeroClient.js";
import type { AutomationJobPayload } from "../../modules/job/job.interface.js";
import { type JsonValue } from "@prisma/client/runtime/library";
import { handleInvoiceReversalItem } from "../handlers/invoiceReversal.handler.js";
import { handleOverpaymentAllocationItem } from "../handlers/overpaymentAllocation.handler.js";
import { generateIdempotencyKey, checkIdempotency, markIdempotencyCompleted, markIdempotencyFailed } from "../../utils/idempotency.js";

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

            await prisma.job.update({
                where: { id: jobId },
                data: { status: "RUNNING", startedAt: new Date() },
            });

            let processed = 0, failed = 0, skipped = 0;
            const total = fullJob.jobItems.length;

            for (let i = 0; i < total; i++) {
                const item = fullJob.jobItems[i];
                
                // --- Idempotency Guard ---
                const idKey = generateIdempotencyKey(jobId, item.id, fullJob.jobType);
                const idCheck = await checkIdempotency(idKey);
                
                if (idCheck.alreadyProcessed) {
                    if (idCheck.status === "COMPLETED") {
                        processed++;
                        logger.info(`Item ${item.id} already processed successfully. Skipping.`);
                        continue;
                    }
                    // If FAILED, we might want to retry, so we fall through
                }

                try {
                    if (fullJob.jobType === "INVOICE_REVERSAL") {
                        await handleInvoiceReversalItem(fullJob, item, tenantId);
                    } else if (fullJob.jobType === "OVERPAYMENT_ALLOCATION") {
                        await handleOverpaymentAllocationItem(fullJob, item, tenantId);
                    } else {
                        throw new Error(`Unsupported job type: ${fullJob.jobType}`);
                    }

                    await markIdempotencyCompleted(idKey);
                    processed++;

                } catch (itemErr: any) {
                    failed++;
                    await markIdempotencyFailed(idKey, itemErr.response?.data || { message: itemErr.message });
                    logger.error(`JobItem ${item.id} failed`, { error: itemErr.message });
                }

                // Update Progress
                await job.updateProgress(Math.round(((i + 1) / total) * 100));
                await prisma.job.update({
                    where: { id: jobId },
                    data: { processedCount: processed, failedCount: failed, skippedCount: skipped },
                });
            }

            const finalStatus = failed === 0 ? "COMPLETED" : (processed > 0 ? "PARTIAL" : "FAILED");
            await prisma.job.update({
                where: { id: jobId },
                data: { status: finalStatus, completedAt: new Date() },
            });

            logger.info(`Job finished [${jobId}]: ${finalStatus} [P:${processed}, F:${failed}]`);

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
