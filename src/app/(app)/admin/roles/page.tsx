import { requireAdmin } from "@/server/admin-guard";
import { isAdmin } from "@/server/auth/actor";
import { db } from "@/server/db";
import { RoleMatrix } from "@/components/admin/config-editors";

export const metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const { actor } = await requireAdmin("admin.roles");
  const [roles, permissions] = await Promise.all([
    db.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } } }),
    db.permission.findMany({ orderBy: { key: "asc" } }),
  ]);
  return (
    <>
      <p className="mb-4 text-sm text-slate-600">Permissions are enforced on the server for every page, action and download. Changes take effect on each user&apos;s next request and are audited.</p>
      <RoleMatrix
        canEdit={isAdmin(actor)}
        permissions={permissions.map((p) => ({ key: p.key, description: p.description }))}
        roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, isSystem: r.isSystem, users: r._count.users, perms: r.permissions.map((p) => p.permission.key) }))}
      />
    </>
  );
}
