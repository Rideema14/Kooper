import { Prisma, type MovementType, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/server/db";
import { conflict, notFound, badRequest } from "@/lib/server/errors";
import { D, planDraw, type Dec, type DecIn } from "@/lib/domain";

export type Tx = Prisma.TransactionClient;
type Actor = { restaurantId: string; userId?: string | null };

async function ingredientOrThrow(tx: Tx, restaurantId: string, ingredientId: string) {
  // restaurantId in the WHERE clause is what enforces tenant isolation.
  const ing = await tx.ingredient.findFirst({ where: { id: ingredientId, restaurantId } });
  if (!ing) throw notFound("Ingredient not found.");
  return ing;
}

/** Returns an existing movement if this idempotency key was already applied (prevents double deduction). */
async function alreadyApplied(tx: Tx, restaurantId: string, key?: string) {
  if (!key) return false;
  return !!(await tx.stockMovement.findFirst({ where: { restaurantId, idempotencyKey: key }, select: { id: true } }));
}

export async function receiveStock(tx: Tx, a: Actor, p: {
  ingredientId: string; quantity: DecIn; unitCost?: DecIn | null; expiryDate?: Date | null;
  batchCode?: string | null; type?: MovementType; reason?: string; refType?: string; refId?: string; idempotencyKey?: string;
}) {
  const qty = D(p.quantity);
  if (qty.lte(0)) throw badRequest("Quantity must be greater than zero.");
  const ing = await ingredientOrThrow(tx, a.restaurantId, p.ingredientId);
  if (await alreadyApplied(tx, a.restaurantId, p.idempotencyKey)) return { duplicate: true as const };
  const cost = p.unitCost != null ? D(p.unitCost) : ing.unitCost;
  const batch = await tx.inventoryItem.create({
    data: { restaurantId: a.restaurantId, ingredientId: ing.id, quantity: qty, unitCost: cost, expiryDate: p.expiryDate ?? null, batchCode: p.batchCode ?? null },
  });
  await tx.stockMovement.create({
    data: {
      restaurantId: a.restaurantId, ingredientId: ing.id, inventoryItemId: batch.id, type: p.type ?? "PURCHASE_RECEIVED",
      quantity: qty, unitCost: cost, reason: p.reason, refType: p.refType, refId: p.refId,
      idempotencyKey: p.idempotencyKey, createdById: a.userId ?? null,
    },
  });
  return { duplicate: false as const, batchId: batch.id };
}

/** Remove stock FIFO (earliest expiry first). One ledger row per batch touched. Fails if stock is insufficient. */
export async function drawStock(tx: Tx, a: Actor, p: {
  ingredientId: string; quantity: DecIn; type: Extract<MovementType, "CONSUMPTION" | "WASTE" | "ADJUSTMENT">;
  reason?: string; refType?: string; refId?: string; idempotencyKey?: string;
}) {
  const qty = D(p.quantity);
  if (qty.lte(0)) throw badRequest("Quantity must be greater than zero.");
  const ing = await ingredientOrThrow(tx, a.restaurantId, p.ingredientId);
  if (await alreadyApplied(tx, a.restaurantId, p.idempotencyKey)) return { duplicate: true as const, value: D(0), unitCost: ing.unitCost };

  // Lock the batches so concurrent draws serialise instead of double-spending the same stock.
  const rows = await tx.$queryRaw<{ id: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal }[]>`
    SELECT "id", "quantity", "unitCost" FROM "InventoryItem"
    WHERE "restaurantId" = ${a.restaurantId} AND "ingredientId" = ${ing.id} AND "quantity" > 0
    ORDER BY "expiryDate" ASC NULLS LAST, "receivedAt" ASC
    FOR UPDATE`;
  const plan = planDraw(rows.map((r) => ({ id: r.id, quantity: D(r.quantity), unitCost: D(r.unitCost) })), qty);
  if (!plan) {
    const have = rows.reduce((s, r) => s.plus(D(r.quantity)), D(0));
    throw conflict(`Only ${have.toString()} ${ing.unit} of ${ing.name} in stock — can't remove ${qty.toString()}.`);
  }
  let value = D(0);
  for (let i = 0; i < plan.length; i++) {
    const d = plan[i];
    await tx.inventoryItem.update({ where: { id: d.id }, data: { quantity: { decrement: d.take } } });
    await tx.stockMovement.create({
      data: {
        restaurantId: a.restaurantId, ingredientId: ing.id, inventoryItemId: d.id, type: p.type,
        quantity: d.take.negated(), unitCost: d.unitCost, reason: p.reason, refType: p.refType, refId: p.refId,
        // first row carries the caller's key; extra batch rows derive theirs so the unique constraint still holds
        idempotencyKey: p.idempotencyKey ? (i === 0 ? p.idempotencyKey : `${p.idempotencyKey}#${i}`) : undefined,
        createdById: a.userId ?? null,
      },
    });
    value = value.plus(d.take.times(d.unitCost));
  }
  return { duplicate: false as const, value: value.toDecimalPlaces(2), unitCost: qty.gt(0) ? value.div(qty) : ing.unitCost };
}

/** Set the on-hand total to a counted figure by posting the difference as an ADJUSTMENT. */
export async function adjustTo(tx: Tx, a: Actor, p: { ingredientId: string; newTotal: DecIn; reason?: string; idempotencyKey?: string }) {
  const target = D(p.newTotal);
  if (target.lt(0)) throw badRequest("Counted quantity can't be negative.");
  await ingredientOrThrow(tx, a.restaurantId, p.ingredientId);
  const current = await onHand(tx, a.restaurantId, p.ingredientId);
  const delta = target.minus(current);
  if (delta.isZero()) return { delta };
  if (delta.gt(0)) await receiveStock(tx, a, { ingredientId: p.ingredientId, quantity: delta, type: "ADJUSTMENT", reason: p.reason ?? "Stock count", idempotencyKey: p.idempotencyKey });
  else await drawStock(tx, a, { ingredientId: p.ingredientId, quantity: delta.abs(), type: "ADJUSTMENT", reason: p.reason ?? "Stock count", idempotencyKey: p.idempotencyKey });
  return { delta };
}

export async function onHand(tx: Tx | PrismaClient, restaurantId: string, ingredientId: string) {
  const r = await tx.inventoryItem.aggregate({ where: { restaurantId, ingredientId }, _sum: { quantity: true } });
  return D(r._sum.quantity ?? 0);
}

/** Atomic wrapper for routes: one DB transaction per business operation. */
export const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.$transaction(fn, { timeout: 15000, isolationLevel: "Serializable" });

export async function createIngredient(tx: Tx, a: Actor, p: {
  name: string; category?: string; unit: string; unitCost?: DecIn; minStock?: DecIn; maxStock?: DecIn | null;
  reorderLevel?: DecIn; supplierId?: string | null; openingStock?: DecIn; expiryDate?: Date | null;
}) {
  if (p.supplierId) {
    const s = await tx.supplier.findFirst({ where: { id: p.supplierId, restaurantId: a.restaurantId } });
    if (!s) throw notFound("Supplier not found.");
  }
  const ing = await tx.ingredient.create({
    data: {
      restaurantId: a.restaurantId, name: p.name, category: p.category ?? "General", unit: p.unit,
      unitCost: D(p.unitCost ?? 0), minStock: D(p.minStock ?? 0), maxStock: p.maxStock != null ? D(p.maxStock) : null,
      reorderLevel: D(p.reorderLevel ?? 0), supplierId: p.supplierId ?? null,
    },
  });
  if (p.openingStock && D(p.openingStock).gt(0))
    await receiveStock(tx, a, { ingredientId: ing.id, quantity: p.openingStock, unitCost: p.unitCost ?? 0, type: "OPENING", reason: "Opening stock", expiryDate: p.expiryDate });
  return ing;
}
