/**
 * Applies migrations to the separate test database before the test run (non-destructive).
 * Tests create uniquely-named users/categories per run, so they do not depend on an empty DB.
 * To start from a clean slate, drop the test database manually (see docs/TESTING.md).
 */
import { execSync } from "node:child_process";
import { config } from "dotenv";

config({ quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set");
if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
});
