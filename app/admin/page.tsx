"use client";
import { useEffect, useRef, useState } from "react";
import { fileUrl, supabaseBrowser, PhotoRow } from "@/lib/supabase";

type Ev = { slug: string; title: string; editor_pin: string; gallery_token: string; qr_path: string | null; created_at: string; total: number; signed: number };

const safeName = (s: string | null) => ((s || "guest").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "guest");
const inputStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--fg)", font: "inherit" };

function saveBlob(filename: string, blob: Blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export default function AdminPage() {
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [events, setEvents] = useState<Ev[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ slug: string; title: string } | null>(null);
  const [preview, setPreview] = useState<{ ev: Ev; photos: PhotoRow[] } | null>(null);
  const qrFor = useRef<string | null>(null);
  const qrInput = useRef<HTMLInputElement>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const toast = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2600); };
  const api = (init: RequestInit = {}) => fetch("/api/events", { ...init, headers: { "content-type": "application/json", "x-admin-pin": pin, ...(init.headers || {}) } });

  const load = async (p = pin) => {
    const r = await fetch("/api/events", { headers: { "x-admin-pin": p } });
    if (r.status === 403) { setUnlocked(false); try { sessionStorage.removeItem("admin-pin"); } catch {} return false; }
    const j = await r.json(); setEvents(j.events || []); setUnlocked(true); return true;
  };
  useEffect(() => { try { const s = sessionStorage.getItem("admin-pin"); if (s) { setPin(s); load(s); } } catch {} // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlock = async (e: React.FormEvent) => { e.preventDefault(); if (await load()) { try { sessionStorage.setItem("admin-pin", pin); } catch {} } else toast("Wrong admin PIN"); };

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); if (!title.trim()) return; setBusy("create");
    try { const r = await api({ method: "POST", body: JSON.stringify({ title, date }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setTitle(""); setDate(""); await load(); toast(`Created /${j.event.slug}`); }
    catch (err: any) { toast(err.message); } finally { setBusy(null); }
  };
  const rename = async () => {
    if (!editing) return; setBusy(editing.slug);
    try { const r = await api({ method: "PATCH", body: JSON.stringify(editing) }); if (!r.ok) throw new Error((await r.json()).error); setEditing(null); await load(); toast("Renamed"); }
    catch (err: any) { toast(err.message); } finally { setBusy(null); }
  };
  const remove = async (slug: string) => {
    setBusy(slug);
    try { const r = await api({ method: "DELETE", body: JSON.stringify({ slug }) }); if (!r.ok) throw new Error((await r.json()).error); setConfirmSlug(null); if (preview?.ev.slug === slug) setPreview(null); await load(); toast("Deleted"); }
    catch (err: any) { toast(err.message); } finally { setBusy(null); }
  };
  const uploadQr = async (ev: Ev, f: File) => {
    setBusy(ev.slug);
    try {
      const fd = new FormData(); fd.append("slug", ev.slug); fd.append("pin", ev.editor_pin); fd.append("kind", "qr"); fd.append("file", f);
      const r = await fetch("/api/upload", { method: "POST", body: fd }); if (!r.ok) throw new Error((await r.json()).error);
      await load(); toast("QR code is live on the iPad");
    } catch (err: any) { toast(err.message); } finally { setBusy(null); }
  };
  const removeQr = async (ev: Ev) => {
    setBusy(ev.slug);
    try { await fetch("/api/upload", { method: "DELETE", body: JSON.stringify({ slug: ev.slug, pin: ev.editor_pin }), headers: { "content-type": "application/json" } }); await load(); toast("QR removed"); }
    finally { setBusy(null); }
  };
  const photosOf = async (ev: Ev) => {
    const sb = supabaseBrowser();
    const { data: e } = await sb.from("events").select("id").eq("slug", ev.slug).single();
    const { data } = await sb.from("photos").select("*").eq("event_id", e!.id).order("created_at", { ascending: true });
    return (data || []) as PhotoRow[];
  };
  const openPreview = async (ev: Ev) => { setPreview({ ev, photos: await photosOf(ev) }); };
  const download = async (ev: Ev, signedOnly: boolean) => {
    setBusy(ev.slug);
    try {
      const photos = (await photosOf(ev)).filter((p) => !signedOnly || p.signed_path);
      if (!photos.length) { toast("Nothing to download yet"); return; }
      const JSZip = (await import("jszip")).default; const zip = new JSZip(); const folder = zip.folder(ev.slug)!;
      let i = 0;
      for (const p of photos) {
        const base = `SB-${String(++i).padStart(3, "0")}-${safeName(p.guest_name)}`;
        setBusy(`${ev.slug}:${i}/${photos.length}`);
        const get = async (path: string | null) => { if (!path) return null; const r = await fetch(fileUrl(path)!); return r.ok ? r.blob() : null; };
        const [o, s, l] = await Promise.all([get(p.original_path), get(p.signed_path), get(p.layer_path)]);
        if (o) folder.file(`${base}-original.jpg`, o); if (s) folder.file(`${base}-signed.jpg`, s); if (l) folder.file(`${base}-ink.png`, l);
      }
      saveBlob(`${ev.slug}-${signedOnly ? "signed" : "all"}.zip`, await zip.generateAsync({ type: "blob" }));
    } catch (err: any) { toast("Download failed: " + (err?.message || "")); } finally { setBusy(null); }
  };
  const copy = async (text: string, label: string) => { try { await navigator.clipboard.writeText(text); toast(`${label} copied`); } catch { toast("Select and copy the link manually"); } };

  if (!unlocked) {
    return (
      <div className="page">
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
    <div className="page">
      <div className="bar"><div className="brand"><img className="logo" src="/logo.png" alt="Photo Lounge" /><span className="brand-sub">Admin</span></div>
        <div className="right"><span className="stat">{events.length} {events.length === 1 ? "event" : "events"}</span></div></div>
      <div className="wrap" style={{ maxWidth: 1000, margin: "0 auto", width: "100%" }}>
        <h2 style={{ fontSize: 30, marginBottom: 6 }}>New event</h2>
        <p style={{ color: "var(--fg2)", margin: "0 0 14px" }}>Couple's names and the wedding date. The links and editor PIN are generated for you.</p>
        <form className="row" onSubmit={create} style={{ marginTop: 0 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sarah & Kai" required style={{ ...inputStyle, flex: 2, minWidth: 200 }} />
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
          <button className="primary" type="submit" disabled={busy === "create"}>Create event</button>
        </form>

        <h2 style={{ fontSize: 30, margin: "36px 0 14px" }}>Events</h2>
        <div style={{ display: "grid", gap: 14 }}>
          {events.map((ev) => {
            const booth = `${origin}/${ev.slug}`, upload = `${origin}/${ev.slug}/upload`, gallery = `${origin}/${ev.slug}/gallery?key=${ev.gallery_token}`;
            const isBusy = !!busy && busy.startsWith(ev.slug);
            return (
              <div key={ev.slug} style={{ border: "1px solid var(--line)", background: "var(--card)", padding: 16 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                  {editing?.slug === ev.slug ? (
                    <>
                      <input autoFocus value={editing.title} onChange={(e) => setEditing({ slug: ev.slug, title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setEditing(null); }} style={{ ...inputStyle, fontFamily: "var(--display)", fontSize: 22, minWidth: 220 }} />
                      <button className="tbtn" onClick={rename}>Save</button><button className="tbtn" onClick={() => setEditing(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <b style={{ fontFamily: "var(--display)", fontWeight: 400, fontSize: 24 }}>{ev.title}</b>
                      <button className="tbtn" onClick={() => setEditing({ slug: ev.slug, title: ev.title })}>Rename</button>
                    </>
                  )}
                  <span className="stat">/{ev.slug}</span>
                  <span className="stat" style={{ marginLeft: "auto" }}>{ev.signed} signed of {ev.total}</span>
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 14, fontSize: 14 }}>
                  <Row label="iPad" value={booth} onCopy={() => copy(booth, "iPad link")} />
                  <Row label="Editor" value={`${upload}  ·  PIN ${ev.editor_pin}`} onCopy={() => copy(`${upload}\nPIN: ${ev.editor_pin}`, "Editor link and PIN")} />
                  <Row label="Couple" value={gallery} onCopy={() => copy(gallery, "Couple's gallery link")} />
                </div>

                <div className="row" style={{ marginTop: 14, alignItems: "center" }}>
                  {ev.qr_path ? <img src={fileUrl(ev.qr_path)!} alt="" className="qr-preview" /> : <span className="stat">No QR code yet</span>}
                  <button className="tbtn" disabled={isBusy} onClick={() => { qrFor.current = ev.slug; qrInput.current?.click(); }}>{ev.qr_path ? "Replace QR" : "Upload QR code"}</button>
                  {ev.qr_path && <button className="tbtn" disabled={isBusy} onClick={() => removeQr(ev)}>Remove QR</button>}
                  <span style={{ flex: 1 }} />
                  <button className="tbtn" onClick={() => openPreview(ev)}>View gallery</button>
                  <a className="tbtn" href={gallery} target="_blank" rel="noreferrer">Open couple's view</a>
                  <button className="primary" disabled={isBusy || !ev.signed} onClick={() => download(ev, true)}>{isBusy && busy!.includes(":") ? "Packing " + busy!.split(":")[1] : "Download signed"}</button>
                  <button className="tbtn" disabled={isBusy || !ev.total} onClick={() => download(ev, false)}>All files</button>
                </div>

                <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                  {confirmSlug === ev.slug ? (
                    <>
                      <span className="stat" style={{ color: "var(--bad)" }}>Deletes every portrait and note for this event. Download first.</span>
                      <button className="tbtn" onClick={() => setConfirmSlug(null)}>Keep</button>
                      <button className="tbtn" style={{ color: "var(--bad)", borderColor: "var(--bad)" }} disabled={isBusy} onClick={() => remove(ev.slug)}>Delete for good</button>
                    </>
                  ) : (
                    <button className="tbtn" onClick={() => setConfirmSlug(ev.slug)}>Delete event</button>
                  )}
                </div>
              </div>
            );
          })}
          {events.length === 0 && <div className="empty"><h3>No events yet</h3><p>Create the first one above.</p></div>}
        </div>
      </div>

      <input ref={qrInput} type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; const ev = events.find((x) => x.slug === qrFor.current); if (f && ev) uploadQr(ev, f); }} />

      {preview && (
        <div className="lightbox" style={{ justifyContent: "flex-start", overflowY: "auto", padding: 24 }}>
          <button className="lb-close" onClick={() => setPreview(null)}>Close</button>
          <div style={{ width: "100%", maxWidth: 1100, marginTop: 40 }}>
            <div className="eyebrow" style={{ color: "#A89E99" }}>{preview.ev.slug}</div>
            <h2 style={{ fontSize: 32, color: "#F1EAE5" }}>{preview.ev.title}</h2>
            <p style={{ color: "#A89E99" }}>{preview.photos.filter((p) => p.signed_path).length} signed of {preview.photos.length}</p>
            <div className="gal" style={{ margin: "16px 0 0" }}>
              {preview.photos.map((p) => (
                <figure key={p.id} style={{ background: "#262321", borderColor: "#3A3532", cursor: "default" }}>
                  <img src={fileUrl(p.signed_path || p.original_path)!} alt="" loading="lazy" />
                  <figcaption style={{ color: "#A89E99" }}><b style={{ color: "#F1EAE5" }}>{p.signed_path ? p.guest_name || "A guest" : "Unsigned"}</b><span>{p.signed_at ? new Date(p.signed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</span></figcaption>
                </figure>
              ))}
            </div>
            {preview.photos.length === 0 && <div className="empty" style={{ color: "#A89E99" }}><p>No portraits uploaded yet.</p></div>}
          </div>
        </div>
      )}
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 10, alignItems: "center", minWidth: 0 }}>
      <span className="eyebrow">{label}</span>
      <code style={{ fontSize: 13, color: "var(--fg2)", overflowWrap: "anywhere", userSelect: "text", WebkitUserSelect: "text" }}>{value}</code>
      <button className="tbtn" onClick={onCopy}>Copy</button>
    </div>
  );
}
