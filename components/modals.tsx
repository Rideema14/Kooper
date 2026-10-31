"use client";
import { useState, type FormEvent } from "react";
import { Copy, MessageCircle, Share2, PackagePlus, Trash2, ScanLine, ShoppingBasket } from "lucide-react";
import { isLow, isoDaysAgo, money, suggestQty, uid, type InventoryItem, type Purchase, type WasteEntry } from "@/lib/data";
import type { KooperData } from "@/lib/store";
import { Field, Sheet, emoji, haptic } from "./ui";
import type { ModalState, Notify, Page } from "./types";

type P = { d: KooperData; close: () => void; notify: Notify; go: (p: Page) => void; open: (m: NonNullable<ModalState>) => void };
const Actions = ({ close, label }: { close: () => void; label: string }) => (
  <div className="actions full"><button type="button" className="btn soft" onClick={close}>Cancel</button><button className="btn lime">{label}</button></div>
);
const Units = ({ list }: { list: string[] }) => <>{list.map((u) => <option key={u}>{u}</option>)}</>;

function StockSheet({ d, close, notify }: P) {
  const [f, set] = useState({ name: "", category: "Produce", quantity: "", unit: "kg", reorderAt: "", unitPrice: "", supplier: "" });
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const item: InventoryItem = { id: uid("I"), name: f.name.trim(), category: f.category, quantity: Number(f.quantity), unit: f.unit, reorderAt: Number(f.reorderAt), unitPrice: Number(f.unitPrice), supplier: f.supplier.trim(), updated: "Just now" };
    d.setInventory((v) => [item, ...v]); close(); haptic(12);
    notify(`${item.name} added to stock.`, () => d.setInventory((v) => v.filter((x) => x.id !== item.id)));
  };
  return (
    <Sheet title="Add ingredient" desc="What you have now, and when you want to reorder." onClose={close}>
      <form className="form-grid" onSubmit={submit}>
        <Field label="Name" full><input className="field" required value={f.name} onChange={up("name")} placeholder="e.g. Parmesan" /></Field>
        <Field label="Category"><select className="field" value={f.category} onChange={up("category")}><Units list={["Produce", "Dairy", "Pantry", "Meat", "Seafood", "Other"]} /></select></Field>
        <Field label="Unit"><select className="field" value={f.unit} onChange={up("unit")}><Units list={["kg", "g", "L", "pcs", "box"]} /></select></Field>
        <Field label="On hand"><input className="field num" type="number" inputMode="decimal" min="0" step=".01" required value={f.quantity} onChange={up("quantity")} /></Field>
        <Field label="Reorder at"><input className="field num" type="number" inputMode="decimal" min="0" step=".01" required value={f.reorderAt} onChange={up("reorderAt")} /></Field>
        <Field label="Price per unit (₹)"><input className="field num" type="number" inputMode="decimal" min="0" required value={f.unitPrice} onChange={up("unitPrice")} /></Field>
        <Field label="Supplier"><input className="field" required value={f.supplier} onChange={up("supplier")} /></Field>
        <Actions close={close} label="Add" />
      </form>
    </Sheet>
  );
}

function WasteSheet({ d, close, notify, item }: P & { item?: string }) {
  const [f, set] = useState({ item: item ?? "", quantity: "", unit: item ? d.inventory.find((x) => x.name === item)?.unit ?? "kg" : "kg", reason: "Spoiled", date: isoDaysAgo(0) });
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set({ ...f, [k]: e.target.value });
  const reasons = ["Spoiled", "Expired", "Prep waste", "Overproduction", "Customer return"];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const w: WasteEntry = { id: uid("W"), item: f.item.trim(), quantity: Number(f.quantity), unit: f.unit, reason: f.reason, date: f.date };
    d.setWaste((v) => [w, ...v]); close(); haptic(12);
    notify("Waste logged.", () => d.setWaste((v) => v.filter((x) => x.id !== w.id)));
  };
  return (
    <Sheet title="Log waste" desc="Tap a reason, add the amount. Patterns show up on their own." onClose={close}>
      <form className="form-grid" onSubmit={submit}>
        <datalist id="waste-names">{d.inventory.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        <Field label="Ingredient" full><input className="field" list="waste-names" required value={f.item} onChange={up("item")} placeholder="e.g. Lettuce" /></Field>
        <Field label="Quantity"><input className="field num" type="number" inputMode="decimal" min=".01" step=".01" required value={f.quantity} onChange={up("quantity")} autoFocus={!!item} /></Field>
        <Field label="Unit"><select className="field" value={f.unit} onChange={up("unit")}><Units list={["kg", "g", "L", "pcs"]} /></select></Field>
        <div className="full"><span className="label">Reason</span>
          <div className="chips" style={{ margin: 0, padding: 0, flexWrap: "wrap" }}>{reasons.map((r) => <button type="button" key={r} className={`chip ${f.reason === r ? "on" : "quick"}`} onClick={() => { haptic(4); set({ ...f, reason: r }); }}>{r}</button>)}</div>
        </div>
        <Field label="Date" full><input className="field num" type="date" required max={isoDaysAgo(0)} value={f.date} onChange={up("date")} /></Field>
        <Actions close={close} label="Save entry" />
      </form>
    </Sheet>
  );
}

