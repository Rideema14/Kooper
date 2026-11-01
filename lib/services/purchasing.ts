import type { PurchaseStatus } from "@prisma/client";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { badRequest, conflict, notFound } from "@/lib/server/errors";
import { D, lineTotal, priceChangePct } from "@/lib/domain";
import { inTx, receiveStock, onHand, type Tx } from "./stock";
import { notify } from "./notifications";
import type { z } from "zod";
import type { poCreate, poReceive } from "@/lib/schemas";

type Ctx = { restaurantId: string; userId: string };
const OPEN: PurchaseStatus[] = ["PENDING_APPROVAL", "APPROVED", "SENT", "PARTIALLY_RECEIVED"];

const include = { supplier: { select: { id: true, name: true, phone: true, email: true } }, items: { include: { ingredient: { select: { id: true, name: true, unit: true, category: true } } } } } as const;

export const listPurchases = (ctx: Ctx, status?: PurchaseStatus[]) =>
  db.purchaseOrder.findMany({ relationLoadStrategy: "join", where: { restaurantId: ctx.restaurantId, ...(status ? { status: { in: status } } : {}) }, include, orderBy: { createdAt: "desc" }, take: 300 });

export async function getPurchase(ctx: Ctx, id: string) {
  const po = await db.purchaseOrder.findFirst({ where: { id, restaurantId: ctx.restaurantId }, include });
  if (!po) throw notFound("Order not found.");
  return po;
}

/** Cheapest known price for an ingredient: supplier-specific list first, else the ingredient's last cost. */
async function priceFor(tx: Tx, ctx: Ctx, ingredientId: string, supplierId?: string | null) {
  if (supplierId) {
    const sp = await tx.supplierPrice.findFirst({ where: { supplierId, ingredientId, restaurantId: ctx.restaurantId } });
    if (sp) return sp.price;
  }
  const ing = await tx.ingredient.findFirst({ where: { id: ingredientId, restaurantId: ctx.restaurantId } });
  if (!ing) throw notFound("Ingredient not found.");
  return ing.unitCost;
}

export async function createPurchase(ctx: Ctx, p: z.infer<typeof poCreate>) {
  return inTx(async (tx) => {
    if (p.supplierId && !(await tx.supplier.findFirst({ where: { id: p.supplierId, restaurantId: ctx.restaurantId } }))) throw notFound("Supplier not found.");
    const items = [];
    for (const it of p.items) items.push({ ingredientId: it.ingredientId, orderedQty: D(it.quantity), unitPrice: it.unitPrice != null ? D(it.unitPrice) : await priceFor(tx, ctx, it.ingredientId, p.supplierId) });
    const n = (await tx.purchaseOrder.count({ where: { restaurantId: ctx.restaurantId } })) + 1;
    const po = await tx.purchaseOrder.create({
      data: { restaurantId: ctx.restaurantId, supplierId: p.supplierId ?? null, number: `PO-${String(n).padStart(4, "0")}`, status: "PENDING_APPROVAL", notes: p.notes, expectedAt: p.expectedAt ?? null, createdById: ctx.userId, items: { create: items } },
      include,
    });
    await audit(tx, ctx, "po.create", "PurchaseOrder", po.id, { number: po.number });
    return po;
  });
}

export async function updatePurchase(ctx: Ctx, id: string, p: Partial<z.infer<typeof poCreate>>) {
  return inTx(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({ where: { id, restaurantId: ctx.restaurantId } });
    if (!po) throw notFound("Order not found.");
    if (po.status !== "PENDING_APPROVAL") throw conflict("Only orders waiting for approval can be edited.");
    if (p.items) {
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      for (const it of p.items) await tx.purchaseOrderItem.create({ data: { purchaseOrderId: id, ingredientId: it.ingredientId, orderedQty: D(it.quantity), unitPrice: it.unitPrice != null ? D(it.unitPrice) : await priceFor(tx, ctx, it.ingredientId, p.supplierId ?? po.supplierId) } });
    }
    await tx.purchaseOrder.update({ where: { id }, data: { supplierId: p.supplierId === undefined ? undefined : p.supplierId, notes: p.notes, expectedAt: p.expectedAt } });
    await audit(tx, ctx, "po.update", "PurchaseOrder", id);
    return tx.purchaseOrder.findFirstOrThrow({ where: { id }, include });
  });
}

