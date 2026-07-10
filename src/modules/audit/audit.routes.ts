import { Router } from "express";
import { auditController } from "./audit.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/requirePermission.middleware.js";

const router: Router = Router();

router.use(authMiddleware);

// Audit log access is gated by the "admin" permission.
router.get("/", requirePermission("admin"), auditController.listLogs);

export const auditRoutes: Router = router;
