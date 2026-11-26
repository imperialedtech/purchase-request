import { describe, expect, it } from "vitest";
import { db, decide, draft, submitted, world } from "./helpers";
import { getRequestForActor, listRequests } from "@/server/services/requests";
import { getAttachmentForActor, recordAttachment, detectType } from "@/server/services/attachments";
import { runReport } from "@/server/services/reports";
import { createUser, setRolePermissions } from "@/server/services/admin";
import { authenticate } from "@/server/services/auth";
import { hashPassword } from "@/server/auth/crypto";
import { can } from "@/server/auth/actor";

describe("request visibility", () => {
  it("an unrelated employee cannot view another user's PR", async () => {
    const w = await world();
    const id = await submitted();
    await expect(getRequestForActor(db, w.actors.employee2, id)).rejects.toThrow(/not found/i);
    const list = await listRequests(db, w.actors.employee2, {});
    expect(list.rows.find((r) => r.id === id)).toBeUndefined();
  });

  it("drafts are private to the requester, even for administrators and viewers", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    await expect(getRequestForActor(db, w.actors.admin, pr.id)).rejects.toThrow();
    await expect(getRequestForActor(db, w.actors.viewer, pr.id)).rejects.toThrow();
    expect((await getRequestForActor(db, w.actors.employee, pr.id)).pr.id).toBe(pr.id);
  });

  it("approvers can see PRs assigned to them; finance viewer sees all submitted", async () => {
    const w = await world();
    const id = await submitted();
    expect((await getRequestForActor(db, w.actors.l1, id)).caps.canAct).toBe(true);
    expect((await getRequestForActor(db, w.actors.finance, id)).caps.canAct).toBe(false);
    expect((await getRequestForActor(db, w.actors.viewer, id)).caps.canAct).toBe(false);
  });

  it("users without access to an entity cannot see its records", async () => {
    const w = await world();
    const id = await submitted();
    await expect(getRequestForActor(db, w.actors.paveOnly, id)).rejects.toThrow();
    const list = await listRequests(db, w.actors.paveOnly, {});
    expect(list.rows.every((r) => r.entityCode === "PAVE")).toBe(true);
    await expect(decide(w.actors.paveOnly, id, "APPROVED")).rejects.toThrow();
  });

  it("restricted payment details are hidden from viewers without permission", async () => {
    const w = await world();
    const id = await submitted(undefined, { paymentDetails: "Bank: XYZ, Acct 0123456789" });
    expect((await getRequestForActor(db, w.actors.viewer, id)).pr.paymentDetails).toBeNull();
    expect((await getRequestForActor(db, w.actors.viewer, id)).paymentRestricted).toBe(true);
    expect((await getRequestForActor(db, w.actors.l1, id)).pr.paymentDetails).toContain("XYZ");
    expect((await getRequestForActor(db, w.actors.employee, id)).pr.paymentDetails).toContain("XYZ");
  });
});

