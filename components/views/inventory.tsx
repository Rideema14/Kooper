"use client";
import { useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { isLow, money, suggestQty, type InventoryItem } from "@/lib/data";
import { Empty, Level, Screen, SwipeRow, emoji, haptic, insertAt } from "../ui";
import type { ViewProps } from "../types";

export function Inventory({ d, open, notify }: ViewProps) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  const [openId, setOpenId] = useState<string | null>(null);
  const low = d.inventory.filter(isLow);
  const value = d.inventory.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
  const cats = useMemo(() => Array.from(new Set(d.inventory.map((x) => x.category))), [d.inventory]);
  const rows = d.inventory.filter((x) => {
    const hit = `${x.name} ${x.category} ${x.supplier}`.toLowerCase().includes(q.toLowerCase());
    return hit && (filter === "All" ? true : filter === "Low" ? isLow(x) : x.category === filter);
  });
  const patch = (id: string, f: (x: InventoryItem) => Partial<InventoryItem>) => d.setInventory((v) => v.map((x) => (x.id === id ? { ...x, ...f(x), updated: "Just now" } : x)));
  const adjust = (id: string, delta: number) => { haptic(5); patch(id, (x) => ({ quantity: Math.max(0, +(x.quantity + delta).toFixed(2)) })); };
  const order = (x: InventoryItem) => open({ type: "purchase", preset: { item: x.name, quantity: String(suggestQty(x)), unit: x.unit, supplier: x.supplier, estimated: String(suggestQty(x) * x.unitPrice) } });
  const remove = (x: InventoryItem) => {
    const i = d.inventory.findIndex((y) => y.id === x.id);
    d.setInventory((v) => v.filter((y) => y.id !== x.id));
    notify(`${x.name} removed.`, () => d.setInventory((v) => insertAt(v, i, x)));
  };

  return (
    <Screen title="Stock" sub="Tap a card for details. Swipe it left for shortcuts." action={<button className="round-btn" style={{ background: "var(--lime)" }} aria-label="Add ingredient" onClick={() => open({ type: "stock" })}><Plus /></button>}>
      <div className="trio">
        <div><b>{d.inventory.length}</b><span>Items</span></div>
        <div><b style={{ color: low.length ? "var(--tomato)" : undefined }}>{low.length}</b><span>Running low</span></div>
        <div><b>{money(value)}</b><span>On shelves</span></div>
      </div>
      <div className="search"><Search /><input placeholder="Search ingredients or suppliers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stock" /></div>
      <div className="chips" style={{ marginBottom: 14 }}>{["All", "Low", ...cats].map((c) => <button key={c} className={`chip ${filter === c ? "on" : ""}`} onClick={() => { haptic(4); setFilter(c); }}>{c === "Low" ? `Low · ${low.length}` : c}</button>)}</div>

      <div className="stack">
        {rows.map((x, i) => (
          <div key={x.id} style={{ ["--i" as string]: i }} className={isLow(x) ? "is-low" : ""}>
            <SwipeRow actions={[{ label: "Order", icon: <ShoppingCart />, tone: "lime", onClick: () => order(x) }, { label: "Delete", icon: <Trash2 />, tone: "red", onClick: () => remove(x) }]}>
              <div className="item" onClick={() => setOpenId(openId === x.id ? null : x.id)}>
                <span className="item-ico">{emoji(x.category)}</span>
                <div className="item-main">
                  <div className="item-title">{x.name}{isLow(x) && <span className="tag red">Low</span>}</div>
                  <div className="item-sub">{x.supplier}</div>
                  <Level qty={x.quantity} reorder={x.reorderAt} />
                </div>
                <div className="qty" onClick={(e) => e.stopPropagation()}>
                  <button aria-label={`Decrease ${x.name}`} onClick={() => adjust(x.id, -1)}><Minus /></button>
                  <span className="num">{x.quantity}<small>{x.unit}</small></span>
                  <button aria-label={`Increase ${x.name}`} onClick={() => adjust(x.id, 1)}><Plus /></button>
                </div>
              </div>
              {openId === x.id && (
                <div className="item-more">
                  <div>Price<b className="num">{money(x.unitPrice)}/{x.unit}</b></div>
                  <div>Updated<b>{x.updated}</b></div>
                  <div className="full"><span>Reorder at<b className="num">{x.reorderAt} {x.unit}</b></span>
                    <span className="qty"><button aria-label="Lower reorder level" onClick={() => patch(x.id, (y) => ({ reorderAt: Math.max(0, y.reorderAt - 1) }))}><Minus /></button><button aria-label="Raise reorder level" onClick={() => patch(x.id, (y) => ({ reorderAt: y.reorderAt + 1 }))}><Plus /></button></span>
                  </div>
                </div>
              )}
            </SwipeRow>
          </div>
        ))}
        {rows.length === 0 && <Empty icon="search" title="Nothing matches" text="Try another search or filter." />}
      </div>
    </Screen>
  );
}