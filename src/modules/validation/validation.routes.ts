import { Router } from "express";
import { validationController } from "./validation.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router: Router = Router();

router.use(authMiddleware);

router.post("/run", validationController.runValidation);

export const validationRoutes: Router = router;
