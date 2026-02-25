import { Router } from "express";
import { healthRoutes } from "./health.routes.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { userRoutes } from "../modules/user/user.routes.js";
import { companyRoutes } from "../modules/company/company.routes.js";

const router = Router();

router.use(healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/companies", companyRoutes);

export const routes = router;
