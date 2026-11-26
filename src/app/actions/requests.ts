"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActor } from "@/server/auth/session";
import { toActionError, type ActionResult } from "@/server/errors";
import { saveDraftTx } from "@/server/services/requests";
import { addCommentTx, cancelTx, decideTx, reassignTx, saveAndSubmit } from "@/server/services/workflow";
import { deliverEmails } from "@/server/services/notifications";
import { removeAttachmentTx } from "@/server/services/attachments";
import { visibleRequestsWhere } from "@/server/services/visibility";
import type { DraftInput } from "@/lib/validation";

function after(ids: string[] | undefined) {
  if (ids?.length) void deliverEmails(db, ids);
  revalidatePath("/", "layout");
}

export async function saveDraftAction(input: DraftInput, requestId?: string): Promise<ActionResult<{ id: string }>> {
  const actor = await requireActor();
  try {
    const pr = await db.$transaction((tx) => saveDraftTx(tx, actor, input, requestId));
    after(undefined);
    return { ok: true, data: { id: pr.id }, message: "Draft saved" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitAction(
  input: DraftInput,
  requestId: string | undefined,
  confirmed: boolean,
): Promise<ActionResult<{ id: string; prNumber: string; stageName: string; approverNames: string[]; status: string }>> {
  const actor = await requireActor();
  try {
    const r = await saveAndSubmit(db, actor, input, requestId, confirmed);
    after(r.notificationIds);
    return { ok: true, data: { id: r.requestId, prNumber: r.prNumber, stageName: r.stageName, approverNames: r.approverNames, status: r.status } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function decideAction(requestId: string, decision: "APPROVED" | "REJECTED" | "CLARIFICATION_REQUESTED", comment: string): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    const r = await db.$transaction((tx) => decideTx(tx, actor, { requestId, decision, comment }));
    after(r.notificationIds);
    const msg =
      decision === "APPROVED" ? (r.status === "APPROVED" ? `${r.prNumber} fully approved` : `${r.prNumber} approved and sent to ${r.nextStage}`) : decision === "REJECTED" ? `${r.prNumber} rejected` : `${r.prNumber} returned for clarification`;
    return { ok: true, message: msg };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelAction(requestId: string, reason: string): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    const ids = await db.$transaction((tx) => cancelTx(tx, actor, requestId, reason));
    after(ids);
    return { ok: true, message: "Request cancelled" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function commentAction(requestId: string, body: string): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    const ids = await db.$transaction((tx) => addCommentTx(tx, actor, requestId, body, visibleRequestsWhere(actor)));
    after(ids);
    return { ok: true, message: "Comment added" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reassignAction(requestId: string, stageId: string, userId: string, reason: string): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    const ids = await db.$transaction((tx) => reassignTx(tx, actor, requestId, stageId, userId, reason));
    after(ids);
    return { ok: true, message: "Approver reassigned" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeAttachmentAction(attachmentId: string): Promise<ActionResult> {
  const actor = await requireActor();
  try {
    await db.$transaction((tx) => removeAttachmentTx(tx, actor, attachmentId));
    after(undefined);
    return { ok: true, message: "Attachment removed" };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markNotificationsReadAction(ids: string[] | "all"): Promise<ActionResult> {
  const actor = await requireActor();
  await db.notification.updateMany({
    where: { userId: actor.id, readAt: null, ...(ids === "all" ? {} : { id: { in: ids.slice(0, 200) } }) },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
