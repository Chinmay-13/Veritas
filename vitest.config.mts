import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests run against an in-memory Postgres (PGlite), never a real database.
    env: { DATABASE_URL: "pglite://memory", SESSION_SECRET: "test-secret-test-secret-test-secret-123" },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
