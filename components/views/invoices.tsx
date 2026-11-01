"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Camera, FileText, FolderUp, ScanLine, X, AlertTriangle, AlertCircle } from "lucide-react";
import { money } from "@/lib/data";
import { api } from "@/lib/store";
import { Screen, haptic } from "../ui";
import type { ViewProps } from "../types";

type Issue = { code: string; severity: "error" | "warning"; message: string };
type Item = { id?: string; rawName: string; ingredientId: string | null; quantity: number; unit: string | null; unitPrice: number; lineTotal: number };
type Inv = { id: string; status: string; supplierName: string | null; number: string | null; invoiceDate: string | null; dueDate: string | null; subtotal: number | null; tax: number | null; total: number | null; fileName: string | null; createdAt: string; issues: Issue[] | null; items: Item[] };
type Form = { supplierName: string; number: string; invoiceDate: string; dueDate: string; subtotal: string; tax: string; total: string; items: Item[] };

const ok = [".pdf", ".png", ".jpg", ".jpeg", ".csv", ".xlsx"];
const toForm = (i: Inv): Form => ({ supplierName: i.supplierName ?? "", number: i.number ?? "", invoiceDate: i.invoiceDate?.slice(0, 10) ?? "", dueDate: i.dueDate?.slice(0, 10) ?? "", subtotal: i.subtotal == null ? "" : String(i.subtotal), tax: i.tax == null ? "" : String(i.tax), total: i.total == null ? "" : String(i.total), items: i.items.map((x) => ({ ...x, quantity: Number(x.quantity), unitPrice: Number(x.unitPrice), lineTotal: Number(x.lineTotal) })) });
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const tone = (s: string) => (s === "APPROVED" ? "good" : s === "NEEDS_REVIEW" ? "warn" : s === "REJECTED" || s === "FAILED" ? "red" : "");
const label = (s: string) => ({ APPROVED: "Approved", NEEDS_REVIEW: "Needs review", REJECTED: "Rejected", FAILED: "Failed", PROCESSING: "Processing" } as Record<string, string>)[s] ?? s;

