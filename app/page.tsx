"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Boxes, ClipboardList, Home as HomeIcon, MoreHorizontal, Plus } from "lucide-react";
import type { SceneApi, ScrollState } from "@/components/scene";
import { isLow } from "@/lib/data";
import { useKooperData } from "@/lib/store";
import { Modals } from "@/components/modals";
import { useToasts, haptic } from "@/components/ui";
import type { ChatMsg, ModalState, Page, ViewProps } from "@/components/types";
import { Overview } from "@/components/views/overview";
import { Invoices } from "@/components/views/invoices";
import { Inventory } from "@/components/views/inventory";
import { Purchasing } from "@/components/views/purchasing";
import { Costing } from "@/components/views/costing";
import { Waste } from "@/components/views/waste";
import { Assistant } from "@/components/views/assistant";
import { Reports } from "@/components/views/reports";
import { More } from "@/components/views/more";

const Scene = dynamic(() => import("@/components/scene"), { ssr: false });

const links: { p: Page; t: string }[] = [
  { p: "Home", t: "Home" }, { p: "Stock", t: "Stock" }, { p: "Orders", t: "Orders" }, { p: "Invoices", t: "Invoices" },
  { p: "Costing", t: "Plate cost" }, { p: "Waste", t: "Waste" }, { p: "Assistant", t: "Ask Kooper" }, { p: "Reports", t: "Reports" },
];
const bandPx = (p: Page, h: number) => (p === "Home" ? Math.max(430, Math.round(h * 0.84)) : Math.min(330, Math.max(230, Math.round(h * 0.34))));

function Tab({ p, icon, label, badge, page, go }: { p: Page; icon: React.ReactNode; label: string; badge?: number; page: Page; go: (p: Page) => void }) {
  const on = p === "More" ? moreGroup.includes(page) : page === p;
  return <button className={`tab ${on ? "on" : ""}`} onClick={() => { haptic(5); go(p); }} aria-current={on ? "page" : undefined}>{icon}{label}{!!badge && <b>{badge}</b>}</button>;
}

const valid: Page[] = ["Home", "Stock", "Orders", "More", "Invoices", "Costing", "Waste", "Assistant", "Reports"];
const moreGroup: Page[] = ["More", "Invoices", "Costing", "Waste", "Assistant", "Reports"];

