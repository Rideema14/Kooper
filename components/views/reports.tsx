"use client";
import { useEffect, useState } from "react";
import { Copy, Download } from "lucide-react";
import { money } from "@/lib/data";
import { api, type Dash } from "@/lib/store";
import { CountUp, Ico, Screen, Section } from "../ui";
import type { Page, ViewProps } from "../types";

const RANGES = [{ k: 7, t: "7 days" }, { k: 30, t: "30 days" }, { k: 90, t: "90 days" }] as const;

export function Reports({ d, go, notify }: ViewProps) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [r, setR] = useState<Dash | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const allowed = d.can("reports");
  const from = new Date(Date.now() - days * 864e5).toISOString();

  useEffect(() => {
    let live = true;
    api<Dash>("GET", `/api/dashboard?from=${encodeURIComponent(from)}`).then((x) => live && setR(x)).catch((e) => notify(e instanceof Error ? e.message : "Couldn’t load the report."));
    return () => { live = false; };
  }, [days, d.inventory.length, d.waste.length, d.purchases.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = d.purchases.filter((p) => p.status === "Needs approval").length;
  const cat = r?.categoryValue.map((c) => [c.category, c.value] as const) ?? [];
  const max = Math.max(...cat.map((c) => c[1]), 1);
  const [text, setText] = useState("Hello, we’re reviewing our upcoming ingredient requirements. Could you please confirm current prices, stock availability and the earliest delivery slot for our usual items? Please hold off on processing any order until we confirm quantities. Thank you.");
  const acts: { e: string; t: string; s: string; p: Page }[] = [
    { e: "box", t: `${r?.lowStockCount ?? 0} ingredient${r?.lowStockCount === 1 ? "" : "s"} at reorder level`, s: "Review suggested quantities.", p: "Stock" },
    { e: "note", t: `${pending} order${pending === 1 ? "" : "s"} awaiting approval`, s: "Check supplier, quantity and estimate.", p: "Orders" },
    { e: "bin", t: `${r?.wasteByReason.reduce((s, w) => s + w.count, 0) ?? 0} waste events in this period`, s: "Keep logging to see what repeats.", p: "Waste" },
  ];
  const q = `from=${encodeURIComponent(from)}`;

  if (!allowed) return <Screen title="Reports" sub="Reports are for owners, managers and accountants." back={() => go("More")}><div className="card"><p className="muted">Your role doesn’t include reports.</p></div></Screen>;

  return (
    <Screen title="Reports" sub="Figures come straight from your records." back={() => go("More")}>
      <div className="chips" style={{ marginBottom: 14 }}>{RANGES.map((x) => <button key={x.k} className={`chip ${days === x.k ? "on" : "quick"}`} onClick={() => setDays(x.k)}>Last {x.t}</button>)}</div>
      <section className="hero" style={{ gridTemplateColumns: "1fr" }}>
        <div><p style={{ marginTop: 0 }}>{sel ? `${sel} stock value` : "Stock value on shelves"}</p><h2 style={{ fontSize: 42 }} className="num"><CountUp to={sel ? (cat.find((c) => c[0] === sel)?.[1] ?? 0) : r?.inventoryValue ?? 0} format={(n) => money(n)} /></h2></div>
      </section>
      <div className="trio" style={{ marginTop: 14 }}>
        <div><b>{money(r?.purchaseSpend ?? 0)}</b><span>Received</span></div>
        <div><b>{money(r?.wasteCost ?? 0)}</b><span>Waste</span></div>
        <div><b>{r?.foodCostPct == null ? "—" : `${r.foodCostPct}%`}</b><span>Food cost</span></div>
      </div>

      <Section title="Where it sits" aside={<span className="muted" style={{ fontSize: 12.5 }}>tap a bar</span>} />
      <div className="card">
        {cat.length === 0 && <p className="muted">Add stock to see its value by category.</p>}
        {cat.map(([n, v], i) => (
          <button key={n} className={`bar-row ${sel === n ? "on" : ""}`} style={{ gridTemplateColumns: "78px 1fr 70px" }} onClick={() => setSel(sel === n ? null : n)}>
            <span>{n}</span><div className="bar-track"><span style={{ width: `${(v / max) * 100}%`, ["--i" as string]: i }} /></div><span className="num muted" style={{ textAlign: "right" }}>{money(v)}</span>
          </button>
        ))}
      </div>

      {r && r.priceTrends.length > 0 && <>
        <Section title="Price changes" />
        <div className="card">{r.priceTrends.slice(0, 6).map((t) => <div className="team-row" key={t.name}><span>{t.name}</span><span className="num">{money(t.first)} → {money(t.last)} <span className={`tag ${(t.changePct ?? 0) > 0 ? "red" : "good"}`}>{(t.changePct ?? 0) > 0 ? "+" : ""}{t.changePct}%</span></span></div>)}</div>
      </>}

      {r && r.recipeProfitability.length > 0 && <>
        <Section title="Dish profitability" />
        <div className="card">{r.recipeProfitability.map((x) => <div className="team-row" key={x.id}><span>{x.name}<small className="muted"> · {money(x.grossProfit)} profit</small></span><span className={`tag ${x.foodCostPct <= 30 ? "good" : x.foodCostPct <= 35 ? "warn" : "red"}`}>{x.foodCostPct}% food cost</span></div>)}</div>
      </>}

      {r && r.supplierPerformance.some((s) => s.orders > 0) && <>
        <Section title="Suppliers" />
        <div className="card">{r.supplierPerformance.filter((s) => s.orders > 0).map((s) => <div className="team-row" key={s.id}><span>{s.name}<small className="muted"> · {s.orders} order{s.orders > 1 ? "s" : ""} · {money(s.ordered)}</small></span><span className="tag">{s.fulfilmentPct ?? 0}% delivered</span></div>)}</div>
      </>}

      {r && Object.keys(r.invoiceStatus).length > 0 && <>
        <Section title="Invoices" />
        <div className="card">{Object.entries(r.invoiceStatus).map(([k, v]) => <div className="team-row" key={k}><span>{k.replace("_", " ").toLowerCase()}</span><span className="num">{v.count} · {money(v.total)}</span></div>)}</div>
      </>}

      <Section title="Next steps" />
      <div className="menu">{acts.map((a) => <button key={a.t} onClick={() => go(a.p)}><span className="ico" style={{ background: "var(--canvas)", fontSize: 22 }}><Ico n={a.e} /></span><div><strong style={{ fontSize: 15 }}>{a.t}</strong><small>{a.s}</small></div></button>)}</div>

      <Section title="Download" />
      <div className="pill-row">
        {[["inventory", "csv", "Stock CSV"], ["movements", "csv", "Ledger CSV"], ["waste", "csv", "Waste CSV"], ["purchases", "csv", "Orders CSV"], ["invoices", "csv", "Invoices CSV"], ["all", "xlsx", "Excel"], ["all", "pdf", "PDF"]].map(([k, f, t]) => (
          <a key={t} className="btn soft sm" style={{ textDecoration: "none" }} href={`/api/reports/export?kind=${k}&format=${f}&${q}`}><Download /> {t}</a>
        ))}
      </div>

      <Section title="Supplier follow-up" aside={<button className="btn sm soft" onClick={() => { navigator.clipboard?.writeText(text); notify("Follow-up copied."); }}><Copy /> Copy</button>} />
      <textarea className="field" rows={5} value={text} onChange={(e) => setText(e.target.value)} style={{ lineHeight: 1.6, resize: "none" }} aria-label="Follow-up message" />
    </Screen>
  );
}
