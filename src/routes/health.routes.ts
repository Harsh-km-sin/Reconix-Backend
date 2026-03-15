import { Router } from "express";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../types/api.types.js";
import { prisma, redis } from "../config/index.js";

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    // Check Database
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis
    await redis.ping();

    sendSuccess(res, {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        redis: "connected",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Health check failed";
    sendError(res, ErrorCode.INTERNAL_ERROR, message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
});

export const healthRoutes: Router = router;
