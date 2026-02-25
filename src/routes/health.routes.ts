import { Router } from "express";
import { sendSuccess } from "../types/api.types.js";

const router = Router();

router.get("/health", (_req, res) => {
  sendSuccess(res, { status: "ok", timestamp: new Date().toISOString() });
});

export const healthRoutes = router;
