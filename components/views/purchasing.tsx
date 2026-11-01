"use client";
import { useState } from "react";
import { Check, CheckCheck, MessageCircle, PackageCheck, Plus, Send, Trash2, Wand2, X, Printer } from "lucide-react";
import { money } from "@/lib/data";
import type { Purchase } from "@/lib/data";
import { Empty, Screen, Segmented, emoji, haptic } from "../ui";
import type { ViewProps } from "../types";

const tabs = ["To approve", "Approved", "Ordered"] as const;
type Tab = (typeof tabs)[number];
const status: Record<Tab, Purchase["status"]> = { "To approve": "Needs approval", Approved: "Approved", Ordered: "Ordered" };
const steps = ["Draft", "Approved", "Ordered", "Received"];

export function Purchasing({ d, open, notify }: ViewProps) {
  const [tab, setTab] = useState<Tab>("To approve");
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const manage = d.can("purchasing"), receiving = d.can("receiving");
  const count = (t: Tab) => d.purchases.filter((p) => p.status === status[t]).length;
  const list = d.purchases.filter((p) => p.status === status[tab]);
  const total = list.reduce((s, p) => s + p.estimated, 0);
  const fail = (e: unknown) => notify(e instanceof Error ? e.message : "Something went wrong.");

  const run = async (p: Purchase, action: "approve" | "reject" | "cancel" | "send", msg: string, next?: Tab, body?: unknown) => {
    if (busy) return; setBusy(p.id); haptic(12);
    try { await d.act.po(p.id, action, body); setFlash(p.id); setTimeout(() => setFlash(null), 700); notify(msg); if (next) setTimeout(() => setTab(next), 350); }
    catch (e) { fail(e); } finally { setBusy(null); }
  };
  const approveAll = async () => {
    haptic(15);
    try { for (const p of list) await d.act.po(p.id, "approve"); notify(`${list.length} approved. Nothing has been sent.`); } catch (e) { fail(e); }
  };
  const draftFromLow = async () => {
    try { const made = await d.act.draftFromLow(); if (!made.length) return notify("Nothing needs ordering — every low item already has an order."); setTab("To approve"); haptic(12); notify(`${made.length} draft${made.length > 1 ? "s" : ""} from low stock. Review and approve.`); }
    catch (e) { fail(e); }
  };
  const markSent = (p: Purchase) => {
    // Approval is internal. This must only be pressed after the user has really placed the order with the supplier.
    if (!window.confirm(`Mark ${p.number} as ordered?\n\nKooper doesn't contact suppliers. Only continue if you've already placed this order with ${p.supplier}.`)) return;
    run(p, "send", "Marked as ordered.", "Ordered", { confirmPlacedWithSupplier: true });
  };
  const print = (p: Purchase) => {
    const w = window.open("", "_blank", "width=720,height=900"); if (!w) return notify("Allow pop-ups to print.");
    const rows = p.lines.map((l) => `<tr><td>${l.name.replace(/</g, "&lt;")}</td><td style="text-align:right">${l.ordered} ${l.unit}</td><td style="text-align:right">${money(l.price)}</td><td style="text-align:right">${money(l.ordered * l.price)}</td></tr>`).join("");
    w.document.write(`<title>${p.number}</title><body style="font:14px system-ui;padding:32px;max-width:680px;margin:auto"><h1 style="margin:0">Purchase order ${p.number}</h1><p>${d.me?.restaurant.name ?? ""} → <b>${p.supplier.replace(/</g, "&lt;")}</p><table width="100%" cellpadding="8" style="border-collapse:collapse"><tr style="border-bottom:2px solid #000;text-align:left"><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr>${rows}<tr style="border-top:2px solid #000"><td colspan="3" style="text-align:right"><b>Total</b></td><td style="text-align:right"><b>${money(p.estimated)}</b></td></tr></table><p style="color:#666">Dated ${new Date().toLocaleDateString("en-IN")}</p><script>onload=()=>print()<\/script></body>`);
    w.document.close();
  };

  return (
    <Screen title="Orders" sub="You approve everything. Kooper never orders for you." action={manage ? <button className="round-btn" style={{ background: "var(--lime)" }} aria-label="New order" onClick={() => open({ type: "purchase" })}><Plus /></button> : undefined}>
      <Segmented options={[...tabs]} value={tab} onChange={setTab} counts={{ "To approve": count("To approve"), Approved: count("Approved"), Ordered: count("Ordered") }} />
      <div className="chips" style={{ marginBottom: 14 }}>
        {manage && <button className="chip quick" onClick={draftFromLow}><Wand2 size={14} style={{ verticalAlign: -2 }} /> Draft from low stock</button>}
        <button className="chip quick" onClick={() => open({ type: "message" })}><MessageCircle size={14} style={{ verticalAlign: -2 }} /> Message suppliers</button>
        {manage && tab === "To approve" && list.length > 1 && <button className="chip on" onClick={approveAll}><CheckCheck size={14} style={{ verticalAlign: -2 }} /> Approve all · {money(total)}</button>}
      </div>
      <div className="stack">
        {list.map((p, i) => {
          const at = tab === "To approve" ? 0 : tab === "Approved" ? 1 : 2;
          const got = p.lines.reduce((s, l) => s + l.received, 0), want = p.lines.reduce((s, l) => s + l.ordered, 0);
          return (
            <div className={`order ${flash === p.id ? "flash" : ""}`} key={p.id} style={{ ["--i" as string]: i }}>
              <div className="order-top">
                <span className="item-ico">{emoji(p.lines[0]?.category ?? "")}</span>
                <div className="item-main"><div className="item-title">{p.item}</div><div className="item-sub">{p.number} · {p.lines.length === 1 ? `${p.quantity} ${p.unit} · ` : ""}{p.supplier}</div></div>
                <div className="price num">{money(p.estimated)}</div>
              </div>
              {p.lines.length > 1 && <div className="item-sub" style={{ margin: "6px 2px 0" }}>{p.lines.map((l) => `${l.name} ${l.ordered} ${l.unit}`).join(" · ")}</div>}
              {p.partial && <div className="item-sub" style={{ margin: "6px 2px 0", color: "var(--warn)" }}>Partly delivered: {+got.toFixed(2)} of {+want.toFixed(2)} received</div>}
              <div className="track" aria-label={`Step ${at + 1} of 4`}>{steps.map((_, k) => <i key={k} className={k <= at ? "on" : ""} />)}</div>
              <div className="track-labels">{steps.map((s) => <span key={s}>{s}</span>)}</div>
              <div className="order-act">
                {manage && p.status === "Needs approval" && <button className="btn lime" disabled={busy === p.id} onClick={() => run(p, "approve", "Approved. No order was sent to the supplier.", "Approved")}><Check /> Approve</button>}
                {manage && p.status === "Approved" && <button className="btn" disabled={busy === p.id} onClick={() => markSent(p)}><Send /> I placed this order</button>}
                {receiving && p.status === "Ordered" && <button className="btn lime" onClick={() => open({ type: "receive", id: p.id })}><PackageCheck /> Receive</button>}
                {p.status !== "Needs approval" && <button className="btn soft" style={{ flex: "0 0 52px", padding: 0 }} aria-label={`Print ${p.number}`} onClick={() => print(p)}><Printer /></button>}
                {manage && p.status === "Needs approval" && <button className="btn soft" style={{ flex: "0 0 52px", padding: 0 }} aria-label={`Reject ${p.number}`} onClick={() => run(p, "reject", "Order rejected.")}><X /></button>}
                {manage && p.status !== "Ordered" && <button className="btn soft" style={{ flex: "0 0 52px", padding: 0 }} aria-label={`Cancel ${p.number}`} onClick={() => run(p, "cancel", "Order cancelled.")}><Trash2 /></button>}
              </div>
            </div>
          );
        })}
        {list.length === 0 && <Empty icon={tab === "To approve" ? "done" : "empty"} title={tab === "To approve" ? "Nothing to approve" : `Nothing ${tab.toLowerCase()}`} text={tab === "To approve" ? "Draft from low stock or add your own." : "Orders will appear here as they move along."} />}
      </div>
    </Screen>
  );
}
