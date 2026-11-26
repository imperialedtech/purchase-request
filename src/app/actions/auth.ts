"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { authenticate, changePassword, setPasswordWithToken } from "@/server/services/auth";
import { clientMeta, endSession, requireActor, startSession } from "@/server/auth/session";
import { rateLimit } from "@/server/auth/rate-limit";
import { toActionError, type ActionResult } from "@/server/errors";
import { updateOwnProfile } from "@/server/services/admin";
import { audit } from "@/server/services/audit";

function safeNext(n: FormDataEntryValue | null) {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  const { ip } = await clientMeta();
  const a = await rateLimit(db, `login:ip:${ip}`, 30, 15 * 60_000);
  const b = await rateLimit(db, `login:acct:${ip}:${email}`, 10, 15 * 60_000);
  if (!a.allowed || !b.allowed) return { ok: false, error: `Too many sign-in attempts. Try again in ${Math.ceil(Math.max(a.retryAfterSec, b.retryAfterSec) / 60)} minutes.` };
  if (!email || !password) return { ok: false, error: "Enter your email and password" };
  let userId: string;
  try {
    const user = await authenticate(db, email, password, ip);
    userId = user.id;
    await audit(db, { actor: { id: user.id, name: user.name }, action: "USER_SIGNED_IN", targetType: "User", targetId: user.id, summary: `${user.email} signed in`, ip });
  } catch (e) {
    return toActionError(e);
  }
  await startSession(userId);
  redirect(safeNext(fd.get("next")));
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function setPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { ip } = await clientMeta();
  if (!(await rateLimit(db, `invite:${ip}`, 20, 15 * 60_000)).allowed) return { ok: false, error: "Too many attempts. Try again later." };
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { ok: false, error: "Passwords do not match", fieldErrors: { confirm: "Passwords do not match" } };
  try {
    await setPasswordWithToken(db, token, password);
  } catch (e) {
    return toActionError(e);
  }
  redirect("/login?activated=1");
}

export async function changePasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const next = String(fd.get("password") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { ok: false, error: "Passwords do not match", fieldErrors: { confirm: "Passwords do not match" } };
  try {
    await changePassword(db, actor.id, String(fd.get("current") ?? ""), next);
    // sign out other sessions, keep this one
    await endSession();
    await startSession(actor.id);
    await db.session.deleteMany({ where: { userId: actor.id, createdAt: { lt: new Date(Date.now() - 1000) } } });
    return { ok: true, message: "Password changed. Other sessions have been signed out." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateProfileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => updateOwnProfile(tx, actor, { name: String(fd.get("name") ?? ""), jobTitle: String(fd.get("jobTitle") ?? ""), phone: String(fd.get("phone") ?? "") }));
    revalidatePath("/", "layout");
    return { ok: true, message: "Profile updated" };
  } catch (e) {
    return toActionError(e);
  }
}
