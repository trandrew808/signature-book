"use client";
import { use, useMemo, useState } from "react";
import SignCanvas, { SignResult } from "@/components/SignCanvas";
import { useEvent } from "@/lib/useEvent";
import { fileUrl, PhotoRow } from "@/lib/supabase";

const RECENT_MS = 15 * 60 * 1000;

export default function BoothPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { event, photos, status } = useEvent(slug);
  const [current, setCurrent] = useState<PhotoRow | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);
  const [kiosk, setKiosk] = useState(false);

  const { recent, earlier } = useMemo(() => {
    const cutoff = Date.now() - RECENT_MS;
    const recent = photos.filter((p) => Date.parse(p.created_at) > cutoff && !p.signed_path).slice(0, 6);
    const earlier = photos.filter((p) => !recent.includes(p));
    return { recent, earlier };
  }, [photos]);

  const qr = fileUrl(event?.qr_path);

  const onSave = async ({ signed, layer, guest }: SignResult) => {
    if (!current) return;
    const fd = new FormData();
    fd.append("photo_id", current.id); fd.append("guest", guest);
    fd.append("signed", signed, "signed.jpg"); fd.append("layer", layer, "ink.png");
    const r = await fetch("/api/sign", { method: "POST", body: fd });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "upload failed");
    setCurrent(null);
    setThanks(guest ? `Thank you, ${guest.split(" ")[0]}` : "Thank you");
    setTimeout(() => setThanks(null), qr ? 9000 : 2600);
  };

  const toggleKiosk = () => {
    const next = !kiosk; setKiosk(next);
    const el: any = document.documentElement;
    if (next && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    if (!next && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  if (status === "missing") return <div className="empty"><h3>No event at this link</h3><p>Check the event slug with your editor.</p></div>;
  if (status === "error") return <div className="empty"><h3>Can't reach the book</h3><p>Check the wifi, then reload.</p></div>;

  const Tile = ({ p }: { p: PhotoRow }) => (
    <button className="tile" aria-label={p.guest_name ? `Portrait signed by ${p.guest_name}` : "Portrait"} onClick={() => setCurrent(p)}>
      <img src={fileUrl(p.original_path)!} alt="" loading="lazy" />
      {p.signed_path && <span className="mark">✓</span>}
    </button>
  );

  return (
    <div className="booth">
      {!kiosk && (
        <div className="bar">
          <div className="brand"><img className="logo" src="/logo.png" alt="Photo Lounge by Redefined Weddings" /><span className="brand-sub">Signature Book</span></div>
          <div className="right">{event?.title}</div>
        </div>
      )}
      <div className="booth-head">
        <img className="booth-logo" src="/logo.png" alt="Photo Lounge by Redefined Weddings" />
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
      <button className="kiosk-btn" onClick={toggleKiosk}>{kiosk ? "Exit kiosk" : "Kiosk mode"}</button>

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
    </div>
  );
}
