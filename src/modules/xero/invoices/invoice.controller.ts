import { Request, Response } from "express";
import { logger, prisma } from "../../../config/index.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../../types/api.types.js";
import { AuthUser } from "../../../types/express.js";
import { applyQueryFilters, QueryOptions } from "../../../utils/prisma.utils.js";

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

export const invoiceController = {
    /**
     * GET /api/v1/xero/invoices
     * Lists invoices from local DB mirror.
     */
    async getInvoices(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const {
                page,
                limit,
                sortBy,
                sortOrder,
                search,
                status,
                contactId,
                dateFrom,
                dateTo
            } = req.query as Record<string, string>;

            const filters: any = {
                companyId: authedReq.user.companyId,
            };

            if (status) filters.status = status;
            if (contactId) filters.xeroContactId = contactId;
            if (dateFrom || dateTo) {
                filters.invoiceDate = {};
                if (dateFrom) filters.invoiceDate.gte = new Date(dateFrom);
                if (dateTo) filters.invoiceDate.lte = new Date(dateTo);
            }

            const queryOptions: QueryOptions = {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                sortBy,
                sortOrder: sortOrder as any,
                search,
                searchFields: ["invoiceNumber", "reference"],
                filters,
            };

            const prismaQuery = applyQueryFilters(queryOptions, "invoiceDate");

            const [total, invoices] = await Promise.all([
                prisma.xeroInvoice.count({ where: prismaQuery.where }),
                prisma.xeroInvoice.findMany({
                    ...prismaQuery,
                    select: {
                        id: true,
                        xeroInvoiceId: true,
                        invoiceNumber: true,
                        invoiceDate: true,
                        dueDate: true,
                        status: true,
                        currencyCode: true,
                        total: true,
                        amountDue: true,
                        amountPaid: true,
                        reference: true,
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
                data: invoices
            });
        } catch (err) {
            logger.error("Failed to fetch invoices", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to fetch invoices");
        }
    },
};
