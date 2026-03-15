import { Router } from "express";
import { userController } from "./user.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/requireModule.middleware.js";

const router = Router();
router.use(authMiddleware);
router.get("/me", userController.getMe);
router.patch("/me", userController.updateMe);
router.get("/", requireModule("users"), userController.list);
router.post("/invite", requireModule("users", { write: true }), userController.invite);

export const userRoutes: Router = router;
