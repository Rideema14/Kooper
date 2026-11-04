import { expect, type Page } from "@playwright/test";

export const DEMO = { email: "demo@kooper.dev", password: process.env.SEED_PASSWORD || "kooper-demo-1234" };

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/($|\?|#)/);
}
/** Open a screen directly via its hash; ?nogl skips the Three.js scene so tests are fast and deterministic. */
export async function openScreen(page: Page, name: string) {
  await page.goto(`/?nogl#${name}`);
  await page.locator(".curtain").waitFor({ state: "detached", timeout: 15_000 });
}
