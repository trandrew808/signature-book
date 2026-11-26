"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const err = params.get("error");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(err === "expired" ? "That link expired. Request a new one." : null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) setMsg(error.message); else setSent(true);
  };

  return (
    <form className="pin-gate" onSubmit={send} style={{ maxWidth: 400 }}>
      <h2 style={{ fontSize: 30 }}>Sign in</h2>
      {sent ? (
        <p style={{ color: "var(--fg2)" }}>Check <b>{email}</b> for a sign-in link. It works on this device or any other.</p>
      ) : (
        <>
          <p style={{ color: "var(--fg2)", margin: 0 }}>No password. We email you a link.</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="you@studio.com" style={{ letterSpacing: 0, fontSize: 17 }} />
          <button className="primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a link"}</button>
        </>
      )}
      {msg && <div className="stat">{msg}</div>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="page selectable">
      <div className="bar"><div className="brand"><img className="logo" src="/logo.png" alt="" /><span className="brand-sub">Signature Book</span></div></div>
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
