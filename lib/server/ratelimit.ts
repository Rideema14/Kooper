import { AppError } from "./errors";

type Bucket = { n: number; reset: number };
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window in-memory limiter. Good for a single Node process (dev, one container).
 * On serverless/multi-instance hosting replace the Map with Upstash Redis (free tier) — same signature.
 */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); }
  else if (++b.n > max) throw new AppError(429, "Too many requests. Please slow down and try again shortly.", "rate_limited");
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
