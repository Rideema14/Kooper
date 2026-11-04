// View-model types and small pure helpers. All business data comes from the API (see lib/store.ts).
export type InventoryItem = {
  id: string; name: string; category: string; quantity: number; unit: string;
  reorderAt: number; unitPrice: number; supplier: string; supplierId: string | null; updated: string; expiry: string | null;
};
export type PurchaseStatus = "Needs approval" | "Approved" | "Ordered";
export type PurchaseLine = { id: string; ingredientId: string; name: string; unit: string; ordered: number; received: number; price: number; category: string };
export type Purchase = {
  id: string; number: string; item: string; quantity: number; unit: string; supplier: string; supplierId: string | null;
  estimated: number; status: PurchaseStatus; partial: boolean; paymentStatus: string; lines: PurchaseLine[];
};
export type WasteEntry = {
  id: string; ingredientId: string; item: string; quantity: number; unit: string; reason: string; date: string; value: number; department: string | null;
};

export const isoDaysAgo = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

/** Rough kg-equivalent so mixed units can be totalled (L ≈ kg, pieces ignored). */
export const toKg = (qty: number, unit: string) =>
  unit === "kg" || unit === "L" ? qty : unit === "g" ? qty / 1000 : 0;

export const isLow = (x: InventoryItem) => x.reorderAt > 0 && x.quantity <= x.reorderAt;
export const suggestQty = (x: InventoryItem) => Math.max(+(x.reorderAt * 2 - x.quantity).toFixed(2), 1);
