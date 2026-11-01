"use client";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { money } from "@/lib/data";
import { api } from "@/lib/store";
import { CountUp, Ring, Screen, Segmented, haptic } from "../ui";
import type { ViewProps } from "../types";

type Line = { key: string; ingredientId: string; name: string; qty: number };
type Draft = { id: string | null; name: string; price: number; servings: number; lines: Line[] };
type Hist = { id: string; createdAt: string; meta: { from: string | null; to: string } };
const blank = (): Draft => ({ id: null, name: "", price: 299, servings: 1, lines: [] });
let k = 0; const nk = () => `l${++k}`;

export function Costing({ d, go, notify }: ViewProps) {
  const [draft, setDraft] = useState<Draft>(blank());
  const [target, setTarget] = useState<"25%" | "30%" | "35%">("30%");
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<Hist[]>([]);
  const canEdit = d.can("recipes");
  const fail = (e: unknown) => notify(e instanceof Error ? e.message : "Something went wrong.");

  const load = (id: string) => {
    const r = d.recipes.find((x) => x.id === id); if (!r) return;
    setDraft({ id: r.id, name: r.name, price: Number(r.sellingPrice), servings: r.servings, lines: r.lines.map((l) => ({ key: nk(), ingredientId: l.ingredientId, name: l.ingredient.name, qty: Number(l.quantity) })) });
  };
  useEffect(() => { if (d.ready && !draft.id && d.recipes.length && draft.lines.length === 0 && !draft.name) load(d.recipes[0].id); }, [d.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!draft.id || !canEdit) { setHist([]); return; } api<Hist[]>("GET", `/api/recipes/${draft.id}/history`).then(setHist).catch(() => setHist([])); }, [draft.id, d.recipes, canEdit]);

  const priceOf = (ingredientId: string) => d.inventory.find((x) => x.id === ingredientId)?.unitPrice ?? 0;
  const unitOf = (ingredientId: string) => d.inventory.find((x) => x.id === ingredientId)?.unit ?? "";
  const T = parseInt(target);
  const per = useMemo(() => draft.lines.reduce((s, l) => s + l.qty * priceOf(l.ingredientId), 0), [draft.lines, d.inventory]); // eslint-disable-line react-hooks/exhaustive-deps
  const servings = Math.max(draft.servings || 1, 1);
  const pct = draft.price > 0 ? (per / draft.price) * 100 : 0;
  const suggested = Math.ceil(per / (T / 100) / 5) * 5;
  const good = pct <= T, watch = pct <= T + 5;
  const verdict = pct === 0 ? "Set a menu price" : good ? "Healthy margin" : watch ? "Worth watching" : "Running high";
  const color = good ? "var(--lime)" : watch ? "var(--mango)" : "#ff8a70";
  const upd = (key: string, patch: Partial<Line>) => setDraft((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const pickName = (key: string, name: string) => { const hit = d.inventory.find((x) => x.name.toLowerCase() === name.toLowerCase()); upd(key, hit ? { name: hit.name, ingredientId: hit.id } : { name, ingredientId: "" }); };
  const max = Math.max(1000, draft.price);

  const save = async () => {
    if (!draft.name.trim()) return notify("Give the dish a name.");
    const bad = draft.lines.find((l) => !l.ingredientId || !(l.qty > 0));
    if (bad) return notify("Every line needs an ingredient from your stock list and a quantity.");
    setBusy(true);
    try { const r = await d.act.saveRecipe(draft.id, { name: draft.name.trim(), servings: draft.servings, sellingPrice: draft.price, lines: draft.lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.qty })) }); setDraft((x) => ({ ...x, id: r.id })); haptic(12); notify("Dish saved."); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const remove = async () => { if (!draft.id) return setDraft(blank()); try { await d.act.deleteRecipe(draft.id); setDraft(blank()); notify("Dish archived."); } catch (e) { fail(e); } };

  return (
    <Screen title="Plate cost" sub="Slide the price and watch your margin move." back={() => go("More")}>
      <div className="chips" style={{ marginBottom: 12 }}>
        {d.recipes.map((r) => <button key={r.id} className={`chip ${draft.id === r.id ? "on" : "quick"}`} onClick={() => { haptic(4); load(r.id); }}>{r.name} · {Number(r.foodCostPct)}%</button>)}
        {canEdit && <button className="chip quick" onClick={() => setDraft(blank())}><Plus size={14} style={{ verticalAlign: -2 }} /> New dish</button>}
      </div>
      <section className="plate">
        <div className="plate-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <input className="name" disabled={!canEdit} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Dish name" placeholder="Dish name" />
            <div className="figure num"><CountUp to={per} format={(n) => money(n)} /></div>
            <small>ingredients per plate{servings > 1 && ` · ${money(per * servings)} for ${servings}`}</small>
          </div>
          <Ring value={Math.min(1, pct / 50)} color={color} size={96}><b>{pct.toFixed(0)}%</b><small>food cost</small></Ring>
        </div>
        <div className="slider-wrap">
          <div className="row"><span>Menu price</span><b className="num">{money(draft.price)}</b></div>
          <input className="range" type="range" min={50} max={max} step={5} disabled={!canEdit} value={draft.price} style={{ ["--p" as string]: `${((draft.price - 50) / (max - 50)) * 100}%` }} aria-label="Menu price" onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
        </div>
        <div className="verdict"><b>{verdict}</b><span>Gross profit {money(Math.max(draft.price - per, 0))} / plate</span></div>
        <div style={{ marginTop: 14 }}><Segmented options={["25%", "30%", "35%"]} value={target} onChange={setTarget} /></div>
        {canEdit && per > 0 && !good && <button className="btn lime block" style={{ marginTop: -2 }} onClick={() => { haptic(10); setDraft({ ...draft, price: suggested }); }}>Set price to {money(suggested)} for {T}%</button>}
      </section>

      <div className="sect"><h2>Ingredients</h2><span className="tag">per plate</span></div>
      <datalist id="inv-names">{d.inventory.map((x) => <option key={x.id} value={x.name} />)}</datalist>
      <div className="stack">
        {draft.lines.map((x) => (
          <div className="ing" key={x.key}>
            <input className="field compact" list="inv-names" disabled={!canEdit} value={x.name} placeholder="Ingredient" onChange={(e) => pickName(x.key, e.target.value)} aria-label="Ingredient" />
            {canEdit && <button className="round-btn" style={{ width: 38, height: 38 }} aria-label={`Remove ${x.name}`} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((l) => l.key !== x.key) })}><X /></button>}
            <div className="mini">
              <label><span>Qty {unitOf(x.ingredientId) && `(${unitOf(x.ingredientId)})`}</span><span className="qty" style={{ display: "flex" }}>
                <button aria-label="Less" disabled={!canEdit} onClick={() => { haptic(4); upd(x.key, { qty: Math.max(0, +(x.qty - 0.01).toFixed(3)) }); }}><Minus /></button>
                <input className="field compact num" style={{ textAlign: "center", background: "transparent", padding: "6px" }} type="number" step=".001" min="0" disabled={!canEdit} value={x.qty} onChange={(e) => upd(x.key, { qty: Number(e.target.value) })} aria-label="Quantity" />
                <button aria-label="More" disabled={!canEdit} onClick={() => { haptic(4); upd(x.key, { qty: +(x.qty + 0.01).toFixed(3) }); }}><Plus /></button></span></label>
              <label><span>₹ / unit (from stock)</span><input className="field compact num" readOnly value={priceOf(x.ingredientId)} aria-label="Price per unit" /></label>
              <div className="cost num" style={{ alignSelf: "end", paddingBottom: 8 }}>{money(x.qty * priceOf(x.ingredientId))}</div>
            </div>
          </div>
        ))}
        {canEdit && <button className="btn soft block" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { key: nk(), ingredientId: "", name: "", qty: 0.1 }] })}><Plus /> Add ingredient</button>}
      </div>
      <label style={{ display: "block", marginTop: 16 }}><span className="label">Servings in this batch</span><input className="field num" type="number" min="1" disabled={!canEdit} value={draft.servings} onChange={(e) => setDraft({ ...draft, servings: Math.max(1, Number(e.target.value)) })} /></label>
      {canEdit && <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn lime block" disabled={busy} onClick={save}>{busy ? "Saving…" : draft.id ? "Save changes" : "Save dish"}</button>
        {draft.id && <button className="btn soft block" onClick={remove}>Archive this dish</button>}
      </div>}
      {hist.length > 0 && <p className="hint">Price history: {hist.slice(0, 5).map((h) => `${h.meta.from ? money(Number(h.meta.from)) + " → " : ""}${money(Number(h.meta.to))} (${new Date(h.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })})`).join(" · ")}</p>}
      <p className="hint">Ingredients only. Costs follow your latest approved ingredient prices. Labour, utilities, packaging and tax aren’t included.</p>
    </Screen>
  );
}
