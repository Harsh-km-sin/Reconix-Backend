import { Router } from "express";
import { healthRoutes } from "./health.routes.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { userRoutes } from "../modules/user/user.routes.js";
import { companyRoutes } from "../modules/company/company.routes.js";
import { xeroRoutes } from "../modules/xero/xero.routes.js";
import { jobRoutes } from "../modules/job/job.routes.js";

const router: Router = Router();

router.use(healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/companies", companyRoutes);
router.use("/xero", xeroRoutes);
router.use("/jobs", jobRoutes);

export const routes = router;
