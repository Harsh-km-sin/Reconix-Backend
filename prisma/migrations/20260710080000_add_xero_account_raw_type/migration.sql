-- Preserve Xero's exact account type (e.g. INVENTORY) which the coarse
-- AccountType enum collapses into OTHER.
ALTER TABLE "xero_accounts" ADD COLUMN "xero_type" TEXT;
