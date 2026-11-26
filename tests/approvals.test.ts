import { describe, expect, it } from "vitest";
import { db, decide, draft, item, submit, submitted, world } from "./helpers";
import { saveDraftTx, getRequestForActor } from "@/server/services/requests";
import { cancelTx, reassignTx } from "@/server/services/workflow";

describe("sequential three-level approval", () => {
  it("Level 1 → Finance → Chief of Staff → Approved", async () => {
    const w = await world();
    const id = await submitted();

    let r = await decide(w.actors.l1, id, "APPROVED", "OK functionally");
    expect(r.status).toBe("PENDING_FINANCE");
    r = await decide(w.actors.finance, id, "APPROVED");
    expect(r.status).toBe("PENDING_FINAL");
    r = await decide(w.actors.cos, id, "APPROVED", "Approved");
    expect(r.status).toBe("APPROVED");

    const pr = await db.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { approvals: { orderBy: { createdAt: "asc" } }, stages: true } });
    expect(pr.finalApproverId).toBe(w.ids.cos);
    expect(pr.finalApprovedAt).not.toBeNull();
    expect(pr.approvals.map((a) => [a.stageName, a.decision, a.actorId])).toEqual([
      ["Functional Responsible", "APPROVED", w.ids.l1],
      ["Finance Manager", "APPROVED", w.ids.finance],
      ["Chief of Staff", "APPROVED", w.ids.cos],
    ]);
    expect(pr.stages.every((s) => s.state === "APPROVED")).toBe(true);
    const notes = await db.notification.findMany({ where: { requestId: id, userId: w.ids.employee } });
    expect(notes.some((n) => n.type === "PR_APPROVED")).toBe(true);
  });

  it("routes Level 1 by category", async () => {
    const w = await world();
    const id = await submitted(undefined, { categoryId: w.category2.id });
    await expect(decide(w.actors.l1, id, "APPROVED")).rejects.toThrow(/not the assigned approver/);
    const r = await decide(w.actors.l1b, id, "APPROVED");
    expect(r.status).toBe("PENDING_FINANCE");
  });

  it("Finance cannot approve before Level 1; Chief of Staff cannot approve before Finance", async () => {
    const w = await world();
    const id = await submitted();
    await expect(decide(w.actors.finance, id, "APPROVED")).rejects.toThrow(/not the assigned approver/);
    await expect(decide(w.actors.cos, id, "APPROVED")).rejects.toThrow(/not the assigned approver/);
    await decide(w.actors.l1, id, "APPROVED");
    await expect(decide(w.actors.cos, id, "APPROVED")).rejects.toThrow(/not the assigned approver/);
    await expect(decide(w.actors.l1, id, "APPROVED")).rejects.toThrow(/not the assigned approver/);
  });

  it("employees and viewers cannot approve", async () => {
    const w = await world();
    const id = await submitted();
    await expect(decide(w.actors.employee2, id, "APPROVED")).rejects.toThrow();
    await expect(decide(w.actors.viewer, id, "APPROVED")).rejects.toThrow();
    await expect(decide(w.actors.admin, id, "APPROVED")).rejects.toThrow();
  });

  it("prevents self-approval by default", async () => {
    const w = await world();
    // the Level 1 approver raises a request in their own category
    const id = await submitted(w.actors.l1);
    await expect(decide(w.actors.l1, id, "APPROVED")).rejects.toThrow(/own purchase request|not the assigned/);
    // administrators are alerted that a reassignment is required
    const adminNote = await db.notification.findFirst({ where: { requestId: id, userId: w.ids.admin, type: "APPROVER_REASSIGNED" } });
    expect(adminNote).not.toBeNull();
    // and can reassign to another approver, which is audited
    const stage = await db.purchaseRequestStage.findFirstOrThrow({ where: { requestId: id, stageOrder: 1 } });
    await db.$transaction((tx) => reassignTx(tx, w.actors.admin, id, stage.id, w.ids.l1b, "Requester is the category approver"));
    const r = await decide(w.actors.l1b, id, "APPROVED");
    expect(r.status).toBe("PENDING_FINANCE");
    expect(await db.auditLog.count({ where: { requestId: id, action: "APPROVER_CHANGED" } })).toBe(1);
  });

  it("an approver who is also the requester cannot approve at a later stage either", async () => {
    const w = await world();
    const id = await submitted(w.actors.finance);
    await decide(w.actors.l1, id, "APPROVED");
    await expect(decide(w.actors.finance, id, "APPROVED")).rejects.toThrow(/own purchase request/);
  });

  it("cannot action the same stage twice", async () => {
    const w = await world();
    const id = await submitted();
    await decide(w.actors.l1, id, "APPROVED");
    await expect(decide(w.actors.l1, id, "APPROVED")).rejects.toThrow();
    const count = await db.purchaseRequestApproval.count({ where: { requestId: id } });
    expect(count).toBe(1);
  });

  it("concurrent approvals of the same stage result in a single decision", async () => {
    const w = await world();
    const id = await submitted();
    const results = await Promise.allSettled([decide(w.actors.l1, id, "APPROVED"), decide(w.actors.l1, id, "APPROVED"), decide(w.actors.l1, id, "APPROVED")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.purchaseRequestApproval.count({ where: { requestId: id } })).toBe(1);
  });
});

