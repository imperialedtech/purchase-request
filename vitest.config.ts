import { defineConfig } from "vitest/config";
import path from "node:path";
import { config } from "dotenv";

config({ quiet: true });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/empty.ts"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      DIRECT_URL: process.env.TEST_DATABASE_URL ?? "",
      STORAGE_DRIVER: "local",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "test-secret-test-secret-test-secret-123",
      SMTP_HOST: "",
    },
  },
});
