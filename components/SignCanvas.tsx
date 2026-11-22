"use client";
import { useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number; p: number };
type Stroke = { ink: string; pts: Pt[] };
export type FrameStyle = "print" | "none";

const INKS = [
  { color: "#1E1C17", label: "Black ink" },
  { color: "#FFFFFF", label: "White ink" },
  { color: "#B98A88", label: "Rose ink" },
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

/**
 * Build the "paper": the photo alone, or an instant-print style frame. The
 * frame is defined by the paper, like real instant film: side and top border
 * are 5% of the paper width and the writing band is 30% of the paper width,
 * so every signed portrait shares the same border weight and writing room
 * whatever the photo's shape. The photo always spans the full width at its
 * native resolution; all ink coordinates are in this canvas's pixel space.
 */
function makeBase(img: HTMLImageElement, frame: FrameStyle): HTMLCanvasElement {
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement("canvas");
  if (frame === "none") { c.width = W; c.height = H; c.getContext("2d")!.drawImage(img, 0, 0); return c; }
  const PW = Math.round(W / 0.9);          // paper width: photo is 90% of it
  const m = Math.round(PW * 0.05);         // side and top border
  const band = Math.round(PW * 0.30);      // writing band under the photo
  c.width = PW; c.height = m + H + band;
  const x = c.getContext("2d")!;
  x.fillStyle = "#FBF9F6"; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, m, m, W, H);
  return c;
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export failed"))), type, q));

export type SignResult = { signed: Blob; layer: Blob; guest: string; frame: FrameStyle };

export default function SignCanvas({ src, initialName, onClose, onSave }:
  { src: string; initialName?: string; onClose: () => void; onSave: (r: SignResult) => Promise<void> }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<Stroke | null>(null);
  const [frame, setFrame] = useState<FrameStyle>("print");
  const [ink, setInk] = useState(INKS[0].color);
  const [guest, setGuest] = useState(initialName || "");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (t: string, ms = 2200) => { setMsg(t); setTimeout(() => setMsg(null), ms); };

  const redraw = () => {
    const c = inkRef.current, base = baseRef.current; if (!c || !base) return;
    const ctx = c.getContext("2d")!; ctx.clearRect(0, 0, c.width, c.height);
    drawStrokes(ctx, strokesRef.current, c.width / base.width);
  };

  const fit = () => {
    const base = baseRef.current, stage = stageRef.current, fr = frameRef.current, pc = photoRef.current, ic = inkRef.current;
    if (!base || !stage || !fr || !pc || !ic) return;
    const maxW = stage.clientWidth - 24, maxH = stage.clientHeight - 24;
    const r = Math.min(maxW / base.width, maxH / base.height, 1.5);
    const cssW = Math.floor(base.width * r), cssH = Math.floor(base.height * r);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    fr.style.width = cssW + "px"; fr.style.height = cssH + "px";
    for (const c of [pc, ic]) { c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr); c.style.width = cssW + "px"; c.style.height = cssH + "px"; }
    pc.getContext("2d")!.drawImage(base, 0, 0, pc.width, pc.height);
    redraw();
  };

  useEffect(() => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => { imgRef.current = img; baseRef.current = makeBase(img, frame); setLoaded(true); requestAnimationFrame(fit); };
    img.onerror = () => setMsg("That portrait could not be loaded.");
    img.src = src;
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const switchFrame = (next: FrameStyle) => {
    if (next === frame || !imgRef.current) return;
    if (strokesRef.current.length) flash("Frame changed, your note was cleared.");
    strokesRef.current = []; setFrame(next);
    setInk(next === "print" ? INKS[0].color : INKS[1].color);
    baseRef.current = makeBase(imgRef.current, next); requestAnimationFrame(fit);
  };

  const toBase = (e: PointerEvent): Pt => {
    const c = inkRef.current!, base = baseRef.current!; const r = c.getBoundingClientRect(); const k = base.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, p: e.pointerType === "pen" ? e.pressure || 0.5 : 0.5 };
  };

  useEffect(() => {
    const c = inkRef.current; if (!c) return;
    const down = (e: PointerEvent) => { if (!baseRef.current) return; try { c.setPointerCapture(e.pointerId); } catch {} liveRef.current = { ink, pts: [toBase(e)] }; strokesRef.current.push(liveRef.current); };
    const move = (e: PointerEvent) => {
      const live = liveRef.current; if (!live) return;
      if (e.pointerType === "pen" && e.buttons === 0) return; // Pencil hovering, not touching
      // Safari delivers Pencil input in bursts: take every coalesced point, then draw every new segment,
      // not just the last one, or the stroke comes out dashed.
      const co: PointerEvent[] = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [];
      const evs = co && co.length ? co : [e];
      const start = live.pts.length;
      for (const ev of evs) live.pts.push(toBase(ev));
      const ctx = c.getContext("2d")!; const sc = c.width / baseRef.current!.width;
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = live.ink;
      for (let i = Math.max(1, start); i < live.pts.length; i++) {
        const a = live.pts[i - 1], b = live.pts[i];
        ctx.lineWidth = widthFor(b.p) * sc;
        ctx.beginPath(); ctx.moveTo(a.x * sc, a.y * sc); ctx.lineTo(b.x * sc, b.y * sc); ctx.stroke();
      }
    };
    const up = () => { liveRef.current = null; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink, loaded]);

  const save = async () => {
    const base = baseRef.current; if (!base) return;
    if (!strokesRef.current.length) { flash("Write something first."); return; }
    setSaving(true);
    try {
      const W = base.width, H = base.height;
      const flat = document.createElement("canvas"); flat.width = W; flat.height = H;
      const fc = flat.getContext("2d")!; fc.drawImage(base, 0, 0); drawStrokes(fc, strokesRef.current, 1);
      const layer = document.createElement("canvas"); layer.width = W; layer.height = H; drawStrokes(layer.getContext("2d")!, strokesRef.current, 1);
      const [signed, layerBlob] = await Promise.all([toBlob(flat, "image/jpeg", 0.92), toBlob(layer, "image/png")]);
      await onSave({ signed, layer: layerBlob, guest: guest.trim(), frame });
    } catch (e: any) {
      flash("Could not save. " + (e?.message || "Try again."), 3500);
    } finally { setSaving(false); }
  };

  return (
    <div className="sign dark" role="dialog" aria-label="Sign your portrait">
      <div className="sign-top">
        <div><h2>Write your note</h2><div className="hint">Use the Pencil or your finger. It's saved for the couple.</div></div>
        <div className="seg" role="group" aria-label="Frame">
          <button aria-pressed={frame === "print"} onClick={() => switchFrame("print")}>Print frame</button>
          <button aria-pressed={frame === "none"} onClick={() => switchFrame("none")}>Photo only</button>
        </div>
        <button className="close" onClick={onClose}>Back</button>
      </div>
      <div className="stage" ref={stageRef}>
        <div className={"frame" + (frame === "print" ? " paper" : "")} ref={frameRef}>
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