export default function App() {
  const d = useKooperData();
  const { notify, toastNode } = useToasts();
  const [page, setPage] = useState<Page>("Home");
  const [modal, setModal] = useState<ModalState>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const screen = useRef<HTMLDivElement>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [noGl, setNoGl] = useState(false);
  const [curtain, setCurtain] = useState<"on" | "open" | "gone">("on");
  // The intro opens as soon as the data has loaded — it never waits for the 3D scene (which keeps loading behind it).
  // Repeat visits in the same tab skip it entirely. (sessionStorage holds only this cosmetic flag.)
  useEffect(() => {
    try { if (sessionStorage.getItem("kooper_intro") === "1") setCurtain("gone"); } catch { /* storage blocked: just play the intro */ }
  }, []);
  useEffect(() => {
    if (!d.ready || curtain !== "on") return;
    const a = setTimeout(() => setCurtain("open"), 45), b = setTimeout(() => { setCurtain("gone"); try { sessionStorage.setItem("kooper_intro", "1"); } catch { /* ignore */ } }, 470);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [d.ready, curtain]);
  const focus: Page = page;
  const stageEl = useRef<HTMLDivElement>(null);
  const scroll = useRef<ScrollState>({ y: 0, band: 520 });
  const sceneApi = useRef<SceneApi | null>(null);
  const [target, setTarget] = useState<Page | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [reveal, setReveal] = useState<{ x: number; y: number; n: number } | null>(null);
  const busy = useRef(false);
  const pageRef = useRef<Page>("Home");
  const [vh, setVh] = useState(800);
  const [solid, setSolid] = useState(false);
  useEffect(() => { const f = () => setVh(innerHeight); f(); addEventListener("resize", f); return () => removeEventListener("resize", f); }, []);
  const band = bandPx(page, vh);
  scroll.current.band = bandPx(target ?? page, vh);
  pageRef.current = page;
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const y = e.currentTarget.scrollTop; scroll.current.y = y;
    const dim = Math.min(1, y / Math.max(200, scroll.current.band * 0.7));
    stageEl.current?.style.setProperty("--dim", String(dim));
    setSolid((v) => { const n = y > 48; return v === n ? v : n; });
  }, []);

  useEffect(() => { if (new URLSearchParams(location.search).has("nogl")) setNoGl(true); }, []);
  useEffect(() => {
    const h = decodeURIComponent(location.hash.slice(1)) as Page;
    if (valid.includes(h)) setPage(h);
  }, []);
  useEffect(() => {
    if (!d.ready) return;
    const n = d.inventory.filter(isLow).length;
    setChat((c) => c.length ? c : [{ role: "bot", text: `Hi! I’ve looked over your records. ${n} ${n === 1 ? "item is" : "items are"} at or below reorder level. What would you like to look into?` }]);
  }, [d.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = useCallback((p: Page) => {
    setPage(p);
    history.replaceState(null, "", `#${encodeURIComponent(p)}`);
    screen.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    scroll.current.y = 0; stageEl.current?.style.setProperty("--dim", "0"); setSolid(false);
  }, []);
  /** Changing screens: the table falls away, the camera dives onto that screen's object from above, and the page opens outward from it. */
  const go = useCallback((p: Page) => {
    if (p === pageRef.current) { screen.current?.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (busy.current) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { switchTo(p); return; }
    busy.current = true; haptic(6);
    const w = innerWidth, h = innerHeight;
    const ox = p === "Home" && w >= 900 ? -0.17 : 0;
    const origin = { x: w / 2 - ox * w, y: bandPx(p, h) / 2 };
    setTarget(p); setLeaving(true);
    sceneApi.current?.dive(p);
    setTimeout(() => {
      switchTo(p); setLeaving(false); setTarget(null);
      setReveal({ ...origin, n: Date.now() });
      setTimeout(() => { busy.current = false; setReveal(null); }, 1000);
    }, 780);
  }, [switchTo]);
  const close = useCallback(() => setModal(null), []);
  const open = useCallback((m: NonNullable<ModalState>) => { haptic(6); setModal(m); }, []);

  useEffect(() => {
    const root = screen.current; if (!root || !d.ready) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(".sect, .view .card, .view .menu, .view .trio, .view .plate, .view .scan, .view .verdict"));
    els.forEach((el) => el.classList.add("rv"));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { root, rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [page, d.ready, d.inventory.length, d.purchases.length]);

  const low = d.inventory.filter(isLow).length;
  const pending = d.purchases.filter((p) => p.status === "Needs approval").length;
  const unseen = d.notices.filter((n) => !n.readAt && !["low_stock", "po_approval"].includes(n.kind)).length;
  const props: ViewProps = { d, go, notify, open };
  const chatting = page === "Assistant";
  const tp = { page, go };

  return (
    <div className={`stage ${noGl ? "nogl" : ""} ${solid ? "solid" : ""} ${page === "Home" ? "is-home" : ""}`} ref={stageEl}>
      {!noGl && <Scene focus={focus} scroll={scroll} apiRef={sceneApi} intro={curtain !== "on"} onReady={() => setSceneReady(true)} onFail={() => setNoGl(true)} />}
      <div className="dim" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="topbar">
        <button className="place" onClick={() => go("Home")} aria-label="Home"><i>k</i><span>{d.me?.restaurant.name ?? "Kooper"}</span></button>
        <nav className="navlinks" aria-label="Sections">
          {links.map((l) => <button key={l.p} className={page === l.p ? "on" : ""} onClick={() => go(l.p)} aria-current={page === l.p ? "page" : undefined}>{l.t}{l.p === "Stock" && low > 0 && <b>{low}</b>}{l.p === "Orders" && pending > 0 && <b>{pending}</b>}</button>)}
        </nav>
        <div className="tools">
          <button className="btn lime sm quickadd" onClick={() => open({ type: "quick" })}><Plus /> Quick add</button>
          <button className={`round-btn ${low + pending + unseen > 0 ? "dot" : ""}`} aria-label="Alerts" onClick={() => open({ type: "alerts" })}><Bell /></button>
        </div>
      </header>

      <main className={`screen ${chatting ? "chat-screen" : ""} ${leaving ? "leaving" : ""}`} ref={screen} onScroll={onScroll} style={{ ["--band" as string]: `${band}px` }}>
        {!d.ready ? <div className="boot"><i /></div> : d.error ? (
          <div className="page"><div className="view"><div className="card" style={{ margin: "120px auto", maxWidth: 460, textAlign: "center" }}><h2>We couldn’t load your kitchen</h2><p className="muted" style={{ margin: "8px 0 16px" }}>{d.error}</p><button className="btn lime" onClick={() => location.reload()}>Try again</button></div></div></div>
        ) : (
          <div key={page} className={`page ${curtain === "on" ? "hold" : ""} ${reveal ? "reveal" : ""}`} style={reveal ? { ["--ox" as string]: `${reveal.x}px`, ["--oy" as string]: `${reveal.y}px` } : undefined}>
            {page === "Home" && <Overview {...props} />}
            {page === "Stock" && <Inventory {...props} />}
            {page === "Orders" && <Purchasing {...props} />}
            {page === "More" && <More {...props} />}
            {page === "Invoices" && <Invoices {...props} />}
            {page === "Costing" && <Costing {...props} />}
            {page === "Waste" && <Waste {...props} />}
            {page === "Assistant" && <Assistant {...props} chat={chat} setChat={setChat} />}
            {page === "Reports" && <Reports {...props} />}
          </div>
        )}
      </main>

      <nav className={`tabbar ${chatting ? "hide" : ""}`} aria-label="Main navigation">
        <Tab {...tp} p="Home" icon={<HomeIcon />} label="Home" />
        <Tab {...tp} p="Stock" icon={<Boxes />} label="Stock" badge={low} />
        <button className="fab" aria-label="Quick add" onClick={() => open({ type: "quick" })}><Plus /></button>
        <Tab {...tp} p="Orders" icon={<ClipboardList />} label="Orders" badge={pending} />
        <Tab {...tp} p="More" icon={<MoreHorizontal />} label="More" />
      </nav>

      <Modals modal={modal} d={d} close={close} notify={notify} go={go} open={open} />
      {toastNode}
      {curtain !== "gone" && <div className={`curtain ${curtain === "open" ? "ready" : ""}`} aria-hidden="true"><i /><i /><div>Kooper</div></div>}
    </div>
  );
}
