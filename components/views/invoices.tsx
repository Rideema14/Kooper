"use client";
import { useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Camera, Check, FileText, FolderUp, ScanLine, X } from "lucide-react";
import { money } from "@/lib/data";
import { Screen, haptic } from "../ui";
import type { ViewProps } from "../types";

type Line = { ingredient: string; quantity: number; unit: string; unitPrice: number; total: number };
type Result = { filename: string; warning: string; extracted: Line[] };
const ok = [".pdf", ".png", ".jpg", ".jpeg", ".heic", ".csv", ".xlsx"];

export function Invoices({ d, go, notify }: ViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const cam = useRef<HTMLInputElement>(null), docs = useRef<HTMLInputElement>(null);
  const was = (n: string) => d.inventory.find((x) => x.name.toLowerCase() === n.toLowerCase())?.unitPrice;

  const pick = (f?: File | null) => {
    if (!f) return;
    if (!ok.some((e) => f.name.toLowerCase().endsWith(e))) return notify("Please choose a PDF, photo, CSV or XLSX file.");
    if (f.size > 10 * 1024 * 1024) return notify("That file is over 10 MB.");
    setFile(f); setRes(null); haptic(8); extract(f);
  };
  const extract = async (f: File) => {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const [r] = await Promise.all([fetch("/api/invoices", { method: "POST", body: fd }), new Promise((s) => setTimeout(s, 1400))]);
      const j: Result = await r.json();
      if (!r.ok) throw new Error((j as unknown as { error: string }).error);
      setRes(j); haptic(14);
      setChosen(new Set(j.extracted.filter((l) => { const w = was(l.ingredient); return w !== undefined && w !== l.unitPrice; }).map((l) => l.ingredient)));
    } catch (e) { notify(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  };
  const toggle = (n: string) => { haptic(4); setChosen((s) => { const c = new Set(s); c.has(n) ? c.delete(n) : c.add(n); return c; }); };
  const apply = () => {
    if (!res) return;
    const pick = res.extracted.filter((l) => chosen.has(l.ingredient));
    const before = d.inventory;
    d.setInventory((v) => v.map((x) => { const l = pick.find((e) => e.ingredient.toLowerCase() === x.name.toLowerCase()); return l ? { ...x, unitPrice: l.unitPrice, updated: "Just now" } : x; }));
    notify(pick.length ? `Updated ${pick.length} price${pick.length > 1 ? "s" : ""}.` : "No prices changed.", pick.length ? () => d.setInventory(before) : undefined);
    setRes(null); setFile(null);
  };

  return (
    <Screen title="Scan invoice" sub="Snap or upload. Check the prices before saving." back={() => go("More")}>
      <section className={`scan ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <div className="viewfinder">{busy && <span className="line" />}<ScanLine /></div>
        <h2>{busy ? "Reading your invoice…" : "Bring in a supplier bill"}</h2>
        <p>{busy ? file?.name : "Photos, PDFs, CSV or XLSX up to 10 MB"}</p>
        <div className="acts">
          <button className="btn lime" disabled={busy} onClick={() => cam.current?.click()}><Camera /> Take photo</button>
          <button className="btn" style={{ background: "#ffffff22" }} disabled={busy} onClick={() => docs.current?.click()}><FolderUp /> Upload file</button>
        </div>
        <input ref={cam} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={docs} type="file" hidden accept={ok.join(",")} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </section>

      {file && !busy && !res && (
        <div className="file"><span className="item-ico" style={{ width: 40, height: 40, fontSize: 18 }}><FileText size={18} /></span><div style={{ flex: 1, minWidth: 0 }}><strong>{file.name}</strong><small className="muted">{(file.size / 1024).toFixed(0)} KB</small></div><button className="round-btn" aria-label="Remove" onClick={() => setFile(null)}><X /></button></div>
      )}
      {busy && <div className="stack" style={{ marginTop: 16 }}><div className="shimmer" /><div className="shimmer" /><div className="shimmer" /></div>}

      {res && !busy && (
        <div style={{ marginTop: 22, animation: "slide .5s var(--ease)" }}>
          <div className="sect" style={{ marginTop: 0 }}><h2>Check the prices</h2><span className="tag warn">Review needed</span></div>
          <p className="muted" style={{ fontSize: 13.5, margin: "-4px 2px 12px" }}>{res.warning} Tap a line to include it.</p>
          <div className="stack">
            {res.extracted.map((l, i) => {
              const w = was(l.ingredient), diff = w ? l.unitPrice - w : 0, on = chosen.has(l.ingredient);
              return (
                <button key={l.ingredient} className={`pick ${on ? "on" : ""}`} style={{ ["--i" as string]: i }} onClick={() => toggle(l.ingredient)} aria-pressed={on}>
                  <span className="check"><Check /></span>
                  <div className="item-main"><div className="item-title">{l.ingredient}</div><div className="item-sub" style={{ margin: 0 }}>{l.quantity} {l.unit} · {money(l.total)}</div></div>
                  <div style={{ textAlign: "right" }}>
                    <b className="num" style={{ fontFamily: "var(--display)", fontSize: 17 }}>{money(l.unitPrice)}</b>
                    {w !== undefined && diff !== 0 ? <div className={`delta ${diff > 0 ? "up" : "down"}`}>{diff > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}was {money(w)}</div> : <div className="delta muted">no change</div>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn lime block" onClick={apply}>{chosen.size ? `Update ${chosen.size} price${chosen.size > 1 ? "s" : ""}` : "Save without changes"}</button>
            <button className="btn soft block" onClick={() => { setRes(null); setFile(null); notify("Marked reviewed. Nothing was saved."); }}>Mark reviewed only</button>
          </div>
        </div>
      )}
    </Screen>
  );
}