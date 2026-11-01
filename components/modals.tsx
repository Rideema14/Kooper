"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, MessageCircle, Share2, PackagePlus, Trash2, ScanLine, ShoppingBasket, Download, LogOut } from "lucide-react";
import { isLow, isoDaysAgo, money, suggestQty } from "@/lib/data";
import { api, type KooperData } from "@/lib/store";
import { Field, Ico, Sheet, emoji, haptic } from "./ui";
import type { ModalState, Notify, Page } from "./types";

type P = { d: KooperData; close: () => void; notify: Notify; go: (p: Page) => void; open: (m: NonNullable<ModalState>) => void };
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const Actions = ({ close, label, busy }: { close: () => void; label: string; busy?: boolean }) => (
  <div className="actions full"><button type="button" className="btn soft" onClick={close}>Cancel</button><button className="btn lime" disabled={busy}>{busy ? "Saving…" : label}</button></div>
);
const Units = ({ list }: { list: string[] }) => <>{list.map((u) => <option key={u}>{u}</option>)}</>;
const key = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));

function StockSheet({ d, close, notify }: P) {
  const [f, set] = useState({ name: "", category: "Produce", quantity: "", unit: "kg", reorderAt: "", unitPrice: "", supplier: "", expiry: "" });
  const [busy, setBusy] = useState(false);
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true);
    try {
      let supplierId: string | null = d.suppliers.find((s) => s.name.toLowerCase() === f.supplier.trim().toLowerCase())?.id ?? null;
      if (!supplierId && f.supplier.trim()) {
        if (d.can("purchasing")) supplierId = (await d.act.createSupplier(f.supplier.trim())).id;
        else notify("Saved without a supplier — only managers can add new suppliers.");
      }
      const made = await d.act.addIngredient({ name: f.name.trim(), category: f.category, unit: f.unit, unitCost: Number(f.unitPrice), reorderLevel: Number(f.reorderAt), minStock: Number(f.reorderAt), supplierId, openingStock: Number(f.quantity), expiryDate: f.expiry || null });
      close(); haptic(12);
      notify(`${f.name.trim()} added to stock.`, () => { d.act.archiveIngredient(made.id).catch((x) => notify(msg(x))); });
    } catch (x) { notify(msg(x)); setBusy(false); }
  };
  return (
    <Sheet title="Add ingredient" desc="What you have now, and when you want to reorder." onClose={close}>
      <form className="form-grid" onSubmit={submit}>
        <datalist id="sup-names">{d.suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        <Field label="Name" full><input className="field" required value={f.name} onChange={up("name")} placeholder="e.g. Parmesan" /></Field>
        <Field label="Category"><select className="field" value={f.category} onChange={up("category")}><Units list={["Produce", "Dairy", "Pantry", "Meat", "Seafood", "Other"]} /></select></Field>
        <Field label="Unit"><select className="field" value={f.unit} onChange={up("unit")}><Units list={["kg", "g", "L", "pcs", "box"]} /></select></Field>
        <Field label="On hand"><input className="field num" type="number" inputMode="decimal" min="0" step=".01" required value={f.quantity} onChange={up("quantity")} /></Field>
        <Field label="Reorder at"><input className="field num" type="number" inputMode="decimal" min="0" step=".01" required value={f.reorderAt} onChange={up("reorderAt")} /></Field>
        <Field label="Price per unit (₹)"><input className="field num" type="number" inputMode="decimal" min="0" step=".01" required value={f.unitPrice} onChange={up("unitPrice")} /></Field>
        <Field label="Expiry (optional)"><input className="field num" type="date" min={isoDaysAgo(0)} value={f.expiry} onChange={up("expiry")} /></Field>
        <Field label="Supplier" full><input className="field" list="sup-names" value={f.supplier} onChange={up("supplier")} placeholder="Choose or type a new one" /></Field>
        <Actions close={close} label="Add" busy={busy} />
      </form>
    </Sheet>
  );
}

