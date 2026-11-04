import { describe, it, expect, afterAll } from "vitest";
import { db } from "@/lib/server/db";
import { createIngredient, receiveStock, drawStock, adjustTo, onHand, inTx } from "@/lib/services/stock";
import { makeRestaurant, cleanup } from "./helpers";

afterAll(async () => { await cleanup(); await db.$disconnect(); });

const ledgerSum = async (restaurantId: string, ingredientId: string) => {
  const r = await db.stockMovement.aggregate({ where: { restaurantId, ingredientId }, _sum: { quantity: true } });
  return r._sum.quantity?.toString() ?? "0";
};

describe("stock ledger", () => {
  it("reproduces the spec example: 20 + 10 − 5 − 2 = 23 kg, and ledger == batches", async () => {
    const a = await makeRestaurant();
    const ing = await inTx((tx) => createIngredient(tx, a, { name: "Rice", unit: "kg", unitCost: 90, openingStock: 20 }));
    await inTx((tx) => receiveStock(tx, a, { ingredientId: ing.id, quantity: 10, unitCost: 95 }));
    await inTx((tx) => drawStock(tx, a, { ingredientId: ing.id, quantity: 5, type: "CONSUMPTION" }));
    await inTx((tx) => drawStock(tx, a, { ingredientId: ing.id, quantity: 2, type: "WASTE" }));
    expect((await onHand(db, a.restaurantId, ing.id)).toString()).toBe("23");
    expect(await ledgerSum(a.restaurantId, ing.id)).toBe("23");
    const types = (await db.stockMovement.findMany({ where: { ingredientId: ing.id }, orderBy: { createdAt: "asc" } })).map((m) => m.type);
    expect(types).toEqual(["OPENING", "PURCHASE_RECEIVED", "CONSUMPTION", "WASTE"]);
  });

  it("consumes FIFO by earliest expiry and values draws at batch cost", async () => {
    const a = await makeRestaurant();
    const ing = await inTx((tx) => createIngredient(tx, a, { name: "Cream", unit: "L" }));
    await inTx((tx) => receiveStock(tx, a, { ingredientId: ing.id, quantity: 4, unitCost: 200, expiryDate: new Date("2027-03-01") }));
    await inTx((tx) => receiveStock(tx, a, { ingredientId: ing.id, quantity: 4, unitCost: 100, expiryDate: new Date("2027-01-01") }));
    const r = await inTx((tx) => drawStock(tx, a, { ingredientId: ing.id, quantity: 6, type: "CONSUMPTION" }));
    // 4 @100 (earlier expiry) + 2 @200 = 800
    expect(r.value.toString()).toBe("800");
    const left = await db.inventoryItem.findMany({ where: { ingredientId: ing.id }, orderBy: { expiryDate: "asc" } });
    expect(left.map((b) => b.quantity.toString())).toEqual(["0", "2"]);
    expect(await ledgerSum(a.restaurantId, ing.id)).toBe("2");
  });

  it("rejects over-consumption and leaves no partial changes", async () => {
    const a = await makeRestaurant();
    const ing = await inTx((tx) => createIngredient(tx, a, { name: "Salt", unit: "kg", unitCost: 20, openingStock: 3 }));
    await expect(inTx((tx) => drawStock(tx, a, { ingredientId: ing.id, quantity: 5, type: "CONSUMPTION" }))).rejects.toThrow(/Only 3/);
    expect((await onHand(db, a.restaurantId, ing.id)).toString()).toBe("3");
    expect(await db.stockMovement.count({ where: { ingredientId: ing.id } })).toBe(1);
  });

  it("is idempotent: the same key can't deduct twice", async () => {
    const a = await makeRestaurant();
    const ing = await inTx((tx) => createIngredient(tx, a, { name: "Flour", unit: "kg", unitCost: 48, openingStock: 10 }));
    const key = "waste:abc123";
    await inTx((tx) => drawStock(tx, a, { ingredientId: ing.id, quantity: 1, type: "WASTE", idempotencyKey: key }));
    const second = await inTx((tx) => drawStock(tx, a, { ingredientId: ing.id, quantity: 1, type: "WASTE", idempotencyKey: key }));
    expect(second.duplicate).toBe(true);
    expect((await onHand(db, a.restaurantId, ing.id)).toString()).toBe("9");
  });

  it("adjustTo posts the difference as ADJUSTMENT rows (up and down)", async () => {
    const a = await makeRestaurant();
    const ing = await inTx((tx) => createIngredient(tx, a, { name: "Oil", unit: "L", unitCost: 600, openingStock: 5 }));
    await inTx((tx) => adjustTo(tx, a, { ingredientId: ing.id, newTotal: 8 }));
    await inTx((tx) => adjustTo(tx, a, { ingredientId: ing.id, newTotal: 6 }));
    expect((await onHand(db, a.restaurantId, ing.id)).toString()).toBe("6");
    expect(await ledgerSum(a.restaurantId, ing.id)).toBe("6");
    expect(await db.stockMovement.count({ where: { ingredientId: ing.id, type: "ADJUSTMENT" } })).toBe(2);
  });

  it("serialises concurrent draws — never oversells stock", async () => {
    const a = await makeRestaurant();
    const ing = await inTx((tx) => createIngredient(tx, a, { name: "Tomato", unit: "kg", unitCost: 34, openingStock: 10 }));
    const attempts = Array.from({ length: 6 }, () =>
      inTx((tx) => drawStock(tx, a, { ingredientId: ing.id, quantity: 3, type: "CONSUMPTION" })).then(() => "ok", () => "fail"));
    const res = await Promise.all(attempts);
    const ok = res.filter((r) => r === "ok").length;
    expect(ok).toBeLessThanOrEqual(3);                       // 10 kg can satisfy at most three 3 kg draws
    const left = await onHand(db, a.restaurantId, ing.id);
    expect(left.gte(0)).toBe(true);
    expect(left.toString()).toBe(String(10 - ok * 3));
    expect(await ledgerSum(a.restaurantId, ing.id)).toBe(left.toString());
  });
});

