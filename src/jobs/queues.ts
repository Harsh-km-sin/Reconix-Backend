import { Queue, ConnectionOptions } from "bullmq";
import { env, logger } from "../config/index.js";

const connection: ConnectionOptions = {
    host: env.redisHost,
    port: env.redisPort,
};

/**
 * Queue for Xero data synchronization (Contacts, Invoices, etc.)
 */
export const syncQueue = new Queue("sync-queue", {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

/**
 * Queue for accounting automation jobs (Overpayment Allocation, Invoice Reversal)
 */
export const jobQueue = new Queue("automation-job-queue", {
    connection,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
    },
});

logger.info("BullMQ queues initialized");
