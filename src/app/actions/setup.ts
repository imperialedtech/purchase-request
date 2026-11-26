"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { clientMeta, startSession } from "@/server/auth/session";
import { rateLimit } from "@/server/auth/rate-limit";
import { createFirstAdmin } from "@/server/services/setup";
import { toActionError, type ActionResult } from "@/server/errors";

export async function firstAdminSetupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { ip } = await clientMeta();
  if (!(await rateLimit(db, `setup:${ip}`, 10, 15 * 60_000)).allowed) return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  if (String(fd.get("password") ?? "") !== String(fd.get("confirm") ?? "")) return { ok: false, error: "Passwords do not match", fieldErrors: { confirm: "Passwords do not match" } };
  let userId: string;
  try {
    userId = await createFirstAdmin(
      db,
      {
        code: String(fd.get("code") ?? ""),
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        jobTitle: String(fd.get("jobTitle") ?? ""),
        password: String(fd.get("password") ?? ""),
      },
      ip,
    );
  } catch (e) {
    return toActionError(e);
  }
  await startSession(userId);
  redirect("/admin");
}
