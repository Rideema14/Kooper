import type { KooperData } from "@/lib/store";
export type Page = "Home" | "Stock" | "Orders" | "More" | "Invoices" | "Costing" | "Waste" | "Assistant" | "Reports";
export type PurchasePreset = { item?: string; quantity?: string; unit?: string; supplier?: string; estimated?: string };
export type ModalState =
  | null
  | { type: "stock" }
  | { type: "waste"; item?: string }
  | { type: "purchase"; preset?: PurchasePreset }
  | { type: "settings" }
  | { type: "quick" }
  | { type: "alerts" }
  | { type: "message" };
export type Notify = (text: string, undo?: () => void) => void;
export type ViewProps = { d: KooperData; go: (p: Page) => void; notify: Notify; open: (m: NonNullable<ModalState>) => void };
export type ChatMsg = { role: "bot" | "user"; text: string };