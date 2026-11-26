import type { DB } from "../db";
import { hashPassword, hashToken, newToken, verifyPassword } from "../auth/crypto";
import { AppError, invalid } from "../errors";
import { passwordSchema } from "@/lib/validation";
import { audit } from "./audit";

const LOCK_THRESHOLD = 8;
const LOCK_MINUTES = 15;

/** Verifies credentials with account lockout. Error messages never reveal whether an email exists. */
export async function authenticate(db: DB, email: string, password: string, ip?: string | null) {
  const generic = new AppError("UNAUTHENTICATED", "Invalid email or password");
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    await verifyPassword(password, null);
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("RATE_LIMITED", "Account temporarily locked after repeated failed sign-ins. Try again later.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.isActive) {
    if (user.isActive) {
      const count = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: count >= LOCK_THRESHOLD ? 0 : count, lockedUntil: count >= LOCK_THRESHOLD ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      if (count >= LOCK_THRESHOLD)
        await audit(db, { actor: null, action: "USER_LOCKED", targetType: "User", targetId: user.id, summary: `Account ${user.email} locked after failed sign-ins`, ip });
    }
    throw generic;
  }
  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  return user;
}

export async function createSessionRecord(db: DB, userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = newToken();
  const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
  return { token, expiresAt };
}

export async function resolveSession(db: DB, token: string) {
  const s = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.isActive) return null;
  return s;
}

/** Creates a one-time invite / reset link token (stored hashed). */
export async function issueUserToken(db: DB, userId: string, purpose: "INVITE" | "PASSWORD_RESET", hours = 72) {
  const token = newToken();
  await db.userToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await db.userToken.create({ data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + hours * 3_600_000) } });
  return token;
}

export async function findValidUserToken(db: DB, token: string) {
  const t = await db.userToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!t || t.usedAt || t.expiresAt < new Date() || !t.user.isActive) return null;
  return t;
}

export async function setPasswordWithToken(db: DB, token: string, password: string) {
  const t = await findValidUserToken(db, token);
  if (!t) throw invalid("This link is invalid or has expired. Ask your administrator for a new one.");
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) throw invalid(pw.error.issues[0]!.message, { password: pw.error.issues[0]!.message });
  await db.user.update({ where: { id: t.userId }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
  await db.userToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
  await db.session.deleteMany({ where: { userId: t.userId } });
  await audit(db, { actor: { id: t.user.id, name: t.user.name }, action: t.purpose === "INVITE" ? "USER_ACTIVATED" : "PASSWORD_RESET", targetType: "User", targetId: t.userId, summary: `${t.user.email} set a password via ${t.purpose.toLowerCase().replace("_", " ")} link` });
  return t.user;
}

export async function changePassword(db: DB, userId: string, current: string, next: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw invalid("User not found");
  if (!(await verifyPassword(current, user.passwordHash))) throw invalid("Current password is incorrect", { current: "Incorrect password" });
  const pw = passwordSchema.safeParse(next);
  if (!pw.success) throw invalid(pw.error.issues[0]!.message, { password: pw.error.issues[0]!.message });
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
  await audit(db, { actor: { id: user.id, name: user.name }, action: "PASSWORD_CHANGED", targetType: "User", targetId: user.id, summary: `${user.email} changed their password` });
}
