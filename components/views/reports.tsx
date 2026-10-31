"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { isLow, money } from "@/lib/data";
import { CountUp, Ico, Screen, Section } from "../ui";
import type { Page, ViewProps } from "../types";

export function Reports({ d, go, notify }: ViewProps) {
  const [sel, setSel] = useState<string | null>(null);
  const low = d.inventory.filter(isLow);
  const pending = d.purchases.filter((p) => p.status === "Needs approval").length;
  const value = d.inventory.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
  const cat = Object.entries(d.inventory.reduce<Record<string, number>>((m, x) => ((m[x.category] = (m[x.category] || 0) + x.quantity * x.unitPrice), m), {})).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...cat.map((c) => c[1]), 1);
  const [text, setText] = useState("Hello, we’re reviewing our upcoming ingredient requirements. Could you please confirm current prices, stock availability and the earliest delivery slot for our usual items? Please hold off on processing any order until we confirm quantities. Thank you.");
  const acts: { e: string; t: string; s: string; p: Page }[] = [
    { e: "box", t: `${low.length} ingredient${low.length === 1 ? "" : "s"} at reorder level`, s: "Review suggested quantities.", p: "Stock" },
    { e: "note", t: `${pending} order${pending === 1 ? "" : "s"} awaiting approval`, s: "Check supplier, quantity and estimate.", p: "Orders" },
    { e: "bin", t: `${d.waste.length} waste events logged`, s: "Keep logging to see what repeats.", p: "Waste" },
  ];
  return (
    <Screen title="This week" sub="A plain look at your numbers." back={() => go("More")}>
      <section className="hero" style={{ gridTemplateColumns: "1fr" }}>
        <div><p style={{ marginTop: 0 }}>{sel ? `${sel} stock value` : "Stock value on shelves"}</p><h2 style={{ fontSize: 42 }} className="num"><CountUp to={sel ? cat.find((c) => c[0] === sel)![1] : value} format={(n) => money(n)} /></h2></div>
      </section>
      <Section title="Where it sits" aside={<span className="muted" style={{ fontSize: 12.5 }}>tap a bar</span>} />
      <div className="card">
        {cat.map(([n, v], i) => (
          <button key={n} className={`bar-row ${sel === n ? "on" : ""}`} style={{ gridTemplateColumns: "78px 1fr 70px" }} onClick={() => setSel(sel === n ? null : n)}>
            <span>{n}</span><div className="bar-track"><span style={{ width: `${(v / max) * 100}%`, ["--i" as string]: i }} /></div><span className="num muted" style={{ textAlign: "right" }}>{money(v)}</span>
          </button>
        ))}
      </div>
      <Section title="Next steps" />
      <div className="menu">{acts.map((a) => <button key={a.t} onClick={() => go(a.p)}><span className="ico" style={{ background: "var(--canvas)", fontSize: 22 }}><Ico n={a.e} /></span><div><strong style={{ fontSize: 15 }}>{a.t}</strong><small>{a.s}</small></div></button>)}</div>
      <Section title="Supplier follow-up" aside={<button className="btn sm soft" onClick={() => { navigator.clipboard?.writeText(text); notify("Follow-up copied."); }}><Copy /> Copy</button>} />
      <textarea className="field" rows={5} value={text} onChange={(e) => setText(e.target.value)} style={{ lineHeight: 1.6, resize: "none" }} aria-label="Follow-up message" />
    </Screen>
  );
}