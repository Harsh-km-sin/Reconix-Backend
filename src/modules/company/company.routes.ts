import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireModule } from "../../middlewares/requireModule.middleware.js";
import { companyController } from "./company.controller.js";

const router = Router();
router.use(authMiddleware);
router.get("/", requireModule("companies"), companyController.list);
router.get("/:id", requireModule("companies"), companyController.getOne);
router.patch("/:id", requireModule("companies", { write: true }), companyController.update);

export const companyRoutes: Router = router;
