"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import SignCanvas, { SignResult } from "@/components/SignCanvas";
import Slideshow from "@/components/Slideshow";
import { useEvent } from "@/lib/useEvent";
import { fileUrl, PhotoRow } from "@/lib/supabase";

const RECENT_MS = 15 * 60 * 1000;
const IDLE_MS = 60 * 1000;        // booth drifts into the slideshow after a minute untouched
const HOLD_TO_UNLOCK_MS = 2000;   // long-press on the logo to leave kiosk mode
const KIOSK_PIN = "0000";         // crew code to leave kiosk mode

export default function BoothPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { event, photos, status } = useEvent(slug);
  const [current, setCurrent] = useState<PhotoRow | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);
  const [kiosk, setKiosk] = useState(false);
  const [idle, setIdle] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // kiosk state survives reloads
  useEffect(() => { try { setKiosk(localStorage.getItem("kiosk:" + slug) === "1"); } catch {} }, [slug]);
  const setKioskPersist = (on: boolean) => { setKiosk(on); try { localStorage.setItem("kiosk:" + slug, on ? "1" : "0"); } catch {} };

  // idle → slideshow (only when nothing is open)
  const touch = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => { if (!current && !thanks && !unlock) setIdle(true); }, IDLE_MS);
  };
  useEffect(() => { touch(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, thanks, unlock]);

  const { recent, earlier } = useMemo(() => {
    const cutoff = Date.now() - RECENT_MS;
    const recent = photos.filter((p) => Date.parse(p.created_at) > cutoff && !p.signed_path).slice(0, 6);
    const earlier = photos.filter((p) => !recent.includes(p));
    return { recent, earlier };
  }, [photos]);

  const qr = fileUrl(event?.qr_path);

  const onSave = async ({ signed, layer, guest, frame }: SignResult) => {
    if (!current) return;
    const fd = new FormData();
    fd.append("photo_id", current.id); fd.append("guest", guest); fd.append("frame", frame);
    fd.append("signed", signed, "signed.jpg"); fd.append("layer", layer, "ink.png");
    const r = await fetch("/api/sign", { method: "POST", body: fd });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "upload failed");
    setCurrent(null);
    setThanks(guest ? `Thank you, ${guest.split(" ")[0]}` : "Thank you");
    setTimeout(() => setThanks(null), qr ? 9000 : 2600);
  };

  // long-press the logo in kiosk mode to get the PIN prompt
  const holdStart = () => { if (!kiosk) return; holdTimer.current = setTimeout(() => { setUnlock(true); setPin(""); setPinMsg(null); }, HOLD_TO_UNLOCK_MS); };
  const holdEnd = () => { if (holdTimer.current) clearTimeout(holdTimer.current); };
  const tryUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === KIOSK_PIN) { setKioskPersist(false); setUnlock(false); } else setPinMsg("Wrong PIN");
  };

  if (status === "missing") return <div className="empty"><h3>No event at this link</h3><p>Check the event slug with your editor.</p></div>;
  if (status === "error") return <div className="empty"><h3>Can't reach the book</h3><p>Check the wifi, then reload.</p></div>;

  const Tile = ({ p }: { p: PhotoRow }) => (
    <button className="tile" aria-label={p.guest_name ? `Portrait signed by ${p.guest_name}` : "Portrait"} onClick={() => setCurrent(p)}>
      <img src={fileUrl(p.original_path)!} alt="" loading="lazy" />
      {p.signed_path && <span className="mark">✓</span>}
    </button>
  );

  const logoProps = { onPointerDown: holdStart, onPointerUp: holdEnd, onPointerLeave: holdEnd, onPointerCancel: holdEnd, onContextMenu: (e: React.MouseEvent) => e.preventDefault() };

  return (
    <div className="booth" onPointerDown={touch}>
      {!kiosk && (
        <div className="bar">
          <div className="brand"><img className="logo" src="/logo.png" alt="Photo Lounge by Redefined Weddings" /><span className="brand-sub">Signature Book</span></div>
          <div className="right">{event?.title}</div>
        </div>
      )}
      <div className="booth-head">
        {kiosk && <img className="booth-logo" src="/logo.png" alt="Photo Lounge by Redefined Weddings" draggable={false} {...logoProps} />}
        <h1>Find Your Portrait</h1>
        <p>Tap the portrait you just took, then write a note for the couple.</p>
        <div className="rule" />
        {qr && (
          <div className="qr-block small"><img src={qr} alt="QR code for the online gallery" /><div className="eyebrow">Scan to pre-register for the online gallery</div></div>
        )}
      </div>
      <div className="grid-scroll">
        <div className="wrap">
          {status === "ready" && photos.length === 0 && (
            <div className="empty"><h3>The lounge is warming up</h3><p>Portraits appear here moments after they're taken. Step in front of the camera and smile.</p></div>
          )}
          {recent.length > 0 && (<>
            <div className="section-label"><span className="eyebrow">Just taken</span></div>
            <div className="grid recent">{recent.map((p) => <Tile key={p.id} p={p} />)}</div>
          </>)}
          {earlier.length > 0 && (<>
            <div className="section-label"><span className="eyebrow">Earlier tonight</span></div>
            <div className="grid">{earlier.map((p) => <Tile key={p.id} p={p} />)}</div>
          </>)}
        </div>
      </div>
      {!kiosk && <button className="kiosk-btn" onClick={() => setKioskPersist(true)}>Lock kiosk</button>}

      {current && (
        <SignCanvas src={fileUrl(current.original_path)!} initialName={current.guest_name || ""} onClose={() => setCurrent(null)} onSave={onSave} />
      )}

      {thanks && (
        <div className="thanks" onClick={() => setThanks(null)}>
          <div>
            <h2>{thanks}</h2>
            <p>Your note is in the couple's book.</p>
            {qr && (<div className="qr-block"><img src={qr} alt="QR code for the online gallery" /><div className="eyebrow">Scan to pre-register for the online gallery</div></div>)}
          </div>
        </div>
      )}

      {idle && !current && !thanks && (
        <Slideshow photos={photos} title={event?.title} hint="Tap anywhere to find your portrait" onInteract={() => setIdle(false)} />
      )}

      {unlock && (
        <div className="thanks" style={{ zIndex: 50 }}>
          <form className="pin-gate" onSubmit={tryUnlock} style={{ margin: 0 }}>
            <div className="eyebrow">Photo Lounge crew</div>
            <h2>Crew code to unlock</h2>
            <input autoFocus value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="off" placeholder="••••" />
            <button className="primary" type="submit">Unlock kiosk</button>
            <button className="tbtn" type="button" onClick={() => setUnlock(false)}>Cancel</button>
            {pinMsg && <div className="stat">{pinMsg}</div>}
          </form>
        </div>
      )}
    </div>
  );
}
