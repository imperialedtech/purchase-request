import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireAdmin } from "@/server/admin-guard";
import { db } from "@/server/db";
import { Badge, Card, Input, LinkButton, Table, Td, Th, buttonClass } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { entityIds } = await requireAdmin("admin.users");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100);
  const users = await db.user.findMany({
    where: {
      entities: { some: { entityId: { in: entityIds } } },
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { jobTitle: { contains: q, mode: "insensitive" } }] } : {}),
      ...(sp.status === "inactive" ? { isActive: false } : sp.status === "active" ? { isActive: true } : {}),
    },
    include: { department: true, entities: { include: { entity: true } }, roles: { include: { role: true, entity: true } } },
    orderBy: { name: "asc" },
    take: 500,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex gap-2" method="get">
          <Input name="q" defaultValue={q} placeholder="Search name, email, job title" className="w-72" aria-label="Search users" />
          <button className={buttonClass("secondary")}>Search</button>
        </form>
        <LinkButton href="/admin/users/new">
          <UserPlus className="h-4 w-4" /> Invite user
        </LinkButton>
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Job title / department</Th>
              <Th>Entities</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
              <Th>Last sign-in</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/70">
                <Td>
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-brand-700 hover:underline">
                    {u.name}
                  </Link>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </Td>
                <Td className="text-xs">
                  {u.jobTitle ?? "—"}
                  <p className="text-slate-500">{u.department?.name ?? "—"}</p>
                </Td>
                <Td className="text-xs">{u.entities.map((e) => e.entity.code).join(", ")}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r.id} tone={r.role.key === "SYSTEM_ADMIN" ? "violet" : "blue"}>
                        {r.role.name}
                        {r.entity ? ` · ${r.entity.code}` : ""}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td>{!u.isActive ? <Badge tone="slate">Deactivated</Badge> : u.passwordHash ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Invited</Badge>}</Td>
                <Td className="text-xs whitespace-nowrap">{fmtDateTime(u.lastLoginAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
