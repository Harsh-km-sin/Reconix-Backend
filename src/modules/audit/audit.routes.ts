import { Router } from "express";
import { auditController } from "./audit.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router: Router = Router();

router.use(authMiddleware);

router.get("/", auditController.listLogs);

export const auditRoutes: Router = router;
