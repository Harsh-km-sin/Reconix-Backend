import { Request, Response } from "express";
import { env, logger, prisma } from "../../config/index.js";
import { jobQueue } from "../../jobs/queues.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../types/api.types.js";
import { AuthUser } from "../../types/express.js";
import type { CreateJobBody, AddItemsBody, AutomationJobPayload } from "./job.interface.js";

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

export const jobController = {

    /**
     * POST /api/v1/jobs
     * Create a new job in PENDING status.
     */
    async createJob(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const { jobType, reversalDate, notes } = req.body as CreateJobBody;

            if (!jobType) {
                sendError(res, ErrorCode.VALIDATION_ERROR, "jobType is required", HttpStatus.BAD_REQUEST);
                return;
            }

            const job = await prisma.job.create({
                data: {
                    companyId: authedReq.user.companyId,
                    createdByUserId: authedReq.user.userId,
                    jobType,
                    reversalDate: reversalDate ? new Date(reversalDate) : null,
                    notes: notes ?? null,
                    totalItems: 0,
                },
            });

            sendSuccess(res, job, HttpStatus.CREATED);
        } catch (err) {
            logger.error("Failed to create job", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to create job");
        }
    },

    /**
     * GET /api/v1/jobs
     * List all jobs for the user's active company, paginated.
     */
    async listJobs(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const {
                status,
                jobType,
                page = "1",
                limit = "20",
            } = req.query as Record<string, string>;

            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

            const where: any = { companyId: authedReq.user.companyId };
            if (status) where.status = status;
            if (jobType) where.jobType = jobType;

            const [total, jobs] = await Promise.all([
                prisma.job.count({ where }),
                prisma.job.findMany({
                    where,
                    select: {
                        id: true,
                        jobType: true,
                        status: true,
                        totalItems: true,
                        processedCount: true,
                        skippedCount: true,
                        failedCount: true,
                        reversalDate: true,
                        notes: true,
                        startedAt: true,
                        completedAt: true,
                        createdAt: true,
                        approvedAt: true,
                        createdBy: { select: { id: true, name: true, email: true } },
                        approvedBy: { select: { id: true, name: true, email: true } },
                    },
                    orderBy: { createdAt: "desc" },
                    skip: (pageNum - 1) * limitNum,
                    take: limitNum,
                }),
            ]);

            sendSuccess(res, { total, page: pageNum, limit: limitNum, data: jobs });
        } catch (err) {
            logger.error("Failed to list jobs", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to list jobs");
        }
    },

    /**
     * GET /api/v1/jobs/:jobId
     * Get a single job with all its items.
     */
    async getJob(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const { jobId } = req.params;

            const job = await prisma.job.findUnique({
                where: { id: jobId },
                include: {
                    createdBy: { select: { id: true, name: true, email: true } },
                    approvedBy: { select: { id: true, name: true, email: true } },
                    jobItems: {
                        select: {
                            id: true,
                            itemType: true,
                            invoiceNumber: true,
                            contactName: true,
                            expectedAmount: true,
                            actualAmountDue: true,
                            amountMismatchAcknowledged: true,
                            xeroCreditNoteId: true,
                            creditNoteNumber: true,
                            xeroAllocationId: true,
                            allocatedAmount: true,
                            status: true,
                            skipReason: true,
                            failureReason: true,
                            executedAt: true,
                            createdAt: true,
                            xeroInvoice: { select: { xeroInvoiceId: true, invoiceNumber: true, total: true, amountDue: true, currencyCode: true } },
                            xeroOverpayment: { select: { xeroOverpaymentId: true, remainingCredit: true, currencyCode: true } },
                        },
                        orderBy: { createdAt: "asc" },
                    },
                },
            });

            if (!job || job.companyId !== authedReq.user.companyId) {
                sendError(res, ErrorCode.NOT_FOUND, "Job not found", HttpStatus.NOT_FOUND);
                return;
            }

            sendSuccess(res, job);
        } catch (err) {
            logger.error("Failed to get job", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to get job");
        }
    },

    /**
     * DELETE /api/v1/jobs/:jobId
     * Delete a PENDING job. Only ADMIN can delete.
     */
    async deleteJob(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            if (authedReq.user.role !== "ADMIN") {
                sendError(res, ErrorCode.FORBIDDEN, "Only ADMIN can delete jobs", HttpStatus.FORBIDDEN);
                return;
            }

            const { jobId } = req.params;
            const job = await prisma.job.findUnique({ where: { id: jobId } });

            if (!job || job.companyId !== authedReq.user.companyId) {
                sendError(res, ErrorCode.NOT_FOUND, "Job not found", HttpStatus.NOT_FOUND);
                return;
            }

            if (job.status !== "PENDING") {
                sendError(res, ErrorCode.VALIDATION_ERROR, "Only PENDING jobs can be deleted", HttpStatus.BAD_REQUEST);
                return;
            }

            await prisma.job.delete({ where: { id: jobId } });
            sendSuccess(res, { message: "Job deleted" });
        } catch (err) {
            logger.error("Failed to delete job", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to delete job");
        }
    },

    /**
     * POST /api/v1/jobs/:jobId/items
     * Bulk-add items to a PENDING job.
     */
    async addItems(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const { jobId } = req.params;
            const { items } = req.body as AddItemsBody;

            if (!items || !Array.isArray(items) || items.length === 0) {
                sendError(res, ErrorCode.VALIDATION_ERROR, "items array is required and must not be empty", HttpStatus.BAD_REQUEST);
                return;
            }

            const job = await prisma.job.findUnique({ where: { id: jobId } });

            if (!job || job.companyId !== authedReq.user.companyId) {
                sendError(res, ErrorCode.NOT_FOUND, "Job not found", HttpStatus.NOT_FOUND);
                return;
            }

            if (job.status !== "PENDING") {
                sendError(res, ErrorCode.VALIDATION_ERROR, "Can only add items to PENDING jobs", HttpStatus.BAD_REQUEST);
                return;
            }

            await prisma.$transaction([
                prisma.jobItem.createMany({
                    data: items.map((item) => ({
                        jobId,
                        companyId: authedReq.user.companyId!,
                        itemType: item.itemType,
                        xeroInvoiceId: item.xeroInvoiceId ?? null,
                        xeroOverpaymentId: item.xeroOverpaymentId ?? null,
                        invoiceNumber: item.invoiceNumber ?? null,
                        contactName: item.contactName ?? null,
                        expectedAmount: item.expectedAmount ?? null,
                        actualAmountDue: item.actualAmountDue ?? null,
                    })),
                }),
                prisma.job.update({
                    where: { id: jobId },
                    data: { totalItems: { increment: items.length } },
                }),
            ]);

            sendSuccess(res, { added: items.length }, HttpStatus.CREATED);
        } catch (err) {
            logger.error("Failed to add items to job", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to add items");
        }
    },

    /**
     * DELETE /api/v1/jobs/:jobId/items/:itemId
     * Remove a single item from a PENDING job.
     */
    async removeItem(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const { jobId, itemId } = req.params;

            const job = await prisma.job.findUnique({ where: { id: jobId } });
            if (!job || job.companyId !== authedReq.user.companyId) {
                sendError(res, ErrorCode.NOT_FOUND, "Job not found", HttpStatus.NOT_FOUND);
                return;
            }
            if (job.status !== "PENDING") {
                sendError(res, ErrorCode.VALIDATION_ERROR, "Can only remove items from PENDING jobs", HttpStatus.BAD_REQUEST);
                return;
            }

            const item = await prisma.jobItem.findUnique({ where: { id: itemId } });
            if (!item || item.jobId !== jobId) {
                sendError(res, ErrorCode.NOT_FOUND, "Job item not found", HttpStatus.NOT_FOUND);
                return;
            }

            await prisma.$transaction([
                prisma.jobItem.delete({ where: { id: itemId } }),
                prisma.job.update({
                    where: { id: jobId },
                    data: { totalItems: { decrement: 1 } },
                }),
            ]);

            sendSuccess(res, { message: "Item removed" });
        } catch (err) {
            logger.error("Failed to remove job item", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to remove item");
        }
    },

    /**
     * PATCH /api/v1/jobs/:jobId/items/:itemId/acknowledge
     * Acknowledge an amount mismatch on a job item.
     */
    async acknowledgeItem(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const { jobId, itemId } = req.params;

            const job = await prisma.job.findUnique({ where: { id: jobId } });
            if (!job || job.companyId !== authedReq.user.companyId) {
                sendError(res, ErrorCode.NOT_FOUND, "Job not found", HttpStatus.NOT_FOUND);
                return;
            }

            const item = await prisma.jobItem.findUnique({ where: { id: itemId } });
            if (!item || item.jobId !== jobId) {
                sendError(res, ErrorCode.NOT_FOUND, "Job item not found", HttpStatus.NOT_FOUND);
                return;
            }

            const updated = await prisma.jobItem.update({
                where: { id: itemId },
                data: { amountMismatchAcknowledged: true },
            });

            sendSuccess(res, updated);
        } catch (err) {
            logger.error("Failed to acknowledge job item", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to acknowledge item");
        }
    },

    /**
     * POST /api/v1/jobs/:jobId/approve
     * APPROVER or ADMIN only: enqueue job for execution.
     */
    async approveJob(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const role = authedReq.user.role;
            if (role !== "ADMIN" && role !== "APPROVER") {
                sendError(res, ErrorCode.FORBIDDEN, "Only ADMIN or APPROVER can approve jobs", HttpStatus.FORBIDDEN);
                return;
            }

             const { jobId } = req.params;
            const job = await prisma.job.findUnique({ where: { id: jobId } });

            if (!job || job.companyId !== authedReq.user.companyId) {
                sendError(res, ErrorCode.NOT_FOUND, "Job not found", HttpStatus.NOT_FOUND);
                return;
            }

            // --- Four-Eyes Principle Enforcement ---
            if (job.createdByUserId === authedReq.user.userId && env.nodeEnv === 'production') {
                sendError(res, ErrorCode.FORBIDDEN, "Four-Eyes Principle: You cannot approve a job you created", HttpStatus.FORBIDDEN);
                return;
            }

            if (job.status !== "PENDING") {
                sendError(res, ErrorCode.VALIDATION_ERROR, `Job is already in ${job.status} status`, HttpStatus.BAD_REQUEST);
                return;
            }

            if (job.totalItems === 0) {
                sendError(res, ErrorCode.VALIDATION_ERROR, "Cannot approve a job with no items", HttpStatus.BAD_REQUEST);
                return;
            }

            // Fetch the xeroConnection to get tenantId for the Xero API client
            const connection = await prisma.xeroConnection.findFirst({
                where: { userId: authedReq.user.userId, isActive: true },
            });

            if (!connection) {
                sendError(res, ErrorCode.VALIDATION_ERROR, "No active Xero connection found", HttpStatus.BAD_REQUEST);
                return;
            }

            // Transition to RUNNING and enqueue
            await prisma.job.update({
                where: { id: jobId },
                data: {
                    status: "RUNNING",
                    startedAt: new Date(),
                    approvedByUserId: authedReq.user.userId,
                    approvedAt: new Date(),
                },
            });

            const payload: AutomationJobPayload = {
                jobId,
                companyId: authedReq.user.companyId,
                tenantId: connection.tenantId,
            };

            await jobQueue.add(`job-${jobId}`, payload, { jobId });

            logger.info(`Job ${jobId} approved and enqueued`, { approvedBy: authedReq.user.userId });
            sendSuccess(res, { message: "Job approved and execution started", jobId });
        } catch (err) {
            logger.error("Failed to approve job", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to approve job");
        }
    },
};
