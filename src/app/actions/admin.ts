"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActor } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import * as admin from "@/server/services/admin";
import { emailConfigured, sendEmail } from "@/server/email";
import { entitiesWith } from "@/server/auth/actor";
import { rateLimit } from "@/server/auth/rate-limit";
import { appUrl } from "@/server/env";

function done<T>(data?: T, message?: string): ActionResult<T> {
  revalidatePath("/admin", "layout");
  return { ok: true, data, message };
}

async function inviteDelivery(email: string, name: string, token: string, purpose: "INVITE" | "PASSWORD_RESET") {
  const link = `${appUrl()}/invite/${token}`;
  let emailed = false;
  try {
    emailed = await sendEmail({
      to: email,
      subject: purpose === "INVITE" ? "[IPRAMS] You have been invited to the Purchase Request system" : "[IPRAMS] Password reset",
      intro: purpose === "INVITE" ? `Hello ${name}, an account has been created for you. Use the button below to set your password.` : `Hello ${name}, use the button below to set a new password.`,
      lines: [],
      link,
    });
  } catch (e) {
    console.error("[IPRAMS] invite email failed", e);
  }
  return { link, emailed };
}

export async function createUserAction(input: admin.UserInput): Promise<ActionResult<{ id: string; link: string; emailed: boolean }>> {
  const actor = await requireActor();
  try {
    const r = await db.$transaction((tx) => admin.createUser(tx, actor, input));
    const d = await inviteDelivery(r.user.email, r.user.name, r.inviteToken, "INVITE");
    return done({ id: r.user.id, ...d }, "User created");
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateUserAction(id: string, input: admin.UserInput): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => admin.updateUser(tx, actor, id, input));
    return done(undefined, "User updated");
  } catch (e) {
    return toActionError(e);
  }
}

export async function setUserActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => admin.setUserActive(tx, actor, id, active));
    return done(undefined, active ? "User activated" : "User deactivated");
  } catch (e) {
    return toActionError(e);
  }
}

export async function issueResetLinkAction(id: string): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const actor = await requireActor();
  try {
    const r = await db.$transaction((tx) => admin.issueResetLink(tx, actor, id));
    return done(await inviteDelivery(r.user.email, r.user.name, r.token, r.purpose));
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveDepartmentAction(id: string | null, input: Parameters<typeof admin.saveDepartment>[3]): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => admin.saveDepartment(tx, actor, id, input));
    return done(undefined, "Department saved");
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveCategoryAction(id: string | null, input: Parameters<typeof admin.saveCategory>[3]): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => admin.saveCategory(tx, actor, id, input));
    return done(undefined, "Category saved");
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveWorkflowAction(id: string | null, input: Parameters<typeof admin.saveWorkflow>[3]): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => admin.saveWorkflow(tx, actor, id, input));
    return done(undefined, "Workflow saved. Existing requests keep their original routing.");
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveEntityAction(id: string | null, input: Parameters<typeof admin.saveEntity>[3]): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => admin.saveEntity(tx, actor, id, input));
    return done(undefined, "Entity saved");
  } catch (e) {
    return toActionError(e);
  }
}

export async function setRolePermissionsAction(roleId: string, keys: string[]): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => admin.setRolePermissions(tx, actor, roleId, keys));
    return done(undefined, "Permissions updated");
  } catch (e) {
    return toActionError(e);
  }
}

export async function createRoleAction(input: { key: string; name: string; description?: string }): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => admin.createRole(tx, actor, input));
    return done(undefined, "Role created");
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveSettingsAction(input: Partial<admin.SystemSettings>): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => admin.saveSettings(tx, actor, input));
    return done(undefined, "Settings saved");
  } catch (e) {
    return toActionError(e);
  }
}

/** Sends a test email to the signed-in administrator so SMTP settings can be checked from the app. */
export async function sendTestEmailAction(): Promise<ActionResult> {
  const actor = await requireActor();
  if (entitiesWith(actor, "admin.settings").length === 0) return { ok: false, error: "You do not have permission to do this" };
  const rl = await rateLimit(db, `test-email:${actor.id}`, 5, 10 * 60_000);
  if (!rl.allowed) return { ok: false, error: `Too many test emails. Try again in ${Math.ceil(rl.retryAfterSec / 60)} min.` };
  if (!emailConfigured()) return { ok: false, error: "Email is not configured. Add the SMTP_* variables in Vercel and redeploy." };
  try {
    await sendEmail({
      to: actor.email,
      subject: "[IPRAMS] Test email",
      intro: `Hello ${actor.name}, this is a test from the Purchase Request system. Email notifications are working.`,
      lines: [["Sent from", process.env.SMTP_FROM ?? ""], ["Mail server", process.env.SMTP_HOST ?? ""]],
      link: appUrl(),
    });
    return { ok: true, message: `Test email sent to ${actor.email}. Check the inbox (and spam folder).` };
  } catch (e) {
    // Show the mail server's reason (never the password) so the setup can be corrected.
    const reason = e instanceof Error ? e.message.replace(process.env.SMTP_PASSWORD || "\u0000", "•••").slice(0, 300) : "Unknown error";
    console.error("[IPRAMS] test email failed", e);
    return { ok: false, error: `Sending failed: ${reason}` };
  }
}
