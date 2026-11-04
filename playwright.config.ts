import { defineConfig, devices } from "@playwright/test";

/**
 * Prerequisites: a migrated + seeded database (npm run db:seed) and a .env with DATABASE_URL / AUTH_SECRET.
 * Run:  npx playwright install chromium && npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3200", trace: "retain-on-failure", viewport: { width: 1280, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run build && npx next start -p 3200", url: "http://localhost:3200/api/health", reuseExistingServer: !process.env.CI, timeout: 240_000 },
});
