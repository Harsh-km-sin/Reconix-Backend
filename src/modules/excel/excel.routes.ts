import { Router } from "express";
import multer from "multer";
import { excelController } from "./excel.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authMiddleware);

router.post("/upload", upload.single("file"), excelController.uploadFile);
router.get("/:uploadId/metadata", excelController.getMetadata);
router.post("/mapping", excelController.saveMapping);
router.get("/mapping", excelController.listMappings);

export const excelRoutes: Router = router;
