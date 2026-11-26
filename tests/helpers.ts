import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { bootstrap } from "../prisma/bootstrap";
import { loadActor, type Actor } from "@/server/auth/actor";
import { saveDraftTx } from "@/server/services/requests";
import { decideTx, submitRequestTx } from "@/server/services/workflow";

export const db = new PrismaClient();

let ctx: Awaited<ReturnType<typeof setupWorld>> | null = null;

/** Creates (once per file) the IET entity, roles and a full set of users for every approval level. */
export async function world() {
  ctx ??= await setupWorld();
  return ctx;
}

async function setupWorld() {
  const { ietId, roles } = await bootstrap(db);
  const pave = await db.entity.findUniqueOrThrow({ where: { code: "PAVE" } });
  const tag = randomUUID().slice(0, 8);
  const dept = await db.department.findFirstOrThrow({ where: { entityId: ietId } });

  const mk = async (key: string, roleKeys: string[], entityIds: string[] = [ietId]) => {
    const u = await db.user.create({
      data: {
        email: `${key}-${tag}@test.local`,
        name: `${key} ${tag}`,
        jobTitle: key,
        departmentId: dept.id,
        entities: { create: entityIds.map((entityId) => ({ entityId })) },
        roles: { create: roleKeys.map((r) => ({ roleId: roles[r]!, entityId: null })) },
      },
    });
    return u.id;
  };

  const ids = {
    admin: await mk("admin", ["SYSTEM_ADMIN", "EMPLOYEE"], [ietId, pave.id]),
    employee: await mk("employee", ["EMPLOYEE"]),
    employee2: await mk("employee2", ["EMPLOYEE"]),
    l1: await mk("l1", ["LEVEL1_APPROVER", "EMPLOYEE"]),
    l1b: await mk("l1b", ["LEVEL1_APPROVER", "EMPLOYEE"]),
    finance: await mk("finance", ["FINANCE_MANAGER", "EMPLOYEE"]),
    cos: await mk("cos", ["CHIEF_OF_STAFF", "EMPLOYEE"]),
    viewer: await mk("viewer", ["FINANCE_VIEWER"]),
    paveOnly: await mk("paveonly", ["EMPLOYEE", "FINANCE_VIEWER"], [pave.id]),
  };

  // a dedicated category per test file, routed to this file's Level 1 approver
  const category = await db.category.create({ data: { entityId: ietId, name: `Test Category ${tag}`, level1ApproverId: ids.l1, level1Label: "Purchasing Officer" } });
  const category2 = await db.category.create({ data: { entityId: ietId, name: `Test IT ${tag}`, level1ApproverId: ids.l1b, level1Label: "System Administrator" } });

  // Other files may have changed workflows; ensure only the standard workflow is active.
  const wf = await db.approvalWorkflow.findFirstOrThrow({ where: { entityId: ietId, name: "Imperial EdTech Standard Approval" } });
  await db.approvalWorkflow.updateMany({ where: { entityId: ietId, id: { not: wf.id } }, data: { isActive: false } });
  await db.approvalWorkflow.update({ where: { id: wf.id }, data: { isActive: true } });

  const actors = {} as Record<keyof typeof ids, Actor>;
  for (const [k, v] of Object.entries(ids)) actors[k as keyof typeof ids] = (await loadActor(db, v))!;
  return { ietId, paveId: pave.id, roles, ids, actors, category, category2, tag, deptId: dept.id };
}

export const item = (description = "Item", quantity = "1", unitPrice = "1000.00", currency = "NGN") => ({
  description,
  quantity,
  unitPrice,
  currency,
  specifications: "",
});

export async function draft(actor: Actor, opts: Partial<{ categoryId: string; items: ReturnType<typeof item>[]; title: string; comments: string; paymentDetails: string; entityId: string }> = {}) {
  const w = await world();
  return db.$transaction((tx) =>
    saveDraftTx(tx, actor, {
      entityId: opts.entityId ?? w.ietId,
      title: opts.title ?? "Test purchase",
      categoryId: opts.categoryId ?? w.category.id,
      comments: opts.comments ?? "Needed for day-to-day operations of the team.",
      paymentDetails: opts.paymentDetails ?? "",
      items: opts.items ?? [item("Widget", "2", "1500.50")],
    }),
  );
}

export const submit = (actor: Actor, id: string) => db.$transaction((tx) => submitRequestTx(tx, actor, id, { confirmed: true }));

export const decide = (actor: Actor, requestId: string, decision: "APPROVED" | "REJECTED" | "CLARIFICATION_REQUESTED", comment = "") =>
  db.$transaction((tx) => decideTx(tx, actor, { requestId, decision, comment }));

export async function submitted(actor?: Actor, opts: Parameters<typeof draft>[1] = {}) {
  const w = await world();
  const a = actor ?? w.actors.employee;
  const pr = await draft(a, opts);
  await submit(a, pr.id);
  return pr.id;
}
