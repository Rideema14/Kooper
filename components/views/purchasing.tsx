"use client";
import { useState } from "react";
import { Check, CheckCheck, MessageCircle, PackageCheck, Plus, Send, Trash2, Wand2 } from "lucide-react";
import { isLow, money, suggestQty, uid, type Purchase } from "@/lib/data";
import { Empty, Screen, Segmented, emoji, haptic, insertAt } from "../ui";
import type { ViewProps } from "../types";

const tabs = ["To approve", "Approved", "Ordered"] as const;
type Tab = (typeof tabs)[number];
const status: Record<Tab, Purchase["status"]> = { "To approve": "Needs approval", Approved: "Approved", Ordered: "Ordered" };
const steps = ["Draft", "Approved", "Ordered", "Received"];

export function Purchasing({ d, open, notify }: ViewProps) {
  const [tab, setTab] = useState<Tab>("To approve");
  const [flash, setFlash] = useState<string | null>(null);
  const low = d.inventory.filter(isLow);
  const count = (t: Tab) => d.purchases.filter((p) => p.status === status[t]).length;
  const list = d.purchases.filter((p) => p.status === status[tab]);
  const total = list.reduce((s, p) => s + p.estimated, 0);
  const cat = (name: string) => d.inventory.find((x) => x.name.toLowerCase() === name.toLowerCase())?.category ?? "";

  const move = (p: Purchase, to: Purchase["status"], msg: string, next?: Tab) => {
    const prev = p.status; haptic(12);
    d.setPurchases((v) => v.map((x) => (x.id === p.id ? { ...x, status: to } : x)));
    setFlash(p.id); setTimeout(() => setFlash(null), 700);
    notify(msg, () => d.setPurchases((v) => v.map((x) => (x.id === p.id ? { ...x, status: prev } : x))));
    if (next) setTimeout(() => setTab(next), 350);
  };
  const approveAll = () => {
    const ids = new Set(list.map((p) => p.id)); haptic(15);
    d.setPurchases((v) => v.map((p) => (ids.has(p.id) ? { ...p, status: "Approved" } : p)));
    notify(`${ids.size} approved. Nothing has been sent.`, () => d.setPurchases((v) => v.map((p) => (ids.has(p.id) ? { ...p, status: "Needs approval" } : p))));
  };
  const draftFromLow = () => {
    const have = new Set(d.purchases.filter((p) => p.status === "Needs approval").map((p) => p.item.toLowerCase()));
    const fresh = low.filter((x) => !have.has(x.name.toLowerCase()));
    if (!fresh.length) return notify("Every low item already has a draft.");
    const made = fresh.map((x): Purchase => ({ id: uid("PO"), item: x.name, quantity: suggestQty(x), unit: x.unit, supplier: x.supplier, estimated: suggestQty(x) * x.unitPrice, status: "Needs approval" }));
    d.setPurchases((v) => [...made, ...v]); setTab("To approve"); haptic(12);
    notify(`${made.length} draft${made.length > 1 ? "s" : ""} from low stock.`, () => d.setPurchases((v) => v.filter((p) => !made.some((m) => m.id === p.id))));
  };
  const receive = (p: Purchase) => {
    const match = d.inventory.find((x) => x.name.toLowerCase() === p.item.toLowerCase()); haptic(15);
    const i = d.purchases.findIndex((x) => x.id === p.id);
    if (match) d.setInventory((v) => v.map((x) => (x.id === match.id ? { ...x, quantity: +(x.quantity + p.quantity).toFixed(2), updated: "Just now" } : x)));
    d.setPurchases((v) => v.filter((x) => x.id !== p.id));
    notify(match ? `${p.quantity} ${p.unit} of ${p.item} added to stock.` : `${p.item} isn’t in Stock yet. Add it to track it.`, () => {
      d.setPurchases((v) => insertAt(v, i, p));
      if (match) d.setInventory((v) => v.map((x) => (x.id === match.id ? { ...x, quantity: +(x.quantity - p.quantity).toFixed(2) } : x)));
    });
  };
  const remove = (p: Purchase) => { const i = d.purchases.findIndex((x) => x.id === p.id); d.setPurchases((v) => v.filter((x) => x.id !== p.id)); notify("Order removed.", () => d.setPurchases((v) => insertAt(v, i, p))); };

  return (
    <Screen title="Orders" sub="You approve everything. Kooper never orders for you." action={<button className="round-btn" style={{ background: "var(--lime)" }} aria-label="New order" onClick={() => open({ type: "purchase" })}><Plus /></button>}>
      <Segmented options={[...tabs]} value={tab} onChange={setTab} counts={{ "To approve": count("To approve"), Approved: count("Approved"), Ordered: count("Ordered") }} />
      <div className="chips" style={{ marginBottom: 14 }}>
        <button className="chip quick" onClick={draftFromLow}><Wand2 size={14} style={{ verticalAlign: -2 }} /> Draft from low stock</button>
        <button className="chip quick" onClick={() => open({ type: "message" })}><MessageCircle size={14} style={{ verticalAlign: -2 }} /> Message suppliers</button>
        {tab === "To approve" && list.length > 1 && <button className="chip on" onClick={approveAll}><CheckCheck size={14} style={{ verticalAlign: -2 }} /> Approve all · {money(total)}</button>}
      </div>
      <div className="stack">
        {list.map((p, i) => {
          const at = tab === "To approve" ? 0 : tab === "Approved" ? 1 : 2;
          return (
            <div className={`order ${flash === p.id ? "flash" : ""}`} key={p.id} style={{ ["--i" as string]: i }}>
              <div className="order-top">
                <span className="item-ico">{emoji(cat(p.item))}</span>
                <div className="item-main"><div className="item-title">{p.item}</div><div className="item-sub">{p.quantity} {p.unit} · {p.supplier}</div></div>
                <div className="price num">{money(p.estimated)}</div>
              </div>
              <div className="track" aria-label={`Step ${at + 1} of 4`}>{steps.map((_, k) => <i key={k} className={k <= at ? "on" : ""} />)}</div>
              <div className="track-labels">{steps.map((s) => <span key={s}>{s}</span>)}</div>
              <div className="order-act">
                {p.status === "Needs approval" && <button className="btn lime" onClick={() => move(p, "Approved", "Approved. No order was sent.", "Approved")}><Check /> Approve</button>}
                {p.status === "Approved" && <button className="btn" onClick={() => move(p, "Ordered", "Marked as ordered.", "Ordered")}><Send /> Mark ordered</button>}
                {p.status === "Ordered" && <button className="btn lime" onClick={() => receive(p)}><PackageCheck /> Received</button>}
                <button className="btn soft" style={{ flex: "0 0 52px", padding: 0 }} aria-label={`Remove ${p.item}`} onClick={() => remove(p)}><Trash2 /></button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <Empty icon={tab === "To approve" ? "✅" : "📭"} title={tab === "To approve" ? "Nothing to approve" : `Nothing ${tab.toLowerCase()}`} text={tab === "To approve" ? "Draft from low stock or add your own." : "Orders will appear here as they move along."} />}
      </div>
    </Screen>
  );
}