function PurchaseSheet({ d, close, notify, preset }: P & { preset?: NonNullable<Extract<ModalState, { type: "purchase" }>["preset"]> }) {
  const [f, set] = useState({ item: preset?.item ?? "", quantity: preset?.quantity ?? "", unit: preset?.unit ?? "kg", supplier: preset?.supplier ?? "", estimated: preset?.estimated ?? "" });
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set({ ...f, [k]: e.target.value });
  const fromStock = (name: string) => {
    const hit = d.inventory.find((x) => x.name.toLowerCase() === name.toLowerCase());
    set(hit ? { ...f, item: name, unit: hit.unit, supplier: hit.supplier } : { ...f, item: name });
  };
  const autoPrice = () => {
    const hit = d.inventory.find((x) => x.name.toLowerCase() === f.item.toLowerCase());
    if (hit && f.quantity && !f.estimated) set({ ...f, estimated: String(Number(f.quantity) * hit.unitPrice) });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p: Purchase = { id: uid("PO"), item: f.item.trim(), quantity: Number(f.quantity), unit: f.unit, supplier: f.supplier.trim(), estimated: Number(f.estimated), status: "Needs approval" };
    d.setPurchases((v) => [p, ...v]); close(); haptic(12);
    notify("Added to Orders. Nothing was ordered.", () => d.setPurchases((v) => v.filter((x) => x.id !== p.id)));
  };
  return (
    <Sheet title="New order" desc="Creates a draft for you to approve. It never places an order." onClose={close}>
      <form className="form-grid" onSubmit={submit}>
        <datalist id="po-names">{d.inventory.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        <Field label="Ingredient"><input className="field" list="po-names" required value={f.item} onChange={(e) => fromStock(e.target.value)} /></Field>
        <Field label="Supplier"><input className="field" required value={f.supplier} onChange={up("supplier")} /></Field>
        <Field label="Quantity"><input className="field num" type="number" inputMode="decimal" min=".01" step=".01" required value={f.quantity} onChange={up("quantity")} onBlur={autoPrice} /></Field>
        <Field label="Unit"><select className="field" value={f.unit} onChange={up("unit")}><Units list={["kg", "g", "L", "pcs", "box"]} /></select></Field>
        <Field label="Estimated total (₹)" full><input className="field num" type="number" inputMode="decimal" min="0" required value={f.estimated} onChange={up("estimated")} /></Field>
        <Actions close={close} label="Add to orders" />
      </form>
    </Sheet>
  );
}

function SettingsSheet({ d, close, notify }: P) {
  const [armed, setArmed] = useState(false);
  const value = d.inventory.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
  return (
    <Sheet title="Settings" desc="Olive & Oak Bistro" onClose={close}>
      <div className="stack">
        <div className="card" style={{ background: "var(--canvas)", boxShadow: "none" }}><b>Your data stays on this device</b><p className="muted" style={{ marginTop: 4, fontSize: 13.5 }}>{d.inventory.length} ingredients worth {money(value)} are saved in this browser only. Clearing site data removes them.</p></div>
        <button className="btn block" style={armed ? { background: "var(--tomato)" } : undefined} onClick={() => { if (!armed) { setArmed(true); haptic(10); return; } d.reset(); close(); notify("Demo data restored."); }}>{armed ? "Tap again to reset everything" : "Reset demo data"}</button>
        <button className="btn soft block" onClick={close}>Done</button>
      </div>
    </Sheet>
  );
}

function QuickSheet({ close, open, go }: P) {
  const t = (cls: string, icon: React.ReactNode, title: string, sub: string, fn: () => void) => <button className={`tile ${cls}`} onClick={() => { close(); setTimeout(fn, 240); }}>{icon}<div><strong>{title}</strong><span>{sub}</span></div></button>;
  return (
    <Sheet title="Quick add" onClose={close}>
      <div className="tiles">
        {t("t-lime", <PackagePlus />, "Ingredient", "Add to stock", () => open({ type: "stock" }))}
        {t("t-mango", <Trash2 />, "Log waste", "Record what was binned", () => open({ type: "waste" }))}
        {t("t-sky", <ShoppingBasket />, "New order", "Draft for approval", () => open({ type: "purchase" }))}
        {t("t-lilac", <ScanLine />, "Scan invoice", "Check supplier prices", () => go("Invoices"))}
      </div>
    </Sheet>
  );
}

function AlertsSheet({ d, close, open, go }: P) {
  const low = d.inventory.filter(isLow);
  const pending = d.purchases.filter((p) => p.status === "Needs approval");
  return (
    <Sheet title="Needs you" desc={low.length + pending.length ? "A few things worth a look." : "You’re all caught up."} onClose={close}>
      <div className="alerts">
        {low.map((x) => (
          <button key={x.id} className="alert" onClick={() => { close(); setTimeout(() => open({ type: "purchase", preset: { item: x.name, quantity: String(suggestQty(x)), unit: x.unit, supplier: x.supplier, estimated: String(suggestQty(x) * x.unitPrice) } }), 240); }}>
            <span className="item-ico">{emoji(x.category)}</span><div style={{ flex: 1 }}><strong>{x.name} is low</strong><small>{x.quantity} {x.unit} left · tap to draft an order</small></div><span className="tag red">Low</span>
          </button>
        ))}
        {pending.length > 0 && <button className="alert" onClick={() => { close(); go("Orders"); }}><span className="item-ico">📝</span><div style={{ flex: 1 }}><strong>{pending.length} order{pending.length > 1 ? "s" : ""} to approve</strong><small>Nothing goes out without you</small></div><span className="tag warn">{pending.length}</span></button>}
        {low.length + pending.length === 0 && <div className="empty"><span>🎉</span><strong>All clear</strong>Everything is stocked and approved.</div>}
      </div>
    </Sheet>
  );
}

function MessageSheet({ d, close, notify }: P) {
  const items = d.purchases.filter((p) => p.status !== "Ordered");
  const base = items.length ? items.map((p) => `• ${p.item} — ${p.quantity} ${p.unit}`).join("\n") : "• (add your items here)";
  const [text, setText] = useState(`Hi, could you please confirm today’s availability and latest pricing for:\n\n${base}\n\nPlease also share the delivery window and any minimum order. We’ll confirm quantities once reviewed. Thank you.`);
  return (
    <Sheet title="Message suppliers" desc="Built from your open orders. Edit, then send the way you usually do." onClose={close}>
      <textarea className="field" rows={9} value={text} onChange={(e) => setText(e.target.value)} style={{ lineHeight: 1.6, resize: "none" }} aria-label="Supplier message" />
      <div className="actions" style={{ marginTop: 14 }}>
        <button className="btn soft" onClick={() => { navigator.clipboard?.writeText(text); notify("Message copied."); }}><Copy /> Copy</button>
        <a className="btn lime" style={{ textDecoration: "none" }} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a>
        {typeof navigator !== "undefined" && "share" in navigator && <button className="btn soft" aria-label="Share" onClick={() => navigator.share({ text }).catch(() => {})}><Share2 /></button>}
      </div>
    </Sheet>
  );
}

export function Modals({ modal, ...p }: P & { modal: ModalState }) {
  if (!modal) return null;
  switch (modal.type) {
    case "stock": return <StockSheet {...p} />;
    case "waste": return <WasteSheet {...p} item={modal.item} />;
    case "purchase": return <PurchaseSheet {...p} preset={modal.preset} />;
    case "quick": return <QuickSheet {...p} />;
    case "alerts": return <AlertsSheet {...p} />;
    case "message": return <MessageSheet {...p} />;
    default: return <SettingsSheet {...p} />;
  }
}