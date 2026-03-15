import { Request, Response } from "express";
import { logger, prisma } from "../../../config/index.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../../types/api.types.js";
import { AuthUser } from "../../../types/express.js";
import { applyQueryFilters, QueryOptions } from "../../../utils/prisma.utils.js";

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

export const bankAccountController = {
    /**
     * GET /api/v1/xero/bank-accounts
     * Lists bank accounts.
     */
    async getBankAccounts(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const { search, page, limit, sortBy, sortOrder } = req.query as Record<string, string>;

            const filters: any = { companyId: authedReq.user.companyId, isActive: true };

            const queryOptions: QueryOptions = {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                sortBy,
                sortOrder: sortOrder as any,
                search,
                searchFields: ["name", "code", "bankAccountNumber"],
                filters,
            };

            const prismaQuery = applyQueryFilters(queryOptions, "name");

            const [total, bankAccounts] = await Promise.all([
                prisma.xeroBankAccount.count({ where: prismaQuery.where }),
                prisma.xeroBankAccount.findMany({
                    ...prismaQuery,
                    select: {
                        id: true,
                        xeroAccountId: true,
                        code: true,
                        name: true,
                        bankAccountNumber: true,
                        bankAccountType: true,
                        currencyCode: true
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
                data: bankAccounts
            });
        } catch (err) {
            logger.error("Failed to fetch bank accounts", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to fetch bank accounts");
        }
    },
};