describe("rejection", () => {
  it("requires a reason, records it and preserves history", async () => {
    const w = await world();
    const id = await submitted();
    await decide(w.actors.l1, id, "APPROVED");
    await expect(decide(w.actors.finance, id, "REJECTED", "")).rejects.toThrow(/rejection reason/);
    const r = await decide(w.actors.finance, id, "REJECTED", "Over budget");
    expect(r.status).toBe("REJECTED");
    const pr = await db.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { approvals: true } });
    expect(pr.rejectionReason).toBe("Over budget");
    expect(pr.approvals).toHaveLength(2);
    await expect(decide(w.actors.cos, id, "APPROVED")).rejects.toThrow(/rejected/);
    const { pr: visible } = await getRequestForActor(db, w.actors.employee, id);
    expect(visible.status).toBe("REJECTED");
  });
});

describe("clarification & resubmission", () => {
  it("returns to the requester, keeps prior values and comments, and resumes at the returning stage", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee, { items: [item("Original item", "5", "100")] });
    await submit(w.actors.employee, pr.id);
    await decide(w.actors.l1, pr.id, "APPROVED");
    await expect(decide(w.actors.finance, pr.id, "CLARIFICATION_REQUESTED", "")).rejects.toThrow(/clarification/);
    const r = await decide(w.actors.finance, pr.id, "CLARIFICATION_REQUESTED", "Why 5 units?");
    expect(r.status).toBe("RETURNED");

    // approvers cannot act while returned
    await expect(decide(w.actors.finance, pr.id, "APPROVED")).rejects.toThrow();

    // requester edits and resubmits
    await db.$transaction((tx) =>
      saveDraftTx(tx, w.actors.employee, { entityId: w.ietId, title: "Test purchase", categoryId: w.category.id, comments: "Reduced to 3 units after review.", items: [item("Original item", "3", "100")] }, pr.id),
    );
    const re = await submit(w.actors.employee, pr.id);
    expect(re.status).toBe("PENDING_FINANCE");
    expect(re.prNumber).toBe((await db.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id } })).prNumber);

    const full = await db.purchaseRequest.findUniqueOrThrow({ where: { id: pr.id }, include: { revisions: { orderBy: { revision: "asc" } }, approvals: true, stages: { orderBy: { stageOrder: "asc" } } } });
    expect(full.revision).toBe(2);
    expect(full.revisions).toHaveLength(2);
    expect((full.revisions[0]!.snapshot as { totalAmount: string }).totalAmount).toBe("500");
    expect((full.revisions[1]!.snapshot as { totalAmount: string }).totalAmount).toBe("300");
    expect(full.approvals.map((a) => a.decision)).toEqual(["APPROVED", "CLARIFICATION_REQUESTED"]);
    expect(full.stages.map((s) => s.state)).toEqual(["APPROVED", "ACTIVE", "WAITING"]);
    expect(await db.auditLog.count({ where: { requestId: pr.id, action: "PR_RESUBMITTED" } })).toBe(1);

    // continue to final approval
    await decide(w.actors.finance, pr.id, "APPROVED");
    expect((await decide(w.actors.cos, pr.id, "APPROVED")).status).toBe("APPROVED");
  });

  it("restarts from the first stage when the workflow is configured to", async () => {
    const w = await world();
    const pr = await draft(w.actors.employee);
    await submit(w.actors.employee, pr.id);
    await db.purchaseRequest.update({ where: { id: pr.id }, data: { resubmitRule: "FIRST_STAGE" } });
    await decide(w.actors.l1, pr.id, "APPROVED");
    await decide(w.actors.finance, pr.id, "CLARIFICATION_REQUESTED", "Need quote");
    const re = await submit(w.actors.employee, pr.id);
    expect(re.status).toBe("PENDING_LEVEL1");
  });
});

