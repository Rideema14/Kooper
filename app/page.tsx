"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Boxes, ClipboardList, Home as HomeIcon, MoreHorizontal, Plus } from "lucide-react";
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

const valid: Page[] = ["Home", "Stock", "Orders", "More", "Invoices", "Costing", "Waste", "Assistant", "Reports"];
const moreGroup: Page[] = ["More", "Invoices", "Costing", "Waste", "Assistant", "Reports"];

export default function App() {
  const d = useKooperData();
  const { notify, toastNode } = useToasts();
  const [page, setPage] = useState<Page>("Home");
  const [modal, setModal] = useState<ModalState>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const screen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = decodeURIComponent(location.hash.slice(1)) as Page;
    if (valid.includes(h)) setPage(h);
  }, []);
  useEffect(() => {
    if (!d.ready) return;
    const n = d.inventory.filter(isLow).length;
    setChat((c) => c.length ? c : [{ role: "bot", text: `Hi! I’ve looked over your records. ${n} ${n === 1 ? "item is" : "items are"} at or below reorder level. What would you like to look into?` }]);
  }, [d.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((p: Page) => {
    setPage(p);
    history.replaceState(null, "", `#${encodeURIComponent(p)}`);
    screen.current?.scrollTo({ top: 0 });
  }, []);
  const close = useCallback(() => setModal(null), []);
  const open = useCallback((m: NonNullable<ModalState>) => { haptic(6); setModal(m); }, []);

  const low = d.inventory.filter(isLow).length;
  const pending = d.purchases.filter((p) => p.status === "Needs approval").length;
  const props: ViewProps = { d, go, notify, open };
  const chatting = page === "Assistant";

  const Tab = ({ p, icon, label, badge }: { p: Page; icon: React.ReactNode; label: string; badge?: number }) => {
    const on = p === "More" ? moreGroup.includes(page) : page === p;
    return <button className={`tab ${on ? "on" : ""}`} onClick={() => { haptic(5); go(p); }} aria-current={on ? "page" : undefined}>{icon}{label}{!!badge && <b>{badge}</b>}</button>;
  };

  return (
    <div className="stage">
      <div className="phone">
        <header className="appbar">
          <div className="place"><i>k</i>Olive &amp; Oak</div>
          <button className={`round-btn ${low + pending > 0 ? "dot" : ""}`} aria-label="Alerts" onClick={() => open({ type: "alerts" })}><Bell /></button>
        </header>

        <div className={`screen ${chatting ? "chat-screen" : ""}`} ref={screen}>
          {!d.ready ? <div className="boot"><i /></div> : (
            <div key={page}>
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
        </div>

        <nav className={`tabbar ${chatting ? "hide" : ""}`} aria-label="Main navigation">
          <Tab p="Home" icon={<HomeIcon />} label="Home" />
          <Tab p="Stock" icon={<Boxes />} label="Stock" badge={low} />
          <button className="fab" aria-label="Quick add" onClick={() => open({ type: "quick" })}><Plus /></button>
          <Tab p="Orders" icon={<ClipboardList />} label="Orders" badge={pending} />
          <Tab p="More" icon={<MoreHorizontal />} label="More" />
        </nav>

        <Modals modal={modal} d={d} close={close} notify={notify} go={go} open={open} />
        {toastNode}
      </div>
    </div>
  );
}