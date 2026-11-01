import { Prisma } from "@prisma/client";

export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export type Dec = Prisma.Decimal;
export type DecIn = Prisma.Decimal.Value;

/** Order batches for consumption: earliest expiry first (no-expiry last), then oldest received. */
export function fifoOrder<T extends { expiryDate: Date | null; receivedAt: Date }>(batches: T[]): T[] {
  return [...batches].sort((a, b) => {
    const ae = a.expiryDate?.getTime() ?? Infinity, be = b.expiryDate?.getTime() ?? Infinity;
    return ae !== be ? ae - be : a.receivedAt.getTime() - b.receivedAt.getTime();
  });
}

export type Draw = { id: string; take: Dec; unitCost: Dec };

/** Plan how much to take from each batch. Returns null when stock is insufficient. */
export function planDraw(batches: { id: string; quantity: Dec; unitCost: Dec }[], qty: Dec): Draw[] | null {
  let left = qty;
  const out: Draw[] = [];
  for (const b of batches) {
    if (left.lte(0)) break;
    const take = Prisma.Decimal.min(b.quantity, left);
    if (take.gt(0)) { out.push({ id: b.id, take, unitCost: b.unitCost }); left = left.minus(take); }
  }
  return left.gt(0) ? null : out;
}

export const recipeCost = (lines: { quantity: DecIn; unitCost: DecIn }[]) =>
  lines.reduce((s, l) => s.plus(D(l.quantity).times(D(l.unitCost))), D(0));

export function recipeMetrics(cost: Dec, price: DecIn) {
  const p = D(price);
  const gross = p.minus(cost);
  const pct = p.gt(0) ? cost.div(p).times(100) : D(0);
  return { cost, gross, foodCostPct: pct };
}

export const wasteValue = (qty: DecIn, unitCost: DecIn) => D(qty).times(D(unitCost)).toDecimalPlaces(2);

export const lineTotal = (qty: DecIn, price: DecIn) => D(qty).times(D(price)).toDecimalPlaces(2);

export type InvoiceIssue = { code: string; severity: "error" | "warning"; message: string };

/** Validate extracted invoice arithmetic. Tolerance defaults to ₹1 to absorb rounding. */
export function validateInvoice(inv: {
  items: { quantity: DecIn; unitPrice: DecIn; lineTotal: DecIn }[];
  subtotal?: DecIn | null; tax?: DecIn | null; total?: DecIn | null;
  number?: string | null; supplierName?: string | null; invoiceDate?: Date | null;
}, tol = 1): InvoiceIssue[] {
  const issues: InvoiceIssue[] = [];
  if (!inv.supplierName) issues.push({ code: "missing_supplier", severity: "error", message: "Supplier name is missing." });
  if (!inv.number) issues.push({ code: "missing_number", severity: "warning", message: "Invoice number is missing — duplicate detection is weaker." });
  if (!inv.invoiceDate) issues.push({ code: "missing_date", severity: "warning", message: "Invoice date is missing." });
  if (!inv.items.length) issues.push({ code: "no_items", severity: "error", message: "No line items were found." });
  inv.items.forEach((it, i) => {
    const expect = lineTotal(it.quantity, it.unitPrice);
    if (expect.minus(D(it.lineTotal)).abs().gt(tol))
      issues.push({ code: "line_mismatch", severity: "error", message: `Line ${i + 1}: quantity × price is ${expect.toFixed(2)} but the line total is ${D(it.lineTotal).toFixed(2)}.` });
  });
  const sum = inv.items.reduce((s, it) => s.plus(D(it.lineTotal)), D(0));
  if (inv.subtotal != null && sum.minus(D(inv.subtotal)).abs().gt(tol))
    issues.push({ code: "subtotal_mismatch", severity: "error", message: `Line items add up to ${sum.toFixed(2)} but the subtotal is ${D(inv.subtotal).toFixed(2)}.` });
  if (inv.total != null) {
    const base = inv.subtotal != null ? D(inv.subtotal) : sum;
    const expect = base.plus(D(inv.tax ?? 0));
    if (expect.minus(D(inv.total)).abs().gt(tol))
      issues.push({ code: "total_mismatch", severity: "error", message: `Subtotal + tax is ${expect.toFixed(2)} but the grand total is ${D(inv.total).toFixed(2)}.` });
  } else issues.push({ code: "missing_total", severity: "warning", message: "Grand total is missing." });
  return issues;
}

export const priceChangePct = (oldP: DecIn, newP: DecIn) => {
  const o = D(oldP);
  return o.gt(0) ? D(newP).minus(o).div(o).times(100) : null;
};
