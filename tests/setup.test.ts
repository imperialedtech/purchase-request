import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { db } from "./helpers";
import { createFirstAdmin, setupNeeded } from "@/server/services/setup";
import { authenticate } from "@/server/services/auth";

const saved = process.env.SETUP_CODE;
afterEach(() => {
  if (saved === undefined) delete process.env.SETUP_CODE;
  else process.env.SETUP_CODE = saved;
});

const input = (email: string, code = "correct-horse-setup-code") => ({ code, name: "First Admin", email, jobTitle: "IT", password: "First-Admin-Pass-1" });
const client = db as unknown as PrismaClient;

describe("first-time administrator setup", () => {
  it("is disabled until a SETUP_CODE of at least 12 characters is configured", async () => {
    delete process.env.SETUP_CODE;
    await expect(createFirstAdmin(client, input("a@setup.test"))).rejects.toThrow(/not enabled/);
    process.env.SETUP_CODE = "short";
    await expect(createFirstAdmin(client, input("a@setup.test", "short"))).rejects.toThrow(/not enabled/);
  });

  it("rejects a wrong setup code and weak passwords", async () => {
    process.env.SETUP_CODE = "correct-horse-setup-code";
    await expect(createFirstAdmin(client, input("a@setup.test", "wrong-code-wrong-code"))).rejects.toThrow(/incorrect/);
    await expect(createFirstAdmin(client, { ...input("a@setup.test"), password: "weak" })).rejects.toThrow();
  });

  it("creates exactly one first administrator, who can then sign in", async () => {
    process.env.SETUP_CODE = "correct-horse-setup-code";
    const email = `first-${crypto.randomUUID().slice(0, 8)}@setup.test`;
    if (await setupNeeded(client)) {
      const id = await createFirstAdmin(client, input(email));
      const u = await db.user.findUniqueOrThrow({ where: { id }, include: { roles: { include: { role: true } } } });
      expect(u.roles.map((r) => r.role.key).sort()).toEqual(["EMPLOYEE", "SYSTEM_ADMIN"]);
      expect((await authenticate(db, email, "First-Admin-Pass-1")).id).toBe(id);
      expect(await db.entity.count({ where: { code: { in: ["IET", "PAVE"] } } })).toBe(2);
    }
    expect(await setupNeeded(client)).toBe(false);
    await expect(createFirstAdmin(client, input(`second-${crypto.randomUUID().slice(0, 8)}@setup.test`))).rejects.toThrow(/already been completed/);
  });
});
