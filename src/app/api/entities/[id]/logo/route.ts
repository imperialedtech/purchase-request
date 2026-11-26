import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getActor } from "@/server/auth/session";
import { setEntityLogo } from "@/server/services/admin";
import { detectType } from "@/server/services/attachments";
import { getObject, putObject } from "@/server/storage";
import { errorResponse, sameOrigin } from "@/server/http";
import { invalid, notFound } from "@/server/errors";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const { id } = await params;
    if (!actor.entityIds.includes(id)) throw notFound();
    const e = await db.entity.findUnique({ where: { id } });
    if (!e?.logoKey) throw notFound();
    const data = await getObject(e.logoKey);
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": data[0] === 0x89 ? "image/png" : "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=60" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { id } = await params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw invalid("No file provided");
    if (file.size > 1024 * 1024) throw invalid("Logo must be under 1 MB");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = detectType(file.name, bytes);
    if (type !== "image/png" && type !== "image/jpeg") throw invalid("Logo must be a PNG or JPG image");
    const key = await putObject("logos", bytes);
    await db.$transaction((tx) => setEntityLogo(tx, actor, id, key));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
