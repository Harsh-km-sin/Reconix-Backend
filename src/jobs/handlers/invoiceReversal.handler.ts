import { prisma, logger } from "../../config/index.js";
import { getXeroClient } from "../../config/xeroClient.js";
import { auditService } from "../../modules/audit/audit.service.js";
import { generateIdempotencyKey, checkIdempotency, markIdempotencyCompleted } from "../../utils/idempotency.js";

export const handleInvoiceReversalItem = async (
  job: any,
  item: any,
  tenantId: string
): Promise<void> => {
  const xero = await getXeroClient(tenantId);
  const rawJson: any = item.xeroInvoice.rawXeroJson;

  try {
    const idempKey = generateIdempotencyKey(job.id, item.id, "REVERSE");
    const { alreadyProcessed } = await checkIdempotency(idempKey);

    if (alreadyProcessed) {
      logger.info(`Item ${item.id} already processed. Skipping.`);
      return;
    }

    // 1. Create Credit Note to reverse the invoice
    const cnResponse = await xero.post("/CreditNotes", {
      Type: "ACCPAYCREDIT",
      Contact: { ContactID: rawJson?.Contact?.ContactID },
      Date: job.reversalDate ? job.reversalDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      LineItems: rawJson?.LineItems?.map((li: any) => ({
        Description: `Reversal of ${item.invoiceNumber}: ${li.Description}`,
        Quantity: li.Quantity,
        UnitAmount: li.UnitAmount,
        AccountCode: li.AccountCode,
        TaxType: li.TaxType,
        Tracking: li.Tracking,
      })),
      Status: "AUTHORISED",
    });

    const xeroCn = cnResponse.data.CreditNotes[0];
    await markIdempotencyCompleted(idempKey, xeroCn);

    // 2. Allocate Credit Note to Invoice
    const allocResponse = await xero.put(`/CreditNotes/${xeroCn.CreditNoteID}/Allocations`, {
      Allocations: [{
        Invoice: { InvoiceID: item.xeroInvoice.xeroInvoiceId },
        Amount: item.xeroInvoice.amountDue,
        Date: new Date().toISOString().split("T")[0],
      }]
    });

    // 3. Update DB
    await prisma.jobItem.update({
      where: { id: item.id },
      data: {
        status: "PROCESSED",
        xeroCreditNoteId: xeroCn.CreditNoteID,
        creditNoteNumber: xeroCn.CreditNoteNumber,
        xeroRequestPayload: cnResponse.config.data, // Capture exact request
        xeroResponsePayload: cnResponse.data,       // Capture exact response
        executedAt: new Date(),
      },
    });

    // 4. Audit Log
    await auditService.record({
      companyId: job.companyId,
      action: "XERO_CREDIT_NOTE_CREATED",
      resourceType: "JobItem",
      resourceId: item.id,
      afterState: xeroCn,
      xeroResponse: cnResponse.data,
    });

  } catch (error: any) {
    const errorMessage = error.response?.data?.Elements?.[0]?.ValidationErrors?.[0]?.Message
      || error.response?.data?.Message
      || error.message;

    await prisma.jobItem.update({
      where: { id: item.id },
      data: {
        status: "FAILED",
        failureReason: errorMessage,
        failureRawError: error.response?.data || { message: error.message },
      },
    });
    
    throw error;
  }
};
