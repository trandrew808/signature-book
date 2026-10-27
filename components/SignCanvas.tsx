"use client";
import { useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number; p: number };
type Stroke = { ink: string; pts: Pt[] };

const INKS = [
  { color: "#FFFFFF", label: "White ink" },
  { color: "#1E1C17", label: "Black ink" },
  { color: "#E6B8B3", label: "Blush ink" },
];

const widthFor = (p: number) => Math.max(1.2, 1.5 + 3.5 * p);

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.strokeStyle = s.ink;
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1], b = s.pts[i];
      ctx.lineWidth = widthFor(b.p) * scale;
      ctx.beginPath(); ctx.moveTo(a.x * scale, a.y * scale); ctx.lineTo(b.x * scale, b.y * scale); ctx.stroke();
    }
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), type, q));

export type SignResult = { signed: Blob; layer: Blob; guest: string };

/**
 * Full-screen signing view. Loads `src`, lets the guest write with Pencil or
 * finger (points stored in image-pixel coordinates), and on save exports a
 * flattened JPEG plus a transparent PNG ink layer at the image's native size.
 */
export default function SignCanvas({ src, initialName, onClose, onSave }:
  { src: string; initialName?: string; onClose: () => void; onSave: (r: SignResult) => Promise<void> }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<Stroke | null>(null);
  const [ink, setInk] = useState(INKS[0].color);
  const [guest, setGuest] = useState(initialName || "");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const redraw = () => {
    const c = inkRef.current, img = imgRef.current; if (!c || !img) return;
    const ctx = c.getContext("2d")!; ctx.clearRect(0, 0, c.width, c.height);
    drawStrokes(ctx, strokesRef.current, c.width / img.naturalWidth);
  };

  const fit = () => {
    const img = imgRef.current, stage = stageRef.current, frame = frameRef.current, pc = photoRef.current, ic = inkRef.current;
    if (!img || !stage || !frame || !pc || !ic) return;
    const maxW = stage.clientWidth - 24, maxH = stage.clientHeight - 24;
    const r = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1.5);
    const cssW = Math.floor(img.naturalWidth * r), cssH = Math.floor(img.naturalHeight * r);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    frame.style.width = cssW + "px"; frame.style.height = cssH + "px";
    for (const c of [pc, ic]) { c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr); c.style.width = cssW + "px"; c.style.height = cssH + "px"; }
    pc.getContext("2d")!.drawImage(img, 0, 0, pc.width, pc.height);
    redraw();
  };

  useEffect(() => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => { imgRef.current = img; setLoaded(true); requestAnimationFrame(fit); };
    img.onerror = () => setMsg("That portrait could not be loaded.");
    img.src = src;
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const toImg = (e: PointerEvent): Pt => {
    const c = inkRef.current!, img = imgRef.current!; const r = c.getBoundingClientRect(); const k = img.naturalWidth / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, p: e.pointerType === "pen" ? e.pressure || 0.5 : 0.5 };
  };

  useEffect(() => {
    const c = inkRef.current; if (!c) return;
    const down = (e: PointerEvent) => { if (!imgRef.current) return; c.setPointerCapture(e.pointerId); liveRef.current = { ink, pts: [toImg(e)] }; strokesRef.current.push(liveRef.current); };
    const move = (e: PointerEvent) => {
      const live = liveRef.current; if (!live) return;
      const evs: PointerEvent[] = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
      for (const ev of evs) live.pts.push(toImg(ev));
      const ctx = c.getContext("2d")!; const sc = c.width / imgRef.current!.naturalWidth; const n = live.pts.length;
      if (n > 1) { const a = live.pts[n - 2], b = live.pts[n - 1]; ctx.lineCap = "round"; ctx.strokeStyle = live.ink; ctx.lineWidth = widthFor(b.p) * sc; ctx.beginPath(); ctx.moveTo(a.x * sc, a.y * sc); ctx.lineTo(b.x * sc, b.y * sc); ctx.stroke(); }
    };
    const up = () => { liveRef.current = null; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink, loaded]);

  const save = async () => {
    const img = imgRef.current; if (!img) return;
    if (!strokesRef.current.length) { setMsg("Write something first."); setTimeout(() => setMsg(null), 2000); return; }
    setSaving(true);
    try {
      const W = img.naturalWidth, H = img.naturalHeight;
      const flat = document.createElement("canvas"); flat.width = W; flat.height = H;
      const fc = flat.getContext("2d")!; fc.drawImage(img, 0, 0); drawStrokes(fc, strokesRef.current, 1);
      const layer = document.createElement("canvas"); layer.width = W; layer.height = H; drawStrokes(layer.getContext("2d")!, strokesRef.current, 1);
      const [signed, layerBlob] = await Promise.all([toBlob(flat, "image/jpeg", 0.92), toBlob(layer, "image/png")]);
      await onSave({ signed, layer: layerBlob, guest: guest.trim() });
    } catch (e: any) {
      setMsg("Could not save. " + (e?.message || "Try again.")); setTimeout(() => setMsg(null), 3500);
    } finally { setSaving(false); }
  };

  return (
    <div className="sign dark" role="dialog" aria-label="Sign your portrait">
      <div className="sign-top">
        <div><h2>Write your note</h2><div className="hint">Use the Pencil or your finger. It's saved for the couple.</div></div>
        <button className="close" onClick={onClose}>Back</button>
      </div>
      <div className="stage" ref={stageRef}>
        <div className="frame" ref={frameRef}>
          <canvas ref={photoRef} />
          <canvas ref={inkRef} className="ink" />
        </div>
      </div>
      <div className="tools">
        <div className="swatches">
          {INKS.map((i) => (
            <button key={i.color} className="sw" style={{ background: i.color }} aria-pressed={ink === i.color} aria-label={i.label} onClick={() => setInk(i.color)} />
          ))}
        </div>
        <button className="tbtn" onClick={() => { strokesRef.current.pop(); redraw(); }}>Undo</button>
        <button className="tbtn" onClick={() => { strokesRef.current = []; redraw(); }}>Clear</button>
        <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Your name (optional)" maxLength={60} autoComplete="off" />
        <button className="primary" onClick={save} disabled={saving || !loaded}>{saving ? "Saving…" : "Save to the book"}</button>
      </div>
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
