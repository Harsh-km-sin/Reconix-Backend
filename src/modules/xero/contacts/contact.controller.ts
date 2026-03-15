import { Request, Response } from "express";
import { logger, prisma } from "../../../config/index.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../../types/api.types.js";
import { AuthUser } from "../../../types/express.js";
import { applyQueryFilters, QueryOptions } from "../../../utils/prisma.utils.js";

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

export const contactController = {
    /**
     * GET /api/v1/xero/contacts
     * Lists synced contacts.
     */
    async getContacts(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const { search, page, limit, sortBy, sortOrder, isSupplier, isCustomer } = req.query as Record<string, string>;

            const filters: any = { companyId: authedReq.user.companyId };
            if (isSupplier !== undefined) filters.isSupplier = isSupplier === "true";
            if (isCustomer !== undefined) filters.isCustomer = isCustomer === "true";

            const queryOptions: QueryOptions = {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                sortBy,
                sortOrder: sortOrder as any,
                search,
                searchFields: ["name", "email"],
                filters,
            };

            const prismaQuery = applyQueryFilters(queryOptions, "name");

            const [total, contacts] = await Promise.all([
                prisma.xeroContact.count({ where: prismaQuery.where }),
                prisma.xeroContact.findMany({
                    ...prismaQuery,
                    select: {
                        id: true,
                        xeroContactId: true,
                        name: true,
                        email: true,
                        isSupplier: true,
                        isCustomer: true,
                        defaultCurrency: true
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
                data: contacts
            });
        } catch (err) {
            logger.error("Failed to fetch contacts", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to fetch contacts");
        }
    },
};