async function transition(ctx: Ctx, id: string, from: PurchaseStatus[], to: PurchaseStatus, extra: object = {}, action = `po.${to.toLowerCase()}`) {
  // Conditional update = optimistic lock; two clicks can't both succeed.
  const r = await db.purchaseOrder.updateMany({ where: { id, restaurantId: ctx.restaurantId, status: { in: from } }, data: { status: to, ...extra } });
  if (!r.count) {
    const po = await db.purchaseOrder.findFirst({ where: { id, restaurantId: ctx.restaurantId } });
    if (!po) throw notFound("Order not found.");
    throw conflict(`This order is ${po.status.replace(/_/g, " ").toLowerCase()} and can't be moved to ${to.replace(/_/g, " ").toLowerCase()}.`);
  }
  await audit(db, ctx, action, "PurchaseOrder", id);
  return getPurchase(ctx, id);
}
export const approvePurchase = (ctx: Ctx, id: string) => transition(ctx, id, ["PENDING_APPROVAL"], "APPROVED", { approvedById: ctx.userId, approvedAt: new Date() });
export const rejectPurchase = (ctx: Ctx, id: string) => transition(ctx, id, ["PENDING_APPROVAL", "APPROVED"], "REJECTED");
export const cancelPurchase = (ctx: Ctx, id: string) => transition(ctx, id, ["PENDING_APPROVAL", "APPROVED", "SENT"], "CANCELLED");
/** Approval is internal only. "Sent" means the user confirmed they placed it with the supplier themselves. */
export const markSent = (ctx: Ctx, id: string) => transition(ctx, id, ["APPROVED"], "SENT", { sentAt: new Date() }, "po.marked_sent");

export async function setPayment(ctx: Ctx, id: string, paymentStatus: "UNPAID" | "PARTIAL" | "PAID") {
  const r = await db.purchaseOrder.updateMany({ where: { id, restaurantId: ctx.restaurantId }, data: { paymentStatus } });
  if (!r.count) throw notFound("Order not found.");
  await audit(db, ctx, "po.payment", "PurchaseOrder", id, { paymentStatus });
}

