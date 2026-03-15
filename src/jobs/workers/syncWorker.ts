import { Worker, Job } from "bullmq";
import { env, logger, prisma } from "../../config/index.js";
import { getXeroClient } from "../../config/xeroClient.js";

const connection = {
    host: env.redisHost,
    port: env.redisPort,
};

export enum SyncJobType {
    FULL_SYNC = "FULL_SYNC",
    PARTIAL_SYNC = "PARTIAL_SYNC",
    INCREMENTAL_SYNC = "INCREMENTAL_SYNC",
}

/**
 * Worker to process Xero data synchronization jobs.
 */
export const syncWorker = new Worker(
    "sync-queue",
    async (job: Job) => {
        const { type, tenantId } = job.data;
        logger.info(`Processing ${type} for tenant ${tenantId}`, { jobId: job.id });

        try {
            // Find company associated with this tenant
            const company = await prisma.company.findUnique({
                where: { xeroTenantId: tenantId }
            });

            if (!company) {
                throw new Error(`No company found for Xero tenant ${tenantId}`);
            }

            const companyId = company.id;

            if (type === SyncJobType.FULL_SYNC) {
                await handleFullSync(tenantId, companyId, job);
            } else {
                logger.warn(`Unhandled sync job type: ${type}`);
            }
        } catch (err) {
            logger.error(`Sync job ${job.id} failed`, { err, tenantId, type });
            throw err;
        }
    },
    { connection, concurrency: 5 }
);

async function handleFullSync(tenantId: string, companyId: string, job: Job) {
    const xero = await getXeroClient(tenantId);

    // Define sync order to maintain relational integrity
    // 1. Accounts
    // 2. Tax Rates
    // 3. Contacts
    // 4. Invoices
    // 5. Credit Notes
    // 6. Overpayments

    await job.updateProgress(5);
    await syncAccounts(xero, companyId);

    await job.updateProgress(15);
    await syncTaxRates(xero, tenantId); // tenantId is still used here, as per original code

    await job.updateProgress(30);
    await syncContacts(xero, companyId);

    await job.updateProgress(60);
    await syncInvoices(xero, companyId);

    await job.updateProgress(75);
    await syncCreditNotes(xero, companyId);

    await job.updateProgress(85);
    await syncOverpayments(xero, companyId);

    await job.updateProgress(95);
    await syncBankAccounts(xero, companyId);

    await prisma.xeroConnection.update({
        where: { tenantId },
        data: { lastSyncedAt: new Date() },
    });

    await job.updateProgress(100);
}

// ---------------------------------------------------------------------------
// Sync Implementations
// ---------------------------------------------------------------------------

async function syncAccounts(xero: any, companyId: string) {
    logger.info("Syncing accounts...", { companyId });
    const response = await xero.get("/Accounts");
    const accounts = response.data.Accounts;

    for (const account of accounts) {
        await prisma.xeroAccount.upsert({
            where: {
                companyId_xeroAccountId: {
                    companyId,
                    xeroAccountId: account.AccountID
                }
            },
            update: {
                code: account.Code,
                name: account.Name,
                type: mapAccountType(account.Type),
                currencyCode: account.CurrencyCode || "USD",
                taxType: account.TaxType,
                isActive: account.Status === "ACTIVE",
                lastSyncedAt: new Date(),
            },
            create: {
                companyId,
                xeroAccountId: account.AccountID,
                code: account.Code,
                name: account.Name,
                type: mapAccountType(account.Type),
                currencyCode: account.CurrencyCode || "USD",
                taxType: account.TaxType,
                isActive: account.Status === "ACTIVE",
                lastSyncedAt: new Date(),
            },
        });
    }
}

async function syncTaxRates(xero: any, tenantId: string) {
    logger.info("Syncing tax rates...", { tenantId });
}

async function syncContacts(xero: any, companyId: string) {
    logger.info("Syncing contacts...", { companyId });
    const response = await xero.get("/Contacts");
    const contacts = response.data.Contacts;

    for (const contact of contacts) {
        await prisma.xeroContact.upsert({
            where: {
                companyId_xeroContactId: {
                    companyId,
                    xeroContactId: contact.ContactID
                }
            },
            update: {
                name: contact.Name,
                email: contact.EmailAddress,
                defaultCurrency: contact.DefaultCurrency,
                taxNumber: contact.TaxNumber,
                isSupplier: contact.IsSupplier,
                isCustomer: contact.IsCustomer,
                lastSyncedAt: new Date(),
                rawXeroJson: contact,
            },
            create: {
                companyId,
                xeroContactId: contact.ContactID,
                name: contact.Name,
                email: contact.EmailAddress,
                defaultCurrency: contact.DefaultCurrency,
                taxNumber: contact.TaxNumber,
                isSupplier: contact.IsSupplier,
                isCustomer: contact.IsCustomer,
                lastSyncedAt: new Date(),
                rawXeroJson: contact,
            },
        });
    }
}

