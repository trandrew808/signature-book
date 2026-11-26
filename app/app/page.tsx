"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EventsDashboard from "@/components/EventsDashboard";
import type { Studio } from "@/lib/auth";

const PLAN_LABEL: Record<string, string> = { trial: "Trial", starter: "Starter", studio: "Studio", white_label: "White Label" };

/** The studio's home: its events, links, PINs and downloads. Signed in via magic link. */
export default function StudioApp() {
  const router = useRouter();
  const [studios, setStudios] = useState<Studio[] | null>(null);
  const [current, setCurrent] = useState<Studio | null>(null);

  useEffect(() => {
    fetch("/api/studios").then(async (r) => {
      if (r.status === 401) { router.replace("/login?next=/app"); return; }
      const j = await r.json();
      if (!j.studios?.length) { router.replace("/start"); return; }
      setStudios(j.studios);
      let pick = j.studios[0];
      try { const saved = localStorage.getItem("studio"); const f = j.studios.find((s: Studio) => s.id === saved); if (f) pick = f; } catch {}
      setCurrent(pick);
    });
  }, [router]);

  const signOut = async () => { await fetch("/api/auth", { method: "DELETE" }); router.replace("/login"); };

  if (!current) return <div className="page"><div className="bar"><div className="brand"><img className="logo" src="/logo.png" alt="" /><span className="brand-sub">Signature Book</span></div></div><div className="empty"><p>Loading…</p></div></div>;

  const trialDays = current.plan === "trial" && current.trial_ends_at ? Math.max(0, Math.ceil((new Date(current.trial_ends_at).getTime() - Date.now()) / 86400000)) : null;
  const banner = current.plan === "trial" ? (
    <div style={{ border: "1px solid var(--accent)", background: "var(--card)", padding: "12px 16px", marginBottom: 24, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span><b>Trial</b> · {trialDays} {trialDays === 1 ? "day" : "days"} left. Everything is unlocked while you try it.</span>
      <a className="tbtn" href="/app/billing" style={{ marginLeft: "auto" }}>Choose a plan</a>
    </div>
  ) : current.plan_status === "past_due" ? (
    <div style={{ border: "1px solid var(--bad)", background: "var(--card)", padding: "12px 16px", marginBottom: 24 }}>Your last payment didn't go through. <a href="/app/billing" style={{ textDecoration: "underline" }}>Update your card</a> to keep creating events.</div>
  ) : null;

  return (
    <div className="page selectable">
      <div className="bar">
        <div className="brand"><img className="logo" src="/logo.png" alt="" /><span className="brand-sub">Signature Book</span></div>
        <div className="right">
          {studios && studios.length > 1 ? (
            <select value={current.id} onChange={(e) => { const s = studios.find((x) => x.id === e.target.value)!; setCurrent(s); try { localStorage.setItem("studio", s.id); } catch {} }} style={{ font: "inherit", padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 999, background: "var(--card)", color: "var(--fg)" }}>
              {studios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : <span>{current.name}</span>}
          <span className="stat">{PLAN_LABEL[current.plan] || current.plan}</span>
          <a className="tbtn" href="/app/settings">Settings</a>
          <button className="tbtn" onClick={signOut}>Sign out</button>
        </div>
      </div>
      <EventsDashboard studioId={current.id} banner={banner} onUnauthorized={() => router.replace("/login?next=/app")} />
    </div>
  );
}
