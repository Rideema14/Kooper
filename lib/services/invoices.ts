import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { conflict, notFound } from "@/lib/server/errors";
import { D, validateInvoice, priceChangePct, type InvoiceIssue } from "@/lib/domain";
import { inTx, receiveStock } from "./stock";
import { notify } from "./notifications";
import { extractInvoice } from "./extract";
import type { Extraction } from "@/lib/schemas";
import type { z } from "zod";
import type { invoiceUpdate } from "@/lib/schemas";

type Ctx = { restaurantId: string; userId: string };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/(es|s)\b/g, "");

/** Match an invoice line to an ingredient: exact → containment → token overlap. Returns null when unsure. */
export function matchIngredient(raw: string, list: { id: string; name: string }[]) {
  const n = norm(raw); if (!n) return null;
  const c = list.map((i) => ({ i, k: norm(i.name) }));
  const exact = c.find((x) => x.k === n); if (exact) return exact.i.id;
  const contain = c.filter((x) => x.k.length >= 4 && (n.includes(x.k) || x.k.includes(n)));
  if (contain.length === 1) return contain[0].i.id;
  const A = new Set(n.split(" "));
  let best: { id: string; s: number } | null = null;
  for (const x of c) { const B = new Set(x.k.split(" ")); const inter = [...A].filter((t) => B.has(t)).length; const s = inter / new Set([...A, ...B]).size; if (s >= 0.6 && (!best || s > best.s)) best = { id: x.i.id, s }; }
  return best?.id ?? null;
}

const parseDate = (s?: string | null) => { if (!s) return null; const d = new Date(s); return isNaN(+d) ? null : d; };
const include = { items: { include: { ingredient: { select: { id: true, name: true, unit: true, unitCost: true } } } }, supplier: { select: { id: true, name: true } } } as const;

async function issuesFor(ctx: Ctx, inv: { id?: string; supplierName: string | null; number: string | null; invoiceDate: Date | null; subtotal: unknown; tax: unknown; total: unknown; items: { rawName: string; ingredientId: string | null; quantity: unknown; unit: string | null; unitPrice: unknown; lineTotal: unknown }[] }): Promise<InvoiceIssue[]> {
  const issues = validateInvoice({ items: inv.items.map((i) => ({ quantity: i.quantity as never, unitPrice: i.unitPrice as never, lineTotal: i.lineTotal as never })), subtotal: inv.subtotal as never, tax: inv.tax as never, total: inv.total as never, number: inv.number, supplierName: inv.supplierName, invoiceDate: inv.invoiceDate });
  if (inv.number && inv.supplierName) {
    const dup = await db.invoice.findFirst({ where: { restaurantId: ctx.restaurantId, number: inv.number, supplierName: { equals: inv.supplierName, mode: "insensitive" }, status: { in: ["NEEDS_REVIEW", "APPROVED"] }, ...(inv.id ? { id: { not: inv.id } } : {}) } });
    if (dup) issues.push({ code: "duplicate_number", severity: "error", message: `Invoice ${inv.number} from ${inv.supplierName} was already ${dup.status === "APPROVED" ? "approved" : "uploaded"}.` });
  }
  const ids = inv.items.map((i) => i.ingredientId).filter(Boolean) as string[];
  const ings = await db.ingredient.findMany({ where: { id: { in: ids }, restaurantId: ctx.restaurantId } });
  for (const it of inv.items) {
    if (!it.ingredientId) { issues.push({ code: "unmatched", severity: "warning", message: `“${it.rawName}” isn't linked to an ingredient — it won't update prices or stock.` }); continue; }
    const ing = ings.find((x) => x.id === it.ingredientId); if (!ing) continue;
    if (it.unit && it.unit.toLowerCase() !== ing.unit.toLowerCase()) issues.push({ code: "unit_mismatch", severity: "warning", message: `“${it.rawName}” is billed in ${it.unit} but stocked in ${ing.unit}.` });
    const pct = priceChangePct(ing.unitCost, it.unitPrice as never);
    if (pct && pct.abs().gte(20)) issues.push({ code: "price_jump", severity: "warning", message: `${ing.name} price is ${pct.gt(0) ? "up" : "down"} ${pct.abs().toFixed(0)}% versus your last price.` });
  }
  return issues;
}

