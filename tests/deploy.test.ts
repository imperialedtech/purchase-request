import { afterEach, describe, expect, it } from "vitest";
import { db } from "./helpers";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("database storage driver (Vercel without an object store)", () => {
  it("stores, reads and deletes files in PostgreSQL", async () => {
    process.env.STORAGE_DRIVER = "database";
    const { putObject, getObject, deleteObject } = await import("@/server/storage");
    const bytes = Buffer.from("%PDF-1.4 quotation");
    const key = await putObject("attachments", bytes);
    expect(key).toMatch(/^attachments\/[0-9a-f-]{36}$/);
    expect((await getObject(key)).equals(bytes)).toBe(true);
    await deleteObject(key);
    await expect(getObject(key)).rejects.toThrow();
  });

  it("is chosen automatically on Vercel when no Supabase service key is present", async () => {
    const { storageDriver } = await import("@/server/env");
    delete process.env.STORAGE_DRIVER;
    process.env.VERCEL = "1";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(storageDriver()).toBe("database");
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
    expect(storageDriver()).toBe("supabase");
    delete process.env.VERCEL;
    expect(storageDriver()).toBe("local");
  });
});

describe("configuration fallbacks", () => {
  it("derives a stable session key from the database password when SESSION_SECRET is absent", async () => {
    const { sessionSecret } = await import("@/server/env");
    delete process.env.SESSION_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    process.env.POSTGRES_PASSWORD = "pw-one";
    const a = sessionSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionSecret()).toBe(a);
    process.env.POSTGRES_PASSWORD = "pw-two";
    expect(sessionSecret()).not.toBe(a);
    process.env.SESSION_SECRET = "explicit-secret-explicit-secret-123456";
    expect(sessionSecret()).toBe("explicit-secret-explicit-secret-123456");
  });

  it("maps Vercel's Supabase variable names", async () => {
    const { databaseUrl, appUrl } = await import("@/server/env");
    delete process.env.DATABASE_URL;
    process.env.POSTGRES_PRISMA_URL = "postgresql://pooled";
    expect(databaseUrl()).toBe("postgresql://pooled");
    delete process.env.APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "pr.example.com";
    expect(appUrl()).toBe("https://pr.example.com");
  });
});

describe("direct database API lockdown", () => {
  it("enables row level security on every application table", async () => {
    const rows = await db.$queryRaw<{ tablename: string; rowsecurity: boolean }[]>`
      SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`;
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([]);
  });
});
