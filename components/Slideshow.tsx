"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileUrl, PhotoRow } from "@/lib/supabase";

const HOLD_MS = 6000;

/**
 * Full-screen crossfading slideshow of signed portraits, newest first.
 * A portrait signed while the show is running jumps to the front.
 */
export default function Slideshow({ photos, title, onInteract, hint }:
  { photos: PhotoRow[]; title?: string; onInteract?: () => void; hint?: string }) {
  const signed = useMemo(() => photos.filter((p) => p.signed_path).sort((a, b) => (b.signed_at! > a.signed_at! ? 1 : -1)), [photos]);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState<PhotoRow | null>(null);
  const [fading, setFading] = useState(false);
  const lastNewest = useRef<string | null>(null);

  // newest signature arrives: show it next
  useEffect(() => {
    const newest = signed[0]?.id || null;
    if (newest && lastNewest.current && newest !== lastNewest.current) setIdx(0);
    lastNewest.current = newest;
  }, [signed]);

  useEffect(() => {
    if (!signed.length) { setShown(null); return; }
    const next = signed[idx % signed.length];
    if (shown && next.id !== shown.id) {
      setFading(true);
      const t = setTimeout(() => { setShown(next); setFading(false); }, 600);
      return () => clearTimeout(t);
    }
    if (!shown) setShown(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, signed]);

  useEffect(() => {
    if (signed.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % signed.length), HOLD_MS);
    return () => clearInterval(t);
  }, [signed.length]);

  return (
    <div className="show" onPointerDown={onInteract}>
      {shown ? (
        <figure className={"show-fig" + (fading ? " out" : "")} key={shown.id}>
          <img src={fileUrl(shown.signed_path)!} alt={shown.guest_name ? `Signed by ${shown.guest_name}` : "Signed portrait"} />
          <figcaption>{title || "The Signature Book"}</figcaption>
        </figure>
      ) : (
        <div className="show-empty">
          <img src="/logo.png" alt="Photo Lounge by Redefined Weddings" />
          <h2>{title || "The Signature Book"}</h2>
          <p>Signed portraits will appear here as guests write their notes.</p>
        </div>
      )}
      {hint && <div className="show-hint">{hint}</div>}
      {signed.length > 1 && (
        <div className="show-dots" aria-hidden="true">
          {signed.slice(0, 12).map((p, i) => <i key={p.id} className={i === idx % signed.length ? "on" : ""} />)}
        </div>
      )}
    </div>
  );
}
