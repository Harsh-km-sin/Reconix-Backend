import { prisma, logger } from "../../config/index.js";
import { getXeroClient } from "../../config/xeroClient.js";
import { withResourceLock } from "../../utils/lock.js";
import { roundCurrency } from "../../utils/financialMath.js";

/**
 * Allocate an overpayment's remaining credit against an invoice's amount due.
 *
 * Idempotency for this item is owned by the worker (see jobWorker). Here we only
 * guarantee correctness under concurrency: the whole read → Xero → persist cycle
 * runs while holding a lock on the overpayment, and balances are re-read fresh
 * inside the lock so two concurrent jobs cannot both drain the same credit.
 */
export const handleOverpaymentAllocationItem = async (
  job: any,
  item: any,
  tenantId: string
): Promise<void> => {
  if (!item.xeroOverpaymentId || !item.xeroInvoiceId) {
    throw new Error("Missing linked overpayment or invoice for allocation");
  }

  const xero = await getXeroClient(tenantId);

  // Serialize on the overpayment — the scarce resource being drained.
  await withResourceLock(`overpayment:${item.xeroOverpaymentId}`, async () => {
    try {
      // Re-read balances fresh inside the lock (the worker-loaded copy may be stale).
      const [overpayment, invoice] = await Promise.all([
        prisma.xeroOverpayment.findUnique({ where: { id: item.xeroOverpaymentId } }),
        prisma.xeroInvoice.findUnique({ where: { id: item.xeroInvoiceId } }),
      ]);

      if (!overpayment || !invoice) {
        throw new Error("Linked overpayment or invoice no longer exists");
      }

      const amountToAllocate = roundCurrency(
        Math.min(Number(overpayment.remainingCredit), Number(invoice.amountDue))
      );

      if (amountToAllocate <= 0) {
        await prisma.jobItem.update({
          where: { id: item.id },
          data: {
            status: "SKIPPED",
            skipReason: "No remaining credit or amount due to allocate",
            executedAt: new Date(),
          },
        });
        logger.info(`Item ${item.id} skipped: nothing to allocate.`);
        return;
      }

      const allocResponse = await xero.put(
        `/Overpayments/${overpayment.xeroOverpaymentId}/Allocations`,
        {
          Allocations: [
            {
              Invoice: { InvoiceID: invoice.xeroInvoiceId },
              Amount: amountToAllocate,
              Date: new Date().toISOString().split("T")[0],
            },
          ],
        }
      );

      const alloc = allocResponse.data.Allocations[0];

      // Persist the item result and the two balance decrements atomically.
      await prisma.$transaction([
        prisma.jobItem.update({
          where: { id: item.id },
          data: {
            status: "PROCESSED",
            xeroAllocationId: alloc.AllocationID,
            allocatedAmount: amountToAllocate,
            xeroRequestPayload: allocResponse.config.data,
            xeroResponsePayload: allocResponse.data,
            executedAt: new Date(),
          },
        }),
        prisma.xeroInvoice.update({
          where: { id: invoice.id },
          data: { amountDue: roundCurrency(Math.max(0, Number(invoice.amountDue) - amountToAllocate)) },
        }),
        prisma.xeroOverpayment.update({
          where: { id: overpayment.id },
          data: { remainingCredit: roundCurrency(Math.max(0, Number(overpayment.remainingCredit) - amountToAllocate)) },
        }),
      ]);
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.Elements?.[0]?.ValidationErrors?.[0]?.Message ||
        error.response?.data?.Message ||
        error.message;

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
  });
};
