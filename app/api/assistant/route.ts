import { NextRequest, NextResponse } from "next/server";

type Item = { name: string; quantity: number; unit: string; reorderAt: number; unitPrice: number; supplier: string };
type Waste = { item: string; quantity: number; unit: string; reason: string };
type Purchase = { status: string };

type AssistantContext = {
  inventory: Item[];
  waste: Waste[];
  purchases: Purchase[];
  [key: string]: unknown;
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fallback = "I can review stock, draft a purchase list, estimate costs or spot waste patterns. Try: “What should I reorder today?”";

function buildLocalReply(message: string, context: AssistantContext) {
  const q = message.toLowerCase();
  const inv = context.inventory;
  const waste = context.waste;
  const purchases = context.purchases;
  const low = inv.filter((x) => x.quantity <= x.reorderAt);
  let reply = fallback;

  if (/^(hi|hello|hey)\b/.test(q)) {
    reply = "Hello! Ask me what to reorder, where waste is coming from, or what your ingredients cost.";
  } else if (/reorder|low|stock|order/.test(q) && !/message|draft/.test(q)) {
    if (!inv.length) reply = "Add a few ingredients to inventory and I can tell you what to reorder.";
    else if (!low.length) reply = "Everything is above its reorder level right now. Nothing needs ordering today.";
    else {
      const lines = low.map((x) => { const need = Math.max(x.reorderAt * 2 - x.quantity, 1); return `• ${x.name}: ${x.quantity} ${x.unit} on hand (reorder at ${x.reorderAt}) — about ${need} ${x.unit}, roughly ${inr(need * x.unitPrice)}`; });
      const pend = purchases.filter((p) => p.status === "Needs approval").length;
      reply = `Here’s what’s running low:\n\n${lines.join("\n")}\n\n${pend ? `You already have ${pend} suggestion${pend > 1 ? "s" : ""} waiting for approval. ` : ""}Check today’s deliveries before you approve anything.`;
    }
  } else if (/waste|discard|throw|wasted/.test(q)) {
    if (!waste.length) reply = "Nothing has been logged yet. Record waste daily and I’ll point out the patterns.";
    else {
      const m = waste.reduce<Record<string, number>>((a, w) => ((a[w.item] = (a[w.item] || 0) + 1), a), {});
      const top = Object.entries(m).sort((a, b) => b[1] - a[1]);
      const r = waste.reduce<Record<string, number>>((a, w) => ((a[w.reason] = (a[w.reason] || 0) + 1), a), {});
      const topReason = Object.entries(r).sort((a, b) => b[1] - a[1])[0][0];
      reply = `You’ve logged ${waste.length} waste ${waste.length > 1 ? "entries" : "entry"}. ${top[0][0]} appears most (${top[0][1]}×), and the leading reason is “${topReason}”.\n\nTry using the oldest ${top[0][0].toLowerCase()} in today’s specials and trim prep quantities until the pattern settles.`;
    }
  } else if (/cost|menu|price|margin|expensive/.test(q)) {
    if (!inv.length) reply = "Add ingredients with unit prices and I can talk through costs.";
    else {
      const top = [...inv].sort((a, b) => b.unitPrice - a.unitPrice).slice(0, 3);
      const val = [...inv].sort((a, b) => b.quantity * b.unitPrice - a.quantity * a.unitPrice)[0];
      reply = `Your priciest ingredients per unit: ${top.map((x) => `${x.name} (${inr(x.unitPrice)}/${x.unit})`).join(", ")}.\n\nMost money is tied up in ${val.name} (${inr(val.quantity * val.unitPrice)} on hand). Open Menu costing to see how each dish lands against a 30% food-cost target.`;
    }
  } else if (/supplier|message|draft|email|whatsapp/.test(q)) {
    const bySup = new Map<string, string[]>();
    low.forEach((x) => bySup.set(x.supplier, [...(bySup.get(x.supplier) ?? []), x.name.toLowerCase()]));
    const [sup, items] = [...bySup.entries()][0] ?? ["", []];
    reply = items.length
      ? `Draft for ${sup}:\n\n“Hi, could you please confirm today’s availability and your latest price for ${items.join(", ")}? Please share the delivery window before we confirm quantities. Thank you.”`
      : "Draft:\n\n“Hi, could you please confirm today’s availability, latest prices and the delivery window for our usual items? We’ll confirm quantities once reviewed. Thank you.”";
  } else if (/value|worth|total/.test(q) && inv.length) {
    reply = `Your recorded stock is worth about ${inr(inv.reduce((s, x) => s + x.quantity * x.unitPrice, 0))} across ${inv.length} ingredients.`;
  }
  return reply;
}

async function askGemini(message: string, context: AssistantContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "You are Kooper, a practical restaurant operations assistant. Help independent restaurant owners with inventory, supplier purchasing, invoice information, food costs, menu margins and waste reduction. Use the supplied restaurant data as the source of truth. Never invent stock levels, prices, suppliers, purchases or business metrics. If data is missing, say what is needed. Give clear, concise, useful recommendations. Do not claim to place orders, contact suppliers, or change records. Any supplier message must be a draft for the owner to review. Use INR (₹) when discussing rupee amounts. Format answers with short paragraphs or bullets when useful.",
          }],
        },
        contents: [{
          role: "user",
          parts: [{ text: `Restaurant data (JSON):\n${JSON.stringify(context)}\n\nOwner's question: ${message}` }],
        }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 700,
        },
      }),
      signal: AbortSignal.timeout(25000),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Gemini API request failed:", response.status, detail.slice(0, 500));
    throw new Error(`Gemini API returned ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("\n")
    .trim();

  if (!text) throw new Error("Gemini returned an empty response");
  return text as string;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "Please enter a message." }, { status: 400 });

  const rawContext = body?.context ?? {};
  const context: AssistantContext = {
    ...rawContext,
    inventory: Array.isArray(rawContext.inventory) ? rawContext.inventory : [],
    waste: Array.isArray(rawContext.waste) ? rawContext.waste : [],
    purchases: Array.isArray(rawContext.purchases) ? rawContext.purchases : [],
  };

  try {
    const geminiReply = await askGemini(message, context);
    if (geminiReply) return NextResponse.json({ reply: geminiReply, mode: "gemini" });
  } catch (error) {
    console.error("Kooper assistant falling back to local responses:", error);
  }

  return NextResponse.json({ reply: buildLocalReply(message, context), mode: "demo" });
}