describe("tenant isolation", () => {
  it("restaurant B cannot read, receive into, or draw from restaurant A's ingredient", async () => {
    const A = await makeRestaurant("A");
    const B = await makeRestaurant("B");
    const ing = await inTx((tx) => createIngredient(tx, A, { name: "Saffron", unit: "g", unitCost: 400, openingStock: 50 }));
    await expect(inTx((tx) => receiveStock(tx, B, { ingredientId: ing.id, quantity: 1 }))).rejects.toThrow(/not found/i);
    await expect(inTx((tx) => drawStock(tx, B, { ingredientId: ing.id, quantity: 1, type: "CONSUMPTION" }))).rejects.toThrow(/not found/i);
    await expect(inTx((tx) => adjustTo(tx, B, { ingredientId: ing.id, newTotal: 0 }))).rejects.toThrow(/not found/i);
    expect((await onHand(db, A.restaurantId, ing.id)).toString()).toBe("50");
  });
  it("B can't attach A's supplier to its own ingredient", async () => {
    const A = await makeRestaurant("A");
    const B = await makeRestaurant("B");
    const sup = await db.supplier.create({ data: { restaurantId: A.restaurantId, name: "SupA" } });
    await expect(inTx((tx) => createIngredient(tx, B, { name: "X", unit: "kg", supplierId: sup.id }))).rejects.toThrow(/Supplier not found/);
  });
  it("same ingredient name is allowed in different restaurants but unique within one", async () => {
    const A = await makeRestaurant("A"); const B = await makeRestaurant("B");
    await inTx((tx) => createIngredient(tx, A, { name: "Basil", unit: "kg" }));
    await inTx((tx) => createIngredient(tx, B, { name: "Basil", unit: "kg" }));
    await expect(inTx((tx) => createIngredient(tx, A, { name: "Basil", unit: "kg" }))).rejects.toThrow();
  });
});
