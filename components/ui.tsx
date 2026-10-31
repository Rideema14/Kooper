"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE, type ReactNode } from "react";
import { Bean, Beef, CheckCircle2, ChevronLeft, ClipboardList, Compass, Fish, Inbox, Leaf, Milk, Package, PartyPopper, Recycle, Repeat, Search, Sprout, Trash2, Wheat, Droplets, Salad } from "lucide-react";

export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };
const ICONS: Record<string, ReactNode> = {
  Produce: <Salad />, Dairy: <Milk />, Pantry: <Droplets />, Meat: <Beef />, Seafood: <Fish />, Grain: <Wheat />, Other: <Package />,
  box: <Package />, note: <ClipboardList />, bin: <Trash2 />, search: <Search />, done: <CheckCircle2 />, empty: <Inbox />, sprout: <Sprout />,
  repeat: <Repeat />, compass: <Compass />, recycle: <Recycle />, party: <PartyPopper />, leaf: <Leaf />, bean: <Bean />,
};
export const emoji = (c: string): ReactNode => ICONS[c] ?? ICONS.Other;
export const Ico = ({ n }: { n: string }) => <>{ICONS[n] ?? ICONS.Other}</>;

/* ── Animated number ── */
export function CountUp({ to, format = (n: number) => String(Math.round(n)), duration = 800 }: { to: number; format?: (n: number) => string; duration?: number }) {
  const [val, setVal] = useState(to);
  const from = useRef(to);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setVal(to); from.current = to; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setVal(a + (to - a) * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = to; };
  }, [to, duration]);
  return <>{format(val)}</>;
}

/* ── Screen wrapper with big title ── */
export function Screen({ title, sub, back, action, children }: { title: ReactNode; sub?: ReactNode; back?: () => void; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="view">
      <header className="screen-head">
        {back && <button className="round-btn" onClick={back} aria-label="Back"><ChevronLeft /></button>}
        <div className="sh-text"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
        {action}
      </header>
      {children}
    </div>
  );
}

export const Section = ({ title, aside }: { title: string; aside?: ReactNode }) => <div className="sect"><h2>{title}</h2>{aside}</div>;
export const Empty = ({ icon = "leaf", title, text }: { icon?: string; title: string; text?: string }) => <div className="empty"><span><Ico n={icon} /></span><strong>{title}</strong>{text}</div>;

/* ── Ring gauge ── */
export function Ring({ value, size = 104, stroke = 11, color = "var(--lime)", track = "#ffffff26", children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  const [m, setM] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(t); }, []);
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={m ? c * (1 - v) : c} style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.9,.2,1), stroke .3s" }} />
      </svg>
      <div className="gauge-in">{children}</div>
    </div>
  );
}

/* ── Segmented control with sliding thumb ── */
export function Segmented<T extends string>({ options, value, onChange, counts }: { options: T[]; value: T; onChange: (v: T) => void; counts?: Partial<Record<T, number>> }) {
  return (
    <div className="seg" style={{ ["--n" as string]: options.length, ["--i" as string]: options.indexOf(value) }}>
      <span className="seg-thumb" />
      {options.map((o) => (
        <button key={o} className={o === value ? "on" : ""} onClick={() => { haptic(4); onChange(o); }}>
          {o}{counts?.[o] !== undefined && <b>{counts[o]}</b>}
        </button>
      ))}
    </div>
  );
}

