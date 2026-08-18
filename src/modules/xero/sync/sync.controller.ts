import { Request, Response } from "express";
import { logger, redis, prisma } from "../../../config/index.js";
import { syncQueue } from "../../../jobs/queues.js";
import { SyncJobType, syncLockKey } from "../../../jobs/workers/syncWorker.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../../types/api.types.js";
import type { AuthenticatedRequest } from "../../../types/express.js";

export const syncController = {
    /**
     * POST /api/v1/xero/sync/:tenantId
     */
    async triggerSync(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user) {
                sendError(res, ErrorCode.UNAUTHORIZED, "Unauthorized");
                return;
            }

            const { tenantId } = req.params;
            // Full re-sync ignores the watermark; default is incremental.
            const full = (req.body as { full?: boolean })?.full === true;
            const type = full ? SyncJobType.FULL_SYNC : SyncJobType.INCREMENTAL_SYNC;

            // Fail fast with a clear, actionable message rather than enqueueing a
            // job that will throw deep in the worker.
            const conn = await prisma.xeroConnection.findUnique({
                where: { tenantId },
                select: { isActive: true },
            });
            if (!conn) {
                sendError(res, ErrorCode.NOT_FOUND, "Xero connection not found for this company", HttpStatus.NOT_FOUND);
                return;
            }
            if (!conn.isActive) {
                sendError(
                    res,
                    ErrorCode.VALIDATION_ERROR,
                    "This Xero connection has expired and must be reconnected before syncing.",
                    HttpStatus.BAD_REQUEST
                );
                return;
            }

            // Per-tenant lock so a second trigger can't run an overlapping sync.
            // The worker releases it on completion; the TTL is a crash backstop.
            const acquired = await redis.set(syncLockKey(tenantId), "1", "EX", 900, "NX");
            if (!acquired) {
                sendError(res, ErrorCode.CONFLICT, "A sync is already running for this company", HttpStatus.CONFLICT);
                return;
            }

            try {
                const job = await syncQueue.add(`sync-${tenantId}-${Date.now()}`, { type, tenantId });
                sendSuccess(res, {
                    jobId: job.id,
                    type,
                    message: full ? "Full sync started" : "Incremental sync started",
                });
            } catch (enqueueErr) {
                await redis.del(syncLockKey(tenantId));
                throw enqueueErr;
            }
        } catch (err) {
            logger.error("Failed to trigger sync", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to start sync");
        }
    },

    /**
     * GET /api/v1/xero/sync/status/:jobId
     */
    async getSyncStatus(req: Request, res: Response): Promise<void> {
        try {
            const { jobId } = req.params;
            const job = await syncQueue.getJob(jobId);
            if (!job) {
                // Job no longer exists in queue — it has completed/been cleaned up
                sendSuccess(res, { id: jobId, progress: 100, status: "completed" });
                return;
            }

            const state = await job.getState();
            sendSuccess(res, {
                id: job.id,
                progress: job.progress,
                status: state,
                // Surface WHY it failed so the UI can show something actionable
                // instead of a generic "Sync failed".
                failedReason: state === "failed" ? job.failedReason ?? null : null,
            });
        } catch (err) {
            logger.error("Failed to get sync status", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to get status");
        }
    },

    /**
     * GET /api/v1/xero/sync/history/:tenantId
     * Recent sync runs for the company behind this Xero tenant.
     */
    async getSyncHistory(req: Request, res: Response): Promise<void> {
        try {
            const { tenantId } = req.params;
            const company = await prisma.company.findUnique({
                where: { xeroTenantId: tenantId },
                select: { id: true },
            });
            if (!company) {
                sendError(res, ErrorCode.NOT_FOUND, "Company not found", HttpStatus.NOT_FOUND);
                return;
            }
            const logs = await prisma.syncLog.findMany({
                where: { companyId: company.id },
                orderBy: { startedAt: "desc" },
                take: 20,
                select: {
                    id: true,
                    syncType: true,
                    status: true,
                    recordsFetched: true,
                    startedAt: true,
                    completedAt: true,
                    errorMessage: true,
                },
            });
            sendSuccess(res, logs);
        } catch (err) {
            logger.error("Failed to get sync history", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to get sync history");
        }
    },
};
