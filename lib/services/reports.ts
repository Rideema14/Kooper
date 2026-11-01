import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { db } from "@/lib/server/db";
import { D, priceChangePct } from "@/lib/domain";
import { listIngredients } from "./catalog";
import { listRecipes } from "./recipes";
import { repeatedWaste } from "./waste";

type Ctx = { restaurantId: string; userId: string };
const n = (v: unknown) => Number(String(v ?? 0));

export function resolveRange(from?: Date, to?: Date) {
  const end = to ?? new Date(); const start = from ?? new Date(end.getTime() - 30 * 864e5);
  return { from: start, to: end };
}

/** Just what the app shell needs (7-day spend + repeated waste) — 2 queries instead of the full report. */
export async function shellStats(ctx: Ctx) {
  const rid = ctx.restaurantId, from = new Date(Date.now() - 7 * 864e5);
  const [days, repeat] = await Promise.all([
    db.$queryRaw<{ d: Date; v: string }[]>`SELECT date_trunc('day', "createdAt") AS d, SUM("quantity" * COALESCE("unitCost",0))::text AS v FROM "StockMovement" WHERE "restaurantId" = ${rid} AND "type" = 'PURCHASE_RECEIVED' AND "createdAt" >= ${from} GROUP BY 1 ORDER BY 1`,
    repeatedWaste(ctx),
  ]);
  return { spendByDay: days.map((x) => ({ day: x.d.toISOString().slice(0, 10), spend: n(x.v) })), repeatedWaste: repeat.map((r) => ({ ...r, value: n(r.value) })) };
}

