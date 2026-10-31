"use client";
import { useState } from "react";
import { ArrowRight, Check, ChefHat, Leaf, ScanLine, Sparkles, Trash2 } from "lucide-react";
import { isLow, isoDaysAgo, money, suggestQty, toKg, uid, weeklySpend, type InventoryItem, type Purchase } from "@/lib/data";
import { CountUp, Ring, Section, emoji, haptic } from "../ui";
import type { ViewProps } from "../types";

export const wasteWindow = (d: ViewProps["d"]) => {
  const a = isoDaysAgo(6), b = isoDaysAgo(13);
  const sum = (f: (x: string) => boolean) => d.waste.filter((w) => f(w.date)).reduce((s, w) => s + toKg(w.quantity, w.unit), 0);
  return { week: sum((x) => x >= a), prior: sum((x) => x < a && x >= b) };
};

export function Overview({ d, go, open, notify }: ViewProps) {
  const [sel, setSel] = useState(weeklySpend.length - 1);
  const low = d.inventory.filter(isLow);
  const queued = new Set(d.purchases.filter((p) => p.status !== "Ordered").map((p) => p.item.toLowerCase()));
  const pending = d.purchases.filter((p) => p.status === "Needs approval").length;
  const health = d.inventory.length ? (d.inventory.length - low.length) / d.inventory.length : 1;
  const { week, prior } = wasteWindow(d);
  const change = prior > 0 ? Math.round(((week - prior) / prior) * 100) : null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const peak = Math.max(...weeklySpend.map((x) => x.spend));
  const total = weeklySpend.reduce((s, x) => s + x.spend, 0);

  const quickOrder = (x: InventoryItem) => {
    const q = suggestQty(x);
    const p: Purchase = { id: uid("PO"), item: x.name, quantity: q, unit: x.unit, supplier: x.supplier, estimated: q * x.unitPrice, status: "Needs approval" };
    d.setPurchases((v) => [p, ...v]); haptic(12);
    notify(`${x.name} added to Orders.`, () => d.setPurchases((v) => v.filter((y) => y.id !== p.id)));
  };

  return (
    <div className="view">
      <header className="screen-head"><div className="sh-text"><h1>{greet}, Olivia</h1><p>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p></div></header>

      <section className="hero">
        <div>
          <h2>{low.length ? `${low.length} ${low.length === 1 ? "thing needs" : "things need"} restocking` : "Pantry looks great"}</h2>
          <p>{pending ? `${pending} order${pending > 1 ? "s are" : " is"} waiting for your OK.` : "No orders waiting on you."}</p>
        </div>
        <Ring value={health} color={health < 0.6 ? "var(--mango)" : "var(--lime)"}><b><CountUp to={health * 100} format={(n) => `${Math.round(n)}%`} /></b><small>stocked</small></Ring>
        <div className="acts">
          <button className="btn lime sm" onClick={() => go("Orders")}>Review orders</button>
          <button className="btn sm" style={{ background: "#ffffff1f" }} onClick={() => go("Assistant")}><Sparkles /> Ask Kooper</button>
        </div>
      </section>

      {low.length > 0 && <>
        <Section title="Running low" aside={<button className="link" onClick={() => go("Stock")}>See stock <ArrowRight /></button>} />
        <div className="hscroll">
          {low.map((x) => (
            <div className="lowcard" key={x.id}>
              <span className="em">{emoji(x.category)}</span>
              <strong>{x.name}</strong>
              <div className="big num">{x.quantity}<small>{x.unit} left</small></div>
              <div className="level" style={{ background: "var(--tomato-soft)" }}><div className="level-fill low" style={{ width: `${Math.max(6, (x.quantity / x.reorderAt) * 50)}%` }} /></div>
              {queued.has(x.name.toLowerCase())
                ? <button className="btn sm done" onClick={() => go("Orders")}><Check /> In orders</button>
                : <button className="btn sm lime" onClick={() => quickOrder(x)}>Add to orders</button>}
            </div>
          ))}
        </div>
      </>}

      <Section title="Spending" />
      <div className="card">
        <div className="spend-top">
          <div><small className="muted" style={{ fontWeight: 600 }}>{weeklySpend[sel].day} · tap a bar</small><div className="fig num"><CountUp to={weeklySpend[sel].spend} format={(n) => money(n)} duration={500} /></div></div>
          <span className="tag">{money(total)} this week</span>
        </div>
        <div className="spark">
          {weeklySpend.map((x, i) => (
            <button key={x.day} className={i === sel ? "on" : ""} onClick={() => { haptic(4); setSel(i); }} aria-label={`${x.day} ${money(x.spend)}`}>
              <i style={{ ["--h" as string]: `${(x.spend / peak) * 100}%`, ["--i" as string]: i }} />{x.day}
            </button>
          ))}
        </div>
      </div>

      <Section title="Jump in" />
      <div className="tiles stagger">
        <button className="tile t-lime" style={{ ["--i" as string]: 0 }} onClick={() => go("Invoices")}><ScanLine /><div><strong>Scan an invoice</strong><span>Catch price changes</span></div></button>
        <button className="tile t-mango" style={{ ["--i" as string]: 1 }} onClick={() => open({ type: "waste" })}><Trash2 /><div><strong>Log waste</strong><span>{week.toFixed(1)} kg this week{change !== null && ` · ${change <= 0 ? "↓" : "↑"}${Math.abs(change)}%`}</span></div></button>
        <button className="tile t-sky" style={{ ["--i" as string]: 2 }} onClick={() => go("Costing")}><ChefHat /><div><strong>Plate cost</strong><span>What a dish really costs</span></div></button>
        <button className="tile t-lilac" style={{ ["--i" as string]: 3 }} onClick={() => go("Waste")}><Leaf /><div><strong>Waste trends</strong><span>Spot what repeats</span></div></button>
      </div>
    </div>
  );
}