/* ── Swipe-left row actions ── */
export type SwipeAction = { label: string; icon: ReactNode; tone: "lime" | "red" | "plum"; onClick: () => void };
export function SwipeRow({ children, actions }: { children: ReactNode; actions: SwipeAction[] }) {
  const W = actions.length * 76;
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const st = useRef<{ x: number; y: number; base: number; on: boolean } | null>(null);
  const moved = useRef(false);
  const down = (e: RPE) => { st.current = { x: e.clientX, y: e.clientY, base: x, on: false }; moved.current = false; };
  const move = (e: RPE) => {
    const s = st.current; if (!s) return;
    const dx = e.clientX - s.x;
    if (!s.on && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.4) { s.on = true; setDrag(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
    if (s.on) { moved.current = true; setX(Math.max(-W - 24, Math.min(0, s.base + dx))); }
  };
  const up = () => {
    const s = st.current; st.current = null;
    if (s?.on) { setDrag(false); const open = x < -W / 2; setX(open ? -W : 0); if (open) haptic(6); }
  };
  return (
    <div className="swipe">
      <div className="swipe-actions" style={{ width: W }}>
        {actions.map((a) => <button key={a.label} className={`sw-${a.tone}`} onClick={() => { setX(0); haptic(10); a.onClick(); }}>{a.icon}<span>{a.label}</span></button>)}
      </div>
      <div className="swipe-front" style={{ transform: `translateX(${x}px)`, transition: drag ? "none" : "transform .35s cubic-bezier(.2,.9,.2,1)" }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } else if (x !== 0) { e.stopPropagation(); setX(0); } }}>
        {children}
      </div>
    </div>
  );
}

/* ── Bottom sheet (drag the handle down to close) ── */
export function Sheet({ title, desc, onClose, children }: { title: string; desc?: string; onClose: () => void; children: ReactNode }) {
  const [dy, setDy] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<number | null>(null);
  const cb = useRef(onClose); cb.current = onClose;
  const close = useCallback(() => { setLeaving(true); setTimeout(() => cb.current(), 220); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className={`scrim ${leaving ? "out" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`sheet ${leaving ? "out" : ""}`} role="dialog" aria-modal="true" aria-label={title} style={{ transform: leaving ? undefined : dy ? `translateY(${dy}px)` : undefined, transition: start.current === null ? "transform .3s cubic-bezier(.2,.9,.2,1)" : "none" }}>
        <div className="grab" onPointerDown={(e) => { start.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => start.current !== null && setDy(Math.max(0, e.clientY - start.current))}
          onPointerUp={() => { const d = dy; start.current = null; if (d > 110) close(); else setDy(0); }}>
          <i />
        </div>
        <h2>{title}</h2>
        {desc && <p className="sheet-desc">{desc}</p>}
        {children}
      </div>
    </div>
  );
}
export function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return <label className={full ? "full" : undefined}><span className="label">{label}</span>{children}</label>;
}

/* ── Toasts (top pill, optional Undo) ── */
type T = { id: number; text: string; undo?: () => void; out?: boolean };
export function useToasts() {
  const [toasts, setToasts] = useState<T[]>([]);
  const kill = (id: number) => { setToasts((t) => t.map((x) => (x.id === id ? { ...x, out: true } : x))); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 260); };
  const notify = useCallback((text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-1), { id, text, undo }]);
    setTimeout(() => kill(id), undo ? 5000 : 2800);
  }, []);
  const node = (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.out ? "out" : ""}`}>
          <CheckCircle2 /><span>{t.text}</span>
          {t.undo && <button onClick={() => { t.undo?.(); kill(t.id); haptic(6); }}>Undo</button>}
        </div>
      ))}
    </div>
  );
  return { notify, toastNode: node };
}

/* ── Stock level bar with reorder tick ── */
export function Level({ qty, reorder }: { qty: number; reorder: number }) {
  const max = Math.max(reorder * 2, 1);
  const pct = Math.max(4, Math.min(100, (qty / max) * 100));
  return (
    <div className="level" role="img" aria-label={`${qty} on hand, reorder at ${reorder}`}>
      <div className={`level-fill ${qty <= reorder ? "low" : ""}`} style={{ width: `${pct}%` }} />
      <span className="level-tick" />
    </div>
  );
}

export const insertAt = <A,>(arr: A[], i: number, item: A) => [...arr.slice(0, Math.min(i, arr.length)), item, ...arr.slice(Math.min(i, arr.length))];