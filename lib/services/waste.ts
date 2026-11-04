import { randomUUID } from "node:crypto";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { notFound } from "@/lib/server/errors";
import { D } from "@/lib/domain";
import { drawStock, receiveStock, inTx } from "./stock";
import type { z } from "zod";
import type { wasteSchema } from "@/lib/schemas";

type Ctx = { restaurantId: string; userId: string };

/** One transaction: FIFO stock deduction (ledger rows) + the waste record. A retry with the same key is a no-op. */
export async function logWaste(ctx: Ctx, p: z.infer<typeof wasteSchema>) {
  return inTx(async (tx) => {
    const id = randomUUID();
    const key = p.idempotencyKey ? `waste:${p.idempotencyKey}` : `waste:${id}`;
    const dup = p.idempotencyKey ? await tx.stockMovement.findFirst({ where: { restaurantId: ctx.restaurantId, idempotencyKey: key } }) : null;
    if (dup) { const existing = await tx.wasteEntry.findFirst({ where: { id: dup.refId ?? "" } }); if (existing) return existing; }
    const draw = await drawStock(tx, ctx, { ingredientId: p.ingredientId, quantity: p.quantity, type: "WASTE", reason: `Waste: ${p.reason}`, refType: "WasteEntry", refId: id, idempotencyKey: key });
    const entry = await tx.wasteEntry.create({
      data: { id, restaurantId: ctx.restaurantId, ingredientId: p.ingredientId, quantity: D(p.quantity), unitCost: draw.unitCost.toDecimalPlaces(4), value: draw.value, reason: p.reason, department: p.department ?? null, occurredAt: p.occurredAt ?? new Date(), createdById: ctx.userId },
    });
    await audit(tx, ctx, "waste.log", "WasteEntry", id, { qty: p.quantity, reason: p.reason });
    return entry;
  });
}

/** Undo a mistaken entry: removes the record and puts the stock back through a compensating ADJUSTMENT row. */
export async function reverseWaste(ctx: Ctx, id: string) {
  return inTx(async (tx) => {
    const w = await tx.wasteEntry.findFirst({ where: { id, restaurantId: ctx.restaurantId } });
    if (!w) throw notFound("Waste entry not found.");
    await receiveStock(tx, ctx, { ingredientId: w.ingredientId, quantity: w.quantity, unitCost: w.unitCost, type: "ADJUSTMENT", reason: "Reversal of waste entry", refType: "WasteEntry", refId: id, idempotencyKey: `waste-reverse:${id}` });
    await tx.wasteEntry.delete({ where: { id } });
    await audit(tx, ctx, "waste.reverse", "WasteEntry", id);
  });
}

export const listWaste = (ctx: Ctx, from?: Date, to?: Date) =>
  db.wasteEntry.findMany({ relationLoadStrategy: "join", where: { restaurantId: ctx.restaurantId, occurredAt: { gte: from, lte: to } }, include: { ingredient: { select: { name: true, unit: true, category: true } } }, orderBy: { occurredAt: "desc" }, take: 500 });

/** Ingredients wasted 3+ times in the window — the "keeps coming back" signal. One query. */
export async function repeatedWaste(ctx: Ctx, days = 14, min = 3) {
  const since = new Date(Date.now() - days * 864e5);
  const rows = await db.$queryRaw<{ ingredientId: string; name: string; count: number; value: string }[]>`
    SELECT w."ingredientId", i."name", COUNT(*)::int AS count, SUM(w."value")::text AS value
    FROM "WasteEntry" w JOIN "Ingredient" i ON i."id" = w."ingredientId"
    WHERE w."restaurantId" = ${ctx.restaurantId} AND w."occurredAt" >= ${since}
    GROUP BY w."ingredientId", i."name" HAVING COUNT(*) >= ${min} ORDER BY SUM(w."value") DESC`;
  return rows.map((r) => ({ ingredientId: r.ingredientId, name: r.name, count: r.count, value: D(r.value) }));
}
