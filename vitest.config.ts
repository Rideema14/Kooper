import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://kooper:kooper@localhost:5432/kooper_test",
      AUTH_SECRET: "test-secret-test-secret-test-secret-123456",
    },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
