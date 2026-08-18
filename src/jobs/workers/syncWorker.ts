import { Worker, Job } from "bullmq";
import { env, logger, prisma, redis } from "../../config/index.js";
import { getXeroClient } from "../../config/xeroClient.js";

const connection = {
    host: env.redisHost,
    port: env.redisPort,
};

export enum SyncJobType {
    FULL_SYNC = "FULL_SYNC",
    INCREMENTAL_SYNC = "INCREMENTAL_SYNC",
}

/**
 * Xero's If-Modified-Since header expects a UTC datetime with no timezone
 * suffix, e.g. "2026-07-10T05:59:01".
 */
function toXeroDate(d: Date): string {
    return d.toISOString().replace(/\.\d{3}Z$/, "");
}

/**
 * Axios request config carrying the incremental If-Modified-Since header.
 * When `since` is undefined (full sync) it returns an empty config so Xero
 * returns all records.
 */
/** Redis key for the per-tenant sync lock (prevents overlapping syncs). */
export const syncLockKey = (tenantId: string) => `sync:lock:${tenantId}`;

function reqConfig(since?: Date) {
    if (!since) return {};
    return {
        headers: { "If-Modified-Since": toXeroDate(since) },
        // Xero can reply 304 Not Modified when nothing changed since `since`;
        // treat it as a successful empty result rather than an axios error.
        validateStatus: (status: number) => (status >= 200 && status < 300) || status === 304,
    };
}

/**
 * Worker to process Xero data synchronization jobs.
 */
export const syncWorker = new Worker(
    "sync-queue",
    async (job: Job) => {
        const { type, tenantId } = job.data;
        logger.info(`Processing ${type} for tenant ${tenantId}`, { jobId: job.id });

        let syncLogId: string | null = null;
        try {
            // Find company associated with this tenant
            const company = await prisma.company.findUnique({
                where: { xeroTenantId: tenantId }
            });

            if (!company) {
                throw new Error(`No company found for Xero tenant ${tenantId}`);
            }

            const companyId = company.id;

            const isFull = type === SyncJobType.FULL_SYNC;
            const isIncremental = type === SyncJobType.INCREMENTAL_SYNC;
            if (!isFull && !isIncremental) {
                logger.warn(`Unhandled sync job type: ${type}`);
                return;
            }

            // Open a SyncLog record for this run (audit trail / history).
            const log = await prisma.syncLog.create({
                data: { companyId, syncType: isFull ? "FULL" : "INCREMENTAL", status: "RUNNING" },
            });
            syncLogId = log.id;

            // Incremental uses the last successful sync as the watermark; a
            // first-ever sync (no watermark) transparently falls back to full.
            let since: Date | undefined;
            if (isIncremental) {
                const conn = await prisma.xeroConnection.findUnique({ where: { tenantId } });
                since = conn?.lastSyncedAt ?? undefined;
            }

            const total = await runSync(tenantId, companyId, job, since);

            await prisma.syncLog.update({
                where: { id: syncLogId },
                data: { status: "COMPLETED", completedAt: new Date(), recordsFetched: total },
            });
        } catch (err: any) {
            if (err.name === "XeroTokenExpiredError" || err.response?.status === 400) {
                logger.error(`Sync failed due to invalid Xero tokens. User must re-authenticate.`, { tenantId });
                await job.log("Sync failed: Xero connection expired or invalid. Please re-authenticate the company in settings.");
            }
            logger.error(`Sync job ${job.id} failed`, { err, tenantId, type });
            if (syncLogId) {
                await prisma.syncLog.update({
                    where: { id: syncLogId },
                    data: {
                        status: "FAILED",
                        completedAt: new Date(),
                        errorMessage: String(err?.message ?? "Sync failed").slice(0, 500),
                    },
                }).catch(() => { /* best-effort */ });
            }
            throw err;
        } finally {
            // Release the per-tenant sync lock acquired by the trigger endpoint.
            await redis.del(syncLockKey(tenantId)).catch(() => { /* best-effort */ });
        }
    },
    { connection, concurrency: 5 }
);

/**
 * Runs the sync pipeline. When `since` is provided (incremental), each Xero
 * request carries an If-Modified-Since header so only records changed after that
 * time are returned; when undefined, a full pull is performed.
 *
 * The next watermark is the moment this run STARTED (not finished), so records
 * modified while the sync is in flight are still caught next time. Upserts are
 * idempotent, so the small overlap is harmless. The watermark is only advanced
 * on success.
 */
async function runSync(tenantId: string, companyId: string, job: Job, since?: Date) {
    const xero = await getXeroClient(tenantId);
    const startedAt = new Date();
    logger.info(
        since ? `Incremental sync since ${toXeroDate(since)}` : "Full sync (no watermark)",
        { tenantId, companyId }
    );

    // Sync order maintains relational integrity: contacts before the documents
    // that reference them (invoices / credit notes / overpayments).
    let total = 0;
    await job.updateProgress(5);
    total += await syncAccounts(xero, companyId, since);

    await job.updateProgress(30);
    total += await syncContacts(xero, companyId, since);

    await job.updateProgress(60);
    total += await syncInvoices(xero, companyId, since);

    await job.updateProgress(75);
    total += await syncCreditNotes(xero, companyId, since);

    await job.updateProgress(85);
    total += await syncOverpayments(xero, companyId, since);

    await job.updateProgress(95);
    total += await syncBankAccounts(xero, companyId, since);

    // Advance the watermark to the start of this successful run.
    await prisma.xeroConnection.update({
        where: { tenantId },
        data: { lastSyncedAt: startedAt },
    });

    await job.updateProgress(100);
    return total;
}

