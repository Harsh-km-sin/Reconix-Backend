import { Router } from "express";
import { jobController } from "./job.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router: Router = Router();

// All job routes require authentication
router.use(authMiddleware);

// --- Job CRUD (2.1) ---
router.post("/", jobController.createJob);
router.get("/", jobController.listJobs);
router.get("/:jobId", jobController.getJob);
router.delete("/:jobId", jobController.deleteJob);

// --- Job Item APIs (2.2) ---
router.post("/:jobId/items", jobController.addItems);
router.delete("/:jobId/items/:itemId", jobController.removeItem);
router.patch("/:jobId/items/:itemId/acknowledge", jobController.acknowledgeItem);

// --- Job Approval (2.4) — ADMIN or APPROVER role enforced inside controller ---
router.post("/:jobId/approve", jobController.approveJob);

export const jobRoutes: Router = router;
