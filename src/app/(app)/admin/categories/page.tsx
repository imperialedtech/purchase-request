import { requireAdmin } from "@/server/admin-guard";
import { db } from "@/server/db";
import { CategoryManager } from "@/components/admin/managers";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const { entityIds } = await requireAdmin("admin.categories");
  const [entities, categories, approvers] = await Promise.all([
    db.entity.findMany({ where: { id: { in: entityIds } }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    db.category.findMany({
      where: { entityId: { in: entityIds } },
      orderBy: [{ entityId: "asc" }, { name: "asc" }],
      include: { level1Approver: { select: { name: true } }, _count: { select: { requests: true } } },
    }),
    db.user.findMany({
      where: { isActive: true, entities: { some: { entityId: { in: entityIds } } }, roles: { some: { role: { permissions: { some: { permission: { key: "approval.act" } } } } } } },
      select: { id: true, name: true, jobTitle: true, entities: { select: { entityId: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <CategoryManager
      entities={entities}
      approvers={approvers.map((a) => ({ id: a.id, name: a.name, jobTitle: a.jobTitle, entityIds: a.entities.map((e) => e.entityId) }))}
      categories={categories.map((c) => ({
        id: c.id,
        entityId: c.entityId,
        name: c.name,
        description: c.description,
        level1ApproverId: c.level1ApproverId,
        level1Label: c.level1Label,
        isActive: c.isActive,
        approverName: c.level1Approver?.name ?? null,
        requests: c._count.requests,
      }))}
    />
  );
}
