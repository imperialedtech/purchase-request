/**
 * DEVELOPMENT / DEMO SEED ONLY. Do not run against production.
 * Creates demo users for every role and a handful of purchase requests that go through the
 * real service layer (so numbering, routing, approvals, notifications and audit are genuine).
 *
 * Demo accounts (all share SEED_DEMO_PASSWORD from .env):
 *   admin@iet.test       System Administrator (+ Employee)
 *   purchasing@iet.test  Purchasing Officer — Level 1 for office categories
 *   sysadmin@iet.test    System Administrator (job title) — Level 1 for IT categories
 *   finance@iet.test     Finance Manager — Level 2
 *   cos@iet.test         Chief of Staff — Level 3
 *   employee@iet.test    Employee / Requestor
 *   viewer@iet.test      Finance / Reporting Viewer
 */
import { PrismaClient } from "@prisma/client";
import { bootstrap } from "./bootstrap";
import { hashPassword } from "../src/server/auth/crypto";
import { loadActor } from "../src/server/auth/actor";
import { saveDraftTx } from "../src/server/services/requests";
import { decideTx, submitRequestTx } from "../src/server/services/workflow";

const db = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run the demo seed in production");
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error("Set SEED_DEMO_PASSWORD in .env");

  const { ietId, roles } = await bootstrap(db);
  const pave = await db.entity.findUniqueOrThrow({ where: { code: "PAVE" } });
  const dept = async (name: string) => (await db.department.findFirstOrThrow({ where: { entityId: ietId, name } })).id;
  const hash = await hashPassword(password);

  const people = [
    { email: "admin@iet.test", name: "Adaeze Okafor", jobTitle: "IT Systems Manager", dept: "IT", roles: ["SYSTEM_ADMIN", "EMPLOYEE"], pave: true },
    { email: "purchasing@iet.test", name: "Tunde Bakare", jobTitle: "Purchasing Officer", dept: "Administration", roles: ["LEVEL1_APPROVER", "EMPLOYEE"] },
    { email: "sysadmin@iet.test", name: "Ifeanyi Eze", jobTitle: "System Administrator", dept: "IT", roles: ["LEVEL1_APPROVER", "EMPLOYEE"] },
    { email: "finance@iet.test", name: "Funmilayo Adeyemi", jobTitle: "Finance Manager", dept: "Finance", roles: ["FINANCE_MANAGER", "EMPLOYEE"] },
    { email: "cos@iet.test", name: "Olumide Johnson", jobTitle: "Chief of Staff", dept: "Administration", roles: ["CHIEF_OF_STAFF", "EMPLOYEE"] },
    { email: "employee@iet.test", name: "Chiamaka Nwosu", jobTitle: "Operations Executive", dept: "Operations", roles: ["EMPLOYEE"] },
    { email: "viewer@iet.test", name: "Bola Ogunleye", jobTitle: "Accountant", dept: "Finance", roles: ["FINANCE_VIEWER", "EMPLOYEE"] },
  ];
  const ids: Record<string, string> = {};
  for (const p of people) {
    const existing = await db.user.findUnique({ where: { email: p.email } });
    if (existing) {
      ids[p.email] = existing.id;
      continue;
    }
    const u = await db.user.create({
      data: {
        email: p.email,
        name: p.name,
        jobTitle: p.jobTitle,
        departmentId: await dept(p.dept),
        passwordHash: hash,
        passwordChangedAt: new Date(),
        entities: { create: [{ entityId: ietId }, ...(p.pave ? [{ entityId: pave.id }] : [])] },
        roles: { create: p.roles.map((r) => ({ roleId: roles[r]!, entityId: null })) },
      },
    });
    ids[p.email] = u.id;
  }

  // Category → Level 1 functional responsible (as on the current paper form)
  const it = ["IT Equipment", "Software & Subscriptions"];
  for (const c of await db.category.findMany({ where: { entityId: ietId } })) {
    if (c.level1ApproverId) continue;
    await db.category.update({ where: { id: c.id }, data: { level1ApproverId: it.includes(c.name) ? ids["sysadmin@iet.test"] : ids["purchasing@iet.test"] } });
  }

  if ((await db.purchaseRequest.count()) > 0) {
    console.log("Demo requests already exist — skipping.");
    return;
  }

  const actor = async (email: string) => (await loadActor(db, ids[email]!))!;
  const cat = async (name: string) => (await db.category.findFirstOrThrow({ where: { entityId: ietId, name } })).id;
  const employee = await actor("employee@iet.test");

  const make = async (title: string, category: string, comments: string, items: [string, string, string][], who = employee) =>
    db.$transaction(async (tx) =>
      saveDraftTx(tx, who, {
        entityId: ietId,
        title,
        categoryId: await cat(category),
        comments,
        paymentDetails: "",
        items: items.map(([description, quantity, unitPrice]) => ({ description, quantity, unitPrice, currency: "NGN", specifications: "" })),
      }),
    );
  const submit = (id: string, who = employee) => db.$transaction((tx) => submitRequestTx(tx, who, id, { confirmed: true }));
  const decide = async (id: string, email: string, decision: "APPROVED" | "REJECTED" | "CLARIFICATION_REQUESTED", comment = "") =>
    db.$transaction(async (tx) => decideTx(tx, await actor(email), { requestId: id, decision, comment }));

  // 1. Fully approved
  const a = await make("Laptops for new operations staff", "IT Equipment", "Two new operations executives start next month and require laptops for daily reporting and LMS administration.", [
    ["HP ProBook 450 G10, 16GB RAM, 512GB SSD", "2", "1150000"],
    ["Laptop bags", "2", "25000"],
  ]);
  await submit(a.id);
  await decide(a.id, "sysadmin@iet.test", "APPROVED", "Specs are consistent with our standard build.");
  await decide(a.id, "finance@iet.test", "APPROVED", "Within the Q4 equipment budget.");
  await decide(a.id, "cos@iet.test", "APPROVED");

  // 2. Pending finance
  const b = await make("Printer toner and paper restock", "Office Supplies", "Quarterly restock of printing consumables for the head office.", [
    ["HP 26A toner cartridge", "4", "68500"],
    ["A4 paper (box of 5 reams)", "10", "21000"],
  ]);
  await submit(b.id);
  await decide(b.id, "purchasing@iet.test", "APPROVED");

  // 3. Returned for clarification
  const c = await make("Annual Zoom Business licences", "Software & Subscriptions", "Renewal of video-conferencing licences used for client training sessions.", [["Zoom Business licence (annual)", "5", "320000"]]);
  await submit(c.id);
  await decide(c.id, "sysadmin@iet.test", "CLARIFICATION_REQUESTED", "Please confirm whether 5 licences are still required — usage report shows 3 active hosts.");

  // 4. Rejected
  const d = await make("Branded team jackets", "Marketing", "Branded jackets for the sales team for upcoming school visits.", [["Branded fleece jacket", "15", "28000"]]);
  await submit(d.id);
  await decide(d.id, "purchasing@iet.test", "APPROVED");
  await decide(d.id, "finance@iet.test", "REJECTED", "Not budgeted this quarter. Please resubmit in Q1 with the marketing plan.");

  // 5. Draft
  await make("Conference room chairs", "Office Equipment", "Replacement of damaged chairs in the main conference room.", [["Ergonomic meeting chair", "8", "95000"]]);

  console.log("Demo data created.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