function WasteSheet({ d, close, notify, item }: P & { item?: string }) {
  const [f, set] = useState({ item: item ?? "", quantity: "", reason: "Spoiled", department: "Kitchen", date: isoDaysAgo(0) });
  const [busy, setBusy] = useState(false);
  const idem = useRef(key());                                  // one key per opened sheet → a double tap can't deduct twice
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set({ ...f, [k]: e.target.value });
  const reasons = ["Spoiled", "Expired", "Prep waste", "Overproduction", "Customer return"];
  const ing = d.inventory.find((x) => x.name.toLowerCase() === f.item.trim().toLowerCase());
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return;
    if (!ing) return notify("Pick an ingredient from your stock list.");
    setBusy(true);
    try {
      const at = f.date === isoDaysAgo(0) ? new Date() : new Date(f.date + "T12:00:00");
      const w = await d.act.logWaste({ ingredientId: ing.id, quantity: Number(f.quantity), reason: f.reason, department: f.department, occurredAt: at.toISOString(), idempotencyKey: idem.current });
      close(); haptic(12);
      notify("Waste logged and stock updated.", d.can("purchasing") ? () => { d.act.reverseWaste(w.id).catch((x) => notify(msg(x))); } : undefined);
    } catch (x) { notify(msg(x)); setBusy(false); }
  };
  return (
    <Sheet title="Log waste" desc="Tap a reason, add the amount. Stock is reduced automatically." onClose={close}>
      <form className="form-grid" onSubmit={submit}>
        <datalist id="waste-names">{d.inventory.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        <Field label="Ingredient" full><input className="field" list="waste-names" required value={f.item} onChange={up("item")} placeholder="e.g. Lettuce" /></Field>
        <Field label={`Quantity${ing ? ` (${ing.unit})` : ""}`}><input className="field num" type="number" inputMode="decimal" min=".01" step=".01" required value={f.quantity} onChange={up("quantity")} autoFocus={!!item} /></Field>
        <Field label="On hand"><input className="field num" readOnly value={ing ? `${ing.quantity} ${ing.unit}` : "—"} /></Field>
        <div className="full"><span className="label">Reason</span>
          <div className="chips" style={{ margin: 0, padding: 0, flexWrap: "wrap" }}>{reasons.map((r) => <button type="button" key={r} className={`chip ${f.reason === r ? "on" : "quick"}`} onClick={() => { haptic(4); set({ ...f, reason: r }); }}>{r}</button>)}</div>
        </div>
        <Field label="Department"><select className="field" value={f.department} onChange={up("department")}><Units list={["Kitchen", "Bar", "Bakery", "Front of house", "Storage"]} /></select></Field>
        <Field label="Date"><input className="field num" type="date" required max={isoDaysAgo(0)} value={f.date} onChange={up("date")} /></Field>
        <Actions close={close} label="Save entry" busy={busy} />
      </form>
    </Sheet>
  );
}

