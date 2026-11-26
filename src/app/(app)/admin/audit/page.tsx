import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/server/admin-guard";
import { isAdmin } from "@/server/auth/actor";
import { db } from "@/server/db";
import { Card, Input, Table, Td, Th, buttonClass } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor, entityIds } = await requireAdmin("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const and: Prisma.AuditLogWhereInput[] = [isAdmin(actor) ? {} : { entityId: { in: entityIds } }];
  if (sp.q?.trim()) and.push({ OR: [{ summary: { contains: sp.q.trim(), mode: "insensitive" } }, { prNumber: { contains: sp.q.trim(), mode: "insensitive" } }] });
  if (sp.actor?.trim()) and.push({ actorName: { contains: sp.actor.trim(), mode: "insensitive" } });
  if (sp.action) and.push({ action: sp.action });
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) and.push({ createdAt: { gte: new Date(`${sp.from}T00:00:00+01:00`) } });
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) and.push({ createdAt: { lt: new Date(new Date(`${sp.to}T00:00:00+01:00`).getTime() + 86_400_000) } });
  const where = { AND: and };
  const [rows, total, actions] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("page", String(p));
    return `/admin/audit?${u}`;
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">The audit log is append-only: entries cannot be edited or deleted through the application, and the database rejects updates and deletes.</p>
      <Card>
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Input name="q" defaultValue={sp.q} placeholder="Search summary or PR number" className="lg:col-span-2" aria-label="Search" />
          <Input name="actor" defaultValue={sp.actor} placeholder="Actor" aria-label="Actor" />
          <select name="action" defaultValue={sp.action ?? ""} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm" aria-label="Action">
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a.action}>{a.action}</option>
            ))}
          </select>
          <Input type="date" name="from" defaultValue={sp.from} aria-label="From" />
          <div className="flex gap-2">
            <Input type="date" name="to" defaultValue={sp.to} aria-label="To" />
            <button className={buttonClass("primary")}>Filter</button>
          </div>
        </form>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Summary</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</Td>
                <Td className="text-xs">
                  {r.actorName}
                  {r.ip && <p className="text-slate-400">{r.ip}</p>}
                </Td>
                <Td className="font-mono text-[11px]">{r.action}</Td>
                <Td className="text-xs">
                  {r.summary}
                  {r.requestId && (
                    <Link href={`/requests/${r.requestId}`} className="ml-1 text-brand-700 hover:underline">
                      open
                    </Link>
                  )}
                </Td>
                <Td className="text-xs">
                  {(r.before || r.after || r.metadata) && (
                    <details>
                      <summary className="cursor-pointer text-brand-700">View</summary>
                      <div className="mt-2 grid max-w-xl gap-2">
                        {r.before != null && (
                          <div>
                            <p className="font-semibold text-slate-500">Before</p>
                            <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[10px] whitespace-pre-wrap">{JSON.stringify(r.before, null, 2)}</pre>
                          </div>
                        )}
                        {r.after != null && (
                          <div>
                            <p className="font-semibold text-slate-500">After</p>
                            <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[10px] whitespace-pre-wrap">{JSON.stringify(r.after, null, 2)}</pre>
                          </div>
                        )}
                        {r.metadata != null && (
                          <div>
                            <p className="font-semibold text-slate-500">Metadata</p>
                            <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[10px] whitespace-pre-wrap">{JSON.stringify(r.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>{total} event(s)</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link className={buttonClass("secondary", "sm")} href={qs(page - 1)}>
                Newer
              </Link>
            )}
            {page * 50 < total && (
              <Link className={buttonClass("secondary", "sm")} href={qs(page + 1)}>
                Older
              </Link>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
