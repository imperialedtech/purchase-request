import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getActor } from "@/server/auth/session";
import { getAttachmentForActor } from "@/server/services/attachments";
import { getObject } from "@/server/storage";
import { contentDisposition, errorResponse } from "@/server/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const { id } = await params;
    const a = await getAttachmentForActor(db, actor, id);
    const data = await getObject(a.storageKey);
    // Images and PDFs may preview inline; everything else downloads. Never executed: nosniff + sandboxed CSP.
    const inline = new URL(req.url).searchParams.get("inline") === "1" && (a.mimeType.startsWith("image/") || a.mimeType === "application/pdf");
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": a.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", a.fileName),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
