import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/server/db";
import { addIngredient } from "@/lib/services/catalog";
import * as po from "@/lib/services/purchasing";
import * as ws from "@/lib/services/waste";
import * as rc from "@/lib/services/recipes";
import * as inv from "@/lib/services/invoices";
import * as rp from "@/lib/services/reports";
import { receive } from "@/lib/services/catalog";
import { onHand } from "@/lib/services/stock";
import { makeCtx, cleanup, cleanupUsers } from "./helpers";

afterAll(async () => { await cleanup(); await cleanupUsers(); await db.$disconnect(); });
const stock = async (c: { restaurantId: string }, id: string) => (await onHand(db, c.restaurantId, id)).toString();
const ing = (c: Awaited<ReturnType<typeof makeCtx>>, name: string, extra: object = {}) => addIngredient(c, { name, unit: "kg", category: "Produce", unitCost: 100, minStock: 0, reorderLevel: 0, ...extra } as never);

describe("purchase workflow", () => {
  it("enforces approve → sent → receive, supports partial delivery, and updates stock + price", async () => {
    const c = await makeCtx("PO"); const tomato = await ing(c, "Tomato", { unitCost: 30 });
    const order = await po.createPurchase(c, { items: [{ ingredientId: tomato.id, quantity: 10, unitPrice: 40 }] });
    expect(order.status).toBe("PENDING_APPROVAL"); expect(order.number).toBe("PO-0001");
    await expect(po.markSent(c, order.id)).rejects.toThrow(/can't be moved/);                       // not approved yet
    await expect(po.receivePurchase(c, order.id, { lines: [{ itemId: order.items[0].id, quantity: 1 }] })).rejects.toThrow(/sent/);
    await po.approvePurchase(c, order.id);
    await expect(po.approvePurchase(c, order.id)).rejects.toThrow(/can't be moved/);                // double click
    await expect(po.receivePurchase(c, order.id, { lines: [{ itemId: order.items[0].id, quantity: 1 }] })).rejects.toThrow(/sent/); // approved ≠ ordered
    await po.markSent(c, order.id);
    const itemId = order.items[0].id;
    const r1 = await po.receivePurchase(c, order.id, { lines: [{ itemId, quantity: 4 }], idempotencyKey: "r1" });
    expect(r1.status).toBe("PARTIALLY_RECEIVED"); expect(await stock(c, tomato.id)).toBe("4");
    await po.receivePurchase(c, order.id, { lines: [{ itemId, quantity: 4 }], idempotencyKey: "r1" }); // retry same key
    expect(await stock(c, tomato.id)).toBe("4");
    await expect(po.receivePurchase(c, order.id, { lines: [{ itemId, quantity: 7 }] })).rejects.toThrow(/outstanding/);
    const r2 = await po.receivePurchase(c, order.id, { lines: [{ itemId, quantity: 6 }], idempotencyKey: "r2" });
    expect(r2.status).toBe("RECEIVED"); expect(await stock(c, tomato.id)).toBe("10");
    expect((await db.ingredient.findUniqueOrThrow({ where: { id: tomato.id } })).unitCost.toString()).toBe("40");
    expect(await db.notification.count({ where: { restaurantId: c.restaurantId, kind: "price_change" } })).toBe(1); // +33%
  });
  it("suggests low items once, picks the cheapest supplier, and groups drafts per supplier", async () => {
    const c = await makeCtx("SG");
    const a = await db.supplier.create({ data: { restaurantId: c.restaurantId, name: "A" } });
    const b = await db.supplier.create({ data: { restaurantId: c.restaurantId, name: "B" } });
    const rice = await ing(c, "Rice", { reorderLevel: 10, openingStock: 2, supplierId: a.id });
    await db.supplierPrice.create({ data: { restaurantId: c.restaurantId, supplierId: a.id, ingredientId: rice.id, price: 90 } });
    await db.supplierPrice.create({ data: { restaurantId: c.restaurantId, supplierId: b.id, ingredientId: rice.id, price: 70 } });
    await ing(c, "Salt", { reorderLevel: 1, openingStock: 50 });                                   // fine → not suggested
    const s = await po.suggestions(c);
    expect(s.map((x) => x.name)).toEqual(["Rice"]); expect(s[0].supplier?.name).toBe("B"); expect(s[0].unitPrice.toString()).toBe("70");
    const drafts = await po.draftFromSuggestions(c);
    expect(drafts).toHaveLength(1); expect(drafts[0].status).toBe("PENDING_APPROVAL");           // drafted, NOT approved/sent
    expect(await po.suggestions(c)).toHaveLength(0);                                              // already queued
  });
});

describe("waste", () => {
  it("deducts FIFO once, values at batch cost, is idempotent, reversible, and atomic on failure", async () => {
    const c = await makeCtx("WS"); const cream = await ing(c, "Cream", { unit: "L", unitCost: 200, openingStock: 5 });
    const w = await ws.logWaste(c, { ingredientId: cream.id, quantity: 2, reason: "Expired", idempotencyKey: "k1" });
    expect(w.value.toString()).toBe("400"); expect(await stock(c, cream.id)).toBe("3");
    await ws.logWaste(c, { ingredientId: cream.id, quantity: 2, reason: "Expired", idempotencyKey: "k1" });
    expect(await stock(c, cream.id)).toBe("3"); expect(await db.wasteEntry.count({ where: { restaurantId: c.restaurantId } })).toBe(1);
    await expect(ws.logWaste(c, { ingredientId: cream.id, quantity: 9, reason: "Spoiled" })).rejects.toThrow(/Only 3/);
    expect(await db.wasteEntry.count({ where: { restaurantId: c.restaurantId } })).toBe(1);
    await ws.reverseWaste(c, w.id);
    expect(await stock(c, cream.id)).toBe("5"); expect(await db.wasteEntry.count({ where: { restaurantId: c.restaurantId } })).toBe(0);
  });
  it("flags ingredients wasted 3+ times", async () => {
    const c = await makeCtx("RW"); const l = await ing(c, "Lettuce", { openingStock: 20 });
    for (let i = 0; i < 3; i++) await ws.logWaste(c, { ingredientId: l.id, quantity: 1, reason: "Spoiled" });
    expect((await ws.repeatedWaste(c)).map((r) => r.name)).toEqual(["Lettuce"]);
  });
});

describe("recipes", () => {
  it("computes cost/profit/food-cost% and follows approved ingredient price changes", async () => {
    const c = await makeCtx("RC"); const cheese = await ing(c, "Mozzarella", { unitCost: 400 }); const flour = await ing(c, "Flour", { unitCost: 50 });
    const r = await rc.saveRecipe(c, null, { name: "Pizza", servings: 1, sellingPrice: 299, lines: [{ ingredientId: cheese.id, quantity: 0.2 }, { ingredientId: flour.id, quantity: 0.3 }] });
    expect(r.cost.toString()).toBe("95"); expect(r.grossProfit.toString()).toBe("204"); expect(r.foodCostPct.toString()).toBe("31.8");
    await db.ingredient.update({ where: { id: cheese.id }, data: { unitCost: 500 } });
    expect((await rc.listRecipes(c))[0].cost.toString()).toBe("115");
    await rc.saveRecipe(c, r.id, { name: "Pizza", servings: 1, sellingPrice: 349, lines: [{ ingredientId: cheese.id, quantity: 0.2 }] });
    expect((await rc.priceHistory(c, r.id)).map((h) => (h.meta as { to: string }).to)).toEqual(["349", "299"]);
  });
  it("refuses another restaurant's ingredient", async () => {
    const a = await makeCtx("RA"), b = await makeCtx("RB"); const x = await ing(a, "Secret");
    await expect(rc.saveRecipe(b, null, { name: "Steal", servings: 1, sellingPrice: 10, lines: [{ ingredientId: x.id, quantity: 1 }] })).rejects.toThrow(/wasn't found/);
  });
});

describe("invoices", () => {
  const csv = (rows: string) => Buffer.from(`Supplier,Invoice,Date,Item,Quantity,Unit,Unit price,Total\n${rows}`);
  it("extracts CSV → review; blocks approval on arithmetic errors; approval updates prices, stock only if asked", async () => {
    const c = await makeCtx("IV"); const tom = await ing(c, "Tomatoes", { unitCost: 34, unit: "kg" });
    const good = csv("Fresh Farms,INV-9,2026-10-01,Tomatoes,10,kg,40,400\n,,,Subtotal,,,,400\n,,,Total,,,,400");
    const created = await inv.uploadInvoice(c, { name: "a.csv", buffer: good });
    expect(created.status).toBe("NEEDS_REVIEW"); expect(created.items[0].ingredientId).toBe(tom.id);
    expect(await stock(c, tom.id)).toBe("0");                                                    // AI/extraction never touches stock
    await expect(inv.uploadInvoice(c, { name: "a.csv", buffer: good })).rejects.toThrow(/already uploaded/); // duplicate file
    const bad = await inv.uploadInvoice(c, { name: "b.csv", buffer: csv("Fresh Farms,INV-10,2026-10-02,Tomatoes,10,kg,40,500\n,,,Total,,,,500") });
    expect((bad.issues as { code: string }[]).some((i) => i.code === "line_mismatch")).toBe(true);
    await expect(inv.approveInvoice(c, bad.id, false)).rejects.toThrow(/Fix these/);
    const fixed = await inv.updateInvoice(c, bad.id, { supplierName: "Fresh Farms", number: "INV-10", invoiceDate: new Date("2026-10-02"), total: 400, subtotal: 400, tax: 0, items: [{ rawName: "Tomatoes", ingredientId: tom.id, quantity: 10, unit: "kg", unitPrice: 40, lineTotal: 400 }] });
    expect((fixed.issues as { severity: string }[]).filter((i) => i.severity === "error")).toHaveLength(0);
    await inv.approveInvoice(c, bad.id, false);
    expect((await db.ingredient.findUniqueOrThrow({ where: { id: tom.id } })).unitCost.toString()).toBe("40");
    expect(await stock(c, tom.id)).toBe("0");                                                    // approval alone ≠ stock
    await expect(inv.approveInvoice(c, bad.id, true)).rejects.toThrow();                         // already handled
    expect(await db.supplier.count({ where: { restaurantId: c.restaurantId, name: "Fresh Farms" } })).toBe(1);
    expect(await db.supplierPrice.count({ where: { restaurantId: c.restaurantId } })).toBe(1);
    await inv.approveInvoice(c, created.id, true).catch((e) => expect(String(e.message)).toMatch(/INV-9|duplicate|already/i));
  });
  it("adds approved lines to stock when explicitly requested, exactly once", async () => {
    const c = await makeCtx("IS"); const oil = await ing(c, "Olive oil", { unit: "L", unitCost: 600 });
    const i = await inv.uploadInvoice(c, { name: "o.csv", buffer: csv("Chef Supply,INV-1,2026-10-01,Olive oil,3,L,620,1860\n,,,Total,,,,1860") });
    await inv.approveInvoice(c, i.id, true);
    expect(await stock(c, oil.id)).toBe("3");
    await expect(inv.approveInvoice(c, i.id, true)).rejects.toThrow(); expect(await stock(c, oil.id)).toBe("3");
  });
  it("flags duplicate invoice numbers from the same supplier", async () => {
    const c = await makeCtx("ID"); await ing(c, "Rice", { unitCost: 90 });
    await inv.uploadInvoice(c, { name: "1.csv", buffer: csv("Mill,INV-5,2026-10-01,Rice,1,kg,90,90\n,,,Total,,,,90") });
    const d = await inv.uploadInvoice(c, { name: "2.csv", buffer: csv("Mill,INV-5,2026-10-01,Rice,2,kg,90,180\n,,,Total,,,,180") });
    expect((d.issues as { code: string }[]).some((x) => x.code === "duplicate_number")).toBe(true);
  });
  it("is invisible to other restaurants", async () => {
    const a = await makeCtx("IA"), b = await makeCtx("IB"); await ing(a, "Rice");
    const i = await inv.uploadInvoice(a, { name: "x.csv", buffer: csv("S,N1,2026-10-01,Rice,1,kg,100,100\n,,,Total,,,,100") });
    await expect(inv.getInvoice(b, i.id)).rejects.toThrow(/not found/i);
    await expect(inv.approveInvoice(b, i.id, false)).rejects.toThrow(/not found/i);
    expect(await inv.listInvoices(b)).toHaveLength(0);
  });
  it("PDF/photo extraction reports clearly when Gemini isn't configured (no fake data)", async () => {
    const c = await makeCtx("IG"); delete process.env.GEMINI_API_KEY;
    await expect(inv.uploadInvoice(c, { name: "x.pdf", buffer: Buffer.from("%PDF-1.4\n...") })).rejects.toThrow(/Gemini API key/);
    expect(await db.invoice.count({ where: { restaurantId: c.restaurantId } })).toBe(0);
  });
});

describe("dashboard totals match records", () => {
  it("inventory value, waste cost and purchase spend equal the underlying rows", async () => {
    const c = await makeCtx("DB"); const a = await ing(c, "A", { unitCost: 10, openingStock: 10 }); const b = await ing(c, "B", { unitCost: 25, openingStock: 4, reorderLevel: 5 });
    await receive(c, a.id, { quantity: 5, unitCost: 12 });
    await ws.logWaste(c, { ingredientId: a.id, quantity: 2, reason: "Spoiled" });
    const d = await rp.dashboard(c);
    const batches = await db.inventoryItem.findMany({ where: { restaurantId: c.restaurantId } });
    expect(d.inventoryValue).toBe(batches.reduce((s, x) => s + Number(x.quantity) * Number(x.unitCost), 0));
    expect(d.wasteCost).toBe(20); expect(d.purchaseSpend).toBe(60); expect(d.lowStockCount).toBe(1);
    expect((await rp.datasets(c)).inventory.rows).toHaveLength(2);
    expect(rp.toCsv((await rp.datasets(c)).waste)).toContain("Spoiled");
  });
});
