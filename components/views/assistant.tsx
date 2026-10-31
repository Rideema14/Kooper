"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Send } from "lucide-react";
import { haptic } from "../ui";
import type { ChatMsg, ViewProps } from "../types";

const prompts = ["What should I reorder today?", "What have we wasted recently?", "Explain my ingredient costs", "Draft a message to my suppliers"];

export function Assistant({ d, go, chat, setChat }: ViewProps & { chat: ChatMsg[]; setChat: React.Dispatch<React.SetStateAction<ChatMsg[]>> }) {
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat, typing]);

  const send = async (text = input) => {
    const t = text.trim();
    if (!t || typing) return;
    haptic(6);
    setChat((v) => [...v, { role: "user", text: t }]); setInput(""); setTyping(true);
    try {
      const [r] = await Promise.all([
        fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: t, context: { inventory: d.inventory, waste: d.waste, purchases: d.purchases } }) }),
        new Promise((s) => setTimeout(s, 650)),
      ]);
      const j = await r.json();
      setChat((v) => [...v, { role: "bot", text: j.reply }]); haptic(10);
    } catch { setChat((v) => [...v, { role: "bot", text: "I couldn’t reach the demo assistant just now. Please try again." }]); }
    finally { setTyping(false); }
  };

  return (
    <div className="view">
      <header className="screen-head">
        <button className="round-btn" onClick={() => go("More")} aria-label="Back"><ChevronLeft /></button>
        <div className="sh-text"><h1>Ask Kooper</h1><p>Demo mode · answers come from your records</p></div>
      </header>
      <div className="chat" aria-live="polite">
        {chat.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}
        {typing && <div className="bubble bot typing" aria-label="Kooper is typing"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      <div className="composer">
        <div className="chips">{prompts.map((p) => <button key={p} className="chip quick" disabled={typing} onClick={() => send(p)}>{p}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about stock, costs or waste…" aria-label="Message" />
          <button className="send" type="submit" disabled={!input.trim() || typing} aria-label="Send"><Send /></button>
        </form>
      </div>
    </div>
  );
}