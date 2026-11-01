"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type Mode = "login" | "signup" | "forgot" | "reset" | "invite";
const COPY: Record<Mode, { title: string; sub: string; cta: string }> = {
  login: { title: "Welcome back", sub: "Sign in to your kitchen.", cta: "Sign in" },
  signup: { title: "Open your restaurant", sub: "Set up Kooper in a minute.", cta: "Create account" },
  forgot: { title: "Reset your password", sub: "We'll send a link if the account exists.", cta: "Send reset link" },
  reset: { title: "Choose a new password", sub: "At least 10 characters.", cta: "Save password" },
  invite: { title: "Join the team", sub: "You've been invited to a Kooper kitchen.", cta: "Accept invitation" },
};

export default function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
  const [f, set] = useState({ name: "", email: "", password: "", restaurantName: "" });
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; link?: string } | null>(null);
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => set({ ...f, [k]: e.target.value });
  const c = COPY[mode];

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setNote(null);
    const body = mode === "login" ? { email: f.email, password: f.password }
      : mode === "signup" ? f
      : mode === "forgot" ? { email: f.email }
      : mode === "reset" ? { token, password: f.password }
      : { token, name: f.name, password: f.password };
    const path = mode === "invite" ? "accept-invite" : mode;
    try {
      const r = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      if (mode === "forgot") { setNote({ text: j.message, link: j.devLink ?? undefined }); }
      else if (mode === "reset") { setNote({ text: "Password updated. You can sign in now." }); }
      else location.href = "/";
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit} aria-labelledby="auth-title">
        <i className="auth-mark">k</i>
        <h1 id="auth-title">{c.title}</h1>
        <p className="muted">{c.sub}</p>
        {mode === "signup" && <label><span className="label">Restaurant name</span><input className="field" required value={f.restaurantName} onChange={up("restaurantName")} autoComplete="organization" /></label>}
        {(mode === "signup" || mode === "invite") && <label><span className="label">Your name</span><input className="field" required value={f.name} onChange={up("name")} autoComplete="name" /></label>}
        {(mode === "login" || mode === "signup" || mode === "forgot") && <label><span className="label">Email</span><input className="field" type="email" required value={f.email} onChange={up("email")} autoComplete="email" /></label>}
        {mode !== "forgot" && <label><span className="label">Password</span><input className="field" type="password" required minLength={mode === "login" ? 1 : 10} value={f.password} onChange={up("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
        {err && <div className="auth-err" role="alert">{err}</div>}
        {note && <div className="auth-ok" role="status">{note.text}{note.link && <> <br /><a href={note.link}>Open reset link</a> <small>(shown only because email isn&apos;t configured, in development)</small></>}</div>}
       <button className="btn lime block" disabled={busy || !ready}>{!ready ? "Loading…" : busy ? "One moment…" : c.cta}</button>
        <div className="auth-links">
          {mode === "login" && <><Link href="/signup">Create an account</Link><Link href="/forgot">Forgot password?</Link></>}
          {mode !== "login" && <Link href="/login">Back to sign in</Link>}
        </div>
      </form>
    </main>
  );
}
