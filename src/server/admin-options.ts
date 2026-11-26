import "server-only";
import { db } from "./db";

export async function userEditorOptions(entityIds: string[]) {
  const [entities, departments, roles] = await Promise.all([
    db.entity.findMany({ where: { id: { in: entityIds } }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    db.department.findMany({ where: { entityId: { in: entityIds }, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, entityId: true } }),
    db.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, key: true, description: true } }),
  ]);
  return { entities, departments, roles };
}
