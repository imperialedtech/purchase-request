import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { entitiesWith } from "@/server/auth/actor";
import type { PermissionKey } from "@/server/auth/permissions";
import { AdminNav } from "@/components/admin/admin-nav";

const SECTIONS: { href: string; label: string; perm: PermissionKey }[] = [
  { href: "/admin/users", label: "Users", perm: "admin.users" },
  { href: "/admin/departments", label: "Departments", perm: "admin.departments" },
  { href: "/admin/categories", label: "Categories", perm: "admin.categories" },
  { href: "/admin/workflows", label: "Approval workflows", perm: "admin.workflows" },
  { href: "/admin/entities", label: "Entities", perm: "admin.entities" },
  { href: "/admin/roles", label: "Roles & permissions", perm: "admin.roles" },
  { href: "/admin/audit", label: "Audit log", perm: "audit.view" },
  { href: "/admin/settings", label: "System settings", perm: "admin.settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const items = SECTIONS.filter((s) => entitiesWith(actor, s.perm).length > 0);
  if (items.length === 0) redirect("/");
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Administration</h1>
        <p className="mt-1 text-sm text-slate-500">Configuration changes are recorded in the audit log and never alter the history of existing requests.</p>
      </div>
      <AdminNav items={[{ href: "/admin", label: "Overview" }, ...items.map(({ href, label }) => ({ href, label }))]} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
