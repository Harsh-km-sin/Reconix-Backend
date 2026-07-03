import { Router } from "express";
import { jobController } from "./job.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";

const router: Router = Router();

// All job routes require authentication
router.use(authMiddleware);

// --- Job CRUD (2.1) ---
router.post("/", jobController.createJob);
router.get("/", jobController.listJobs);
router.get("/:jobId", jobController.getJob);
router.delete("/:jobId", requireRole("ADMIN"), jobController.deleteJob);

// --- Job Item APIs (2.2) ---
router.post("/:jobId/items", jobController.addItems);
router.delete("/:jobId/items/:itemId", jobController.removeItem);
router.patch("/:jobId/items/:itemId/acknowledge", jobController.acknowledgeItem);

// --- Job Execution (2.4) — only ADMIN or APPROVER may trigger Xero operations ---
// Guarded here so that retry/cancel cannot be used by an OPERATOR to bypass the
// four-eyes approval gate.
router.post("/:jobId/approve", requireRole("ADMIN", "APPROVER"), jobController.approveJob);
router.post("/:jobId/retry", requireRole("ADMIN", "APPROVER"), jobController.retryJob);
router.post("/:jobId/cancel", requireRole("ADMIN", "APPROVER"), jobController.cancelJob);

export const jobRoutes: Router = router;
