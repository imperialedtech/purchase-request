import type { Prisma } from "@prisma/client";
import type { DB } from "../db";
import type { Actor } from "../auth/actor";

export type AuditInput = {
  actor?: Pick<Actor, "id" | "name"> | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  entityId?: string | null;
  requestId?: string | null;
  prNumber?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  ip?: string | null;
};

const json = (v: unknown) => (v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

/** Appends to the audit log. Must be called inside the same transaction as the change it records. */
export async function audit(db: DB, a: AuditInput) {
  await db.auditLog.create({
    data: {
      actorId: a.actor?.id ?? null,
      actorName: a.actor?.name ?? "System",
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId ?? null,
      entityId: a.entityId ?? null,
      requestId: a.requestId ?? null,
      prNumber: a.prNumber ?? null,
      summary: a.summary,
      before: json(a.before),
      after: json(a.after),
      metadata: json(a.metadata),
      ip: a.ip ?? null,
    },
  });
}
