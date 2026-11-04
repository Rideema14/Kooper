import { test, expect } from "@playwright/test";
import { login, openScreen, DEMO } from "./helpers";

const uniq = () => `E2E ${Date.now().toString(36)}`;

test.describe("authentication", () => {
  test("unauthenticated visitors are sent to the sign-in page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
  test("wrong password shows an error; correct password opens the dashboard; sign-out returns to login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEMO.email);
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText(/incorrect/i);
    await login(page);
    await openScreen(page, "Home");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
    await page.getByRole("button", { name: "Quick add" }).first().click();
  });
});

test.describe("signed-in workflows", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("dashboard shows database-backed figures", async ({ page }) => {
    await openScreen(page, "Home");
    await expect(page.locator(".glass-stats")).toContainText("Stocked");
    await openScreen(page, "Reports");
    await expect(page.getByText("Stock value on shelves")).toBeVisible();
    await expect(page.getByRole("link", { name: /Excel/ })).toHaveAttribute("href", /\/api\/reports\/export\?kind=all&format=xlsx/);
  });

  test("add an ingredient and see it in Stock", async ({ page }) => {
    const name = uniq();
    await openScreen(page, "Stock");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("On hand").fill("12");
    await page.getByLabel("Reorder at").fill("4");
    await page.getByLabel("Price per unit (₹)").fill("55");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(name)).toBeVisible();
    await page.reload();                                   // persisted on the server, not in the browser
    await page.locator(".curtain").waitFor({ state: "detached" });
    await expect(page.getByText(name)).toBeVisible();
  });

  test("create a purchase order, approve it, confirm it was placed, receive it", async ({ page }) => {
    const name = uniq();
    await openScreen(page, "Stock");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByLabel("Name").fill(name); await page.getByLabel("On hand").fill("1");
    await page.getByLabel("Reorder at").fill("2"); await page.getByLabel("Price per unit (₹)").fill("100");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(name)).toBeVisible();

    await openScreen(page, "Orders");
    await page.getByRole("button", { name: "New order" }).click();
    await page.getByLabel("Ingredient").fill(name);
    await page.getByLabel(/^Quantity/).fill("5");
    await page.getByLabel("Estimated total (₹)").fill("500");
    await page.getByRole("button", { name: "Add to orders" }).click();
    await expect(page.getByText(name).first()).toBeVisible();

    await page.getByRole("button", { name: "Approve", exact: true }).first().click();
    await page.getByRole("button", { name: /^Approved/ }).click();
    page.once("dialog", (d) => d.accept());                // explicit "I placed this order" confirmation
    await page.getByRole("button", { name: "I placed this order" }).first().click();
    await page.getByRole("button", { name: /^Ordered/ }).click();
    await page.getByRole("button", { name: "Receive" }).first().click();
    await page.getByRole("button", { name: "Add to stock" }).click();
    await openScreen(page, "Stock");
    await expect(page.getByText(name)).toBeVisible();
  });

  test("upload a CSV invoice, review it, approve it", async ({ page }) => {
    const num = `E2E-${Date.now()}`;
    const csv = `Supplier,Invoice,Date,Item,Qty,Unit,Unit price,Amount\nFresh Farms,${num},2026-10-30,Tomatoes,2,kg,40,80\n,,,Total,,,,80\n`;
    await openScreen(page, "Invoices");
    await page.locator('input[type="file"]:not([capture])').setInputFiles({ name: `${num}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByText("Check what was read")).toBeVisible();
    await expect(page.getByText("Totals add up")).toBeVisible();
    await page.getByRole("button", { name: "Approve and update prices" }).click();
    await expect(page.getByText(/Approved\. Prices updated/)).toBeVisible();
    await expect(page.getByText(num)).toBeVisible();       // appears in history as approved
  });

  test("recipe costing reflects stock prices", async ({ page }) => {
    await openScreen(page, "Costing");
    await expect(page.getByLabel("Dish name")).toHaveValue("Grilled salmon");
    await expect(page.getByText("ingredients per plate")).toBeVisible();
    await expect(page.getByText(/food cost/).first()).toBeVisible();
  });

  test("log waste and see the entry", async ({ page }) => {
    await openScreen(page, "Waste");
    await page.getByRole("button", { name: "Log waste" }).click();
    await page.getByLabel("Ingredient").fill("Flour");
    await page.getByLabel(/^Quantity/).fill("0.5");
    await page.getByRole("button", { name: "Spoiled" }).click();
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByText(/Waste logged/)).toBeVisible();
    await expect(page.locator(".wrow", { hasText: "Flour" }).first()).toBeVisible();
  });
});