// ---------------------------------------------------------------------------
// Sync Implementations
// ---------------------------------------------------------------------------

/**
 * Accounts sync incrementally like everything else, with one guard: if any of
 * this company's accounts is missing its raw Xero type (rows stored before the
 * `xeroType` column existed), we force a full pull to backfill it. Otherwise
 * If-Modified-Since would return nothing and `xeroType` would stay NULL forever,
 * leaving the reversal handler unable to identify inventory accounts.
 *
 * The guard is self-healing and costs one COUNT per sync.
 */
async function syncAccounts(xero: any, companyId: string, since?: Date) {
    let effectiveSince = since;
    if (since) {
        const missingType = await prisma.xeroAccount.count({
            where: { companyId, xeroType: null },
        });
        if (missingType > 0) {
            logger.info(`Backfilling xeroType for ${missingType} accounts — forcing full account pull`, { companyId });
            effectiveSince = undefined;
        }
    }

    const response = await xero.get("/Accounts", reqConfig(effectiveSince));
    const accounts = response.data?.Accounts ?? [];

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
                xeroType: account.Type,
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
                xeroType: account.Type,
                currencyCode: account.CurrencyCode || "USD",
                taxType: account.TaxType,
                isActive: account.Status === "ACTIVE",
                lastSyncedAt: new Date(),
            },
        });
    }
    logger.info(`Synced ${accounts.length} accounts`, { companyId });
    return accounts.length;
}

async function syncContacts(xero: any, companyId: string, since?: Date) {
    let page = 1;
    let hasMore = true;
    let totalContacts = 0;

    while (hasMore) {
        const response = await xero.get(`/Contacts?page=${page}`, reqConfig(since));
        const contacts = response.data.Contacts;

        if (!contacts || contacts.length === 0) {
            hasMore = false;
            break;
        }

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
            totalContacts++;
        }

        if (contacts.length < 100) {
            hasMore = false;
        } else {
            page++;
        }
    }
    logger.info(`Synced ${totalContacts} contacts`, { companyId });
    return totalContacts;
}

async function syncInvoices(xero: any, companyId: string, since?: Date) {
    let page = 1;
    let hasMore = true;
    let totalInvoices = 0;

    while (hasMore) {
        const response = await xero.get(`/Invoices?Statuses=AUTHORISED,PAID,VOIDED&Where=${encodeURIComponent('Type=="ACCPAY"')}&page=${page}`, reqConfig(since));
        const invoices = response.data.Invoices;

        if (!invoices || invoices.length === 0) {
            hasMore = false;
            break;
        }

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
                    type: invoice.Type,
                    invoiceNumber: invoice.InvoiceNumber || invoice.InvoiceID || "UNKNOWN",
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
                    type: invoice.Type,
                    invoiceNumber: invoice.InvoiceNumber || invoice.InvoiceID || "UNKNOWN",
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
            totalInvoices++;
        }

        if (invoices.length < 100) {
            hasMore = false;
        } else {
            page++;
        }
    }
    logger.info(`Synced ${totalInvoices} invoices`, { companyId });
    return totalInvoices;
}

async function syncCreditNotes(xero: any, companyId: string, since?: Date) {
    let page = 1;
    let hasMore = true;
    let totalCreditNotes = 0;

    while (hasMore) {
        const response = await xero.get(`/CreditNotes?page=${page}`, reqConfig(since));
        const creditNotes = response.data.CreditNotes;

        if (!creditNotes || creditNotes.length === 0) {
            hasMore = false;
            break;
        }

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
                    creditNoteNumber: cn.CreditNoteNumber || cn.Reference || cn.CreditNoteID,
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
                    creditNoteNumber: cn.CreditNoteNumber || cn.Reference || cn.CreditNoteID,
                    creditNoteDate: new Date(cn.DateString || cn.Date),
                    status: cn.Status,
                    currencyCode: cn.CurrencyCode,
                    remainingCredit: cn.RemainingCredit,
                    total: cn.Total,
                    lastSyncedAt: new Date(),
                    rawXeroJson: cn,
                },
            });
            totalCreditNotes++;
        }

        if (creditNotes.length < 100) {
            hasMore = false;
        } else {
            page++;
        }
    }
    logger.info(`Synced ${totalCreditNotes} credit notes`, { companyId });
    return totalCreditNotes;
}

async function syncOverpayments(xero: any, companyId: string, since?: Date) {
    let page = 1;
    let hasMore = true;
    let totalOverpayments = 0;

    while (hasMore) {
        const response = await xero.get(`/Overpayments?page=${page}`, reqConfig(since));
        const overpayments = response.data.Overpayments;

        if (!overpayments || overpayments.length === 0) {
            hasMore = false;
            break;
        }

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
            totalOverpayments++;
        }

        if (overpayments.length < 100) {
            hasMore = false;
        } else {
            page++;
        }
    }
    logger.info(`Synced ${totalOverpayments} overpayments`, { companyId });
    return totalOverpayments;
}

async function syncBankAccounts(xero: any, companyId: string, since?: Date) {
    const response = await xero.get("/Accounts?where=Type==\"BANK\"", reqConfig(since));
    const accounts = response.data?.Accounts ?? [];

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
    logger.info(`Synced ${accounts.length} bank accounts`, { companyId });
    return accounts.length;
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