export async function dashboard(ctx: Ctx, r0: { from?: Date; to?: Date } = {}) {
  const { from, to } = resolveRange(r0.from, r0.to);
  const rid = ctx.restaurantId;
  const [ings, valueRow, spendRow, spendDays, waste, wasteReasons, invStatus, suppliers, recipes, moves, repeat] = await Promise.all([
    listIngredients(ctx),
    db.$queryRaw<{ v: string | null }[]>`SELECT SUM("quantity" * "unitCost")::text AS v FROM "InventoryItem" WHERE "restaurantId" = ${rid}`,
    db.$queryRaw<{ v: string | null }[]>`SELECT SUM("quantity" * COALESCE("unitCost",0))::text AS v FROM "StockMovement" WHERE "restaurantId" = ${rid} AND "type" = 'PURCHASE_RECEIVED' AND "createdAt" BETWEEN ${from} AND ${to}`,
    db.$queryRaw<{ d: Date; v: string }[]>`SELECT date_trunc('day', "createdAt") AS d, SUM("quantity" * COALESCE("unitCost",0))::text AS v FROM "StockMovement" WHERE "restaurantId" = ${rid} AND "type" = 'PURCHASE_RECEIVED' AND "createdAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 1`,
    db.wasteEntry.aggregate({ where: { restaurantId: rid, occurredAt: { gte: from, lte: to } }, _sum: { value: true }, _count: true }),
    db.wasteEntry.groupBy({ by: ["reason"], where: { restaurantId: rid, occurredAt: { gte: from, lte: to } }, _sum: { value: true }, _count: true }),
    db.invoice.groupBy({ by: ["status"], where: { restaurantId: rid }, _count: true, _sum: { total: true } }),
    db.supplier.findMany({ where: { restaurantId: rid, archivedAt: null }, include: { purchases: { where: { createdAt: { gte: from, lte: to } }, include: { items: true } } } }),
    listRecipes(ctx),
    db.stockMovement.findMany({ where: { restaurantId: rid, type: "PURCHASE_RECEIVED", createdAt: { gte: from, lte: to }, unitCost: { not: null } }, orderBy: { createdAt: "asc" }, take: 3000, select: { ingredientId: true, unitCost: true, createdAt: true } }),
    repeatedWaste(ctx),
  ]);
  const byIng = new Map<string, { cost: number; at: Date }[]>();
  for (const m of moves) byIng.set(m.ingredientId, [...(byIng.get(m.ingredientId) ?? []), { cost: n(m.unitCost), at: m.createdAt }]);
  const priceTrends = [...byIng.entries()].map(([id, pts]) => {
    const pct = priceChangePct(pts[0].cost, pts[pts.length - 1].cost);
    return { ingredientId: id, name: ings.find((i) => i.id === id)?.name ?? "", first: pts[0].cost, last: pts[pts.length - 1].cost, changePct: pct ? Number(pct.toFixed(1)) : null, points: pts.length };
  }).filter((t) => t.points > 1 && t.changePct !== null).sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number));
  const costed = recipes.filter((r) => n(r.sellingPrice) > 0 && r.lines.length);
  const byCat = new Map<string, number>();
  for (const i of ings) byCat.set(i.category, (byCat.get(i.category) ?? 0) + n(i.value));
  return {
    range: { from, to },
    inventoryValue: n(valueRow[0]?.v), lowStockCount: ings.filter((i) => i.isLow).length, ingredientCount: ings.length,
    purchaseSpend: n(spendRow[0]?.v), spendByDay: spendDays.map((s) => ({ day: s.d.toISOString().slice(0, 10), spend: n(s.v) })),
    wasteCost: n(waste._sum.value), wasteCount: waste._count, wasteByReason: wasteReasons.map((w) => ({ reason: w.reason, cost: n(w._sum.value), count: w._count })).sort((a, b) => b.cost - a.cost),
    repeatedWaste: repeat.map((r) => ({ ...r, value: n(r.value) })),
    invoiceStatus: Object.fromEntries(invStatus.map((s) => [s.status, { count: s._count, total: n(s._sum.total) }])),
    supplierPerformance: suppliers.map((s) => {
      const live = s.purchases.filter((p) => !["CANCELLED", "REJECTED"].includes(p.status));
      return { id: s.id, name: s.name, orders: live.length, received: live.filter((p) => p.status === "RECEIVED").length, ordered: live.reduce((t, p) => t + p.items.reduce((a, i) => a + n(i.orderedQty) * n(i.unitPrice), 0), 0), fulfilmentPct: live.length ? Math.round((live.filter((p) => p.status === "RECEIVED").length / live.length) * 100) : null };
    }),
    priceTrends: priceTrends.slice(0, 10),
    foodCostPct: costed.length ? Number((costed.reduce((t, r) => t + n(r.foodCostPct), 0) / costed.length).toFixed(1)) : null,
    recipeProfitability: recipes.map((r) => ({ id: r.id, name: r.name, price: n(r.sellingPrice), cost: n(r.cost), grossProfit: n(r.grossProfit), foodCostPct: n(r.foodCostPct) })).sort((a, b) => b.foodCostPct - a.foodCostPct),
    categoryValue: [...byCat.entries()].map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value),
  };
}

