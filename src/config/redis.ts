import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    showFriendlyErrorStack: true,
  });

redis.on("error", (err) => {
  logger.error("Redis error", { err });
});

redis.on("connect", () => {
  logger.info("Connected to Redis");
});

if (env.nodeEnv !== "production") {
  globalForRedis.redis = redis;
}
