import { Request, Response } from "express";
import { logger, prisma } from "../../../config/index.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../../types/api.types.js";
import { AuthUser } from "../../../types/express.js";
import { applyQueryFilters, QueryOptions } from "../../../utils/prisma.utils.js";

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

export const overpaymentController = {
    /**
     * GET /api/v1/xero/overpayments
     * Lists overpayments from local DB mirror.
     */
    async getOverpayments(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const { page, limit, sortBy, sortOrder, search, contactId } = req.query as Record<string, string>;

            const filters: any = {
                companyId: authedReq.user.companyId,
                remainingCredit: { gt: 0 },
            };

            if (contactId) filters.xeroContactId = contactId;

            const queryOptions: QueryOptions = {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                sortBy,
                sortOrder: sortOrder as any,
                search,
                searchFields: ["bankAccountXeroId"], // Overpayments don't have many searchable text fields other than relation IDs
                filters,
            };

            const prismaQuery = applyQueryFilters(queryOptions, "overpaymentDate");

            const [total, overpayments] = await Promise.all([
                prisma.xeroOverpayment.count({ where: prismaQuery.where }),
                prisma.xeroOverpayment.findMany({
                    ...prismaQuery,
                    select: {
                        id: true,
                        xeroOverpaymentId: true,
                        overpaymentDate: true,
                        currencyCode: true,
                        remainingCredit: true,
                        total: true,
                        status: true,
                        bankAccountXeroId: true,
                        contact: { select: { id: true, name: true, xeroContactId: true } },
                    },
                }),
            ]);

            const pageNum = queryOptions.page || 1;
            const limitNum = queryOptions.limit || 50;

            sendSuccess(res, {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
                data: overpayments
            });
        } catch (err) {
            logger.error("Failed to fetch overpayments", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to fetch overpayments");
        }
    },
};
