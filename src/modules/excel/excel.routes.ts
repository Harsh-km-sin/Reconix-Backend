import { Router } from "express";
import multer from "multer";
import { excelController } from "./excel.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router: Router = Router();
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = /.(xlsx|xls|csv)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_EXTENSIONS.test(file.originalname)) return cb(null, true);
    cb(new Error("Only .xlsx, .xls and .csv files are accepted"));
  },
});

router.use(authMiddleware);

router.post("/upload", upload.single("file"), excelController.uploadFile);
router.get("/:uploadId/metadata", excelController.getMetadata);
router.get("/:uploadId/sheet/:sheetName", excelController.getSheetData);
router.post("/mapping", excelController.saveMapping);
router.get("/mapping", excelController.listMappings);

export const excelRoutes: Router = router;
