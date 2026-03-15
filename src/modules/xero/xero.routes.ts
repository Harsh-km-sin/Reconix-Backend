import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { authController } from "./auth/auth.controller.js";
import { syncController } from "./sync/sync.controller.js";
import { invoiceController } from "./invoices/invoice.controller.js";
import { contactController } from "./contacts/contact.controller.js";
import { accountController } from "./accounts/account.controller.js";
import { overpaymentController } from "./overpayments/overpayment.controller.js";
import { bankAccountController } from "./bank-accounts/bank-account.controller.js";

const router: Router = Router();

/**
 * @swagger
 * /api/v1/xero/connect:
 *   get:
 *     summary: Generate Xero authorize URL
 *     tags: [Xero]
 *     security:
 *       - bearerAuth: []
 */
router.get("/connect", authMiddleware, authController.connect);

/**
 * @swagger
 * /api/v1/xero/callback:
 *   get:
 *     summary: Xero OAuth callback
 *     tags: [Xero]
 */
router.get("/callback", authController.callback);

/**
 * @swagger
 * /api/v1/xero/connections:
 *   get:
 *     summary: List all active Xero connections
 *     tags: [Xero]
 *     security:
 *       - bearerAuth: []
 */
router.get("/connections", authMiddleware, authController.getConnections);

/**
 * @swagger
 * /api/v1/xero/connections/{tenantId}:
 *   delete:
 *     summary: Disconnect a Xero organization
 *     tags: [Xero]
 *     security:
 *       - bearerAuth: []
 */
router.delete("/connections/:tenantId", authMiddleware, authController.disconnect);
router.post("/sync/:tenantId", authMiddleware, syncController.triggerSync);
router.get("/sync/status/:jobId", authMiddleware, syncController.getSyncStatus);

// --- Data Query APIs (serve from local DB mirror for job builder) ---
router.get("/invoices", authMiddleware, invoiceController.getInvoices);
router.get("/overpayments", authMiddleware, overpaymentController.getOverpayments);
router.get("/contacts", authMiddleware, contactController.getContacts);
router.get("/accounts", authMiddleware, accountController.getAccounts);
router.get("/bank-accounts", authMiddleware, bankAccountController.getBankAccounts);

export const xeroRoutes: Router = router;
