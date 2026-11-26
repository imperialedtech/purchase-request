import type { DB, Tx } from "../db";
import type { Actor } from "../auth/actor";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { audit } from "./audit";
import { maxUploadMb } from "../env";
import { visibleRequestsWhere } from "./visibility";
import { EDITABLE_STATUSES } from "./requests";

export const ALLOWED_TYPES: Record<string, { ext: string[]; magic?: number[][] }> = {
  "application/pdf": { ext: ["pdf"], magic: [[0x25, 0x50, 0x44, 0x46]] },
  "image/png": { ext: ["png"], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  "image/jpeg": { ext: ["jpg", "jpeg"], magic: [[0xff, 0xd8, 0xff]] },
  "image/webp": { ext: ["webp"], magic: [[0x52, 0x49, 0x46, 0x46]] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ["docx"], magic: [[0x50, 0x4b, 0x03, 0x04]] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ["xlsx"], magic: [[0x50, 0x4b, 0x03, 0x04]] },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: ["pptx"], magic: [[0x50, 0x4b, 0x03, 0x04]] },
  "text/csv": { ext: ["csv"] },
  "text/plain": { ext: ["txt"] },
};

// Vercel limits request bodies to ~4.5 MB, so set MAX_UPLOAD_MB=4 there.
export const MAX_UPLOAD_BYTES = maxUploadMb() * 1024 * 1024;
export const MAX_ATTACHMENTS = 20;

export function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]/g, "_").replace(/\s+/g, " ").slice(0, 150) || "file";
}

/** Determines the trusted MIME type from extension + file signature; the browser's claim is ignored. */
export function detectType(fileName: string, bytes: Buffer): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  for (const [mime, spec] of Object.entries(ALLOWED_TYPES)) {
    if (!spec.ext.includes(ext)) continue;
    if (!spec.magic) {
      // text formats: reject binary content
      if (bytes.subarray(0, 4096).includes(0)) return null;
      return mime;
    }
    if (spec.magic.some((m) => m.every((b, i) => bytes[i] === b))) return mime;
    return null;
  }
  return null;
}

export async function assertCanUpload(db: DB, actor: Actor, requestId: string) {
  const pr = await db.purchaseRequest.findUnique({ where: { id: requestId }, include: { _count: { select: { attachments: { where: { removedAt: null } } } } } });
  if (!pr || !actor.entityIds.includes(pr.entityId)) throw notFound();
  if (pr.requesterId !== actor.id) throw forbidden("Only the requestor can add attachments");
  if (!(EDITABLE_STATUSES as readonly string[]).includes(pr.status)) throw conflict("Attachments can only be changed while the request is a draft or returned");
  if (pr._count.attachments >= MAX_ATTACHMENTS) throw invalid(`A maximum of ${MAX_ATTACHMENTS} attachments is allowed`);
  return pr;
}

export async function recordAttachment(
  tx: Tx,
  actor: Actor,
  pr: { id: string; entityId: string; prNumber: string | null },
  file: { fileName: string; storageKey: string; mimeType: string; sizeBytes: number },
) {
  const a = await tx.purchaseRequestAttachment.create({ data: { requestId: pr.id, uploadedById: actor.id, ...file } });
  await audit(tx, {
    actor,
    action: "ATTACHMENT_UPLOADED",
    targetType: "PurchaseRequestAttachment",
    targetId: a.id,
    entityId: pr.entityId,
    requestId: pr.id,
    prNumber: pr.prNumber,
    summary: `Attachment "${file.fileName}" uploaded`,
    metadata: { sizeBytes: file.sizeBytes, mimeType: file.mimeType },
  });
  return a;
}

/** Soft-removes an attachment (file kept for audit purposes). */
export async function removeAttachmentTx(tx: Tx, actor: Actor, attachmentId: string) {
  const a = await tx.purchaseRequestAttachment.findUnique({ where: { id: attachmentId }, include: { request: true } });
  if (!a || a.removedAt || !actor.entityIds.includes(a.request.entityId)) throw notFound();
  if (a.request.requesterId !== actor.id) throw forbidden("Only the requestor can remove attachments");
  if (!(EDITABLE_STATUSES as readonly string[]).includes(a.request.status)) throw conflict("Attachments can only be changed while the request is a draft or returned");
  await tx.purchaseRequestAttachment.update({ where: { id: a.id }, data: { removedAt: new Date(), removedById: actor.id } });
  await audit(tx, {
    actor,
    action: "ATTACHMENT_REMOVED",
    targetType: "PurchaseRequestAttachment",
    targetId: a.id,
    entityId: a.request.entityId,
    requestId: a.requestId,
    prNumber: a.request.prNumber,
    summary: `Attachment "${a.fileName}" removed`,
  });
  return a.requestId;
}

/** Returns attachment metadata only if the actor can see the parent request. */
export async function getAttachmentForActor(db: DB, actor: Actor, attachmentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) throw notFound();
  const a = await db.purchaseRequestAttachment.findFirst({
    where: { id: attachmentId, removedAt: null, request: visibleRequestsWhere(actor) },
  });
  if (!a) throw notFound();
  return a;
}
