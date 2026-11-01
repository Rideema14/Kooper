import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { AppError } from "@/lib/server/errors";
import { dashboard } from "./reports";
import { suggestions } from "./purchasing";
import { listIngredients } from "./catalog";

type Ctx = { restaurantId: string; userId: string };
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
const num = (v: unknown) => Number(String(v ?? 0));
export type Msg = { role: "user" | "bot"; text: string };

/** Everything the assistant may know, read from the database for THIS restaurant. Compact on purpose (token-efficient). */
export async function buildFacts(ctx: Ctx) {
  const [d, sug, ings, review, pending, prices] = await Promise.all([
    dashboard(ctx), suggestions(ctx), listIngredients(ctx),
    db.invoice.findMany({ where: { restaurantId: ctx.restaurantId, status: "NEEDS_REVIEW" }, select: { supplierName: true, number: true, total: true }, take: 10 }),
    db.purchaseOrder.findMany({ where: { restaurantId: ctx.restaurantId, status: "PENDING_APPROVAL" }, select: { number: true, supplier: { select: { name: true } } }, take: 10 }),
    db.supplierPrice.findMany({ where: { restaurantId: ctx.restaurantId }, include: { supplier: { select: { name: true } }, ingredient: { select: { name: true, unit: true } } } }),
  ]);
  const cheapest = new Map<string, { supplier: string; price: number; unit: string; others: number }>();
  for (const p of prices) {
    const k = p.ingredient.name, cur = cheapest.get(k);
    if (!cur || num(p.price) < cur.price) cheapest.set(k, { supplier: p.supplier.name, price: num(p.price), unit: p.ingredient.unit, others: (cur?.others ?? 0) + (cur ? 1 : 0) });
    else cur.others++;
  }
  return {
    currency: "INR", periodDays: 30,
    inventory: { value: d.inventoryValue, ingredientCount: d.ingredientCount, lowStock: ings.filter((i) => i.isLow).map((i) => ({ name: i.name, onHand: num(i.onHand), unit: i.unit, reorderLevel: num(i.reorderLevel) })), expiringSoon: ings.filter((i) => i.nextExpiry && +i.nextExpiry - Date.now() < 3 * 864e5).map((i) => ({ name: i.name, expiry: i.nextExpiry })) },
    reorderSuggestions: sug.map((s) => ({ name: s.name, qty: num(s.quantity), unit: s.unit, estimated: num(s.estimated), supplier: s.supplier?.name ?? null })),
    spend: { purchasesReceived: d.purchaseSpend }, waste: { cost: d.wasteCost, entries: d.wasteCount, byReason: d.wasteByReason, repeated: d.repeatedWaste },
    priceChanges: d.priceTrends.map((t) => ({ name: t.name, from: t.first, to: t.last, changePct: t.changePct })),
    cheapestSupplierPerIngredient: Object.fromEntries([...cheapest.entries()].map(([k, v]) => [k, v])),
    suppliers: d.supplierPerformance, invoices: { needsReview: review, counts: d.invoiceStatus }, ordersAwaitingApproval: pending.map((p) => ({ number: p.number, supplier: p.supplier?.name ?? null })),
    recipes: d.recipeProfitability, avgFoodCostPct: d.foodCostPct,
  };
}
type Facts = Awaited<ReturnType<typeof buildFacts>>;