export async function receivePurchase(ctx: Ctx, id: string, p: z.infer<typeof poReceive>) {
  const out = await inTx(async (tx) => {
    const po = await tx.purchaseOrder.findFirst({ where: { id, restaurantId: ctx.restaurantId }, include: { items: true } });
    if (!po) throw notFound("Order not found.");
    if (!["SENT", "PARTIALLY_RECEIVED"].includes(po.status)) throw conflict("Mark the order as sent to the supplier before receiving goods.");
    const variances: { ingredientId: string; pct: number }[] = [];
    for (const line of p.lines) {
      const item = po.items.find((i) => i.id === line.itemId);
      if (!item) throw badRequest("That line doesn't belong to this order.");
      const outstanding = item.orderedQty.minus(item.receivedQty);
      const qty = D(line.quantity);
      if (qty.gt(outstanding)) throw conflict(`Only ${outstanding.toString()} still outstanding on this line — can't receive ${qty.toString()}.`);
      const ing = await tx.ingredient.findFirstOrThrow({ where: { id: item.ingredientId, restaurantId: ctx.restaurantId } });
      const key = p.idempotencyKey ? `${p.idempotencyKey}:${item.id}` : undefined;
      const res = await receiveStock(tx, ctx, { ingredientId: item.ingredientId, quantity: qty, unitCost: item.unitPrice, expiryDate: line.expiryDate, batchCode: line.batchCode, refType: "PurchaseOrder", refId: id, reason: `Received on ${po.number}`, idempotencyKey: key });
      if (res.duplicate) continue;
      await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { receivedQty: { increment: qty } } });
      const pct = priceChangePct(ing.unitCost, item.unitPrice);
      if (!item.unitPrice.equals(ing.unitCost)) await tx.ingredient.update({ where: { id: ing.id }, data: { unitCost: item.unitPrice } });
      if (pct && pct.abs().gte(10)) variances.push({ ingredientId: ing.id, pct: Number(pct.toFixed(1)) });
    }
    const fresh = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const done = fresh.every((i) => i.receivedQty.gte(i.orderedQty));
    const status: PurchaseStatus = done ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await tx.purchaseOrder.update({ where: { id }, data: { status } });
    await audit(tx, ctx, "po.receive", "PurchaseOrder", id, { status, lines: p.lines.length });
    await notify(tx, ctx.restaurantId, { kind: "po_received", title: `${po.number} ${done ? "fully" : "partly"} received`, dedupeKey: `po_recv:${id}:${fresh.map((i) => i.receivedQty.toString()).join(",")}` });
    return { status, variances };
  });
  for (const v of out.variances) {
    const ing = await db.ingredient.findUnique({ where: { id: v.ingredientId } });
    if (ing) await notify(db, ctx.restaurantId, { kind: "price_change", title: `${ing.name} price ${v.pct > 0 ? "up" : "down"} ${Math.abs(v.pct)}%`, body: "Based on the latest delivery.", dedupeKey: `price:${ing.id}:${new Date().toISOString().slice(0, 10)}` });
  }
  return { status: out.status, order: await getPurchase(ctx, id) };
}

/** Low-stock → suggestion. Excludes ingredients already on an open order. */
export async function suggestions(ctx: Ctx) {
  const [ings, open, prices] = await Promise.all([
    db.ingredient.findMany({ where: { restaurantId: ctx.restaurantId, archivedAt: null }, include: { supplier: true } }),
    db.purchaseOrderItem.findMany({ where: { purchaseOrder: { restaurantId: ctx.restaurantId, status: { in: OPEN } } }, select: { ingredientId: true } }),
    db.supplierPrice.findMany({ where: { restaurantId: ctx.restaurantId }, include: { supplier: true } }),
  ]);
  const queued = new Set(open.map((o) => o.ingredientId));
  const out = [];
  for (const i of ings) {
    if (queued.has(i.id)) continue;
    const have = await onHand(db, ctx.restaurantId, i.id);
    if (have.gt(i.reorderLevel)) continue;
    const target = i.maxStock ?? i.reorderLevel.times(2);
    const qty = target.minus(have).lt(1) ? D(1) : target.minus(have);
    const cheapest = prices.filter((p) => p.ingredientId === i.id).sort((a, b) => a.price.comparedTo(b.price))[0];
    const supplier = cheapest ? { id: cheapest.supplierId, name: cheapest.supplier.name } : i.supplier ? { id: i.supplier.id, name: i.supplier.name } : null;
    const price = cheapest?.price ?? i.unitCost;
    out.push({ ingredientId: i.id, name: i.name, unit: i.unit, onHand: have, reorderLevel: i.reorderLevel, quantity: qty.toDecimalPlaces(2), unitPrice: price, estimated: lineTotal(qty, price), supplier });
  }
  return out;
}

/** Turn suggestions into PENDING_APPROVAL drafts, one order per supplier. Still needs manager approval. */
export async function draftFromSuggestions(ctx: Ctx) {
  const s = await suggestions(ctx);
  const groups = new Map<string, typeof s>();
  for (const x of s) groups.set(x.supplier?.id ?? "", [...(groups.get(x.supplier?.id ?? "") ?? []), x]);
  const made = [];
  for (const [sid, rows] of groups) made.push(await createPurchase(ctx, { supplierId: sid || null, items: rows.map((r) => ({ ingredientId: r.ingredientId, quantity: Number(r.quantity), unitPrice: Number(r.unitPrice) })), notes: "Drafted from low stock" }));
  return made;
}