async function syncInvoices(xero: any, companyId: string) {
    logger.info("Syncing invoices...", { companyId });
    const response = await xero.get("/Invoices?Statuses=AUTHORISED,PAID,VOIDED");
    const invoices = response.data.Invoices;

    for (const invoice of invoices) {
        const dbContact = await prisma.xeroContact.findUnique({
            where: {
                companyId_xeroContactId: {
                    companyId,
                    xeroContactId: invoice.Contact.ContactID
                }
            }
        });

        if (!dbContact) continue;

        const dbInvoice = await prisma.xeroInvoice.upsert({
            where: {
                companyId_xeroInvoiceId: {
                    companyId,
                    xeroInvoiceId: invoice.InvoiceID
                }
            },
            update: {
                xeroContactId: dbContact.id,
                invoiceNumber: invoice.InvoiceNumber,
                invoiceDate: new Date(invoice.DateString || invoice.Date),
                dueDate: invoice.DueDateString ? new Date(invoice.DueDateString) : (invoice.DueDate ? new Date(invoice.DueDate) : null),
                status: invoice.Status as any,
                currencyCode: invoice.CurrencyCode,
                currencyRate: invoice.CurrencyRate,
                subTotal: invoice.SubTotal,
                totalTax: invoice.TotalTax,
                total: invoice.Total,
                amountDue: invoice.AmountDue,
                amountPaid: invoice.AmountPaid,
                lineAmountTypes: invoice.LineAmountTypes,
                reference: invoice.Reference,
                hasAttachments: invoice.HasAttachments,
                isReconciled: invoice.Status === "PAID",
                lastSyncedAt: new Date(),
                rawXeroJson: invoice,
            },
            create: {
                companyId,
                xeroInvoiceId: invoice.InvoiceID,
                xeroContactId: dbContact.id,
                invoiceNumber: invoice.InvoiceNumber,
                invoiceDate: new Date(invoice.DateString || invoice.Date),
                dueDate: invoice.DueDateString ? new Date(invoice.DueDateString) : (invoice.DueDate ? new Date(invoice.DueDate) : null),
                status: invoice.Status as any,
                currencyCode: invoice.CurrencyCode,
                currencyRate: invoice.CurrencyRate,
                subTotal: invoice.SubTotal,
                totalTax: invoice.TotalTax,
                total: invoice.Total,
                amountDue: invoice.AmountDue,
                amountPaid: invoice.AmountPaid,
                lineAmountTypes: invoice.LineAmountTypes,
                reference: invoice.Reference,
                hasAttachments: invoice.HasAttachments,
                isReconciled: invoice.Status === "PAID",
                lastSyncedAt: new Date(),
                rawXeroJson: invoice,
            },
        });

        if (invoice.LineItems && invoice.LineItems.length > 0) {
            await prisma.xeroInvoiceLineItem.deleteMany({
                where: { xeroInvoiceId: dbInvoice.id }
            });

            await prisma.xeroInvoiceLineItem.createMany({
                data: invoice.LineItems.map((li: any) => ({
                    xeroInvoiceId: dbInvoice.id,
                    companyId,
                    lineItemId: li.LineItemID,
                    description: li.Description,
                    quantity: li.Quantity || 0,
                    unitAmount: li.UnitAmount || 0,
                    taxAmount: li.TaxAmount || 0,
                    lineAmount: li.LineAmount || 0,
                    accountCode: li.AccountCode,
                    taxType: li.TaxType,
                    trackingCategories: li.Tracking,
                })),
            });
        }
    }
}

