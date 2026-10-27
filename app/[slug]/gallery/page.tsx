"use client";
import { use, useEffect, useMemo, useState } from "react";
import { useEvent } from "@/lib/useEvent";
import { fileUrl, PhotoRow, supabaseBrowser } from "@/lib/supabase";

const safeName = (p: PhotoRow) => ((p.guest_name || "guest").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "guest");
const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

async function fetchBlob(url: string) { const r = await fetch(url); if (!r.ok) throw new Error("fetch failed"); return r.blob(); }

function saveBlob(filename: string, blob: Blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export default function GalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { event, photos, status } = useEvent(slug);
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [lb, setLb] = useState<PhotoRow | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [packing, setPacking] = useState<string | null>(null);

  // Gallery link carries ?key=<gallery_token>. Checked client-side against the event row.
  useEffect(() => {
    if (!event) return;
    const key = new URLSearchParams(window.location.search).get("key") || "";
    supabaseBrowser().from("events").select("id").eq("slug", slug).eq("gallery_token", key).maybeSingle()
      .then(({ data }) => setKeyOk(!!data));
  }, [event, slug]);

  const signed = useMemo(() => photos.filter((p) => p.signed_path).sort((a, b) => (b.signed_at! > a.signed_at! ? 1 : -1)), [photos]);

  const exportAll = async () => {
    if (!signed.length) return;
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip(); const folder = zip.folder("signature-book")!; let i = 0;
    for (const p of [...signed].reverse()) {
      const base = `SB-${String(++i).padStart(3, "0")}-${safeName(p)}`;
      setPacking(`Packing ${i}/${signed.length}`);
      try {
        folder.file(`${base}-signed.jpg`, await fetchBlob(fileUrl(p.signed_path)!));
        folder.file(`${base}-original.jpg`, await fetchBlob(fileUrl(p.original_path)!));
        if (p.layer_path) folder.file(`${base}-ink.png`, await fetchBlob(fileUrl(p.layer_path)!));
      } catch { /* skip a missing file, keep going */ }
    }
    setPacking("Zipping…");
    saveBlob(`${slug}-signature-book.zip`, await zip.generateAsync({ type: "blob" }));
    setPacking(null);
  };

  if (status === "missing") return <div className="empty"><h3>No event at this link</h3></div>;
  if (keyOk === false) return <div className="empty"><h3>This link needs its key</h3><p>Ask Photo Lounge for the full gallery link.</p></div>;
  if (!event || keyOk === null) return <div className="empty"><p>Loading…</p></div>;

  return (
    <div className="page">
      <div className="bar">
        <div className="brand"><img className="logo" src="/logo.png" alt="Photo Lounge by Redefined Weddings" /><span className="brand-sub">Signature Book</span></div>
      </div>
      <div className="wrap">
        <div className="gal-head">
          <div><div className="eyebrow">The Signature Book</div><h2>{event.title}</h2></div>
          <span className="stat">{signed.length} signed of {photos.length}</span>
          <button className="primary" onClick={exportAll} disabled={!!packing || !signed.length}>{packing || "Download all signed"}</button>
        </div>
        {signed.length === 0 && <div className="empty"><h3>Nothing signed yet</h3><p>When a guest finishes a note on the iPad, their portrait lands here.</p></div>}
        <div className="gal">
          {signed.map((p) => (
            <figure key={p.id} onClick={() => { setLb(p); setShowOriginal(false); }}>
              <img src={fileUrl(p.signed_path)!} alt={p.guest_name ? `Signed by ${p.guest_name}` : "Signed portrait"} loading="lazy" />
              <figcaption><b>{p.guest_name || "A guest"}</b><span>{timeOf(p.signed_at)}</span></figcaption>
            </figure>
          ))}
        </div>
      </div>

      {lb && (
        <div className="lightbox" role="dialog" aria-label="Signed portrait">
          <button className="lb-close" onClick={() => setLb(null)}>Close</button>
          <img src={fileUrl(showOriginal ? lb.original_path : lb.signed_path)!} alt="Signed portrait" />
          <div className="lb-bar">
            <b>{lb.guest_name || "A guest"}</b><span className="stat">{timeOf(lb.signed_at)}</span>
            <a className="tbtn" href={fileUrl(showOriginal ? lb.original_path : lb.signed_path)!} download={`${safeName(lb)}-${showOriginal ? "original" : "signed"}.jpg`} target="_blank" rel="noreferrer">Download</a>
            <button className="tbtn" onClick={() => setShowOriginal((v) => !v)}>{showOriginal ? "Show signed" : "Unsigned original"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
