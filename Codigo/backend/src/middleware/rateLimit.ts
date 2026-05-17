import type { Context, MiddlewareHandler } from "hono";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  max: number;
  windowMs: number;
};

const buckets = new Map<string, Bucket>();

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function apiConfig(): RateLimitConfig {
  return {
    max: parsePositiveIntEnv("API_RATE_LIMIT_MAX", 120),
    windowMs: parsePositiveIntEnv("API_RATE_LIMIT_WINDOW_MS", 60_000),
  };
}

function aiConfig(): RateLimitConfig {
  return {
    max: parsePositiveIntEnv("AI_RATE_LIMIT_MAX", 20),
    windowMs: parsePositiveIntEnv("AI_RATE_LIMIT_WINDOW_MS", 60_000),
  };
}

function isAiLikePath(path: string): boolean {
  return (
    path.endsWith("/clinical/livia/context") ||
    path.endsWith("/clinical/livia/suggestions") ||
    path.includes("/dev/sanitize") ||
    path.includes("/dev/ollama/") ||
    path.includes("/dev/rag/") ||
    path.includes("/dev/mcp/")
  );
}

function clientKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = c.req.header("x-real-ip")?.trim();
  const auth = c.req.header("authorization")?.trim();
  return forwarded || realIp || auth || "unknown";
}

function cleanupExpiredBuckets(now: number): void {
  if (buckets.size < 10_000) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export const rateLimit: MiddlewareHandler = async (c, next) => {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const group = isAiLikePath(c.req.path) ? "ai" : "api";
  const config = group === "ai" ? aiConfig() : apiConfig();
  const key = `${group}:${clientKey(c)}`;
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + config.windowMs } : existing;

  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, config.max - bucket.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  c.header("X-RateLimit-Limit", String(config.max));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > config.max) {
    c.header("Retry-After", String(retryAfterSeconds));
    return c.json(
      {
        code: "rate_limit_exceeded",
        message: "Muitas requisi��es em pouco tempo. Tente novamente em instantes.",
      },
      429,
    );
  }

  await next();
};
