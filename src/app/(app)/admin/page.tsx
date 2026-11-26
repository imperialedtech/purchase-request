import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { emailConfigured } from "@/server/email";
import { Card, CardHeader, Stat } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";

export default async function AdminOverview() {
  const actor = await requireActor();
  const ent = { in: actor.entityIds };
  const [users, activeUsers, entities, unassignedCats, workflows, recentAudit] = await Promise.all([
    db.user.count({ where: { entities: { some: { entityId: ent } } } }),
    db.user.count({ where: { isActive: true, passwordHash: { not: null }, entities: { some: { entityId: ent } } } }),
    db.entity.findMany({ where: { id: ent }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { entityId: ent, isActive: true, level1ApproverId: null }, include: { entity: true } }),
    db.approvalWorkflow.findMany({ where: { entityId: ent, isActive: true }, include: { stages: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const checks: { ok: boolean; text: string; href: string }[] = [
    ...entities.map((e) => {
      const wf = workflows.find((w) => w.entityId === e.id);
      return e.isConfigured
        ? { ok: !!wf && wf.stages.length > 0, text: wf ? `${e.name}: workflow "${wf.name}" (${wf.stages.length} levels) active` : `${e.name}: no active approval workflow`, href: "/admin/workflows" }
        : { ok: false, text: `${e.name}: not yet configured — PR template and approval procedures pending`, href: "/admin/entities" };
    }),
    ...unassignedCats.map((c) => ({ ok: false, text: `Category "${c.name}" (${c.entity.code}) has no Level 1 approver — requests in it cannot be submitted`, href: "/admin/categories" })),
    { ok: emailConfigured(), text: emailConfigured() ? "Email notifications configured (SMTP)" : "Email not configured — in-app notifications only (set SMTP_* variables)", href: "/admin/settings" },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Users" value={users} sub={`${activeUsers} activated`} href="/admin/users" />
        <Stat label="Entities" value={entities.length} sub={entities.map((e) => e.code).join(", ")} href="/admin/entities" />
        <Stat label="Active workflows" value={workflows.length} href="/admin/workflows" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Configuration checks" />
          <ul className="divide-y divide-slate-100">
            {checks.map((c, i) => (
              <li key={i}>
                <Link href={c.href} className="flex items-start gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                  {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                  <span className="text-slate-700">{c.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent audit events" actions={<Link href="/admin/audit" className="text-xs font-medium text-brand-700 hover:underline">Open audit log</Link>} />
          <ul className="space-y-3 p-5 text-xs">
            {recentAudit.map((a) => (
              <li key={a.id}>
                <p className="text-slate-800">{a.summary}</p>
                <p className="text-slate-400">
                  {a.actorName} · {fmtDateTime(a.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
