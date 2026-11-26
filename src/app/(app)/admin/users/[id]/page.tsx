import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/admin-guard";
import { userEditorOptions } from "@/server/admin-options";
import { db } from "@/server/db";
import { UserEditor } from "@/components/admin/user-editor";

export const metadata = { title: "Edit user" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, entityIds } = await requireAdmin("admin.users");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const u = await db.user.findFirst({ where: { id, entities: { some: { entityId: { in: entityIds } } } }, include: { entities: true, roles: true } });
  if (!u) notFound();
  const opts = await userEditorOptions(entityIds);
  return (
    <>
      <h2 className="mb-4 text-base font-semibold text-slate-900">{u.name}</h2>
      <UserEditor
        {...opts}
        isSelf={u.id === actor.id}
        user={{
          id: u.id,
          email: u.email,
          name: u.name,
          jobTitle: u.jobTitle ?? "",
          phone: u.phone ?? "",
          departmentId: u.departmentId ?? "",
          canEditProfile: u.canEditProfile,
          isActive: u.isActive,
          activated: !!u.passwordHash,
          entityIds: u.entities.map((e) => e.entityId),
          roles: u.roles.map((r) => ({ roleId: r.roleId, entityId: r.entityId })),
        }}
      />
    </>
  );
}
