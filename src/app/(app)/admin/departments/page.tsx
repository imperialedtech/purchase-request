import { requireAdmin } from "@/server/admin-guard";
import { db } from "@/server/db";
import { DepartmentManager } from "@/components/admin/managers";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const { entityIds } = await requireAdmin("admin.departments");
  const [entities, departments] = await Promise.all([
    db.entity.findMany({ where: { id: { in: entityIds } }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    db.department.findMany({ where: { entityId: { in: entityIds } }, orderBy: [{ entityId: "asc" }, { name: "asc" }], include: { _count: { select: { users: true } } } }),
  ]);
  return (
    <DepartmentManager
      entities={entities}
      departments={departments.map((d) => ({ id: d.id, entityId: d.entityId, name: d.name, code: d.code, isActive: d.isActive, users: d._count.users }))}
    />
  );
}