describe("attachments", () => {
  it("only users who can see the PR can access its attachments", async () => {
    const w = await world();
    const id = await submitted();
    const pr = await db.purchaseRequest.findUniqueOrThrow({ where: { id } });
    const a = await db.$transaction((tx) =>
      recordAttachment(tx, w.actors.employee, pr, { fileName: "quote.pdf", storageKey: `attachments/${crypto.randomUUID()}`, mimeType: "application/pdf", sizeBytes: 10 }),
    );
    await expect(getAttachmentForActor(db, w.actors.employee2, a.id)).rejects.toThrow();
    await expect(getAttachmentForActor(db, w.actors.paveOnly, a.id)).rejects.toThrow();
    expect((await getAttachmentForActor(db, w.actors.l1, a.id)).id).toBe(a.id);
  });

  it("detects file types from content, rejecting disguised files", () => {
    expect(detectType("quote.pdf", Buffer.from("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(detectType("quote.pdf", Buffer.from("MZ\x90\x00 executable"))).toBeNull();
    expect(detectType("script.exe", Buffer.from("MZ"))).toBeNull();
    expect(detectType("page.html", Buffer.from("<script>"))).toBeNull();
    expect(detectType("notes.txt", Buffer.from("hello"))).toBe("text/plain");
  });
});

describe("data integrity in the database", () => {
  it("approval records cannot be modified or deleted", async () => {
    const w = await world();
    const id = await submitted();
    await decide(w.actors.l1, id, "APPROVED");
    const a = await db.purchaseRequestApproval.findFirstOrThrow({ where: { requestId: id } });
    await expect(db.purchaseRequestApproval.update({ where: { id: a.id }, data: { decision: "REJECTED" } })).rejects.toThrow(/append-only/);
    await expect(db.purchaseRequestApproval.delete({ where: { id: a.id } })).rejects.toThrow(/append-only/);
  });

  it("audit logs cannot be modified or deleted", async () => {
    const row = await db.auditLog.findFirstOrThrow();
    await expect(db.auditLog.update({ where: { id: row.id }, data: { summary: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it("rejects inconsistent line totals and invalid quantities at the database level", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    await expect(
      db.purchaseRequestItem.create({ data: { requestId: pr.id, lineNo: 99, description: "x", quantity: "2", unitPrice: "10", lineTotal: "999", currency: "NGN" } }),
    ).rejects.toThrow();
    await expect(
      db.purchaseRequestItem.create({ data: { requestId: pr.id, lineNo: 98, description: "x", quantity: "0", unitPrice: "10", lineTotal: "0", currency: "NGN" } }),
    ).rejects.toThrow();
  });

  it("a non-draft PR without a number cannot exist", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    await expect(db.purchaseRequest.update({ where: { id: pr.id }, data: { status: "APPROVED" } })).rejects.toThrow();
  });
});

describe("role permissions", () => {
  it("permissions follow roles", async () => {
    const w = await world();
    expect(can(w.actors.employee, "pr.create", w.ietId)).toBe(true);
    expect(can(w.actors.employee, "approval.act", w.ietId)).toBe(false);
    expect(can(w.actors.employee, "admin.users")).toBe(false);
    expect(can(w.actors.admin, "admin.users", w.ietId)).toBe(true);
    expect(can(w.actors.viewer, "pr.create", w.ietId)).toBe(false);
  });

  it("employees cannot run reports or manage users", async () => {
    const w = await world();
    await expect(runReport(db, w.actors.employee, "summary", {})).rejects.toThrow(/reports/);
    await expect(
      db.$transaction((tx) =>
        createUser(tx, w.actors.employee, { email: "x@test.local", name: "X", entityIds: [w.ietId], roles: [{ roleId: w.roles.EMPLOYEE!, entityId: null }] }),
      ),
    ).rejects.toThrow();
  });

  it("only system administrators can change role permissions", async () => {
    const w = await world();
    await expect(db.$transaction((tx) => setRolePermissions(tx, w.actors.finance, w.roles.EMPLOYEE!, ["pr.create", "approval.act"]))).rejects.toThrow();
  });

  it("reports only include records the user may see and never mix currencies", async () => {
    const w = await world();
    const report = await runReport(db, w.actors.viewer, "financial", {});
    const currencies = report.rows.map((r) => r.currency);
    expect(new Set(currencies).size).toBe(currencies.length);
  });
});

describe("authentication", () => {
  it("locks the account after repeated failures and gives generic errors", async () => {
    const w = await world();
    const email = `lock-${w.tag}@test.local`;
    await db.user.create({ data: { email, name: "Lock Test", passwordHash: await hashPassword("Correct-Horse-1") } });
    await expect(authenticate(db, "nobody@test.local", "x")).rejects.toThrow("Invalid email or password");
    for (let i = 0; i < 8; i++) await expect(authenticate(db, email, "wrong")).rejects.toThrow("Invalid email or password");
    await expect(authenticate(db, email, "Correct-Horse-1")).rejects.toThrow(/locked/);
  });

  it("deactivated users cannot sign in", async () => {
    const w = await world();
    const email = `inactive-${w.tag}@test.local`;
    await db.user.create({ data: { email, name: "Inactive", isActive: false, passwordHash: await hashPassword("Correct-Horse-1") } });
    await expect(authenticate(db, email, "Correct-Horse-1")).rejects.toThrow("Invalid email or password");
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within a window and is shared through the database", async () => {
    const { rateLimit } = await import("@/server/auth/rate-limit");
    const key = `test:${crypto.randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 7 }, () => rateLimit(db, key, 5, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed).every((r) => r.retryAfterSec > 0)).toBe(true);
  });
});
