import { describe, it, expect } from "vitest";
import { detectKind, parseCsv, tableToExtraction } from "@/lib/services/extract";
import { matchIngredient } from "@/lib/services/invoices";

describe("file validation", () => {
  it("recognises types by content, not by name", () => {
    expect(detectKind(Buffer.from("%PDF-1.7 ..."), "x.pdf")).toBe("pdf");
    expect(detectKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]), "a.png")).toBe("image");
    expect(detectKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "a.jpg")).toBe("image");
    expect(detectKind(Buffer.from("a,b\n1,2"), "a.csv")).toBe("csv");
  });
  it("rejects disguised or unsupported files", () => {
    expect(() => detectKind(Buffer.from("MZ\x90\x00 exe bytes"), "invoice.pdf")).toThrow(/Unsupported/);
    expect(() => detectKind(Buffer.from([0x50, 0x4b, 3, 4]), "evil.zip")).toThrow(/Unsupported/);
    expect(() => detectKind(Buffer.from("a\u0000b,c"), "x.csv")).toThrow(/Unsupported/);
    expect(() => detectKind(Buffer.alloc(0), "x.csv")).toThrow(/empty/);
  });
});

describe("csv parsing", () => {
  it("handles quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y",2\r\n')).toEqual([["a", "b"], ["x, y", "2"]]);
  });
  it("extracts items, header fields and totals; skips total rows from items", () => {
    const rows = parseCsv("Supplier,Invoice,Date,Item,Qty,Unit,Unit price,Amount\nFarm Co,INV-1,2026-10-01,Onions,5,kg,30,150\n,,,GST,,,,7.5\n,,,Total,,,,157.5");
    const x = tableToExtraction(rows);
    expect(x.supplierName).toBe("Farm Co"); expect(x.invoiceNumber).toBe("INV-1");
    expect(x.items).toHaveLength(1); expect(x.items[0]).toMatchObject({ name: "Onions", quantity: 5, unitPrice: 30, lineTotal: 150 });
    expect(x.tax).toBe(7.5); expect(x.total).toBe(157.5);
  });
  it("explains when columns are missing", () => { expect(() => tableToExtraction(parseCsv("foo,bar\n1,2"))).toThrow(/header row/); });
});

describe("ingredient matching", () => {
  const list = [{ id: "1", name: "Tomatoes" }, { id: "2", name: "Parmesan Cheese" }, { id: "3", name: "Olive Oil" }];
  it("matches exact, singular/plural and containment", () => {
    expect(matchIngredient("tomato", list)).toBe("1");
    expect(matchIngredient("TOMATOES ", list)).toBe("1");
    expect(matchIngredient("Parmesan", list)).toBe("2");
    expect(matchIngredient("extra virgin olive oil", list)).toBe("3");
  });
  it("returns null rather than guessing", () => { expect(matchIngredient("Dragonfruit", list)).toBeNull(); });
});