export function Invoices({ d, go, notify }: ViewProps) {
  const [list, setList] = useState<Inv[] | null>(null);
  const [cur, setCur] = useState<Inv | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [receive, setReceive] = useState(false);
  const [busy, setBusy] = useState<"" | "upload" | "save" | "approve">("");
  const [over, setOver] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const cam = useRef<HTMLInputElement>(null), docs = useRef<HTMLInputElement>(null);
  const allowed = d.can("invoices");
  const fail = (e: unknown) => notify(e instanceof Error ? e.message : "Something went wrong.");

  const load = useCallback(async () => { try { setList(await api<Inv[]>("GET", "/api/invoices")); } catch (e) { fail(e); setList([]); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (allowed) load(); }, [allowed, load]);
  const open = (i: Inv) => { setCur(i); setForm(toForm(i)); setReceive(false); };
  const close = () => { setCur(null); setForm(null); setFile(null); };

  const pick = async (f?: File | null) => {
    if (!f || busy) return;
    if (!ok.some((e) => f.name.toLowerCase().endsWith(e))) return notify("Please choose a PDF, JPEG, PNG, CSV or XLSX file.");
    if (f.size > 10 * 1024 * 1024) return notify("That file is over 10 MB.");
    setFile(f.name); setBusy("upload"); haptic(8);
    try { const fd = new FormData(); fd.append("file", f); const inv = await api<Inv>("POST", "/api/invoices", fd); open(inv); haptic(14); load(); }
    catch (e) { fail(e); setFile(null); } finally { setBusy(""); }
  };

  const payload = (f: Form) => ({ supplierName: f.supplierName || null, number: f.number || null, invoiceDate: f.invoiceDate || null, dueDate: f.dueDate || null, subtotal: numOrNull(f.subtotal), tax: numOrNull(f.tax), total: numOrNull(f.total), items: f.items.map((x) => ({ rawName: x.rawName, ingredientId: x.ingredientId || null, quantity: x.quantity, unit: x.unit || null, unitPrice: x.unitPrice, lineTotal: x.lineTotal })) });
  const save = async () => {
    if (!cur || !form) return null; setBusy("save");
    try { const inv = await api<Inv>("PATCH", `/api/invoices/${cur.id}`, payload(form)); setCur(inv); load(); return inv; }
    catch (e) { fail(e); return null; } finally { setBusy(""); }
  };
  const approve = async () => {
    if (!cur) return;
    const saved = await save(); if (!saved) return;
    if ((saved.issues ?? []).some((i) => i.severity === "error")) return notify("Fix the highlighted problems before approving.");
    setBusy("approve");
    try { await api("POST", `/api/invoices/${cur.id}/approve`, { receiveIntoStock: receive }); await d.refresh(); notify(receive ? "Approved. Prices updated and stock added." : "Approved. Prices updated; stock unchanged."); haptic(14); close(); load(); }
    catch (e) { fail(e); } finally { setBusy(""); }
  };
  const reject = async () => { if (!cur) return; try { await api("POST", `/api/invoices/${cur.id}/reject`); notify("Invoice rejected. Nothing was changed."); close(); load(); } catch (e) { fail(e); } };

  const setItem = (i: number, patch: Partial<Item>) => form && setForm({ ...form, items: form.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const editable = cur && ["NEEDS_REVIEW", "FAILED"].includes(cur.status);

  if (!allowed) return <Screen title="Scan invoice" sub="Invoices are handled by owners, managers and accountants." back={() => go("More")}><div className="card"><p className="muted">Your role doesn’t include invoices. Ask the owner if you need access.</p></div></Screen>;

  return (
    <Screen title="Scan invoice" sub="Upload, check what was read, then approve." back={() => (cur ? close() : go("More"))}>
      {!cur && <>
        <section className={`scan ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
          <div className="viewfinder">{busy === "upload" && <span className="line" />}<ScanLine /></div>
          <h2>{busy === "upload" ? "Reading your invoice…" : "Bring in a supplier bill"}</h2>
          <p>{busy === "upload" ? file : "PDF, JPEG, PNG, CSV or XLSX up to 10 MB"}</p>
          <div className="acts">
            <button className="btn lime" disabled={!!busy} onClick={() => cam.current?.click()}><Camera /> Take photo</button>
            <button className="btn" style={{ background: "#ffffff22" }} disabled={!!busy} onClick={() => docs.current?.click()}><FolderUp /> Upload file</button>
          </div>
          <input ref={cam} type="file" hidden accept="image/jpeg,image/png" capture="environment" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={docs} type="file" hidden accept={ok.join(",")} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </section>
        {busy === "upload" && <div className="stack" style={{ marginTop: 16 }}><div className="shimmer" /><div className="shimmer" /></div>}
        <div className="sect"><h2>History</h2><span className="tag">{list?.length ?? 0}</span></div>
        <div className="stack">
          {list?.map((i) => (
            <button key={i.id} className="hist" onClick={() => open(i)}>
              <span className="item-ico" style={{ width: 40, height: 40, fontSize: 18 }}><FileText size={18} /></span>
              <div><strong>{i.supplierName ?? i.fileName ?? "Invoice"}</strong><small>{i.number ?? "No number"} · {new Date(i.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</small></div>
              <div style={{ textAlign: "right" }}><b className="num">{i.total != null ? money(Number(i.total)) : "—"}</b><br /><span className={`tag ${tone(i.status)}`}>{label(i.status)}</span></div>
            </button>
          ))}
          {list && list.length === 0 && <p className="muted" style={{ padding: "0 4px" }}>No invoices yet. Upload one to get started. Photos and PDFs are read by Gemini; CSV and XLSX are read locally.</p>}
        </div>
      </>}

      {cur && form && (
        <div style={{ animation: "slide .5s var(--ease)" }} className="stack">
          <div className="sect" style={{ marginTop: 0 }}><h2>{editable ? "Check what was read" : "Invoice"}</h2><span className={`tag ${tone(cur.status)}`}>{label(cur.status)}</span></div>
          {(cur.issues ?? []).map((i, k) => <div key={k} className={`issue ${i.severity}`}>{i.severity === "error" ? <AlertCircle size={18} /> : <AlertTriangle size={18} />}<span>{i.message}</span></div>)}
          {cur.issues?.length === 0 && editable && <div className="issue" style={{ background: "var(--good-soft)", color: "var(--good)" }}>Totals add up and nothing looks unusual.</div>}

          <div className="card form-grid">
            <label className="full"><span className="label">Supplier</span><input className="field" disabled={!editable} value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} /></label>
            <label><span className="label">Invoice no.</span><input className="field" disabled={!editable} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
            <label><span className="label">Date</span><input className="field num" type="date" disabled={!editable} value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} /></label>
            <label><span className="label">Due</span><input className="field num" type="date" disabled={!editable} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
            <label><span className="label">Subtotal</span><input className="field num" type="number" step=".01" disabled={!editable} value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} /></label>
            <label><span className="label">Tax</span><input className="field num" type="number" step=".01" disabled={!editable} value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></label>
            <label><span className="label">Grand total</span><input className="field num" type="number" step=".01" disabled={!editable} value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} /></label>
          </div>

          {form.items.map((l, i) => {
            const ing = d.inventory.find((x) => x.id === l.ingredientId);
            const diff = ing ? l.unitPrice - ing.unitPrice : 0;
            return (
              <div className="inv-line" key={l.id ?? i}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <b>{l.rawName}</b>
                  {ing && diff !== 0 && <span className={`delta ${diff > 0 ? "up" : "down"}`}>{diff > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}was {money(ing.unitPrice)}</span>}
                </div>
                <label><span>Linked ingredient</span>
                  <select className="field compact" disabled={!editable} value={l.ingredientId ?? ""} onChange={(e) => setItem(i, { ingredientId: e.target.value || null })}>
                    <option value="">Not linked — won’t change prices or stock</option>
                    {d.inventory.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
                  </select>
                </label>
                <div className="row3">
                  <label><span>Qty{l.unit ? ` (${l.unit})` : ""}</span><input className="field compact num" type="number" step=".001" disabled={!editable} value={l.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} /></label>
                  <label><span>Unit price</span><input className="field compact num" type="number" step=".01" disabled={!editable} value={l.unitPrice} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} /></label>
                  <label><span>Line total</span><input className="field compact num" type="number" step=".01" disabled={!editable} value={l.lineTotal} onChange={(e) => setItem(i, { lineTotal: Number(e.target.value) })} /></label>
                </div>
              </div>
            );
          })}

          {editable && <>
            <label className="issue" style={{ background: "var(--canvas)", cursor: "pointer" }}>
              <input type="checkbox" checked={receive} onChange={(e) => setReceive(e.target.checked)} style={{ marginTop: 3 }} />
              <span><b>Also add these quantities to stock</b><br /><small className="muted">Leave unticked if you’ve already received these goods against an order — otherwise stock would be counted twice.</small></span>
            </label>
            <button className="btn lime block" disabled={!!busy} onClick={approve}>{busy === "approve" ? "Approving…" : "Approve and update prices"}</button>
            <button className="btn soft block" disabled={!!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save corrections"}</button>
            <button className="btn soft block" disabled={!!busy} onClick={reject}><X /> Reject invoice</button>
            <p className="hint">Nothing changes in your stock or prices until you approve.</p>
          </>}
        </div>
      )}
    </Screen>
  );
}
