import { prisma, logger } from "../../config/index.js";
import { getXeroClient } from "../../config/xeroClient.js";
import { auditService } from "../../modules/audit/audit.service.js";
import { generateIdempotencyKey, checkIdempotency, markIdempotencyCompleted } from "../../utils/idempotency.js";
import type { ReversalConfig, ReversalLineConfig } from "../../modules/job/job.interface.js";

export const handleInvoiceReversalItem = async (
  job: any,
  item: any,
  tenantId: string
): Promise<void> => {
  const xero = await getXeroClient(tenantId);
  const rawJson: any = item.xeroInvoice.rawXeroJson ?? {};
  const reversalConfig: ReversalConfig | null = item.reversalConfig ?? null;

  try {
    const idempKey = generateIdempotencyKey(job.id, item.id, "REVERSE");
    const idCheck = await checkIdempotency(idempKey);

    if (idCheck.alreadyProcessed && idCheck.status === "COMPLETED") {
      logger.info(`Item ${item.id} already processed successfully. Skipping.`);
      return;
    }

    // ─── 1. Determine exchange rate and base totals ────────────────────────
    // ACCOUNTING POLICY: Always use the original bill's CurrencyRate to prevent
    // FX gain/loss discrepancies.
    const originalCurrencyRate: number = Number(rawJson.CurrencyRate) || 1;
    const lineAmountType = rawJson.LineAmountTypes || "Exclusive";

    // ─── 2. Build line items from reversalConfig ───────────────────────────
    const allLines: any[] = rawJson.LineItems ?? [];
    const isPartial = reversalConfig?.reversalType === "PARTIAL";

    let reversalLines: any[];

    if (isPartial && reversalConfig.lineConfigs && reversalConfig.lineConfigs.length > 0) {
      // Logic for specific line reversals
      const lineConfigMap = new Map<string, ReversalLineConfig>(
        (reversalConfig!.lineConfigs ?? []).map((lc) => [lc.lineItemId ?? "", lc])
      );

      reversalLines = allLines
        .filter((li: any) => lineConfigMap.has(li.LineItemID ?? ""))
        .map((li: any) => {
          const config = lineConfigMap.get(li.LineItemID ?? "")!;
          return {
            Description: config.description ?? `Reversal of ${item.invoiceNumber}: ${li.Description}`,
            Quantity: config.quantity ?? li.Quantity ?? 1,
            UnitAmount: config.unitAmount ?? li.UnitAmount ?? 0,
            AccountCode: li.AccountCode,
            TaxType: li.TaxType,
            Tracking: li.Tracking ?? [],
          };
        });
    } else if (isPartial && reversalConfig.partialAmount) {
      // Partial by total amount (provided in base currency)
      // First, convert the target partial amount to the Transaction Currency
      let targetInTxCurrency = Number(reversalConfig.partialAmount) * originalCurrencyRate;

      // ─── BILL_TOTAL mode: back-calculate tax-exclusive amount ───────────
      // When amountMode is BILL_TOTAL, the user entered the desired Credit Note
      // *total* (including tax). We need to derive the tax-exclusive line amount
      // that, after Xero applies taxes, will produce that exact total.
      if (reversalConfig.amountMode === "BILL_TOTAL") {
        // Calculate effective tax rate from the original bill
        const originalSubtotal = allLines.reduce(
          (sum: number, li: any) => sum + (Number(li.UnitAmount) * Number(li.Quantity)),
          0
        );
        const originalTotalTax = Number(rawJson.TotalTax) || 0;
        const effectiveTaxRate = originalSubtotal > 0 ? originalTotalTax / originalSubtotal : 0;

        // Back-calculate: taxExclusiveAmount = enteredTotal / (1 + effectiveTaxRate)
        targetInTxCurrency = targetInTxCurrency / (1 + effectiveTaxRate);

        logger.info(
          `BILL_TOTAL mode: entered=${reversalConfig.partialAmount}, ` +
          `effectiveTaxRate=${(effectiveTaxRate * 100).toFixed(4)}%, ` +
          `taxExclusiveTarget=${targetInTxCurrency.toFixed(4)}`
        );
      }
      
      // Calculate current subtotal from raw Xero lines
      const fullSubtotal = allLines.reduce((sum: number, li: any) => sum + (Number(li.UnitAmount) * Number(li.Quantity)), 0);
      const scale = fullSubtotal > 0 ? targetInTxCurrency / fullSubtotal : 1;

      reversalLines = allLines.map((li: any) => ({
        Description: `Partial Reversal of ${item.invoiceNumber}: ${li.Description ?? ""}`,
        Quantity: li.Quantity ?? 1,
        UnitAmount: parseFloat((Number(li.UnitAmount) * scale).toFixed(4)),
        AccountCode: li.AccountCode,
        TaxType: li.TaxType,
        Tracking: li.Tracking ?? [],
      }));
    } else {
      // Full reversal
      reversalLines = allLines.map((li: any) => ({
        Description: `Reversal of ${item.invoiceNumber}: ${li.Description ?? ""}`,
        Quantity: li.Quantity ?? 1,
        UnitAmount: li.UnitAmount ?? 0,
        AccountCode: li.AccountCode,
        TaxType: li.TaxType,
        Tracking: li.Tracking ?? [],
      }));
    }

    // ─── 3. Validate reversal amount doesn't exceed remaining balance ────────
    // We sum lines and estimate tax if necessary to avoid over-reversal
    const reversalSubtotal = reversalLines.reduce((sum: number, li: any) => sum + (li.Quantity * li.UnitAmount), 0);
    
    // Safety check: Don't allow creating a 0-value Credit Note
    if (reversalSubtotal <= 0) {
      throw new Error("Reversal total must be greater than 0. Aborting.");
    }

    const amountDue: number = Number(item.xeroInvoice.amountDue);
    // Note: This is a rough check; Xero's final tax calculation will be the ultimate authority
    if (reversalSubtotal > amountDue * 1.5) { // Very loose check here, the allocation step will cap it
       logger.warn(`Potential over-reversal: Subtotal ${reversalSubtotal} vs AmountDue ${amountDue}`);
    }

    // ─── 4. Determine reversal date ──────────────────────────────────────────
    const reversalDate = job.reversalDate ? new Date(job.reversalDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    // ─── 5. Prepare the Credit Note payload ─────────────────────────────────
    const cnPayload: any = {
      Type: "ACCPAYCREDIT",
      Contact: { ContactID: rawJson.Contact.ContactID },
      Date: reversalDate,
      LineAmountTypes: lineAmountType,
      CurrencyCode: rawJson.CurrencyCode || item.xeroInvoice.currencyCode,
      CurrencyRate: originalCurrencyRate,
      LineItems: reversalLines,
      Status: "AUTHORISED",
      Reference: `REV-${item.invoiceNumber}`,
    };

    if (reversalConfig?.reason) {
      cnPayload.Narration = reversalConfig.reason;
    }

    // ─── 6. Create the Credit Note in Xero ──────────────────────────────────
    const cnResponse = await xero.post("/CreditNotes", cnPayload);
    const xeroCn = cnResponse.data.CreditNotes[0];
    const cnNumber = xeroCn.CreditNoteNumber || xeroCn.CreditNoteID || "UNKNOWN";
    
    logger.info(`Credit Note created: ${xeroCn.CreditNoteID} (${cnNumber}). Total: ${xeroCn.Total}`);

    // ─── 7. Allocate to the original Invoice ────────────────────────────────
    // We allocate the LESSER of the Credit Note Total or the Invoice's remaining balance.
    // Use Number() to handle potential Decimal objects from Prisma or strings from Xero.
    const cnAvailable = Number(xeroCn.RemainingCredit || xeroCn.Total || 0);
    const invoiceRemaining = Number(item.xeroInvoice.amountDue || 0);
    
    const allocationAmount = Math.min(cnAvailable, invoiceRemaining);
    
    if (allocationAmount <= 0) {
       logger.warn(`Allocation amount is 0 (CN: ${cnAvailable}, Inv: ${invoiceRemaining}). Skipping allocation.`);
    } else {
      const allocationPayload = {
        Allocations: [{
          Invoice: { InvoiceID: item.xeroInvoice.xeroInvoiceId },
          Amount: parseFloat(allocationAmount.toFixed(2)),
          Date: reversalDate,
        }],
      };

      try {
        await xero.put(`/CreditNotes/${xeroCn.CreditNoteID}/Allocations`, allocationPayload);
        logger.info(`Allocated ${allocationAmount} from CN ${cnNumber} to Invoice ${item.invoiceNumber}`);
      } catch (allocErr: any) {
        const allocMsg = allocErr.response?.data?.Elements?.[0]?.ValidationErrors?.[0]?.Message 
          || allocErr.response?.data?.Message 
          || allocErr.message;
        
        logger.error(`Allocation failed for CN ${cnNumber} to Invoice ${item.invoiceNumber}`, { 
          error: allocMsg,
          invoiceId: item.xeroInvoice.xeroInvoiceId,
          xeroResponse: allocErr.response?.data 
        });
        throw new Error(`Credit Note created (${cnNumber}) but allocation failed: ${allocMsg}`);
      }
    }

    // ─── 8. Update the database records ─────────────────────────────────────
    await prisma.jobItem.update({
      where: { id: item.id },
      data: {
        status: "PROCESSED",
        xeroCreditNoteId: xeroCn.CreditNoteID,
        creditNoteNumber: xeroCn.CreditNoteNumber || cnNumber,
        allocatedAmount: allocationAmount,
        xeroRequestPayload: cnPayload as any,
        xeroResponsePayload: cnResponse.data as any,
        executedAt: new Date(),
      },
    });

    // ─── 9. Update local Invoice balance
    const originalAmountDue = Number(item.xeroInvoice.amountDue);
    const newAmountDue = Math.max(0, originalAmountDue - allocationAmount);
    
    await prisma.xeroInvoice.update({
      where: { id: item.xeroInvoice.id },
      data: { amountDue: newAmountDue }
    });

    // ─── 10. Mark Idempotency Success ─────────────────────────────────────────
    // ONLY do this once everything (CN + Allocation + DB) has succeeded!
    await markIdempotencyCompleted(idempKey, xeroCn);

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
