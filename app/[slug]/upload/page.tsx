"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useEvent } from "@/lib/useEvent";
import { fileUrl, PhotoRow } from "@/lib/supabase";

export default function UploadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { event, photos, status } = useEvent(slug);
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<PhotoRow | null>(null);
  const signed = useMemo(() => photos.filter((p) => p.signed_path).sort((a, b) => (b.signed_at! > a.signed_at! ? 1 : -1)), [photos]);
  const fileRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { const s = sessionStorage.getItem("pin:" + slug); if (s) { setPin(s); setUnlocked(true); } } catch {} }, [slug]);

  const toast = (t: string, ms = 2500) => { setMsg(t); setTimeout(() => setMsg(null), ms); };

  const post = async (file: File, kind: "photo" | "qr") => {
    const fd = new FormData(); fd.append("slug", slug); fd.append("pin", pin); fd.append("kind", kind); fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403) { setUnlocked(false); try { sessionStorage.removeItem("pin:" + slug); } catch {} throw new Error("Wrong PIN"); }
    if (!r.ok) throw new Error(j.error || "upload failed");
    return j;
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!list.length) return;
    let n = 0;
    for (const f of list) {
      setBusy(`Uploading ${n + 1} of ${list.length}…`);
      try { await post(f, "photo"); n++; } catch (e: any) { toast(`${f.name}: ${e.message}`); }
    }
    setBusy(null); toast(`${n} added to the book`);
  };

  const removePhoto = async (id: string) => {
    try {
      const r = await fetch("/api/photos", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, slug, pin }) });
      if (!r.ok) throw new Error((await r.json()).error || "delete failed");
      toast("Portrait removed");
    } catch (e: any) { toast(e.message); } finally { setConfirmId(null); }
  };

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    // dry: true only checks the PIN; nothing is changed.
    const r = await fetch("/api/upload", { method: "DELETE", body: JSON.stringify({ slug, pin, dry: true }), headers: { "content-type": "application/json" } });
    if (r.status === 404) { toast("No event with that slug"); return; }
    if (r.status === 403) { toast("Wrong PIN"); return; }
    if (!r.ok) { toast("Could not check the PIN"); return; }
    setUnlocked(true); try { sessionStorage.setItem("pin:" + slug, pin); } catch {}
  };

  if (status === "missing") return <div className="empty"><h3>No event at this link</h3></div>;

  if (!unlocked) {
    return (
      <div className="page">
        <div className="bar"><div className="brand"><img className="logo" src="/logo.png" alt="Photo Lounge" /><span className="brand-sub">Signature Book</span></div></div>
        <form className="pin-gate" onSubmit={unlock}>
          <div className="eyebrow">{event?.title || slug}</div>
          <h2>Editor PIN</h2>
          <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="••••" />
          <button className="primary" type="submit">Unlock</button>
          {msg && <div className="stat">{msg}</div>}
        </form>
      </div>
    );
  }

  const qr = fileUrl(event?.qr_path);
  const galleryLink = typeof window !== "undefined" ? `${window.location.origin}/${slug}/gallery` : `/${slug}/gallery`;

  return (
    <div className="page">
      <div className="bar">
        <div className="brand"><img className="logo" src="/logo.png" alt="Photo Lounge" /><span className="brand-sub">Signature Book</span></div>
        <div className="right"><span>{event?.title}</span><a className="tbtn" href={`/${slug}`} target="_blank" rel="noreferrer">Open iPad view</a></div>
      </div>
      <div className="wrap two">
        <div className="panel">
          <h2>Send portraits to the iPad</h2>
          <p>Export from Lightroom straight into this drop zone, or run the watcher on the laptop so exports upload themselves.</p>
          <label className={"drop" + (over ? " over" : "")}
            onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setOver(false); }} onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
            <strong>Drop edited JPEGs here</strong>
            or click to choose files
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <div className="row">
            <span className="stat">{busy || `${photos.length} ${photos.length === 1 ? "portrait" : "portraits"} in the book · ${photos.filter((p) => p.signed_path).length} signed`}</span>
          </div>
          <div className="recent-list">
            {photos.slice(0, 24).map((p) => (
              <div className="tile" key={p.id}>
                <img src={fileUrl(p.original_path)!} alt="" loading="lazy" />
                {p.signed_path && <span className="mark">✓</span>}
                {confirmId === p.id ? (
                  <div className="tile-confirm">
                    <span>{p.signed_path ? "Signed. Delete anyway?" : "Delete?"}</span>
                    <button className="tbtn danger" onClick={() => removePhoto(p.id)}>Delete</button>
                    <button className="tbtn" onClick={() => setConfirmId(null)}>Keep</button>
                  </div>
                ) : (
                  <button className="tile-x" aria-label="Delete this portrait" onClick={() => setConfirmId(p.id)}>×</button>
                )}
              </div>
            ))}
          </div>

          <h2 style={{ marginTop: 28 }}>Signed tonight</h2>
          <p>{signed.length ? `${signed.length} ${signed.length === 1 ? "guest has" : "guests have"} written a note. Newest first; tap one to see it large.` : "Nothing signed yet. Signed portraits appear here the moment a guest taps Save."}</p>
          <div className="signed-list">
            {signed.map((p) => (
              <figure key={p.id} onClick={() => setLightbox(p)}>
                <img src={fileUrl(p.signed_path)!} alt={p.guest_name ? `Signed by ${p.guest_name}` : "Signed portrait"} loading="lazy" />
                <figcaption><b>Signed</b><span>{p.signed_at ? new Date(p.signed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</span></figcaption>
              </figure>
            ))}
          </div>

          <h2 style={{ marginTop: 28 }}>Online gallery QR code</h2>
          <p>Upload this event's pre-registration QR code. Guests see it on the welcome screen and after they sign.</p>
          <div className="row">
            <label className="tbtn" htmlFor="qrInput">Upload QR code</label>
            <input id="qrInput" ref={qrRef} type="file" accept="image/png,image/jpeg,image/svg+xml" hidden
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { await post(f, "qr"); toast("QR code is live on the iPad"); } catch (err: any) { toast(err.message); } }} />
            {qr && <img className="qr-preview" src={qr} alt="" />}
            {qr && <button className="tbtn" onClick={async () => { const r = await fetch("/api/upload", { method: "DELETE", body: JSON.stringify({ slug, pin }), headers: { "content-type": "application/json" } }); toast(r.ok ? "QR removed" : "Could not remove"); }}>Remove</button>}
          </div>

          <h2 style={{ marginTop: 28 }}>Couple's gallery link</h2>
          <p>Send this to the couple after the wedding. The key is in the event's row in Supabase (gallery_token).</p>
          <code className="stat" style={{ wordBreak: "break-all" }}>{galleryLink}?key=…</code>
        </div>
        <div className="panel">
          <h2>Night-of workflow</h2>
          <ol className="steps">
            <li><div><b>Shoot in the lounge</b><small>Tethered or card to laptop. Keep a consistent frame so the grid reads clean.</small></div></li>
            <li><div><b>Edit in Lightroom</b><small>Apply the event preset, export 2500px long edge JPEG (quality 85) into the watched folder.</small></div></li>
            <li><div><b>Auto-upload</b><small><code>npm run watcher</code> on the laptop posts every new export here. No clicks.</small></div></li>
            <li><div><b>Guests find themselves</b><small>The iPad shows "Just taken" first, so the guests who just stepped away from the camera see their portrait at the top.</small></div></li>
            <li><div><b>Deliver</b><small>The gallery link is the couple's signed set, with a one-click ZIP for Pic-Time.</small></div></li>
          </ol>
          <p className="note">iPad setup: open <code>/{slug}</code> in Safari, Share → Add to Home Screen, open it from there, then triple-click the top button for Guided Access so guests can't leave.</p>
        </div>
      </div>
      {lightbox && (
        <div className="lightbox" role="dialog" aria-label="Signed portrait" onClick={() => setLightbox(null)}>
          <button className="lb-close" onClick={() => setLightbox(null)}>Close</button>
          <img src={fileUrl(lightbox.signed_path)!} alt="Signed portrait" />
          <div className="lb-bar"><b>Signed</b><span className="stat">{lightbox.signed_at ? new Date(lightbox.signed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}</span></div>
        </div>
      )}
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
