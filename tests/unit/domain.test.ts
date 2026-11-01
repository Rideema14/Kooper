import { describe, it, expect } from "vitest";
import { D, fifoOrder, planDraw, recipeCost, recipeMetrics, wasteValue, validateInvoice, priceChangePct } from "@/lib/domain";

describe("recipe costing", () => {
  it("matches the spec example: ₹299 price, ₹95 cost → ₹204 profit, 31.8%", () => {
    const m = recipeMetrics(D(95), 299);
    expect(m.gross.toString()).toBe("204");
    expect(m.foodCostPct.toDecimalPlaces(1).toString()).toBe("31.8");
  });
  it("sums quantity × unit cost", () => {
    expect(recipeCost([{ quantity: 0.12, unitCost: 390 }, { quantity: 0.15, unitCost: 34 }]).toString()).toBe("51.9");
  });
  it("handles zero selling price without dividing by zero", () => {
    expect(recipeMetrics(D(10), 0).foodCostPct.toString()).toBe("0");
  });
});

describe("waste value", () => {
  it("rounds to paise", () => expect(wasteValue(1.2, 75).toString()).toBe("90"));
  it("keeps decimal precision (no float drift)", () => expect(wasteValue("0.1", "0.2").toString()).toBe("0.02"));
});

describe("FIFO", () => {
  const d = (s: string) => new Date(s);
  it("orders earliest expiry first, no-expiry last, then oldest received", () => {
    const out = fifoOrder([
      { id: "none", expiryDate: null, receivedAt: d("2026-01-01") },
      { id: "late", expiryDate: d("2026-12-01"), receivedAt: d("2026-01-02") },
      { id: "soon", expiryDate: d("2026-06-01"), receivedAt: d("2026-01-03") },
    ]);
    expect(out.map((x) => x.id)).toEqual(["soon", "late", "none"]);
  });
  it("planDraw spans batches and returns null if insufficient", () => {
    const b = [{ id: "a", quantity: D(3), unitCost: D(10) }, { id: "b", quantity: D(5), unitCost: D(12) }];
    const plan = planDraw(b, D(6))!;
    expect(plan.map((p) => [p.id, p.take.toString()])).toEqual([["a", "3"], ["b", "3"]]);
    expect(planDraw(b, D(9))).toBeNull();
  });
});

describe("invoice validation", () => {
  const base = { supplierName: "Fresh Farms", number: "INV-1", invoiceDate: new Date() };
  it("passes a consistent invoice", () => {
    const issues = validateInvoice({ ...base, items: [{ quantity: 10, unitPrice: 34, lineTotal: 340 }], subtotal: 340, tax: 17, total: 357 });
    expect(issues).toEqual([]);
  });
  it("flags a line total mismatch", () => {
    const issues = validateInvoice({ ...base, items: [{ quantity: 10, unitPrice: 34, lineTotal: 400 }], subtotal: 400, tax: 0, total: 400 });
    expect(issues.some((i) => i.code === "line_mismatch")).toBe(true);
  });
  it("flags grand total that doesn't equal subtotal + tax", () => {
    const issues = validateInvoice({ ...base, items: [{ quantity: 1, unitPrice: 100, lineTotal: 100 }], subtotal: 100, tax: 5, total: 120 });
    expect(issues.some((i) => i.code === "total_mismatch")).toBe(true);
  });
  it("flags subtotal not matching line items, and missing fields", () => {
    const issues = validateInvoice({ items: [{ quantity: 1, unitPrice: 100, lineTotal: 100 }], subtotal: 250, total: 250 });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("subtotal_mismatch");
    expect(codes).toContain("missing_supplier");
    expect(codes).toContain("missing_number");
  });
  it("errors on no line items", () => {
    expect(validateInvoice({ ...base, items: [], total: 0 }).some((i) => i.code === "no_items")).toBe(true);
  });
});

describe("price change", () => {
  it("computes percentage", () => expect(priceChangePct(100, 125)!.toString()).toBe("25"));
  it("returns null with no prior price", () => expect(priceChangePct(0, 50)).toBeNull());
});
