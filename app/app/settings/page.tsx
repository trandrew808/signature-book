"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Studio } from "@/lib/auth";

const inputStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--fg)", font: "inherit", width: "100%" };

export default function SettingsPage() {
  const router = useRouter();
  const [studio, setStudio] = useState<Studio | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const toast = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2500); };

  useEffect(() => {
    fetch("/api/studios").then(async (r) => {
      if (r.status === 401) { router.replace("/login?next=/app/settings"); return; }
      const j = await r.json(); if (!j.studios?.length) { router.replace("/start"); return; }
      let s = j.studios[0]; try { const saved = localStorage.getItem("studio"); s = j.studios.find((x: Studio) => x.id === saved) || s; } catch {}
      setStudio(s); setName(s.name);
    });
  }, [router]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!studio) return;
    const r = await fetch("/api/studios", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: studio.id, name }) });
    const j = await r.json(); if (!r.ok) { toast(j.error); return; } setStudio(j.studio); toast("Saved");
  };

  if (!studio) return <div className="page"><div className="empty"><p>Loading…</p></div></div>;
  return (
    <div className="page selectable">
      <div className="bar"><div className="brand"><img className="logo" src="/logo.png" alt="" /><span className="brand-sub">Settings</span></div><div className="right"><a className="tbtn" href="/app">Back to events</a></div></div>
      <div className="wrap" style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <h2 style={{ fontSize: 30, marginBottom: 6 }}>Studio</h2>
        <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
          <label className="eyebrow">Studio name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required />
          <div><button className="primary" type="submit">Save</button></div>
        </form>
        <h2 style={{ fontSize: 30, margin: "36px 0 6px" }}>Branding</h2>
        <p style={{ color: "var(--fg2)" }}>Your logo, accent color and thank-you message on every guest screen are coming next — White Label plans also remove the "Powered by" line.</p>
        <h2 style={{ fontSize: 30, margin: "36px 0 6px" }}>Plan</h2>
        <p style={{ color: "var(--fg2)" }}>Current plan: <b>{studio.plan}</b> ({studio.plan_status}). <a href="/app/billing" style={{ textDecoration: "underline" }}>Manage billing</a></p>
      </div>
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
