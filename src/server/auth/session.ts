import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { loadActor, type Actor } from "./actor";
import { createSessionRecord, resolveSession } from "../services/auth";
import { hashToken } from "./crypto";

export const SESSION_COOKIE = "iprams_session";

export async function clientMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return { ip, userAgent: h.get("user-agent") };
}

export async function startSession(userId: string) {
  const meta = await clientMeta();
  const { token, expiresAt } = await createSessionRecord(db, userId, meta);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Current authenticated actor (memoized per request), or null. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await resolveSession(db, token);
  if (!s) return null;
  return loadActor(db, s.userId);
});

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}