function PurchaseSheet({ d, close, notify, preset }: P & { preset?: NonNullable<Extract<ModalState, { type: "purchase" }>["preset"]> }) {
  const [f, set] = useState({ item: preset?.item ?? "", quantity: preset?.quantity ?? "", supplierId: "", estimated: preset?.estimated ?? "" });
  const [busy, setBusy] = useState(false);
  const ing = d.inventory.find((x) => x.name.toLowerCase() === f.item.trim().toLowerCase());
  const supplierId = f.supplierId || ing?.supplierId || "";
  const autoPrice = () => { if (ing && f.quantity && !f.estimated) set({ ...f, estimated: String(+(Number(f.quantity) * ing.unitPrice).toFixed(2)) }); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return;
    if (!ing) return notify("Pick an ingredient from your stock list.");
    setBusy(true);
    try {
      const q = Number(f.quantity);
      const po = await d.act.createPurchase({ supplierId: supplierId || null, items: [{ ingredientId: ing.id, quantity: q, unitPrice: f.estimated ? Number(f.estimated) / q : undefined }] });
      close(); haptic(12);
      notify("Added to Orders. Nothing was ordered.", () => { d.act.po(po.id, "cancel").catch((x) => notify(msg(x))); });
    } catch (x) { notify(msg(x)); setBusy(false); }
  };
  return (
    <Sheet title="New order" desc="Creates a draft for you to approve. It never places an order." onClose={close}>
      <form className="form-grid" onSubmit={submit}>
        <datalist id="po-names">{d.inventory.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        <Field label="Ingredient"><input className="field" list="po-names" required value={f.item} onChange={(e) => set({ ...f, item: e.target.value })} /></Field>
        <Field label="Supplier"><select className="field" value={supplierId} onChange={(e) => set({ ...f, supplierId: e.target.value })}><option value="">No supplier yet</option>{d.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label={`Quantity${ing ? ` (${ing.unit})` : ""}`}><input className="field num" type="number" inputMode="decimal" min=".01" step=".01" required value={f.quantity} onChange={(e) => set({ ...f, quantity: e.target.value })} onBlur={autoPrice} /></Field>
        <Field label="Estimated total (₹)"><input className="field num" type="number" inputMode="decimal" min="0" step=".01" required value={f.estimated} onChange={(e) => set({ ...f, estimated: e.target.value })} /></Field>
        <Actions close={close} label="Add to orders" busy={busy} />
      </form>
    </Sheet>
  );
}

function ReceiveSheet({ d, close, notify, id }: P & { id: string }) {
  const po = d.purchases.find((p) => p.id === id);
  const [rows, setRows] = useState(() => (po?.lines ?? []).map((l) => ({ id: l.id, qty: String(+(l.ordered - l.received).toFixed(3)), expiry: "", batch: "" })));
  const [busy, setBusy] = useState(false);
  const idem = useRef(key());
  if (!po) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return;
    const lines = rows.filter((r) => Number(r.qty) > 0).map((r) => ({ itemId: r.id, quantity: Number(r.qty), expiryDate: r.expiry || null, batchCode: r.batch || null }));
    if (!lines.length) return notify("Enter a quantity for at least one line.");
    setBusy(true);
    try { await d.act.po(id, "receive", { lines, idempotencyKey: idem.current }); close(); haptic(15); notify("Delivery recorded and stock updated."); }
    catch (x) { notify(msg(x)); setBusy(false); }
  };
  return (
    <Sheet title={`Receive ${po.number}`} desc="Enter what actually arrived. Partial deliveries are fine." onClose={close}>
      <form className="stack" onSubmit={submit}>
        {po.lines.map((l, i) => (
          <div className="inv-line" key={l.id}>
            <b>{l.name}</b><small className="muted">Ordered {l.ordered} {l.unit} · already received {l.received} · {money(l.price)}/{l.unit}</small>
            <div className="row3">
              <label><span>Received now</span><input className="field compact num" type="number" step=".001" min="0" max={l.ordered - l.received} value={rows[i].qty} onChange={(e) => setRows(rows.map((r, k) => (k === i ? { ...r, qty: e.target.value } : r)))} /></label>
              <label><span>Expiry</span><input className="field compact num" type="date" value={rows[i].expiry} onChange={(e) => setRows(rows.map((r, k) => (k === i ? { ...r, expiry: e.target.value } : r)))} /></label>
              <label><span>Batch</span><input className="field compact" value={rows[i].batch} onChange={(e) => setRows(rows.map((r, k) => (k === i ? { ...r, batch: e.target.value } : r)))} /></label>
            </div>
          </div>
        ))}
        <Actions close={close} label="Add to stock" busy={busy} />
      </form>
    </Sheet>
  );
}

function SettingsSheet({ d, close, notify }: P) {
  const [name, setName] = useState(d.me?.restaurant.name ?? "");
  const [team, setTeam] = useState<{ id: string; role: string; user: { name: string; email: string } }[] | null>(null);
  const [inv, setInv] = useState({ email: "", role: "MANAGER" });
  const [link, setLink] = useState<string | null>(null);
  const owner = d.role === "OWNER";
  const loadTeam = async () => { try { setTeam(await api("GET", "/api/team")); } catch (e) { notify(msg(e)); } };
  const [loaded, setLoaded] = useState(false);
  if (owner && !loaded) { setLoaded(true); loadTeam(); }
  const range = "";
  return (
    <Sheet title="Settings" desc={d.me ? `${d.me.user.name} · ${d.me.role.replace("_", " ").toLowerCase()}` : ""} onClose={close}>
      <div className="stack">
        {owner && (
          <div className="card" style={{ background: "var(--canvas)", boxShadow: "none" }}>
            <span className="label">Restaurant name</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn lime sm" disabled={!name.trim() || name === d.me?.restaurant.name} onClick={async () => { try { await api("PATCH", "/api/restaurant", { name }); await d.refresh(); notify("Restaurant renamed."); } catch (e) { notify(msg(e)); } }}>Save</button>
            </div>
          </div>
        )}
        {d.can("reports") && (
          <div className="card" style={{ background: "var(--canvas)", boxShadow: "none" }}>
            <b>Export (last 30 days)</b>
            <div className="pill-row" style={{ marginTop: 10 }}>
              {[["inventory", "csv", "Stock CSV"], ["movements", "csv", "Ledger CSV"], ["waste", "csv", "Waste CSV"], ["purchases", "csv", "Orders CSV"], ["invoices", "csv", "Invoices CSV"], ["all", "xlsx", "Excel (all)"], ["all", "pdf", "PDF summary"]].map(([k, fmt, label]) => (
                <a key={label} className="btn soft sm" style={{ textDecoration: "none" }} href={`/api/reports/export?kind=${k}&format=${fmt}${range}`}><Download /> {label}</a>
              ))}
            </div>
          </div>
        )}
        {owner && (
          <div className="card" style={{ background: "var(--canvas)", boxShadow: "none" }}>
            <b>Team</b>
            {team?.map((m) => (
              <div className="team-row" key={m.id}>
                <span>{m.user.name}<small className="muted"> · {m.user.email}</small></span>
                {m.role === "OWNER" ? <span className="tag">Owner</span> : (
                  <span style={{ display: "flex", gap: 6 }}>
                    <select className="field compact" value={m.role} onChange={async (e) => { try { await api("PATCH", `/api/team/${m.id}`, { role: e.target.value }); await loadTeam(); } catch (x) { notify(msg(x)); } }}>
                      {["MANAGER", "CHEF", "INVENTORY_STAFF", "ACCOUNTANT"].map((r) => <option key={r} value={r}>{r.replace("_", " ").toLowerCase()}</option>)}
                    </select>
                    <button className="round-btn" style={{ width: 36, height: 36 }} aria-label={`Remove ${m.user.name}`} onClick={async () => { try { await api("DELETE", `/api/team/${m.id}`); await loadTeam(); } catch (x) { notify(msg(x)); } }}><Trash2 /></button>
                  </span>
                )}
              </div>
            ))}
            <form style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }} onSubmit={async (e) => {
              e.preventDefault();
              try { const r = await api<{ link: string; emailed: boolean; emailNote: string | null }>("POST", "/api/team", inv); setLink(r.link); notify(r.emailed ? "Invitation emailed." : `Invitation created. ${r.emailNote ?? ""}`); setInv({ ...inv, email: "" }); }
              catch (x) { notify(msg(x)); }
            }}>
              <input className="field" style={{ flex: "1 1 160px" }} type="email" required placeholder="Email to invite" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
              <select className="field" style={{ flex: "0 0 auto" }} value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>{["MANAGER", "CHEF", "INVENTORY_STAFF", "ACCOUNTANT"].map((r) => <option key={r} value={r}>{r.replace("_", " ").toLowerCase()}</option>)}</select>
              <button className="btn lime sm">Invite</button>
            </form>
            {link && <p className="mini-note" style={{ marginTop: 10, wordBreak: "break-all" }}>Share this link (valid 7 days): <a href={link}>{link}</a> <button className="link" onClick={() => { navigator.clipboard?.writeText(link); notify("Link copied."); }}>Copy</button></p>}
          </div>
        )}
        <button className="btn soft block" onClick={() => d.act.logout()}><LogOut /> Sign out</button>
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
  useEffect(() => { d.act.refreshNotices(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const low = d.inventory.filter(isLow);
  const pending = d.purchases.filter((p) => p.status === "Needs approval");
  const unread = d.notices.filter((n) => !n.readAt && !["low_stock", "po_approval"].includes(n.kind));
  const total = low.length + pending.length + unread.length;
  return (
    <Sheet title="Needs you" desc={total ? "A few things worth a look." : "You’re all caught up."} onClose={close}>
      <div className="alerts">
        {low.map((x) => (
          <button key={x.id} className="alert" onClick={() => { close(); setTimeout(() => open({ type: "purchase", preset: { item: x.name, quantity: String(suggestQty(x)), unit: x.unit, supplier: x.supplier, estimated: String(+(suggestQty(x) * x.unitPrice).toFixed(2)) } }), 240); }}>
            <span className="item-ico">{emoji(x.category)}</span><div style={{ flex: 1 }}><strong>{x.name} is low</strong><small>{x.quantity} {x.unit} left · tap to draft an order</small></div><span className="tag red">Low</span>
          </button>
        ))}
        {pending.length > 0 && <button className="alert" onClick={() => { close(); go("Orders"); }}><span className="item-ico"><Ico n="note" /></span><div style={{ flex: 1 }}><strong>{pending.length} order{pending.length > 1 ? "s" : ""} to approve</strong><small>Nothing goes out without you</small></div><span className="tag warn">Review</span></button>}
        {unread.map((n) => (
          <button key={n.id} className="alert" onClick={() => { close(); if (n.kind === "invoice_review") go("Invoices"); else if (n.kind === "expiry") go("Stock"); else if (n.kind === "price_change") go("Reports"); else go("Orders"); }}>
            <span className="item-ico"><Ico n={n.kind === "expiry" ? "bin" : n.kind === "price_change" ? "note" : "box"} /></span><div style={{ flex: 1 }}><strong>{n.title}</strong>{n.body && <small>{n.body}</small>}</div>
          </button>
        ))}
        {total === 0 && <div className="empty"><span><Ico n="party" /></span><strong>All clear</strong>Everything is stocked and approved.</div>}
        {unread.length > 0 && <button className="btn soft block" onClick={() => d.act.markRead()}>Mark alerts as read</button>}
      </div>
    </Sheet>
  );
}

function MessageSheet({ d, close, notify }: P) {
  const items = d.purchases.filter((p) => p.status !== "Ordered");
  const base = items.length ? items.flatMap((p) => p.lines.map((l) => `• ${l.name} — ${l.ordered} ${l.unit}`)).join("\n") : "• (add your items here)";
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
    case "receive": return <ReceiveSheet {...p} id={modal.id} />;
    case "quick": return <QuickSheet {...p} />;
    case "alerts": return <AlertsSheet {...p} />;
    case "message": return <MessageSheet {...p} />;
    default: return <SettingsSheet {...p} />;
  }
}
