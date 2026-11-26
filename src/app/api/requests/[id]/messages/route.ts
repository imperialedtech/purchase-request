import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getActor } from "@/server/auth/session";
import { listMessages, markChatRead } from "@/server/services/chat";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

/** Live chat feed for a request. Polled by the chat panel; `?after=<ISO time>` returns only newer messages. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const afterRaw = new URL(req.url).searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : undefined;
  try {
    const messages = await listMessages(db, actor, id, after && !Number.isNaN(after.getTime()) ? after : undefined);
    await markChatRead(db, actor, id);
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
