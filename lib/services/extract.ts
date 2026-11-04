import { extractionSchema, type Extraction } from "@/lib/schemas";
import { AppError, badRequest } from "@/lib/server/errors";

export const MAX_BYTES = 10 * 1024 * 1024;
export type Kind = "pdf" | "image" | "csv" | "xlsx";

/** Sniff the real type from magic bytes; never trust the filename or browser MIME alone. */
export function detectKind(buf: Buffer, fileName: string): Kind {
  if (buf.length < 4) throw badRequest("That file is empty.");
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "image";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image";
  if (buf[0] === 0x50 && buf[1] === 0x4b) { if (/\.xlsx$/i.test(fileName)) return "xlsx"; throw badRequest("Unsupported file type."); }
  if (/\.csv$/i.test(fileName) && !buf.subarray(0, 4096).includes(0)) return "csv";
  throw badRequest("Unsupported file. Use PDF, JPEG, PNG, CSV or XLSX.");
}
const mimeOf = (buf: Buffer) => (buf[0] === 0x89 ? "image/png" : "image/jpeg");

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === ";" || c === "\t") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); if (row.some((x) => x.trim())) rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

const num = (s: string | undefined) => { if (s == null) return NaN; const n = Number(String(s).replace(/[₹$,\s]/g, "").replace(/^\((.*)\)$/, "-$1")); return n; };
const HEAD: Record<string, RegExp> = {
  name: /^(item|ingredient|description|product|name|particulars)/i, quantity: /^(qty|quantity|units?\s*ordered)$/i, unit: /^(unit|uom|unit of measure)$/i,
  unitPrice: /(unit\s*(price|cost)|^price$|^rate$)/i, lineTotal: /^(line\s*total|amount|total|value)$/i,
  supplier: /^supplier|vendor/i, number: /invoice\s*(no|number|#)|^invoice$/i, date: /^(invoice\s*)?date$/i, due: /due/i,
};

/** Deterministic table → extraction. No AI involved, so CSV/XLSX never leave the server. */
export function tableToExtraction(rows: string[][]): Extraction {
  const hi = rows.findIndex((r) => r.some((c) => HEAD.name.test(c)) && r.some((c) => HEAD.quantity.test(c) || HEAD.unitPrice.test(c)));
  if (hi < 0) throw badRequest("Couldn't find a header row. Include columns like Item, Quantity, Unit, Unit price, Total.");
  const idx: Partial<Record<keyof typeof HEAD, number>> = {};
  rows[hi].forEach((c, i) => { for (const k of Object.keys(HEAD) as (keyof typeof HEAD)[]) if (idx[k] === undefined && HEAD[k].test(c)) idx[k] = i; });
  if (idx.name === undefined || idx.quantity === undefined) throw badRequest("The table needs Item and Quantity columns.");
  const items: Extraction["items"] = []; let subtotal: number | null = null, tax: number | null = null, total: number | null = null;
  const first = rows[hi + 1] ?? [];
  const cell = (r: string[], k: keyof typeof HEAD) => (idx[k] === undefined ? undefined : r[idx[k] as number]);
  for (const r of rows.slice(hi + 1)) {
    const name = (cell(r, "name") ?? "").trim(); if (!name) continue;
    const amount = num(cell(r, "lineTotal"));
    if (/^sub\s*-?total/i.test(name)) { subtotal = amount; continue; }
    if (/^(tax|gst|vat|igst|cgst|sgst)/i.test(name)) { tax = (tax ?? 0) + (Number.isFinite(amount) ? amount : 0); continue; }
    if (/^(grand\s*total|total|amount due)/i.test(name)) { total = amount; continue; }
    const quantity = num(cell(r, "quantity")); let unitPrice = num(cell(r, "unitPrice"));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    if (!Number.isFinite(unitPrice) && Number.isFinite(amount)) unitPrice = amount / quantity;
    if (!Number.isFinite(unitPrice)) continue;
    items.push({ name, quantity, unit: cell(r, "unit") || null, unitPrice, lineTotal: Number.isFinite(amount) ? amount : Math.round(quantity * unitPrice * 100) / 100 });
  }
  const iso = (s?: string) => { const d = s ? new Date(s) : null; return d && !isNaN(+d) ? d.toISOString().slice(0, 10) : null; };
  return extractionSchema.parse({ supplierName: cell(first, "supplier") || null, invoiceNumber: cell(first, "number") || null, invoiceDate: iso(cell(first, "date")), dueDate: iso(cell(first, "due")), items, subtotal, tax, total });
}

async function xlsxRows(buf: Buffer): Promise<string[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]; if (!ws) throw badRequest("The workbook has no sheets.");
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => { rows.push((r.values as unknown[]).slice(1).map((v) => (v == null ? "" : typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result) : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)))); });
  return rows;
}

const PROMPT = `You extract data from a restaurant supplier invoice. Return ONLY JSON:
{"supplierName":string|null,"invoiceNumber":string|null,"invoiceDate":"YYYY-MM-DD"|null,"dueDate":"YYYY-MM-DD"|null,
"items":[{"name":string,"quantity":number,"unit":string|null,"unitPrice":number,"lineTotal":number}],
"subtotal":number|null,"tax":number|null,"total":number|null}
Rules: copy numbers exactly as printed; never calculate or guess missing values — use null; one entry per product line;
exclude subtotal/tax/total rows from items; numbers have no currency symbols or thousands separators.`;

export function geminiConfigured() { return !!process.env.GEMINI_API_KEY; }

export async function extractWithGemini(buf: Buffer, mime: string): Promise<Extraction> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AppError(503, "Reading PDFs and photos needs a Gemini API key (GEMINI_API_KEY). CSV and XLSX invoices work without one.", "ai_unavailable");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data: buf.toString("base64") } }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
      signal: AbortSignal.timeout(60000),
    });
  } catch { throw new AppError(502, "Couldn't reach Gemini. Try again, or upload a CSV/XLSX.", "ai_unreachable"); }
  if (r.status === 429) throw new AppError(429, "Gemini's free-tier limit was reached. Wait a minute and try again.", "ai_rate_limited");
  if (!r.ok) { console.error("[gemini] extract failed", r.status); throw new AppError(502, `Gemini returned an error (${r.status}).`, "ai_error"); }
  const data = await r.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  try { return extractionSchema.parse(JSON.parse(text.replace(/^```json|```$/g, "").trim())); }
  catch { throw new AppError(422, "The document couldn't be read reliably. Try a clearer photo, or enter the invoice manually.", "extraction_invalid"); }
}

export async function extractInvoice(buf: Buffer, fileName: string): Promise<{ kind: Kind; data: Extraction; usedAi: boolean }> {
  if (buf.length > MAX_BYTES) throw new AppError(413, "That file is over 10 MB.", "too_large");
  const kind = detectKind(buf, fileName);
  if (kind === "csv") return { kind, data: tableToExtraction(parseCsv(buf.toString("utf8"))), usedAi: false };
  if (kind === "xlsx") return { kind, data: tableToExtraction(await xlsxRows(buf)), usedAi: false };
  return { kind, data: await extractWithGemini(buf, kind === "pdf" ? "application/pdf" : mimeOf(buf)), usedAi: true };
}