export async function uploadInvoice(ctx: Ctx, file: { name: string; buffer: Buffer }) {
  const hash = createHash("sha256").update(file.buffer).digest("hex");
  const existing = await db.invoice.findFirst({ where: { restaurantId: ctx.restaurantId, fileHash: hash } });
  if (existing) throw conflict(`This exact file was already uploaded (${existing.number ?? existing.fileName ?? existing.id}).`);
  const { data, usedAi } = await extractInvoice(file.buffer, file.name);
  return createFromExtraction(ctx, data, { fileName: file.name, fileHash: hash, usedAi });
}

export async function createFromExtraction(ctx: Ctx, x: Extraction, meta: { fileName?: string; fileHash?: string; usedAi?: boolean } = {}) {
  const ings = await db.ingredient.findMany({ where: { restaurantId: ctx.restaurantId, archivedAt: null }, select: { id: true, name: true } });
  const supplier = x.supplierName ? await db.supplier.findFirst({ where: { restaurantId: ctx.restaurantId, name: { equals: x.supplierName, mode: "insensitive" } } }) : null;
  const items = x.items.filter((i) => i.quantity > 0).map((i) => ({ rawName: i.name, ingredientId: matchIngredient(i.name, ings), quantity: D(i.quantity), unit: i.unit ?? null, unitPrice: D(i.unitPrice), lineTotal: D(i.lineTotal ?? D(i.quantity).times(i.unitPrice).toDecimalPlaces(2).toNumber()) }));
  const header = { supplierName: x.supplierName ?? supplier?.name ?? null, number: x.invoiceNumber ?? null, invoiceDate: parseDate(x.invoiceDate), subtotal: x.subtotal ?? null, tax: x.tax ?? null, total: x.total ?? null };
  const issues = await issuesFor(ctx, { ...header, items });
  try {
    const inv = await db.invoice.create({
      data: { restaurantId: ctx.restaurantId, supplierId: supplier?.id ?? null, ...header, dueDate: parseDate(x.dueDate), status: "NEEDS_REVIEW", fileName: meta.fileName, fileHash: meta.fileHash, issues: issues as unknown as Prisma.InputJsonValue, extractionRaw: { source: meta.usedAi ? "gemini" : "table", data: x } as unknown as Prisma.InputJsonValue, createdById: ctx.userId, items: { create: items } },
      include,
    });
    await audit(db, ctx, "invoice.upload", "Invoice", inv.id, { file: meta.fileName ?? null, ai: !!meta.usedAi });
    return inv;
  } catch (e) { if ((e as { code?: string }).code === "P2002") throw conflict("This file was already uploaded."); throw e; }
}

export const listInvoices = (ctx: Ctx) => db.invoice.findMany({ where: { restaurantId: ctx.restaurantId }, include, orderBy: { createdAt: "desc" }, take: 200 });
export async function getInvoice(ctx: Ctx, id: string) {
  const inv = await db.invoice.findFirst({ where: { id, restaurantId: ctx.restaurantId }, include });
  if (!inv) throw notFound("Invoice not found.");
  return inv;
}

/** Manual correction. Replaces header + lines and re-runs every validation. */
export async function updateInvoice(ctx: Ctx, id: string, p: z.infer<typeof invoiceUpdate>) {
  const cur = await getInvoice(ctx, id);
  if (!["NEEDS_REVIEW", "FAILED"].includes(cur.status)) throw conflict("Approved or rejected invoices can't be edited.");
  const owned = p.items.map((i) => i.ingredientId).filter(Boolean) as string[];
  if (owned.length && (await db.ingredient.count({ where: { id: { in: owned }, restaurantId: ctx.restaurantId } })) !== new Set(owned).size) throw notFound("One of the linked ingredients wasn't found.");
  const items = p.items.map((i) => ({ rawName: i.rawName, ingredientId: i.ingredientId ?? null, quantity: D(i.quantity), unit: i.unit ?? null, unitPrice: D(i.unitPrice), lineTotal: D(i.lineTotal) }));
  const header = { supplierName: p.supplierName ?? null, number: p.number ?? null, invoiceDate: p.invoiceDate ?? null, subtotal: p.subtotal ?? null, tax: p.tax ?? null, total: p.total ?? null };
  const issues = await issuesFor(ctx, { id, ...header, items });
  await db.$transaction([
    db.invoiceItem.deleteMany({ where: { invoiceId: id } }),
    db.invoice.update({ where: { id }, data: { ...header, dueDate: p.dueDate ?? null, status: "NEEDS_REVIEW", issues: issues as unknown as Prisma.InputJsonValue, items: { create: items } } }),
  ]);
  await audit(db, ctx, "invoice.edit", "Invoice", id);
  return getInvoice(ctx, id);
}

