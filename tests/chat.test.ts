import { describe, expect, it } from "vitest";
import { db, decide, submitted, world } from "./helpers";
import { addCommentTx } from "@/server/services/workflow";
import { listConversations, listMessages, markChatRead } from "@/server/services/chat";
import { visibleRequestsWhere } from "@/server/services/visibility";
import { getDashboard } from "@/server/services/dashboard";
import type { Actor } from "@/server/auth/actor";

const say = (actor: Actor, requestId: string, body: string) => db.$transaction((tx) => addCommentTx(tx, actor, requestId, body, visibleRequestsWhere(actor)));

describe("request chat", () => {
  it("delivers messages to the requestor and the current approver, with role labels", async () => {
    const w = await world();
    const id = await submitted();
    await say(w.actors.employee, id, "Hi, can this be approved before Friday?");
    await say(w.actors.l1, id, "Yes, looking at it now.");

    const msgs = await listMessages(db, w.actors.employee, id);
    expect(msgs.map((m) => [m.body, m.role])).toEqual([
      ["Hi, can this be approved before Friday?", "Requestor"],
      ["Yes, looking at it now.", "Functional Responsible approver"], // assigned via the category
    ]);

    const toL1 = await db.notification.findFirstOrThrow({ where: { requestId: id, userId: w.ids.l1, type: "COMMENT_ADDED" } });
    expect(toL1.link).toBe(`/requests/${id}#chat`);
    expect(toL1.title).toContain(w.actors.employee.name);
    const toEmployee = await db.notification.findFirstOrThrow({ where: { requestId: id, userId: w.ids.employee, type: "COMMENT_ADDED" } });
    expect(toEmployee.body).toContain("looking at it now");

    // someone outside the approval chain is labelled by job title
    await say(w.actors.admin, id, "Noted.");
    expect((await listMessages(db, w.actors.employee, id))[2].role).toBe("admin");
  });

  it("returns only newer messages when polling", async () => {
    const w = await world();
    const id = await submitted();
    await say(w.actors.employee, id, "first");
    const [first] = await listMessages(db, w.actors.l1, id);
    await say(w.actors.l1, id, "second");
    const newer = await listMessages(db, w.actors.l1, id, new Date(first.createdAt));
    expect(newer.map((m) => m.body)).toEqual(["second"]);
  });

  it("keeps people without access out of the conversation", async () => {
    const w = await world();
    const id = await submitted();
    await say(w.actors.employee, id, "private to this request");
    await expect(listMessages(db, w.actors.employee2, id)).rejects.toThrow();
    await expect(say(w.actors.employee2, id, "let me in")).rejects.toThrow();
    await expect(listMessages(db, w.actors.paveOnly, id)).rejects.toThrow();
    expect((await listConversations(db, w.actors.employee2)).some((c) => c.requestId === id)).toBe(false);
  });

  it("notifies anyone who joined the conversation, tracks unread and clears it when opened", async () => {
    const w = await world();
    const id = await submitted();
    await say(w.actors.admin, id, "Admin here, watching this one.");
    await say(w.actors.employee, id, "Thanks!");

    const conv = (await listConversations(db, w.actors.admin)).find((c) => c.requestId === id)!;
    expect(conv.unread).toBe(1);
    expect(conv.lastBody).toBe("Thanks!");
    expect(conv.messages).toBe(2);

    await markChatRead(db, w.actors.admin, id);
    expect((await listConversations(db, w.actors.admin)).find((c) => c.requestId === id)!.unread).toBe(0);
  });

  it("rejects empty messages", async () => {
    const w = await world();
    const id = await submitted();
    await expect(say(w.actors.employee, id, "   ")).rejects.toThrow();
  });
});

describe("dashboard figures", () => {
  it("reports this month's approvals, value, turnaround and the stage pipeline", async () => {
    const w = await world();
    const done = await submitted();
    await decide(w.actors.l1, done, "APPROVED");
    await decide(w.actors.finance, done, "APPROVED");
    await decide(w.actors.cos, done, "APPROVED");
    await submitted(); // stays waiting at Level 1

    const d = await getDashboard(db, w.actors.admin);
    expect(d.primaryCurrency).toBe("NGN");
    expect(d.kpis.approvedThisMonth).toBeGreaterThanOrEqual(1);
    expect(d.kpis.valueThisMonth).toBeGreaterThanOrEqual(3001);
    expect(d.kpis.avgDays).not.toBeNull();
    expect(d.kpis.approvalRate).toBeGreaterThan(0);
    expect(d.months).toHaveLength(12);
    const level1 = d.stages.find((s) => s.order === 1)!;
    expect(level1.waiting).toBeGreaterThanOrEqual(1);
    expect(level1.decided).toBeGreaterThanOrEqual(1);
  });
});
