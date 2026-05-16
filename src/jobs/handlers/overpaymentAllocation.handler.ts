import { prisma, logger } from "../../config/index.js";
import { getXeroClient } from "../../config/xeroClient.js";
import { auditService } from "../../modules/audit/audit.service.js";
import { generateIdempotencyKey, checkIdempotency, markIdempotencyCompleted, markIdempotencyFailed } from "../../utils/idempotency.js";

export const handleOverpaymentAllocationItem = async (
  job: any,
  item: any,
  tenantId: string
): Promise<void> => {
  const xero = await getXeroClient(tenantId);

  try {
    const idempKey = generateIdempotencyKey(job.id, item.id, "ALLOCATE");
    const idCheck = await checkIdempotency(idempKey);

    if (idCheck.alreadyProcessed && idCheck.status === "COMPLETED") {
      logger.info(`Item ${item.id} already processed successfully. Skipping.`);
      return;
    }

    if (!item.xeroOverpayment || !item.xeroInvoice) {
      throw new Error("Missing linked overpayment or invoice for allocation");
    }

    const amountToAllocate = Math.min(
      Number(item.xeroOverpayment.remainingCredit),
      Number(item.xeroInvoice.amountDue)
    );

    const allocResponse = await xero.put(`/Overpayments/${item.xeroOverpayment.xeroOverpaymentId}/Allocations`, {
      Allocations: [{
        Invoice: { InvoiceID: item.xeroInvoice.xeroInvoiceId },
        Amount: amountToAllocate,
        Date: new Date().toISOString().split("T")[0],
      }]
    });

    const alloc = allocResponse.data.Allocations[0];
    await markIdempotencyCompleted(idempKey, alloc);

    // Update DB
    await prisma.jobItem.update({
      where: { id: item.id },
      data: {
        status: "PROCESSED",
        xeroAllocationId: alloc.AllocationID,
        allocatedAmount: amountToAllocate,
        xeroRequestPayload: allocResponse.config.data,
        xeroResponsePayload: allocResponse.data,
        executedAt: new Date(),
      },
    });

    // Sync local records immediately
    await prisma.xeroInvoice.update({
      where: { id: item.xeroInvoice.id },
      data: { amountDue: Math.max(0, Number(item.xeroInvoice.amountDue) - amountToAllocate) }
    });

    await prisma.xeroOverpayment.update({
      where: { id: item.xeroOverpayment.id },
      data: { remainingCredit: Math.max(0, Number(item.xeroOverpayment.remainingCredit) - amountToAllocate) }
    });

    // Audit Log (Success logs removed for cleanliness)

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