export async function approveInvoice(ctx: Ctx, id: string, receiveIntoStock: boolean) {
  const inv = await getInvoice(ctx, id);
  const issues = await issuesFor(ctx, inv);
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length) throw conflict(`Fix these before approving: ${errors.map((e) => e.message).join(" ")}`);
  const spikes: { name: string; pct: number }[] = [];
  await inTx(async (tx) => {
    // Conditional claim: only one request can move NEEDS_REVIEW → APPROVED.
    const claimed = await tx.invoice.updateMany({ where: { id, restaurantId: ctx.restaurantId, status: "NEEDS_REVIEW" }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date(), issues: issues as unknown as Prisma.InputJsonValue } });
    if (!claimed.count) throw conflict("This invoice has already been handled.");
    let supplierId = inv.supplierId;
    if (!supplierId && inv.supplierName) {
      supplierId = (await tx.supplier.upsert({ where: { restaurantId_name: { restaurantId: ctx.restaurantId, name: inv.supplierName } }, create: { restaurantId: ctx.restaurantId, name: inv.supplierName }, update: {} })).id;
      await tx.invoice.update({ where: { id }, data: { supplierId } });
    }
    for (const it of inv.items) {
      if (!it.ingredientId) continue;
      const ing = await tx.ingredient.findFirstOrThrow({ where: { id: it.ingredientId, restaurantId: ctx.restaurantId } });
      if (receiveIntoStock) {
        if (it.unit && it.unit.toLowerCase() !== ing.unit.toLowerCase()) throw conflict(`“${it.rawName}” is billed in ${it.unit} but stocked in ${ing.unit}. Fix the unit or untick “Add to stock”.`);
        await receiveStock(tx, ctx, { ingredientId: ing.id, quantity: it.quantity, unitCost: it.unitPrice, refType: "Invoice", refId: id, reason: `Invoice ${inv.number ?? ""}`.trim(), idempotencyKey: `invoice:${id}:${it.id}` });
      }
      const pct = priceChangePct(ing.unitCost, it.unitPrice);
      if (!ing.unitCost.equals(it.unitPrice)) await tx.ingredient.update({ where: { id: ing.id }, data: { unitCost: it.unitPrice } });
      if (supplierId) await tx.supplierPrice.upsert({ where: { supplierId_ingredientId: { supplierId, ingredientId: ing.id } }, create: { restaurantId: ctx.restaurantId, supplierId, ingredientId: ing.id, price: it.unitPrice }, update: { price: it.unitPrice } });
      if (pct && pct.abs().gte(10)) spikes.push({ name: ing.name, pct: Number(pct.toFixed(1)) });
    }
    await audit(tx, ctx, "invoice.approve", "Invoice", id, { receiveIntoStock });
  });
  for (const s of spikes) await notify(db, ctx.restaurantId, { kind: "price_change", title: `${s.name} price ${s.pct > 0 ? "up" : "down"} ${Math.abs(s.pct)}%`, body: `From invoice ${inv.number ?? ""}`.trim(), dedupeKey: `invprice:${id}:${s.name}` });
  return getInvoice(ctx, id);
}

export async function rejectInvoice(ctx: Ctx, id: string) {
  const r = await db.invoice.updateMany({ where: { id, restaurantId: ctx.restaurantId, status: { in: ["NEEDS_REVIEW", "FAILED"] } }, data: { status: "REJECTED" } });
  if (!r.count) throw conflict("This invoice can't be rejected in its current state.");
  await audit(db, ctx, "invoice.reject", "Invoice", id);
}
export async function setInvoicePayment(ctx: Ctx, id: string, paymentStatus: "UNPAID" | "PARTIAL" | "PAID") {
  const r = await db.invoice.updateMany({ where: { id, restaurantId: ctx.restaurantId }, data: { paymentStatus } });
  if (!r.count) throw notFound("Invoice not found.");
  await audit(db, ctx, "invoice.payment", "Invoice", id, { paymentStatus });
}
