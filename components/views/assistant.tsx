"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Send } from "lucide-react";
import { api } from "@/lib/store";
import { haptic } from "../ui";
import type { ChatMsg, ViewProps } from "../types";

const prompts = ["What should I reorder?", "Which ingredients went up in price?", "Which supplier is cheapest?", "What is my waste cost this month?", "Which dishes have poor profit?", "What should I prioritise today?"];

export function Assistant({ d, go, chat, setChat }: ViewProps & { chat: ChatMsg[]; setChat: React.Dispatch<React.SetStateAction<ChatMsg[]>> }) {
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat, typing]);

  const [mode, setMode] = useState<"gemini" | "basic" | null>(null);
  const [follow, setFollow] = useState<string[]>([]);
  const send = async (text = input) => {
    const t = text.trim();
    if (!t || typing) return;
    haptic(6);
    const history = chat.slice(-8);
    setChat((v) => [...v, { role: "user", text: t }]); setInput(""); setTyping(true); setFollow([]);
    try {
      const j = await api<{ reply: string; mode: "gemini" | "basic"; note: string | null; followUps: string[] }>("POST", "/api/assistant", { message: t, history });
      setChat((v) => [...v, { role: "bot", text: j.note ? `${j.reply}\n\n(${j.note})` : j.reply }]); setMode(j.mode); setFollow(j.followUps); haptic(10);
    } catch (e) { setChat((v) => [...v, { role: "bot", text: e instanceof Error ? e.message : "I couldn’t reach the assistant just now. Please try again." }]); }
    finally { setTyping(false); }
  };

  return (
    <div className="view">
      <header className="screen-head">
        <button className="round-btn" onClick={() => go("More")} aria-label="Back"><ChevronLeft /></button>
        <div className="sh-text"><h1>Ask Kooper</h1><p>{mode === "gemini" ? "Gemini · answers come only from your records" : mode === "basic" ? "Basic mode · simple lookup of your records" : "Answers come only from your records"}</p></div>
      </header>
      <div className="chat" aria-live="polite">
        {chat.map((m, i) => <div key={i} className={`bubble ${m.role}`} style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>)}
        {typing && <div className="bubble bot typing" aria-label="Kooper is typing"><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      <div className="composer">
        <div className="chips">{(follow.length ? follow : prompts).map((p) => <button key={p} className="chip quick" disabled={typing} onClick={() => send(p)}>{p}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about stock, costs or waste…" aria-label="Message" />
          <button className="send" type="submit" disabled={!input.trim() || typing} aria-label="Send"><Send /></button>
        </form>
      </div>
    </div>
  );
}