async function syncCreditNotes(xero: any, companyId: string) {
    logger.info("Syncing credit notes...", { companyId });
    const response = await xero.get("/CreditNotes");
    const creditNotes = response.data.CreditNotes;

    for (const cn of creditNotes) {
        if (!cn.Contact?.ContactID) continue;

        const dbContact = await prisma.xeroContact.findUnique({
            where: {
                companyId_xeroContactId: {
                    companyId,
                    xeroContactId: cn.Contact.ContactID
                }
            }
        });

        if (!dbContact) continue;

        await prisma.xeroCreditNote.upsert({
            where: {
                companyId_xeroCreditNoteId: {
                    companyId,
                    xeroCreditNoteId: cn.CreditNoteID
                }
            },
            update: {
                xeroContactId: dbContact.id,
                creditNoteNumber: cn.CreditNoteNumber,
                creditNoteDate: new Date(cn.DateString || cn.Date),
                status: cn.Status,
                currencyCode: cn.CurrencyCode,
                remainingCredit: cn.RemainingCredit,
                total: cn.Total,
                lastSyncedAt: new Date(),
                rawXeroJson: cn,
            },
            create: {
                companyId,
                xeroCreditNoteId: cn.CreditNoteID,
                xeroContactId: dbContact.id,
                creditNoteNumber: cn.CreditNoteNumber,
                creditNoteDate: new Date(cn.DateString || cn.Date),
                status: cn.Status,
                currencyCode: cn.CurrencyCode,
                remainingCredit: cn.RemainingCredit,
                total: cn.Total,
                lastSyncedAt: new Date(),
                rawXeroJson: cn,
            },
        });
    }
}

async function syncOverpayments(xero: any, companyId: string) {
    logger.info("Syncing overpayments...", { companyId });
    const response = await xero.get("/Overpayments");
    const overpayments = response.data.Overpayments;

    for (const op of overpayments) {
        if (!op.Contact?.ContactID) continue;

        const dbContact = await prisma.xeroContact.findUnique({
            where: {
                companyId_xeroContactId: {
                    companyId,
                    xeroContactId: op.Contact.ContactID
                }
            }
        });

        if (!dbContact) continue;

        // Note: For Overpayments, bankAccount might be missing or at op.Payments[0].BankAccount.AccountID
        const bankAccountId = op.Payments && op.Payments.length > 0
            ? op.Payments[0].BankAccount?.AccountID
            : null;

        await prisma.xeroOverpayment.upsert({
            where: {
                companyId_xeroOverpaymentId: {
                    companyId,
                    xeroOverpaymentId: op.OverpaymentID
                }
            },
            update: {
                xeroContactId: dbContact.id,
                overpaymentDate: new Date(op.DateString || op.Date),
                currencyCode: op.CurrencyCode,
                currencyRate: op.CurrencyRate,
                remainingCredit: op.RemainingCredit,
                total: op.Total,
                status: op.Status,
                bankAccountXeroId: bankAccountId,
                lastSyncedAt: new Date(),
                rawXeroJson: op,
            },
            create: {
                companyId,
                xeroOverpaymentId: op.OverpaymentID,
                xeroContactId: dbContact.id,
                overpaymentDate: new Date(op.DateString || op.Date),
                currencyCode: op.CurrencyCode,
                currencyRate: op.CurrencyRate,
                remainingCredit: op.RemainingCredit,
                total: op.Total,
                status: op.Status,
                bankAccountXeroId: bankAccountId,
                lastSyncedAt: new Date(),
                rawXeroJson: op,
            },
        });
    }
}

async function syncBankAccounts(xero: any, companyId: string) {
    logger.info("Syncing bank accounts...", { companyId });
    const response = await xero.get("/Accounts?where=Type==\"BANK\"");
    const accounts = response.data.Accounts;

    for (const acc of accounts) {
        await prisma.xeroBankAccount.upsert({
            where: {
                companyId_xeroAccountId: {
                    companyId,
                    xeroAccountId: acc.AccountID
                }
            },
            update: {
                code: acc.Code,
                name: acc.Name,
                bankAccountNumber: acc.BankAccountNumber,
                bankAccountType: acc.BankAccountType,
                currencyCode: acc.CurrencyCode,
                isActive: acc.Status === "ACTIVE",
                lastSyncedAt: new Date(),
            },
            create: {
                companyId,
                xeroAccountId: acc.AccountID,
                code: acc.Code,
                name: acc.Name,
                bankAccountNumber: acc.BankAccountNumber,
                bankAccountType: acc.BankAccountType,
                currencyCode: acc.CurrencyCode,
                isActive: acc.Status === "ACTIVE",
                lastSyncedAt: new Date(),
            },
        });
    }
}

function mapAccountType(xeroType: string): any {
    const mapping: Record<string, string> = {
        BANK: "BANK",
        EXPENSE: "EXPENSE",
        REVENUE: "REVENUE",
        DIRECTCOSTS: "DIRECTCOSTS",
        EQUITY: "EQUITY",
        ASSET: "OTHER",
        LIABILITY: "OTHER",
    };
    return mapping[xeroType] || "OTHER";
}

syncWorker.on("completed", (job) => {
    logger.info(`Sync job ${job.id} completed`);
});

syncWorker.on("failed", (job, err) => {
    logger.error(`Sync job ${job?.id} failed`, { err });
});
