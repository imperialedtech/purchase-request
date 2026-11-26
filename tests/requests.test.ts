import { describe, expect, it } from "vitest";
import { db, decide, draft, item, submit, world } from "./helpers";
import { saveDraftTx, getRequestForActor } from "@/server/services/requests";
import { allocatePrNumber, currentYear, formatPrNumber } from "@/server/services/workflow";
import { lineTotal, totalsByCurrency } from "@/lib/money";

describe("money calculations", () => {
  it("computes line totals with decimal precision", () => {
    expect(lineTotal("3", "0.1").toFixed(2)).toBe("0.30");
    expect(lineTotal("1.5", "1000.33").toFixed(2)).toBe("1500.50"); // 1500.495 → half-up
    expect(lineTotal("12", "1150000").toFixed(2)).toBe("13800000.00");
  });
  it("keeps totals separate per currency", () => {
    const t = totalsByCurrency([
      { currency: "NGN", quantity: "2", unitPrice: "100" },
      { currency: "USD", quantity: "1", unitPrice: "50.25" },
      { currency: "NGN", quantity: "1", unitPrice: "0.50" },
    ]);
    expect(t).toEqual({ NGN: "200.50", USD: "50.25" });
  });
});

describe("drafts", () => {
  it("creates a draft with the initiator taken from the authenticated profile", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    expect(pr.status).toBe("DRAFT");
    expect(pr.prNumber).toBeNull();
    expect(pr.requesterId).toBe(w.ids.employee);
    expect(pr.requesterName).toBe(w.actors.employee.name);
    expect(pr.totalAmount?.toString()).toBe("3001");
  });

  it("edits a draft and recalculates totals server-side", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    const updated = await db.$transaction((tx) =>
      saveDraftTx(
        tx,
        w.actors.employee,
        {
          entityId: w.ietId,
          title: "Edited",
          categoryId: w.category.id,
          comments: "Updated justification text",
          // a client-supplied total is not part of the schema and is ignored
          items: [{ ...item("Alpha", "3", "10.10"), lineTotal: "999999" } as never, item("Bravo", "1", "5")],
        },
        pr.id,
      ),
    );
    expect(updated.items).toHaveLength(2);
    expect(updated.items.find((i) => i.description === "Alpha")!.lineTotal.toString()).toBe("30.3");
    expect(updated.totalAmount!.toString()).toBe("35.3");
  });

  it("supports many line items", async () => {
    const w = await world();
    const items = Array.from({ length: 25 }, (_, i) => item(`Line ${i + 1}`, "2", "10.00"));
    const pr = await draft(w.actors.employee, { items });
    expect(pr.items).toHaveLength(25);
    expect(pr.totalAmount!.toString()).toBe("500");
  });

  it("rejects invalid quantities and prices", async () => {
    const w = await world();
    await expect(draft(w.actors.employee, { items: [item("Item x", "0", "10")] })).rejects.toThrow(/greater than zero/);
    await expect(draft(w.actors.employee, { items: [item("Item x", "-1", "10")] })).rejects.toThrow();
    await expect(draft(w.actors.employee, { items: [item("Item x", "1", "-5")] })).rejects.toThrow();
    await expect(draft(w.actors.employee, { items: [item("Item x", "1", "10.123")] })).rejects.toThrow(/2 decimal/);
    await expect(draft(w.actors.employee, { items: [item("Item x", "abc", "10")] })).rejects.toThrow();
  });

  it("enforces a single currency per PR for Imperial EdTech and only allowed currencies", async () => {
    const w = await world();
    await expect(draft(w.actors.employee, { items: [item("Item a", "1", "1", "NGN"), item("Item b", "1", "1", "USD")] })).rejects.toThrow(/same currency/);
    await expect(draft(w.actors.employee, { items: [item("Item a", "1", "1", "JPY")] })).rejects.toThrow(/not enabled/);
    const usd = await draft(w.actors.employee, { items: [item("Item a", "2", "99.99", "USD")] });
    expect(usd.currency).toBe("USD");
  });

  it("prevents another user from editing a draft", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    await expect(
      db.$transaction((tx) => saveDraftTx(tx, w.actors.employee2, { entityId: w.ietId, title: "x", comments: "", items: [] }, pr.id)),
    ).rejects.toThrow(/Only the requestor/);
  });

  it("does not allow creating PRs in an unconfigured entity (PAVE)", async () => {
    const w = await world();
    await expect(draft(w.actors.admin, { entityId: w.paveId, categoryId: undefined })).rejects.toThrow(/not yet configured/);
  });
});

