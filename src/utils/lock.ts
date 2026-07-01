import { redis, logger } from "../config/index.js";

/**
 * Run `fn` while holding a Redis mutex for `resourceKey`.
 *
 * Used to serialize concurrent access to the same financial resource (e.g. a
 * single overpayment or invoice) across concurrently-running jobs, so two items
 * cannot both read the same balance and over-allocate it.
 *
 * The lock auto-expires after `ttlMs` as a safety net against a crashed holder,
 * and is always released in a `finally` block.
 */
export async function withResourceLock<T>(
  resourceKey: string,
  fn: () => Promise<T>,
  opts: { ttlMs?: number; waitMs?: number; retryDelayMs?: number } = {}
): Promise<T> {
  const { ttlMs = 30_000, waitMs = 20_000, retryDelayMs = 200 } = opts;
  const lockKey = `lock:resource:${resourceKey}`;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  const deadline = Date.now() + waitMs;
  let acquired = false;
  while (Date.now() < deadline) {
    const ok = await redis.set(lockKey, token, "PX", ttlMs, "NX");
    if (ok) {
      acquired = true;
      break;
    }
    await new Promise((r) => setTimeout(r, retryDelayMs));
  }

  if (!acquired) {
    throw new Error(`Could not acquire lock for resource ${resourceKey} within ${waitMs}ms`);
  }

  try {
    return await fn();
  } finally {
    // Only release the lock if we still own it (best-effort compare-and-delete).
    try {
      const current = await redis.get(lockKey);
      if (current === token) {
        await redis.del(lockKey);
      }
    } catch (err) {
      logger.warn("Failed to release resource lock", { resourceKey, err });
    }
  }
}
