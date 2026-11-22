"use client";
import { useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number; p: number };
type Stroke = { ink: string; size: number; pts: Pt[] };
export type FrameStyle = "print" | "none";

const INKS = [
  { color: "#1E1C17", label: "Black ink" },
  { color: "#FFFFFF", label: "White ink" },
  { color: "#B98A88", label: "Rose ink" },
];

// Stroke width in photo pixels (the base canvas is 2500px on the long edge).
// `size` is the guest's pen size (1 = default). A light Pencil hand sits around p≈0.2,
// so the floor is generous and the curve eases in. Fingers report p=0.5.
const widthFor = (p: number, size = 1) => size * (4.5 + 5 * Math.sqrt(Math.max(0, Math.min(1, p))));
const SIZES = [{ v: 0.6, label: "Fine" }, { v: 1, label: "Pen" }, { v: 1.7, label: "Marker" }];

/**
 * Draw points [from, to] of a stroke as smoothed runs. Consecutive points with
 * similar pressure share one path (quadratic midpoints), so a burst of Pencil
 * input costs a handful of stroke() calls instead of one per sample.
 */
function drawRun(ctx: CanvasRenderingContext2D, pts: Pt[], from: number, to: number, scale: number, size = 1) {
  let i = Math.max(1, from);
  while (i <= to) {
    const w = widthFor(pts[i].p, size);
    let j = i;
    while (j + 1 <= to && Math.abs(widthFor(pts[j + 1].p, size) - w) < 1.2 * size) j++;
    ctx.lineWidth = w * scale;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x * scale, pts[i - 1].y * scale);
    for (let k = i; k <= j; k++) ctx.lineTo(pts[k].x * scale, pts[k].y * scale);
    ctx.stroke();
    i = j + 1;
  }
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number) {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.strokeStyle = s.ink;
    if (s.pts.length === 1) { const p = s.pts[0]; ctx.fillStyle = s.ink; ctx.beginPath(); ctx.arc(p.x * scale, p.y * scale, widthFor(p.p, s.size) * scale / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    drawRun(ctx, s.pts, 1, s.pts.length - 1, scale, s.size);
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

export type SignResult = { signed: Blob; layer: Blob; frame: FrameStyle };

export default function SignCanvas({ src, onClose, onSave }:
  { src: string; onClose: () => void; onSave: (r: SignResult) => Promise<void> }) {
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
  const [size, setSize] = useState(1);
  const [dbg, setDbg] = useState<string | null>(null);
  const debugOn = typeof window !== "undefined" && /[?&]debug=1/.test(window.location.search);
  const strokeT0 = useRef(0); const moveEvents = useRef(0);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

  // Geometry is cached at pointerdown: calling getBoundingClientRect on every sample forces layout and costs latency.
  const geoRef = useRef<{ left: number; top: number; k: number } | null>(null);
  const paintedRef = useRef(0);      // index of the last point already painted on the live stroke
  const rafRef = useRef<number | null>(null);

  const toBase = (e: PointerEvent): Pt => {
    const g = geoRef.current!;
    // pressure can read 0 on the first samples of a quick Pencil stroke; treat that as a light touch, not "not drawing"
    const p = e.pointerType === "pen" ? (e.pressure > 0.02 ? e.pressure : 0.25) : 0.5;
    return { x: (e.clientX - g.left) * g.k, y: (e.clientY - g.top) * g.k, p };
  };
  const hovering = (e: PointerEvent) => e.pointerType === "pen" && e.buttons === 0 && e.pressure === 0 && e.type !== "pointerdown";

  // Paint whatever arrived since the last frame, once per frame.
  const paint = () => {
    rafRef.current = null;
    const live = liveRef.current, c = inkRef.current, base = baseRef.current; if (!live || !c || !base) return;
    const ctx = c.getContext("2d", { desynchronized: true } as any) as CanvasRenderingContext2D; const sc = c.width / base.width;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = live.ink;
    const last = live.pts.length - 1;
    if (last > paintedRef.current) { drawRun(ctx, live.pts, paintedRef.current + 1, last, sc, live.size); paintedRef.current = last; }
  };
  const schedule = () => { if (rafRef.current == null) rafRef.current = requestAnimationFrame(paint); };

  useEffect(() => {
    const c = inkRef.current; if (!c) return;
    const activeId = { current: -1 };
    const down = (e: PointerEvent) => {
      if (!baseRef.current) return;
      if (e.pointerType === "touch" && liveRef.current && activeId.current !== -1) return; // palm while the pen is down
      e.preventDefault();
      // Register the stroke BEFORE anything else: setPointerCapture can synchronously flush queued
      // moves on iPadOS, and if the stroke doesn't exist yet those samples (the whole start of a quick
      // letter) are lost.
      const r = c.getBoundingClientRect(); geoRef.current = { left: r.left, top: r.top, k: baseRef.current.width / r.width };
      liveRef.current = { ink, size, pts: [toBase(e)] }; strokesRef.current.push(liveRef.current); paintedRef.current = 0;
      activeId.current = e.pointerId; strokeT0.current = performance.now(); moveEvents.current = 0;
      const ctx = c.getContext("2d", { desynchronized: true } as any) as CanvasRenderingContext2D; const sc = c.width / baseRef.current.width; const p = liveRef.current.pts[0];
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(p.x * sc, p.y * sc, widthFor(p.p, size) * sc / 2, 0, Math.PI * 2); ctx.fill();
      try { c.setPointerCapture(e.pointerId); } catch {}
    };
    const move = (e: PointerEvent) => {
      const live = liveRef.current; if (!live || e.pointerId !== activeId.current) return;
      if (hovering(e)) return;
      moveEvents.current++;
      const co: PointerEvent[] = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [];
      if (co && co.length) for (const ev of co) live.pts.push(toBase(ev)); else live.pts.push(toBase(e));
      schedule();
    };
    const up = (e: PointerEvent) => {
      const live = liveRef.current; if (!live || e.pointerId !== activeId.current) return;
      if (e.type === "pointerup" && e.clientX && geoRef.current) live.pts.push(toBase(e));
      paint();
      if (debugOn) {
        const ms = Math.max(1, performance.now() - strokeT0.current); const n = live.pts.length;
        const ps = live.pts.map((q) => q.p); const pmin = Math.min(...ps).toFixed(2), pmax = Math.max(...ps).toFixed(2);
        setDbg(`${e.pointerType} · ${n} pts in ${Math.round(ms)}ms (${Math.round(n / ms * 1000)}/s, ${moveEvents.current} events) · pressure ${pmin}–${pmax} · dpr ${window.devicePixelRatio} · canvas ${c.width}×${c.height}`);
      }
      liveRef.current = null; activeId.current = -1;
    };
    // The whole document hears up/cancel, so a stroke ends even if the pointer escapes the canvas.
    const docUp = (e: PointerEvent) => { if (activeId.current !== -1 && e.pointerId === activeId.current) up(e); };
    document.addEventListener("pointerup", docUp); document.addEventListener("pointercancel", docUp);
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); document.removeEventListener("pointerup", docUp); document.removeEventListener("pointercancel", docUp); if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink, size, loaded]);

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
      await onSave({ signed, layer: layerBlob, frame });
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
          <canvas ref={photoRef} aria-hidden="true" />
          <canvas ref={inkRef} className="ink" role="img" aria-label="Writing surface" {...({ inputMode: "none", contentEditable: false, "data-scribble": "false" } as any)} />
        </div>
      </div>
      <div className="tools">
        <div className="swatches">
          {INKS.map((i) => (
            <button key={i.color} className="sw" style={{ background: i.color }} aria-pressed={ink === i.color} aria-label={i.label} onClick={() => setInk(i.color)} />
          ))}
        </div>
        <div className="seg sizes" role="group" aria-label="Pen size">
          {SIZES.map((o) => <button key={o.v} aria-pressed={size === o.v} onClick={() => setSize(o.v)}><i style={{ width: 4 + o.v * 6, height: 4 + o.v * 6 }} />{o.label}</button>)}
        </div>
        <button className="tbtn" onClick={() => { strokesRef.current.pop(); redraw(); }}>Undo</button>
        <button className="tbtn" onClick={() => { strokesRef.current = []; redraw(); }}>Clear</button>
        <button className="primary" onClick={save} disabled={saving || !loaded}>{saving ? "Saving…" : "Save to the book"}</button>
      </div>
      {msg && <div className="toast">{msg}</div>}
      {debugOn && <div className="dbg">{dbg || "debug: write a stroke"}</div>}
    </div>
  );
}
