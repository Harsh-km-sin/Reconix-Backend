import { Request, Response } from "express";
import { logger, prisma } from "../../../config/index.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus, paginated } from "../../../types/api.types.js";
import type { AuthenticatedRequest } from "../../../types/express.js";
import type { XeroInvoiceRawJson } from "../xero.interface.js";
import { applyQueryFilters, QueryOptions } from "../../../utils/prisma.utils.js";

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
                type,
                vendorId,
                contactId,
                dateFrom,
                dateTo
            } = req.query as Record<string, string>;

            const filters: any = {
                companyId: authedReq.user.companyId,
            };

            if (status) {
                if (status === "PARTIAL") {
                    filters.status = "AUTHORISED";
                    filters.amountPaid = { gt: 0 };
                } else {
                    filters.status = status;
                }
            }
            if (type) filters.type = type;
            // Support both 'vendorId' (from manual builder) and 'contactId' (legacy)
            const supplierXeroId = vendorId || contactId;
            if (supplierXeroId) {
                // Filter through the relation: XeroInvoice -> XeroContact.xeroContactId (Xero UUID)
                filters.contact = { xeroContactId: supplierXeroId };
            }
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

            sendSuccess(res, paginated(invoices, {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            }));
        } catch (err) {
            logger.error("Failed to fetch invoices", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to fetch invoices");
        }
    },

    /**
     * GET /api/v1/xero/invoices/:id
     * Returns full bill detail including line items and exchange rate for the reversal UI.
     */
    async getInvoiceDetail(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user?.companyId) {
                sendError(res, ErrorCode.UNAUTHORIZED, "No active company", HttpStatus.UNAUTHORIZED);
                return;
            }

            const { id } = req.params;

            const invoice = await prisma.xeroInvoice.findUnique({
                where: { id },
                include: {
                    contact: { select: { id: true, name: true, xeroContactId: true } },
                },
            });

            if (!invoice || invoice.companyId !== authedReq.user.companyId) {
                sendError(res, ErrorCode.NOT_FOUND, "Invoice not found", HttpStatus.NOT_FOUND);
                return;
            }

            const raw = (invoice.rawXeroJson ?? {}) as XeroInvoiceRawJson;

            const detail = {
                id: invoice.id,
                xeroInvoiceId: invoice.xeroInvoiceId,
                invoiceNumber: invoice.invoiceNumber,
                invoiceDate: invoice.invoiceDate,
                dueDate: invoice.dueDate,
                status: invoice.status,
                currencyCode: invoice.currencyCode,
                // CurrencyRate from the original bill - must be used on the Credit Note for exact FX matching
                currencyRate: raw.CurrencyRate ?? 1,
                total: invoice.total,
                amountDue: invoice.amountDue,
                amountPaid: invoice.amountPaid,
                reversibleAmount: invoice.amountDue,
                reference: invoice.reference,
                contact: invoice.contact,
                // Line items with fully preserved tracking categories and tax mappings
                lineItems: (raw.LineItems ?? []).map((li: any) => ({
                    lineItemId: li.LineItemID,
                    description: li.Description,
                    quantity: li.Quantity ?? 1,
                    unitAmount: li.UnitAmount ?? 0,
                    accountCode: li.AccountCode,
                    taxType: li.TaxType,
                    taxAmount: li.TaxAmount ?? 0,
                    lineAmount: li.LineAmount ?? 0,
                    tracking: li.Tracking ?? [],
                })),
            };

            sendSuccess(res, detail);
        } catch (err) {
            logger.error("Failed to fetch invoice detail", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to fetch invoice detail");
        }
    },
};
