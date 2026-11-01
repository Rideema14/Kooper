"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { InventoryItem, Purchase, PurchaseStatus, WasteEntry } from "./data";

export type Role = "OWNER" | "MANAGER" | "CHEF" | "INVENTORY_STAFF" | "ACCOUNTANT";
export type Me = { user: { id: string; name: string; email: string }; role: Role; restaurant: { id: string; name: string; currency: string } };
export type Supplier = { id: string; name: string; phone?: string | null; email?: string | null };
export type RecipeFull = { id: string; name: string; servings: number; sellingPrice: number; cost: number; grossProfit: number; foodCostPct: number; lines: { ingredientId: string; quantity: number; ingredient: { id: string; name: string; unit: string; unitCost: number } }[] };
export type Notice = { id: string; kind: string; title: string; body: string | null; readAt: string | null; createdAt: string };
export type Dash = {
  inventoryValue: number; lowStockCount: number; purchaseSpend: number; wasteCost: number; foodCostPct: number | null;
  spendByDay: { day: string; spend: number }[]; repeatedWaste: { name: string; count: number; value: number }[];
  categoryValue: { category: string; value: number }[]; priceTrends: { name: string; first: number; last: number; changePct: number | null }[];
  supplierPerformance: { id: string; name: string; orders: number; received: number; ordered: number; fulfilmentPct: number | null }[];
  invoiceStatus: Record<string, { count: number; total: number }>; recipeProfitability: { id: string; name: string; price: number; cost: number; grossProfit: number; foodCostPct: number }[];
  wasteByReason: { reason: string; cost: number; count: number }[];
};

/** Thin fetch wrapper: JSON in/out, readable errors, bounce to /login when the session is gone. */
export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  if (r.status === 401) { location.href = "/login"; throw new Error("Please sign in."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || "Something went wrong.");
  return j as T;
}

