export type InventoryItem = {
  id: string; name: string; category: string; quantity: number; unit: string;
  reorderAt: number; unitPrice: number; supplier: string; updated: string;
};
export type PurchaseStatus = "Needs approval" | "Approved" | "Ordered";
export type Purchase = {
  id: string; item: string; quantity: number; unit: string; supplier: string;
  estimated: number; status: PurchaseStatus;
};
export type WasteEntry = {
  id: string; item: string; quantity: number; unit: string; reason: string; date: string;
};
export type RecipeLine = { id: string; name: string; qty: number; price: number };

export const isoDaysAgo = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const initialInventory: InventoryItem[] = [
  { id: "I-101", name: "Tomatoes", category: "Produce", quantity: 8, unit: "kg", reorderAt: 12, unitPrice: 34, supplier: "Fresh Farms", updated: "Today" },
  { id: "I-102", name: "Mozzarella", category: "Dairy", quantity: 5, unit: "kg", reorderAt: 4, unitPrice: 390, supplier: "Dairy Direct", updated: "Today" },
  { id: "I-103", name: "Olive oil", category: "Pantry", quantity: 3, unit: "L", reorderAt: 5, unitPrice: 620, supplier: "Chef Supply Co.", updated: "Yesterday" },
  { id: "I-104", name: "All-purpose flour", category: "Pantry", quantity: 24, unit: "kg", reorderAt: 10, unitPrice: 48, supplier: "Mill House", updated: "Yesterday" },
  { id: "I-105", name: "Chicken breast", category: "Meat", quantity: 7, unit: "kg", reorderAt: 8, unitPrice: 245, supplier: "Prime Cuts", updated: "Today" },
  { id: "I-106", name: "Basmati rice", category: "Pantry", quantity: 32, unit: "kg", reorderAt: 12, unitPrice: 92, supplier: "Mill House", updated: "2 days ago" },
  { id: "I-107", name: "Lettuce", category: "Produce", quantity: 2, unit: "kg", reorderAt: 5, unitPrice: 75, supplier: "Fresh Farms", updated: "Today" },
  { id: "I-108", name: "Cream", category: "Dairy", quantity: 9, unit: "L", reorderAt: 5, unitPrice: 210, supplier: "Dairy Direct", updated: "Yesterday" },
];

export const initialPurchases: Purchase[] = [
  { id: "PO-204", item: "Tomatoes", quantity: 10, unit: "kg", supplier: "Fresh Farms", estimated: 340, status: "Needs approval" },
  { id: "PO-205", item: "Lettuce", quantity: 5, unit: "kg", supplier: "Fresh Farms", estimated: 375, status: "Needs approval" },
  { id: "PO-206", item: "Chicken breast", quantity: 5, unit: "kg", supplier: "Prime Cuts", estimated: 1225, status: "Approved" },
];

export const initialWaste = (): WasteEntry[] => [
  { id: "W-031", item: "Lettuce", quantity: 1.2, unit: "kg", reason: "Spoiled", date: isoDaysAgo(1) },
  { id: "W-030", item: "Tomatoes", quantity: 0.8, unit: "kg", reason: "Spoiled", date: isoDaysAgo(2) },
  { id: "W-029", item: "Cream", quantity: 0.5, unit: "L", reason: "Expired", date: isoDaysAgo(4) },
  { id: "W-028", item: "Lettuce", quantity: 0.9, unit: "kg", reason: "Prep waste", date: isoDaysAgo(5) },
];

export const initialRecipe: RecipeLine[] = [
  { id: "R1", name: "Mozzarella", qty: 0.12, price: 390 },
  { id: "R2", name: "Tomatoes", qty: 0.15, price: 34 },
  { id: "R3", name: "All-purpose flour", qty: 0.18, price: 48 },
  { id: "R4", name: "Olive oil", qty: 0.02, price: 620 },
];

export const weeklySpend = [
  { day: "Mon", spend: 4200 }, { day: "Tue", spend: 5100 }, { day: "Wed", spend: 3900 },
  { day: "Thu", spend: 6200 }, { day: "Fri", spend: 4800 }, { day: "Sat", spend: 7100 }, { day: "Sun", spend: 5600 },
];

export const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export const uid = (p: string) => `${p}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

/** Rough kg-equivalent so mixed units can be totalled (L ≈ kg, pieces ignored). */
export const toKg = (qty: number, unit: string) =>
  unit === "kg" || unit === "L" ? qty : unit === "g" ? qty / 1000 : 0;

export const isLow = (x: InventoryItem) => x.quantity <= x.reorderAt;
export const suggestQty = (x: InventoryItem) => Math.max(+(x.reorderAt * 2 - x.quantity).toFixed(2), 1);