describe("cancellation", () => {
  it("requester can cancel a pending PR with a reason; others cannot", async () => {
    const w = await world();
    const id = await submitted();
    await expect(db.$transaction((tx) => cancelTx(tx, w.actors.employee2, id, "Not mine"))).rejects.toThrow();
    await expect(db.$transaction((tx) => cancelTx(tx, w.actors.employee, id, ""))).rejects.toThrow(/reason/);
    await db.$transaction((tx) => cancelTx(tx, w.actors.employee, id, "No longer needed"));
    const pr = await db.purchaseRequest.findUniqueOrThrow({ where: { id } });
    expect(pr.status).toBe("CANCELLED");
    expect(pr.cancelledById).toBe(w.ids.employee);
    await expect(decide(w.actors.l1, id, "APPROVED")).rejects.toThrow();
  });

  it("approved PRs cannot be cancelled", async () => {
    const w = await world();
    const id = await submitted();
    await decide(w.actors.l1, id, "APPROVED");
    await decide(w.actors.finance, id, "APPROVED");
    await decide(w.actors.cos, id, "APPROVED");
    await expect(db.$transaction((tx) => cancelTx(tx, w.actors.admin, id, "test"))).rejects.toThrow(/no longer/);
  });
});

describe("workflow changes do not affect existing requests", () => {
  it("existing PR keeps its snapshot after the workflow is edited", async () => {
    const { saveWorkflow } = await import("@/server/services/admin");
    const w = await world();
    const id = await submitted();
    const wf = await db.approvalWorkflow.findFirstOrThrow({ where: { entityId: w.ietId, isActive: true }, include: { stages: { orderBy: { stageOrder: "asc" } } } });
    await db.$transaction((tx) =>
      saveWorkflow(tx, w.actors.admin, wf.id, {
        entityId: w.ietId,
        name: wf.name,
        resubmitRule: wf.resubmitRule,
        isActive: true,
        stages: wf.stages.slice(0, 2).map((s) => ({ name: s.name, statusKey: s.statusKey as "PENDING_LEVEL1", approverType: s.approverType, roleId: s.roleId, userId: s.userId, requireCommentOnApprove: false })),
      }),
    );
    expect(await db.purchaseRequestStage.count({ where: { requestId: id } })).toBe(3);
    await decide(w.actors.l1, id, "APPROVED");
    expect((await decide(w.actors.finance, id, "APPROVED")).status).toBe("PENDING_FINAL");
    // restore the 3-stage workflow
    await db.$transaction((tx) =>
      saveWorkflow(tx, w.actors.admin, wf.id, {
        entityId: w.ietId,
        name: wf.name,
        resubmitRule: wf.resubmitRule,
        isActive: true,
        stages: wf.stages.map((s) => ({ name: s.name, statusKey: s.statusKey as "PENDING_LEVEL1", approverType: s.approverType, roleId: s.roleId, userId: s.userId, requireCommentOnApprove: false })),
      }),
    );
    expect(await db.auditLog.count({ where: { action: "WORKFLOW_CHANGED", targetId: wf.id } })).toBeGreaterThanOrEqual(2);
  });
});
