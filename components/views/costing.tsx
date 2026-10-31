"use client";
import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { money, uid } from "@/lib/data";
import { CountUp, Ring, Screen, Segmented, haptic } from "../ui";
import type { ViewProps } from "../types";

export function Costing({ d, go }: ViewProps) {
  const { recipe, setRecipe, meta, setMeta } = d;
  const [target, setTarget] = useState<"25%" | "30%" | "35%">("30%");
  const T = parseInt(target);
  const per = recipe.reduce((s, x) => s + x.qty * x.price, 0);
  const servings = Math.max(meta.servings || 1, 1);
  const pct = meta.price > 0 ? (per / meta.price) * 100 : 0;
  const suggested = Math.ceil(per / (T / 100) / 5) * 5;
  const good = pct <= T, watch = pct <= T + 5;
  const verdict = pct === 0 ? "Set a menu price" : good ? "Healthy margin" : watch ? "Worth watching" : "Running high";
  const color = good ? "var(--lime)" : watch ? "var(--mango)" : "#ff8a70";
  const upd = (id: string, patch: Partial<(typeof recipe)[number]>) => setRecipe((a) => a.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const pickName = (id: string, name: string) => { const hit = d.inventory.find((x) => x.name.toLowerCase() === name.toLowerCase()); upd(id, hit ? { name, price: hit.unitPrice } : { name }); };
  const max = Math.max(1000, meta.price);

  return (
    <Screen title="Plate cost" sub="Slide the price and watch your margin move." back={() => go("More")}>
      <section className="plate">
        <div className="plate-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <input className="name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} aria-label="Dish name" placeholder="Dish name" />
            <div className="figure num"><CountUp to={per} format={(n) => money(n)} /></div>
            <small>ingredients per plate{servings > 1 && ` · ${money(per * servings)} for ${servings}`}</small>
          </div>
          <Ring value={Math.min(1, pct / 50)} color={color} size={96}><b>{pct.toFixed(0)}%</b><small>food cost</small></Ring>
        </div>
        <div className="slider-wrap">
          <div className="row"><span>Menu price</span><b className="num">{money(meta.price)}</b></div>
          <input className="range" type="range" min={50} max={max} step={5} value={meta.price} style={{ ["--p" as string]: `${((meta.price - 50) / (max - 50)) * 100}%` }} aria-label="Menu price" onChange={(e) => setMeta({ ...meta, price: Number(e.target.value) })} />
        </div>
        <div className="verdict"><b>{verdict}</b><span>Margin {money(Math.max(meta.price - per, 0))} / plate</span></div>
        <div style={{ marginTop: 14 }}><Segmented options={["25%", "30%", "35%"]} value={target} onChange={setTarget} /></div>
        {per > 0 && !good && <button className="btn lime block" style={{ marginTop: -2 }} onClick={() => { haptic(10); setMeta({ ...meta, price: suggested }); }}>Set price to {money(suggested)} for {T}%</button>}
      </section>

      <div className="sect"><h2>Ingredients</h2><span className="tag">per plate</span></div>
      <datalist id="inv-names">{d.inventory.map((x) => <option key={x.id} value={x.name} />)}</datalist>
      <div className="stack">
        {recipe.map((x) => (
          <div className="ing" key={x.id}>
            <input className="field compact" list="inv-names" value={x.name} placeholder="Ingredient" onChange={(e) => pickName(x.id, e.target.value)} aria-label="Ingredient" />
            <button className="round-btn" style={{ width: 38, height: 38 }} aria-label={`Remove ${x.name}`} onClick={() => setRecipe((a) => a.filter((v) => v.id !== x.id))}><X /></button>
            <div className="mini">
              <label><span>Qty</span><span className="qty" style={{ display: "flex" }}><button aria-label="Less" onClick={() => { haptic(4); upd(x.id, { qty: Math.max(0, +(x.qty - 0.01).toFixed(3)) }); }}><Minus /></button><input className="field compact num" style={{ textAlign: "center", background: "transparent", padding: "6px 0" }} type="number" inputMode="decimal" min="0" step=".01" value={x.qty} onChange={(e) => upd(x.id, { qty: Number(e.target.value) })} aria-label="Quantity" /><button aria-label="More" onClick={() => { haptic(4); upd(x.id, { qty: +(x.qty + 0.01).toFixed(3) }); }}><Plus /></button></span></label>
              <label><span>₹ / unit</span><input className="field compact num" type="number" inputMode="decimal" min="0" value={x.price} onChange={(e) => upd(x.id, { price: Number(e.target.value) })} aria-label="Price per unit" /></label>
              <div className="cost num" style={{ alignSelf: "end", paddingBottom: 8 }}>{money(x.qty * x.price)}</div>
            </div>
          </div>
        ))}
        <button className="btn soft block" onClick={() => setRecipe((a) => [...a, { id: uid("R"), name: "", qty: 0.1, price: 100 }])}><Plus /> Add ingredient</button>
      </div>
      <label style={{ display: "block", marginTop: 16 }}><span className="label">Servings in this batch</span><input className="field num" type="number" min="1" value={meta.servings} onChange={(e) => setMeta({ ...meta, servings: Number(e.target.value) })} /></label>
      <p className="hint">Ingredients only. Labour, utilities, packaging and tax aren’t included.</p>
    </Screen>
  );
}