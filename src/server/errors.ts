import { ZodError } from "zod";

export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "You are not permitted to perform this action") => new AppError("FORBIDDEN", msg);
export const notFound = (msg = "Record not found") => new AppError("NOT_FOUND", msg);
export const invalid = (msg: string, fieldErrors?: Record<string, string>) => new AppError("VALIDATION", msg, fieldErrors);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function zodFieldErrors(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Converts thrown errors into a safe, user-facing result. Unknown errors are logged, not leaked. */
export function toActionError(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  if (e instanceof ZodError) {
    const fe = zodFieldErrors(e);
    return { ok: false, error: Object.values(fe)[0] ?? "Invalid input", fieldErrors: fe };
  }
  // Let Next.js redirect/notFound control-flow errors propagate
  if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string") {
    const d = (e as { digest: string }).digest;
    if (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR") || d === "NEXT_NOT_FOUND") throw e;
  }
  console.error("[IPRAMS] Unexpected error", e);
  return { ok: false, error: "Something went wrong. Please try again or contact the administrator." };
}
