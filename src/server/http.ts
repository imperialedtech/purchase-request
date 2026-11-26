import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "./errors";

/** CSRF defence for state-changing route handlers: require a same-origin request. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    const status = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, CONFLICT: 409, RATE_LIMITED: 429 }[e.code];
    return NextResponse.json({ error: e.message }, { status });
  }
  console.error("[IPRAMS] route error", e);
  return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
}

export function contentDisposition(kind: "attachment" | "inline", fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
