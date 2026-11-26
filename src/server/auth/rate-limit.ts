import type { DB } from "../db";

// Fixed-window rate limiter stored in PostgreSQL, so limits hold across serverless
// instances (Vercel) as well as on a single server. One atomic upsert per check.
// Account-level lockout (users.failedLoginCount / lockedUntil) is enforced separately.

export async function rateLimit(db: DB, key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const k = key.slice(0, 300);
  const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "rate_limits" ("key", "count", "resetAt")
    VALUES (${k}, 1, NOW() + (${windowMs} * INTERVAL '1 millisecond'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limits"."resetAt" <= NOW() THEN 1 ELSE "rate_limits"."count" + 1 END,
      "resetAt" = CASE WHEN "rate_limits"."resetAt" <= NOW() THEN NOW() + (${windowMs} * INTERVAL '1 millisecond') ELSE "rate_limits"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0]!;
  // occasional cleanup of expired windows
  if (Math.random() < 0.01) await db.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
  if (row.count > limit) return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)) };
  return { allowed: true, retryAfterSec: 0 };
}
