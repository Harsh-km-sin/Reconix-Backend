import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = Router();

router.post("/login", authController.login);
router.post("/set-password", authController.setPassword);
router.post("/change-password", authMiddleware, authController.changePassword);

// MFA Routes
router.post("/mfa/setup", authMiddleware, authController.setupMFA);
router.post("/mfa/verify", authMiddleware, authController.verifyMFA);
router.post("/mfa/login-verify", authController.loginVerifyMFA);
router.post("/mfa/disable", authMiddleware, authController.disableMFA);

export const authRoutes: Router = router;
