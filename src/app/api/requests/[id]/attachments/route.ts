import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getActor } from "@/server/auth/session";
import { rateLimit } from "@/server/auth/rate-limit";
import { assertCanUpload, detectType, MAX_UPLOAD_BYTES, recordAttachment, sanitizeFileName } from "@/server/services/attachments";
import { deleteObject, putObject } from "@/server/storage";
import { errorResponse, sameOrigin } from "@/server/http";
import { invalid } from "@/server/errors";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!rateLimit(`upload:${actor.id}`, 60, 10 * 60_000).allowed) return NextResponse.json({ error: "Too many uploads, try again later" }, { status: 429 });
  const { id } = await params;
  let key: string | null = null;
  try {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw invalid("Invalid request");
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw invalid(`File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`);
    const pr = await assertCanUpload(db, actor, id);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw invalid("No file provided");
    if (file.size === 0) throw invalid("The file is empty");
    if (file.size > MAX_UPLOAD_BYTES) throw invalid(`File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`);
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileName = sanitizeFileName(file.name);
    const mimeType = detectType(fileName, bytes);
    if (!mimeType) throw invalid("File type not allowed. Upload PDF, image, Word, Excel, PowerPoint, CSV or text files.");
    key = await putObject("attachments", bytes);
    const storageKey = key;
    const a = await db.$transaction((tx) => recordAttachment(tx, actor, pr, { fileName, storageKey, mimeType, sizeBytes: bytes.length }));
    return NextResponse.json({ attachment: { id: a.id, fileName: a.fileName, sizeBytes: a.sizeBytes, mimeType: a.mimeType } });
  } catch (e) {
    if (key) await deleteObject(key);
    return errorResponse(e);
  }
}
