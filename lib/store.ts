"use client";
import { useCallback, useEffect, useState } from "react";
import {
  initialInventory, initialPurchases, initialRecipe, initialWaste,
  type InventoryItem, type Purchase, type RecipeLine, type WasteEntry,
} from "./data";

const KEY = "kooper:v2";
export type RecipeMeta = { name: string; price: number; servings: number };
const defaultMeta: RecipeMeta = { name: "Margherita pizza", price: 299, servings: 1 };
type Persisted = { inventory: InventoryItem[]; purchases: Purchase[]; waste: WasteEntry[]; recipe: RecipeLine[]; meta: RecipeMeta };

/** All app data lives here. Loads once on the client, then saves on every change. */
export function useKooperData() {
  const [ready, setReady] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>(initialInventory);
  const [purchases, setPurchases] = useState<Purchase[]>(initialPurchases);
  const [waste, setWaste] = useState<WasteEntry[]>([]);
  const [recipe, setRecipe] = useState<RecipeLine[]>(initialRecipe);
  const [meta, setMeta] = useState<RecipeMeta>(defaultMeta);

  useEffect(() => {
    let loaded = false;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<Persisted>;
        if (d.inventory) setInventory(d.inventory);
        if (d.purchases) setPurchases(d.purchases);
        if (d.waste) setWaste(d.waste);
        if (d.recipe) setRecipe(d.recipe);
        if (d.meta) setMeta(d.meta);
        loaded = !!d.waste;
      }
    } catch {}
    if (!loaded) setWaste(initialWaste());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify({ inventory, purchases, waste, recipe, meta })); } catch {}
  }, [ready, inventory, purchases, waste, recipe, meta]);

  const reset = useCallback(() => {
    setInventory(initialInventory); setPurchases(initialPurchases);
    setWaste(initialWaste()); setRecipe(initialRecipe); setMeta(defaultMeta);
  }, []);

  return { ready, inventory, setInventory, purchases, setPurchases, waste, setWaste, recipe, setRecipe, meta, setMeta, reset };
}
export type KooperData = ReturnType<typeof useKooperData>;
