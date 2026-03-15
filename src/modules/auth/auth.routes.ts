import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = Router();

router.post("/login", authController.login);
router.post("/set-password", authController.setPassword);
router.post("/change-password", authMiddleware, authController.changePassword);

export const authRoutes: Router = router;