describe("submission & numbering", () => {
  it("validates required fields at submission", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee, { comments: "short", items: [] });
    await expect(submit(w.actors.employee, pr.id)).rejects.toThrow();
    const pr2 = await draft(w.actors.employee, { items: [] });
    await expect(submit(w.actors.employee, pr2.id)).rejects.toThrow(/at least one line item/);
  });

  it("assigns an IET-PR-YYYY-NNNN number and routes to Level 1", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    const r = await submit(w.actors.employee, pr.id);
    expect(r.prNumber).toMatch(new RegExp(`^IET-PR-${currentYear()}-\\d{4}$`));
    expect(r.status).toBe("PENDING_LEVEL1");
    expect(r.stageName).toBe("Functional Responsible");
    const stages = await db.purchaseRequestStage.findMany({ where: { requestId: pr.id }, orderBy: { stageOrder: "asc" } });
    expect(stages.map((s) => s.state)).toEqual(["ACTIVE", "WAITING", "WAITING"]);
    expect(stages[0]!.assignedUserId).toBe(w.ids.l1);
    const notes = await db.notification.findMany({ where: { requestId: pr.id, userId: w.ids.l1 } });
    expect(notes.some((n) => n.type === "APPROVAL_REQUIRED")).toBe(true);
  });

  it("requires the submission declaration to be confirmed", async () => {
    const { submitRequestTx } = await import("@/server/services/workflow");
    const w = await world();
    const pr = await draft(w.actors.employee);
    await expect(db.$transaction((tx) => submitRequestTx(tx, w.actors.employee, pr.id, { confirmed: false }))).rejects.toThrow(/confirm/);
  });

  it("cannot submit twice", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    await submit(w.actors.employee, pr.id);
    await expect(submit(w.actors.employee, pr.id)).rejects.toThrow(/already/);
  });

  it("generates unique sequential numbers under concurrent submissions", async () => {
    const w = await world();
    const drafts = await Promise.all(Array.from({ length: 12 }, () => draft(w.actors.employee)));
    const results = await Promise.all(drafts.map((d) => submit(w.actors.employee, d.id)));
    const nums = results.map((r) => r.prNumber);
    expect(new Set(nums).size).toBe(12);
    const seqs = nums.map((n) => Number(n.split("-").pop())).sort((a, b) => a - b);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]! - seqs[i - 1]!).toBe(1);
  });

  it("formats numbers per entity configuration", () => {
    expect(formatPrNumber("{CODE}-PR-{YEAR}-{SEQ}", "PAVE", 2026, 7, 4)).toBe("PAVE-PR-2026-0007");
  });

  it("database rejects duplicate PR numbers", async () => {
    const w = await world();
    const a = await draft(w.actors.employee);
    const r = await submit(w.actors.employee, a.id);
    const b = await draft(w.actors.employee);
    await expect(db.purchaseRequest.update({ where: { id: b.id }, data: { prNumber: r.prNumber } })).rejects.toThrow();
  });

  it("sequence allocation is atomic per entity", async () => {
    const w = await world();
    const entity = await db.entity.findUniqueOrThrow({ where: { id: w.paveId } });
    const n = await Promise.all(Array.from({ length: 8 }, () => db.$transaction((tx) => allocatePrNumber(tx, entity))));
    expect(new Set(n).size).toBe(8);
    expect(n.every((x) => x.startsWith(`PAVE-PR-${currentYear()}-`))).toBe(true);
  });

  it("freezes the initiator section at submission", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    await submit(w.actors.employee, pr.id);
    await decide(w.actors.l1, pr.id, "APPROVED");
    const { pr: detail } = await getRequestForActor(db, w.actors.employee, pr.id);
    expect(detail.requesterName).toBe(w.actors.employee.name);
    expect(detail.revisions).toHaveLength(1);
  });
});
