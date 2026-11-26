"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** First sign-in: name the studio. Users who already have one are sent on to /app. */
export default function StartPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { fetch("/api/studios").then((r) => r.json()).then((j) => { if (j.studios?.length) router.replace("/app"); }); }, [router]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await fetch("/api/studios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.error); return; }
    router.replace("/app");
  };

  return (
    <div className="page selectable">
      <div className="bar"><div className="brand"><img className="logo" src="/logo.png" alt="" /><span className="brand-sub">Signature Book</span></div></div>
      <form className="pin-gate" onSubmit={create} style={{ maxWidth: 440 }}>
        <h2 style={{ fontSize: 30 }}>Name your studio</h2>
        <p style={{ color: "var(--fg2)", margin: 0 }}>This is what couples and guests will see. You can change it later.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Golden Hour Studio" style={{ letterSpacing: 0, fontSize: 17 }} />
        <button className="primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Start my 14-day trial"}</button>
        {msg && <div className="stat">{msg}</div>}
      </form>
    </div>
  );
}
