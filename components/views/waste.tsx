"use client";
import { useState } from "react";
import { Plus, Undo2 } from "lucide-react";
import { money, toKg } from "@/lib/data";
import { CountUp, Empty, Ico, Screen, Section, SwipeRow, emoji, haptic } from "../ui";
import { wasteWindow } from "./overview";
import type { ViewProps } from "../types";

const fmtDate = (s: string) => new Date(s + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function Waste({ d, open, notify, go }: ViewProps) {
  const [sel, setSel] = useState<string | null>(null);
  const { week } = wasteWindow(d);
  const byItem = Object.entries(d.waste.reduce<Record<string, { kg: number; n: number }>>((m, w) => { const e = (m[w.item] ||= { kg: 0, n: 0 }); e.kg += toKg(w.quantity, w.unit); e.n++; return m; }, {})).sort((a, b) => b[1].kg - a[1].kg);
  const byReason = Object.entries(d.waste.reduce<Record<string, number>>((m, w) => ((m[w.reason] = (m[w.reason] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const repeat = d.dash?.repeatedWaste[0];
  const max = Math.max(...byItem.map(([, v]) => v.kg), 0.1);
  const cat = (n: string) => d.inventory.find((x) => x.name.toLowerCase() === n.toLowerCase())?.category ?? "";
  const log = [...d.waste].sort((a, b) => b.date.localeCompare(a.date)).filter((w) => !sel || w.item === sel);
  const recent = Array.from(new Set([...d.waste.map((w) => w.item), ...d.inventory.map((x) => x.name)])).slice(0, 8);

  const notes = [
    repeat && { i: "repeat", t: `${repeat.name} keeps coming back`, s: `Logged ${repeat.count} times in two weeks (${money(repeat.value)}). Check shelf life and how much you buy at once.` },
    byReason[0] && { i: "compass", t: `Top reason: ${byReason[0][0].toLowerCase()}`, s: ["Spoiled", "Expired"].includes(byReason[0][0]) ? "Look at storage, rotation and order size." : "Use the same reasons each time so the real cause shows." },
    { i: "recycle", t: "Use older stock first", s: "Work the oldest produce into today’s specials before buying more." },
  ].filter(Boolean) as { i: string; t: string; s: string }[];

  return (
    <Screen title="Waste" sub="Log it in two taps. Patterns appear on their own." back={() => go("More")} action={d.can("waste") ? <button className="round-btn" style={{ background: "var(--lime)" }} aria-label="Log waste" onClick={() => open({ type: "waste" })}><Plus /></button> : undefined}>
      <section className="hero" style={{ gridTemplateColumns: "1fr" }}>
        <div><p style={{ marginTop: 0 }}>Last 7 days</p><h2 style={{ fontSize: 44 }} className="num"><CountUp to={week} format={(n) => n.toFixed(1)} /> <span style={{ fontSize: 20, opacity: .7 }}>kg</span></h2></div>
      </section>

      <Section title="Tap to log" />
      <div className="chips">{recent.map((n) => <button key={n} className="chip quick" onClick={() => open({ type: "waste", item: n })}>{emoji(cat(n))} {n}</button>)}</div>

      {byItem.length > 0 && <>
        <Section title="By ingredient" aside={sel ? <button className="link" onClick={() => setSel(null)}>Clear filter</button> : <span className="muted" style={{ fontSize: 12.5 }}>tap to filter</span>} />
        <div className="card">
          {byItem.slice(0, 5).map(([n, v], i) => (
            <button key={n} className={`bar-row ${sel === n ? "on" : ""}`} onClick={() => { haptic(4); setSel(sel === n ? null : n); }}>
              <span>{n}</span><div className="bar-track"><span style={{ width: `${(v.kg / max) * 100}%`, ["--i" as string]: i }} /></div><span className="num muted" style={{ textAlign: "right" }}>{v.kg.toFixed(1)}kg</span>
            </button>
          ))}
        </div>
      </>}

      <Section title={sel ? `${sel} log` : "Recent log"} aside={d.can("purchasing") ? <span className="muted" style={{ fontSize: 12.5 }}>swipe to undo</span> : undefined} />
      <div className="stack">
        {log.map((w, i) => (
          <div key={w.id} style={{ ["--i" as string]: i }}>
            <SwipeRow actions={d.can("purchasing") ? [{ label: "Undo entry", icon: <Undo2 />, tone: "red", onClick: () => { d.act.reverseWaste(w.id).then(() => notify("Entry reversed. Stock was put back.")).catch((e) => notify(e instanceof Error ? e.message : "Couldn’t reverse that entry.")); } }] : []}>
              <div className="wrow"><span className="item-ico">{emoji(cat(w.item))}</span><div className="grow"><strong>{w.item}</strong><small>{w.reason} · {fmtDate(w.date)}</small></div><b className="num">{w.quantity} {w.unit}<small style={{ display: "block", fontWeight: 500, color: "var(--mute)" }}>{money(w.value)}</small></b></div>
            </SwipeRow>
          </div>
        ))}
        {log.length === 0 && <Empty icon="sprout" title="Nothing logged" text="Tap an ingredient above to start." />}
      </div>

      <Section title="What Kooper notices" />
      <div className="card">{notes.map((n) => <div className="insight" key={n.t}><i><Ico n={n.i} /></i><div><b>{n.t}</b><span>{n.s}</span></div></div>)}</div>
    </Screen>
  );
}