const STATUS: Record<string, PurchaseStatus | undefined> = { PENDING_APPROVAL: "Needs approval", APPROVED: "Approved", SENT: "Ordered", PARTIALLY_RECEIVED: "Ordered" };
const ago = (iso: string) => { const m = Math.round((Date.now() - +new Date(iso)) / 60000); return m < 2 ? "Just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

const mapIng = (i: any): InventoryItem => ({ id: i.id, name: i.name, category: i.category, quantity: Number(i.onHand), unit: i.unit, reorderAt: Number(i.reorderLevel), unitPrice: Number(i.unitCost), supplier: i.supplier?.name ?? "—", supplierId: i.supplier?.id ?? null, updated: ago(i.lastMoved), expiry: i.nextExpiry ?? null });
const mapPo = (p: any): Purchase => {
  const lines = p.items.map((l: any) => ({ id: l.id, ingredientId: l.ingredientId, name: l.ingredient.name, unit: l.ingredient.unit, ordered: Number(l.orderedQty), received: Number(l.receivedQty), price: Number(l.unitPrice), category: l.ingredient.category }));
  const first = lines[0];
  return { id: p.id, number: p.number, item: lines.length > 1 ? `${first.name} +${lines.length - 1} more` : first?.name ?? "—", quantity: lines.length === 1 ? first.ordered : lines.length, unit: lines.length === 1 ? first.unit : "items", supplier: p.supplier?.name ?? "No supplier", supplierId: p.supplier?.id ?? null, estimated: lines.reduce((s: number, l: any) => s + l.ordered * l.price, 0), status: STATUS[p.status] ?? "Ordered", partial: p.status === "PARTIALLY_RECEIVED", paymentStatus: p.paymentStatus, lines };
};
const mapWaste = (w: any): WasteEntry => ({ id: w.id, ingredientId: w.ingredientId, item: w.ingredient.name, quantity: Number(w.quantity), unit: w.ingredient.unit, reason: w.reason, date: String(w.occurredAt).slice(0, 10), value: Number(w.value), department: w.department });

type Boot = { me: Me; ingredients: any[]; purchases: any[]; waste: any[]; recipes: any[]; suppliers: Supplier[]; dash: Dash; notifications: Notice[] };

export const CAPS = {
  inventoryWrite: ["OWNER", "MANAGER", "INVENTORY_STAFF"], purchasing: ["OWNER", "MANAGER"], receiving: ["OWNER", "MANAGER", "INVENTORY_STAFF"],
  invoices: ["OWNER", "MANAGER", "ACCOUNTANT"], recipes: ["OWNER", "MANAGER", "CHEF"], waste: ["OWNER", "MANAGER", "CHEF", "INVENTORY_STAFF"], reports: ["OWNER", "MANAGER", "ACCOUNTANT"], team: ["OWNER"],
} as const;

/** All app data comes from the server (PostgreSQL). Nothing business-critical is stored in the browser. */
export function useKooperData() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [waste, setWaste] = useState<WasteEntry[]>([]);
  const [recipes, setRecipes] = useState<RecipeFull[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [dash, setDash] = useState<Dash | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const b = await api<Boot>("GET", "/api/bootstrap");
      if (!alive.current) return;
      setMe(b.me); setInventory(b.ingredients.map(mapIng)); setPurchases(b.purchases.map(mapPo)); setWaste(b.waste.map(mapWaste));
      setRecipes(b.recipes as RecipeFull[]); setSuppliers(b.suppliers); setDash(b.dash); setNotices(b.notifications); setError(null); setReady(true);
    } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : "Couldn't load your data."); setReady(true); } }
  }, []);
  useEffect(() => { alive.current = true; refresh(); return () => { alive.current = false; }; }, [refresh]);

  /** Run a mutation, then reload server truth. Errors propagate so the caller can show them. */
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => { const out = await fn(); await refresh(); return out; }, [refresh]);
  const can = useCallback((cap: keyof typeof CAPS) => !!me && (CAPS[cap] as readonly string[]).includes(me.role), [me]);

  const act = {
    addIngredient: (b: Record<string, unknown>) => run(() => api<{ id: string }>("POST", "/api/ingredients", b)),
    patchIngredient: (id: string, b: Record<string, unknown>) => run(() => api("PATCH", `/api/ingredients/${id}`, b)),
    archiveIngredient: (id: string) => run(() => api("DELETE", `/api/ingredients/${id}`)),
    adjustTo: (id: string, newTotal: number, reason = "Quick adjust") => run(() => api("POST", `/api/ingredients/${id}/adjust`, { newTotal, reason })),
    createSupplier: (name: string) => run(() => api<Supplier>("POST", "/api/suppliers", { name })),
    createPurchase: (b: { supplierId?: string | null; items: { ingredientId: string; quantity: number; unitPrice?: number }[] }) => run(() => api<{ id: string }>("POST", "/api/purchases", b)),
    draftFromLow: () => run(() => api<unknown[]>("POST", "/api/purchases/draft")),
    po: (id: string, action: "approve" | "reject" | "cancel" | "send" | "receive", body: unknown = {}) => run(() => api("POST", `/api/purchases/${id}/${action}`, body)),
    logWaste: (b: Record<string, unknown>) => run(() => api<{ id: string }>("POST", "/api/waste", b)),
    reverseWaste: (id: string) => run(() => api("DELETE", `/api/waste/${id}`)),
    saveRecipe: (id: string | null, b: unknown) => run(() => (id ? api<RecipeFull>("PUT", `/api/recipes/${id}`, b) : api<RecipeFull>("POST", "/api/recipes", b))),
    deleteRecipe: (id: string) => run(() => api("DELETE", `/api/recipes/${id}`)),
    markRead: () => run(() => api("POST", "/api/notifications", {})),
    logout: async () => { await api("POST", "/api/auth/logout"); location.href = "/login"; },
  };
  return { ready, error, me, role: me?.role, can, inventory, purchases, waste, recipes, suppliers, dash, notices, refresh, act };
}
export type KooperData = ReturnType<typeof useKooperData>;