/** Deterministic answers straight from the data. Used when Gemini isn't configured or fails — clearly labelled, never invented. */
export function answerFromFacts(q: string, f: Facts): string {
  const s = q.toLowerCase();
  if (/reorder|low|running out|stock up/.test(s)) return f.reorderSuggestions.length ? `Suggested reorders (not yet ordered):\n${f.reorderSuggestions.map((x) => `• ${x.name}: ${x.qty} ${x.unit} ≈ ${inr(x.estimated)}${x.supplier ? ` from ${x.supplier}` : ""}`).join("\n")}\n\nUse “Draft from low stock” on Orders to create drafts for approval.` : "Nothing is at or below its reorder level, and nothing outstanding needs ordering.";
  if (/increase|price (up|rise|chang)|more expensive|gone up/.test(s)) return f.priceChanges.length ? `Price movements this period:\n${f.priceChanges.map((x) => `• ${x.name}: ${inr(x.from)} → ${inr(x.to)} (${(x.changePct ?? 0) > 0 ? "+" : ""}${x.changePct}%)`).join("\n")}` : "I don't see any ingredient with two or more priced deliveries this period, so there's no price trend to report yet.";
  if (/cheap|supplier/.test(s)) { const e = Object.entries(f.cheapestSupplierPerIngredient); return e.length ? `Lowest known supplier price per ingredient:\n${e.map(([k, v]) => `• ${k}: ${v.supplier} at ${inr(v.price)}/${v.unit}`).join("\n")}` : "No supplier-specific prices are recorded yet. They're added when you approve invoices or set a supplier price list."; }
  if (/waste/.test(s)) return `Waste cost over the last ${f.periodDays} days: ${inr(f.waste.cost)} across ${f.waste.entries} entr${f.waste.entries === 1 ? "y" : "ies"}.${f.waste.byReason[0] ? ` Top reason: ${f.waste.byReason[0].reason} (${inr(f.waste.byReason[0].cost)}).` : ""}${f.waste.repeated.length ? ` Repeating: ${f.waste.repeated.map((r) => r.name).join(", ")}.` : ""}`;
  if (/profit|dish|menu|recipe|margin|food cost/.test(s)) { const r = f.recipes.filter((x) => x.price > 0); return r.length ? `Highest food cost first:\n${r.slice(0, 5).map((x) => `• ${x.name}: ${x.foodCostPct}% (cost ${inr(x.cost)}, price ${inr(x.price)}, profit ${inr(x.grossProfit)})`).join("\n")}` : "No recipes with a selling price yet."; }
  if (/value|worth/.test(s)) return `Your inventory is currently valued at ${inr(f.inventory.value)} across ${f.inventory.ingredientCount} ingredients.`;
  if (/invoice/.test(s)) return f.invoices.needsReview.length ? `${f.invoices.needsReview.length} invoice(s) need review:\n${f.invoices.needsReview.map((i) => `• ${i.supplierName ?? "Unknown supplier"} ${i.number ?? ""} ${i.total ? inr(num(i.total)) : ""}`).join("\n")}` : "No invoices are waiting for review.";
  if (/priorit|today|focus/.test(s)) { const t: string[] = []; if (f.ordersAwaitingApproval.length) t.push(`Approve ${f.ordersAwaitingApproval.length} pending order(s).`); if (f.invoices.needsReview.length) t.push(`Review ${f.invoices.needsReview.length} invoice(s).`); if (f.inventory.lowStock.length) t.push(`Restock: ${f.inventory.lowStock.map((x) => x.name).join(", ")}.`); if (f.inventory.expiringSoon.length) t.push(`Use soon: ${f.inventory.expiringSoon.map((x) => x.name).join(", ")}.`); return t.length ? t.map((x) => `• ${x}`).join("\n") : "Nothing urgent — stock, orders and invoices are all in order."; }
  return "I can answer from your records: reorders, price changes, cheapest suppliers, waste cost, dish profitability, inventory value, invoices to review, and today's priorities.";
}

const SYSTEM = `You are Kooper, an assistant for an independent restaurant. Answer ONLY from the FACTS JSON supplied. 
If the facts don't contain the answer, say so plainly — never invent numbers, prices, suppliers or dates. Amounts are INR (₹).
You cannot change anything: you can't update stock, approve invoices, or place orders. When action is needed, tell the owner which screen to use and that they must approve it.
Be concise (under 150 words) and practical. Respond as JSON: {"answer": string, "followUps": string[]} with at most 3 short follow-up questions.`;

export async function ask(ctx: Ctx, message: string, history: Msg[]) {
  const facts = await buildFacts(ctx);
  const key = process.env.GEMINI_API_KEY;
  const fallback = (note: string) => ({ reply: answerFromFacts(message, facts), mode: "basic" as const, note, followUps: [] as string[] });
  if (!key) return fallback("Gemini isn't configured, so this answer comes from a simple lookup of your records.");
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env().GEMINI_MODEL}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [
          ...history.slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text.slice(0, 800) }] })),
          { role: "user", parts: [{ text: `FACTS:\n${JSON.stringify(facts)}\n\nQUESTION: ${message}` }] },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 600, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (r.status === 429) return fallback("Gemini's free-tier limit was reached, so this answer comes from a simple lookup of your records.");
    if (!r.ok) throw new AppError(502, `Gemini ${r.status}`);
    const data = await r.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    let parsed: { answer?: string; followUps?: string[] } = {};
    try { parsed = JSON.parse(raw.replace(/^```json|```$/g, "").trim()); } catch { parsed = { answer: raw.trim() }; }
    if (!parsed.answer) throw new Error("empty");
    return { reply: parsed.answer, mode: "gemini" as const, note: null, followUps: (parsed.followUps ?? []).slice(0, 3) };
  } catch (e) { console.error("[assistant] gemini failed:", e instanceof Error ? e.message : e); return fallback("Gemini couldn't be reached, so this answer comes from a simple lookup of your records."); }
}
