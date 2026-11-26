import type { DB } from "../db";
import type { RequestFilters } from "./requests";
import { STATUS_LABEL, type PRStatusKey } from "@/lib/status";

export function reportFiltersFromParams(p: URLSearchParams | Record<string, string | undefined>): RequestFilters {
  const get = (k: string) => (p instanceof URLSearchParams ? (p.get(k) ?? undefined) : p[k]) || undefined;
  return {
    from: get("from"),
    to: get("to"),
    entityId: get("entity"),
    departmentId: get("department"),
    categoryId: get("category"),
    status: get("status"),
    currency: get("currency"),
    requester: get("requester"),
  };
}

export async function describeFilters(db: DB, f: RequestFilters) {
  const parts: string[] = [];
  if (f.from || f.to) parts.push(`${f.from ?? "…"} to ${f.to ?? "…"}`);
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  if (uuid(f.entityId)) parts.push((await db.entity.findUnique({ where: { id: f.entityId } }))?.name ?? "");
  if (uuid(f.departmentId)) parts.push((await db.department.findUnique({ where: { id: f.departmentId } }))?.name ?? "");
  if (uuid(f.categoryId)) parts.push((await db.category.findUnique({ where: { id: f.categoryId } }))?.name ?? "");
  if (f.status) parts.push(f.status === "PENDING" ? "Pending" : (STATUS_LABEL[f.status as PRStatusKey] ?? f.status));
  if (f.currency) parts.push(f.currency);
  if (f.requester) parts.push(`Requestor: ${f.requester}`);
  return parts.filter(Boolean).join(", ");
}
