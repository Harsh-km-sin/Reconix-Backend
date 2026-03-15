import { createHash } from "crypto";
import { prisma } from "../config/prisma.js";

export const generateIdempotencyKey = (jobId: string, itemId: string, action: string): string => {
  return createHash("sha256")
    .update(`${jobId}|${itemId}|${action}`)
    .digest("hex");
};

export const checkIdempotency = async (key: string) => {
  const existing = await prisma.idempotencyLog.findUnique({
    where: { key },
  });

  if (existing) {
    return {
      alreadyProcessed: true,
      status: existing.status,
      responseSnapshot: existing.responseSnapshot,
    };
  }

  return { alreadyProcessed: false };
};

export const markIdempotencyCompleted = async (key: string, responseSnapshot?: any) => {
  await prisma.idempotencyLog.create({
    data: {
      key,
      status: "COMPLETED",
      responseSnapshot: responseSnapshot ?? null,
    },
  });
};

export const markIdempotencyFailed = async (key: string, errorSnapshot?: any) => {
  await prisma.idempotencyLog.create({
    data: {
      key,
      status: "FAILED",
      responseSnapshot: errorSnapshot ?? null,
    },
  });
};
