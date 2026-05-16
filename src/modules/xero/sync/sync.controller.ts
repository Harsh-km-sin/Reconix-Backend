import { Request, Response } from "express";
import { logger } from "../../../config/index.js";
import { syncQueue } from "../../../jobs/queues.js";
import { SyncJobType } from "../../../jobs/workers/syncWorker.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../../types/api.types.js";
import { AuthUser } from "../../../types/express.js";

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

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
            const job = await syncQueue.add(`sync-manual-${tenantId}-${Date.now()}`, {
                type: SyncJobType.FULL_SYNC,
                tenantId,
            });

            sendSuccess(res, { jobId: job.id, message: "Sync started" });
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

            sendSuccess(res, {
                id: job.id,
                progress: job.progress,
                status: await job.getState(),
            });
        } catch (err) {
            logger.error("Failed to get sync status", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to get status");
        }
    },
};
