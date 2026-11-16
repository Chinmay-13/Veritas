/**
 * BASIC RATE LIMITING (in memory)
 * Counts attempts per key inside a time window.
 *
 * Honest limitation: the counters live in the memory of one server instance. On
 * serverless hosting each instance has its own counters, so this slows down abuse
 * but is not a hard guarantee. A production launch would use a shared store
 * (for example a Postgres table or Redis).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * @param key What is being limited, e.g. "login:someone@example.com".
 * @param limit Maximum attempts allowed per window.
 * @param windowMs Window length in milliseconds.
 * @returns `{ ok: true }` or `{ ok: false, retryAfterSeconds }`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  return { ok: true, retryAfterSeconds: 0 };
}

/** Limits used by the app. Not business rules, just abuse protection. */
export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 5 * 60 * 1000 }, // 10 attempts per 5 minutes per email
  message: { limit: 30, windowMs: 60 * 1000 }, // 30 messages per minute per user
};