// ---------------- exports ----------------
type Sheet = { name: string; headers: string[]; rows: (string | number | null)[][] };
const iso = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export async function datasets(ctx: Ctx, r0: { from?: Date; to?: Date } = {}): Promise<Record<string, Sheet>> {
  const { from, to } = resolveRange(r0.from, r0.to); const rid = ctx.restaurantId;
  const [ings, moves, waste, pos, invs] = await Promise.all([
    listIngredients(ctx),
    db.stockMovement.findMany({ where: { restaurantId: rid, createdAt: { gte: from, lte: to } }, include: { ingredient: true }, orderBy: { createdAt: "desc" }, take: 20000 }),
    db.wasteEntry.findMany({ where: { restaurantId: rid, occurredAt: { gte: from, lte: to } }, include: { ingredient: true }, orderBy: { occurredAt: "desc" } }),
    db.purchaseOrder.findMany({ where: { restaurantId: rid, createdAt: { gte: from, lte: to } }, include: { supplier: true, items: { include: { ingredient: true } } }, orderBy: { createdAt: "desc" } }),
    db.invoice.findMany({ where: { restaurantId: rid, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    inventory: { name: "Inventory", headers: ["Ingredient", "Category", "Unit", "On hand", "Reorder level", "Unit cost", "Value", "Next expiry", "Low"], rows: ings.map((i) => [i.name, i.category, i.unit, n(i.onHand), n(i.reorderLevel), n(i.unitCost), n(i.value), iso(i.nextExpiry), i.isLow ? "Yes" : ""]) },
    movements: { name: "Stock ledger", headers: ["Date", "Ingredient", "Type", "Quantity", "Unit cost", "Reason"], rows: moves.map((m) => [m.createdAt.toISOString(), m.ingredient.name, m.type, n(m.quantity), m.unitCost ? n(m.unitCost) : null, m.reason ?? ""]) },
    waste: { name: "Waste", headers: ["Date", "Ingredient", "Quantity", "Unit", "Reason", "Department", "Value"], rows: waste.map((w) => [iso(w.occurredAt), w.ingredient.name, n(w.quantity), w.ingredient.unit, w.reason, w.department ?? "", n(w.value)]) },
    purchases: { name: "Purchases", headers: ["Order", "Date", "Supplier", "Status", "Payment", "Ingredient", "Ordered", "Received", "Unit price", "Line value"], rows: pos.flatMap((p) => p.items.map((i) => [p.number, iso(p.createdAt), p.supplier?.name ?? "", p.status, p.paymentStatus, i.ingredient.name, n(i.orderedQty), n(i.receivedQty), n(i.unitPrice), n(i.orderedQty) * n(i.unitPrice)])) },
    invoices: { name: "Invoices", headers: ["Date", "Supplier", "Number", "Status", "Payment", "Subtotal", "Tax", "Total"], rows: invs.map((i) => [iso(i.invoiceDate), i.supplierName ?? "", i.number ?? "", i.status, i.paymentStatus, i.subtotal ? n(i.subtotal) : null, i.tax ? n(i.tax) : null, i.total ? n(i.total) : null]) },
  };
}

const csvCell = (v: string | number | null) => { let s = v == null ? "" : String(v); if (/^[=+\-@]/.test(s) && typeof v === "string") s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (s: Sheet) => [s.headers, ...s.rows].map((r) => r.map(csvCell).join(",")).join("\n");

export async function toXlsx(all: Record<string, Sheet>) {
  const wb = new ExcelJS.Workbook();
  for (const s of Object.values(all)) {
    const ws = wb.addWorksheet(s.name); ws.addRow(s.headers).font = { bold: true };
    s.rows.forEach((r) => ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v))));
    ws.columns.forEach((c) => { c.width = 18; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function toPdf(ctx: Ctx, r0: { from?: Date; to?: Date } = {}) {
  const d = await dashboard(ctx, r0);
  const rest = await db.restaurant.findUniqueOrThrow({ where: { id: ctx.restaurantId } });
  const doc = new PDFDocument({ margin: 48 }); const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const inr = (v: number) => `Rs ${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  doc.fontSize(20).text(`${rest.name} — Operations report`); doc.fontSize(10).fillColor("#666").text(`${iso(d.range.from)} to ${iso(d.range.to)}`).moveDown();
  doc.fillColor("#000").fontSize(12);
  [["Inventory value", inr(d.inventoryValue)], ["Ingredients low on stock", String(d.lowStockCount)], ["Purchases received", inr(d.purchaseSpend)], ["Waste cost", inr(d.wasteCost)], ["Average food cost", d.foodCostPct == null ? "n/a" : `${d.foodCostPct}%`]].forEach(([k, v]) => doc.text(`${k}: ${v}`));
  doc.moveDown().fontSize(14).text("Recipe profitability").fontSize(10);
  d.recipeProfitability.slice(0, 15).forEach((r) => doc.text(`${r.name} — price ${inr(r.price)}, cost ${inr(r.cost)}, profit ${inr(r.grossProfit)}, food cost ${r.foodCostPct}%`));
  doc.moveDown().fontSize(14).text("Largest price changes").fontSize(10);
  d.priceTrends.slice(0, 10).forEach((t) => doc.text(`${t.name}: ${inr(t.first)} → ${inr(t.last)} (${t.changePct}%)`));
  doc.end(); return done;
}
