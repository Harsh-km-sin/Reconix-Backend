import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { userRoutes } from "../modules/user/user.routes.js";
import { companyRoutes } from "../modules/company/company.routes.js";
import { xeroRoutes } from "../modules/xero/xero.routes.js";
import { jobRoutes } from "../modules/job/job.routes.js";
import { auditRoutes } from "../modules/audit/audit.routes.js";
import { excelRoutes } from "../modules/excel/excel.routes.js";
import { validationRoutes } from "../modules/validation/validation.routes.js";

const router: Router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/companies", companyRoutes);
router.use("/xero", xeroRoutes);
router.use("/jobs", jobRoutes);
router.use("/audit", auditRoutes);
router.use("/excel", excelRoutes);
router.use("/validation", validationRoutes);

export const routes = router;
