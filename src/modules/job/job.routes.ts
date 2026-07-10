import { Router } from "express";
import { jobController } from "./job.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/requirePermission.middleware.js";
import { PERMISSIONS } from "../../types/permissions.js";

const router: Router = Router();

// All job routes require authentication
router.use(authMiddleware);

// --- Job CRUD (2.1) ---
router.post("/", jobController.createJob);
router.get("/", jobController.listJobs);
router.get("/:jobId", jobController.getJob);
router.delete("/:jobId", requirePermission(PERMISSIONS.JOBS_DELETE), jobController.deleteJob);

// --- Job Item APIs (2.2) ---
router.post("/:jobId/items", jobController.addItems);
router.delete("/:jobId/items/:itemId", jobController.removeItem);
router.patch("/:jobId/items/:itemId/acknowledge", jobController.acknowledgeItem);

// --- Job Execution (2.4) — gated purely by the jobs:approve permission ---
router.post("/:jobId/approve", requirePermission(PERMISSIONS.JOBS_APPROVE), jobController.approveJob);
router.post("/:jobId/retry", requirePermission(PERMISSIONS.JOBS_APPROVE), jobController.retryJob);
router.post("/:jobId/cancel", requirePermission(PERMISSIONS.JOBS_APPROVE), jobController.cancelJob);

export const jobRoutes: Router = router;
