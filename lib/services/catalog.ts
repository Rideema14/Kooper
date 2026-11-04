import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { conflict, notFound } from "@/lib/server/errors";
import { D } from "@/lib/domain";
import { createIngredient, inTx, adjustTo, receiveStock, drawStock } from "./stock";
import type { z } from "zod";
import type { ingredientCreate, ingredientPatch, supplierSchema, stockReceive, stockConsume, stockAdjust } from "@/lib/schemas";

type Ctx = { restaurantId: string; userId: string };

export async function listIngredients(ctx: Ctx, opts: { includeArchived?: boolean } = {}) {
  const [ings, sums, expiries] = await Promise.all([
    db.ingredient.findMany({ relationLoadStrategy: "join", where: { restaurantId: ctx.restaurantId, ...(opts.includeArchived ? {} : { archivedAt: null }) }, include: { supplier: { select: { id: true, name: true } } }, orderBy: { name: "asc" } }),
    db.inventoryItem.groupBy({ by: ["ingredientId"], where: { restaurantId: ctx.restaurantId }, _sum: { quantity: true }, _max: { updatedAt: true } }),
    db.inventoryItem.groupBy({ by: ["ingredientId"], where: { restaurantId: ctx.restaurantId, quantity: { gt: 0 }, expiryDate: { not: null } }, _min: { expiryDate: true } }),
  ]);
  const qty = new Map(sums.map((s) => [s.ingredientId, s]));
  const exp = new Map(expiries.map((e) => [e.ingredientId, e._min.expiryDate]));
  return ings.map((i) => {
    const onHand = D(qty.get(i.id)?._sum.quantity ?? 0);
    return { ...i, onHand, value: onHand.times(i.unitCost).toDecimalPlaces(2), nextExpiry: exp.get(i.id) ?? null, lastMoved: qty.get(i.id)?._max.updatedAt ?? i.updatedAt, isLow: onHand.lte(i.reorderLevel) };
  });
}

export async function addIngredient(ctx: Ctx, p: z.infer<typeof ingredientCreate>) {
  const ing = await inTx((tx) => createIngredient(tx, ctx, { ...p }));
  await audit(db, ctx, "ingredient.create", "Ingredient", ing.id, { name: ing.name });
  return ing;
}

export async function patchIngredient(ctx: Ctx, id: string, p: z.infer<typeof ingredientPatch>) {
  const cur = await db.ingredient.findFirst({ where: { id, restaurantId: ctx.restaurantId } });
  if (!cur) throw notFound("Ingredient not found.");
  if (p.supplierId) { const s = await db.supplier.findFirst({ where: { id: p.supplierId, restaurantId: ctx.restaurantId } }); if (!s) throw notFound("Supplier not found."); }
  const ing = await db.ingredient.update({ where: { id }, data: p });
  await audit(db, ctx, "ingredient.update", "Ingredient", id, p as object);
  return ing;
}

/** Archive, never hard-delete: ledger rows and recipes keep referencing it. */
export async function archiveIngredient(ctx: Ctx, id: string, archive = true) {
  const r = await db.ingredient.updateMany({ where: { id, restaurantId: ctx.restaurantId }, data: { archivedAt: archive ? new Date() : null } });
  if (!r.count) throw notFound("Ingredient not found.");
  await audit(db, ctx, archive ? "ingredient.archive" : "ingredient.restore", "Ingredient", id);
}

export const receive = (ctx: Ctx, id: string, p: z.infer<typeof stockReceive>) =>
  inTx((tx) => receiveStock(tx, ctx, { ingredientId: id, ...p, type: "PURCHASE_RECEIVED", reason: p.reason ?? "Goods received" }));
export const consume = (ctx: Ctx, id: string, p: z.infer<typeof stockConsume>) =>
  inTx((tx) => drawStock(tx, ctx, { ingredientId: id, quantity: p.quantity, type: "CONSUMPTION", reason: p.reason ?? "Kitchen use", idempotencyKey: p.idempotencyKey }));
export const adjust = (ctx: Ctx, id: string, p: z.infer<typeof stockAdjust>) =>
  inTx((tx) => adjustTo(tx, ctx, { ingredientId: id, newTotal: p.newTotal, reason: p.reason ?? undefined, idempotencyKey: p.idempotencyKey }));

export async function movements(ctx: Ctx, ingredientId?: string, take = 100) {
  return db.stockMovement.findMany({ where: { restaurantId: ctx.restaurantId, ...(ingredientId ? { ingredientId } : {}) }, include: { ingredient: { select: { name: true, unit: true } } }, orderBy: { createdAt: "desc" }, take: Math.min(take, 500) });
}

export const listBatches = (ctx: Ctx, ingredientId: string) =>
  db.inventoryItem.findMany({ where: { restaurantId: ctx.restaurantId, ingredientId, quantity: { gt: 0 } }, orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }] });

// ---- Suppliers ----
export const listSuppliers = (ctx: Ctx) =>
  db.supplier.findMany({ where: { restaurantId: ctx.restaurantId, archivedAt: null }, include: { prices: { include: { ingredient: { select: { name: true, unit: true } } } } }, orderBy: { name: "asc" } });

export async function createSupplier(ctx: Ctx, p: z.infer<typeof supplierSchema>) {
  try {
    const s = await db.supplier.create({ data: { ...p, restaurantId: ctx.restaurantId } });
    await audit(db, ctx, "supplier.create", "Supplier", s.id, { name: s.name });
    return s;
  } catch (e) { if ((e as { code?: string }).code === "P2002") throw conflict("A supplier with that name already exists."); throw e; }
}
export async function updateSupplier(ctx: Ctx, id: string, p: z.infer<typeof supplierSchema>) {
  const r = await db.supplier.updateMany({ where: { id, restaurantId: ctx.restaurantId }, data: p });
  if (!r.count) throw notFound("Supplier not found.");
  await audit(db, ctx, "supplier.update", "Supplier", id);
}
export async function archiveSupplier(ctx: Ctx, id: string) {
  const r = await db.supplier.updateMany({ where: { id, restaurantId: ctx.restaurantId }, data: { archivedAt: new Date() } });
  if (!r.count) throw notFound("Supplier not found.");
  await audit(db, ctx, "supplier.archive", "Supplier", id);
}
export async function setSupplierPrice(ctx: Ctx, supplierId: string, ingredientId: string, price: number) {
  const [s, i] = await Promise.all([
    db.supplier.findFirst({ where: { id: supplierId, restaurantId: ctx.restaurantId } }),
    db.ingredient.findFirst({ where: { id: ingredientId, restaurantId: ctx.restaurantId } }),
  ]);
  if (!s || !i) throw notFound("Supplier or ingredient not found.");
  return db.supplierPrice.upsert({
    where: { supplierId_ingredientId: { supplierId, ingredientId } },
    create: { restaurantId: ctx.restaurantId, supplierId, ingredientId, price }, update: { price },
  });
}
