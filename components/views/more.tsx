"use client";
import { BarChart3, ChevronRight, ChefHat, Leaf, ScanLine, Settings, Sparkles } from "lucide-react";
import { Screen } from "../ui";
import type { Page, ViewProps } from "../types";

export function More({ go, open }: ViewProps) {
  const items: { p: Page; t: string; s: string; icon: React.ReactNode; bg: string }[] = [
    { p: "Assistant", t: "Ask Kooper", s: "Chat about stock, costs and waste", icon: <Sparkles />, bg: "var(--lime)" },
    { p: "Invoices", t: "Scan invoice", s: "Catch price changes", icon: <ScanLine />, bg: "var(--lilac)" },
    { p: "Costing", t: "Plate cost", s: "Price a dish with a slider", icon: <ChefHat />, bg: "var(--sky-soft)" },
    { p: "Waste", t: "Waste", s: "Log and spot patterns", icon: <Leaf />, bg: "var(--mango-soft)" },
    { p: "Reports", t: "This week", s: "Numbers and next steps", icon: <BarChart3 />, bg: "var(--mint-soft)" },
  ];
  return (
    <Screen title="More" sub="Everything else Kooper can do.">
      <div className="menu">
        {items.map((m) => <button key={m.p} onClick={() => go(m.p)}><span className="ico" style={{ background: m.bg }}>{m.icon}</span><div><strong>{m.t}</strong><small>{m.s}</small></div><ChevronRight className="chev" /></button>)}
      </div>
      <div className="menu" style={{ marginTop: 14 }}>
        <button onClick={() => open({ type: "settings" })}><span className="ico" style={{ background: "var(--canvas)" }}><Settings /></span><div><strong>Settings</strong><small>Data and reset</small></div><ChevronRight className="chev" /></button>
      </div>
      <p className="hint">Kooper prepares drafts. It never places an order.</p>
    </Screen>
  );
}