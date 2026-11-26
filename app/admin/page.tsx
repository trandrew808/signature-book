"use client";
import { useEffect, useState } from "react";
import EventsDashboard from "@/components/EventsDashboard";

/** Super-admin: every studio's events, unlocked with the ADMIN_PIN env var. */
export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const check = async (p: string) => {
    const r = await fetch("/api/events", { headers: { "x-admin-pin": p } });
    if (r.ok) { setUnlocked(true); try { sessionStorage.setItem("admin-pin", p); } catch {} return true; }
    setUnlocked(false); try { sessionStorage.removeItem("admin-pin"); } catch {} return false;
  };
  useEffect(() => { try { const s = sessionStorage.getItem("admin-pin"); if (s) { setPin(s); check(s); } } catch {} }, []);
  const unlock = async (e: React.FormEvent) => { e.preventDefault(); if (!(await check(pin))) { setMsg("Wrong admin PIN"); setTimeout(() => setMsg(null), 2500); } };

  if (!unlocked) {
    return (
      <div className="page selectable">
        <div className="bar"><div className="brand"><img className="logo" src="/logo.png" alt="Photo Lounge" /><span className="brand-sub">Admin</span></div></div>
        <form className="pin-gate" onSubmit={unlock}>
          <h2>Admin PIN</h2>
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="off" placeholder="••••" />
          <button className="primary" type="submit">Unlock</button>
          {msg && <div className="stat">{msg}</div>}
        </form>
      </div>
    );
  }
  return (
    <div className="page selectable">
      <div className="bar"><div className="brand"><img className="logo" src="/logo.png" alt="Photo Lounge" /><span className="brand-sub">Admin · all studios</span></div>
        <div className="right"><a className="tbtn" href="/app">Studio app</a></div></div>
      <EventsDashboard headers={{ "x-admin-pin": pin }} onUnauthorized={() => setUnlocked(false)} />
    </div>
  );
}
