import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Guest signing from the iPad. No login: the photo id is an unguessable uuid
 * that only appears on the iPad for that event. multipart/form-data:
 *   photo_id — photos.id
 *   guest    — optional name
 *   signed   — flattened JPEG
 *   layer    — transparent PNG ink layer
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const photoId = String(form.get("photo_id") || "");
  const guest = String(form.get("guest") || "").trim().slice(0, 60);
  const frame = form.get("frame") === "print" ? "print" : "none";
  const signed = form.get("signed");
  const layer = form.get("layer");

  if (!photoId || !(signed instanceof File) || !(layer instanceof File)) {
    return NextResponse.json({ error: "photo_id, signed and layer are required" }, { status: 400 });
  }
  if (signed.size > 20 * 1024 * 1024 || layer.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const db = supabaseAdmin();
  const { data: photo } = await db
    .from("photos")
    .select("id, event_id, original_path, events(slug)")
    .eq("id", photoId)
    .single();
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const slug = (photo as any).events?.slug ?? "event";
  const stamp = Date.now();
  const signedPath = `${slug}/signed/${photoId}-${stamp}.jpg`;
  const layerPath = `${slug}/ink/${photoId}-${stamp}.png`;

  const [s, l] = await Promise.all([
    db.storage.from("booth").upload(signedPath, Buffer.from(await signed.arrayBuffer()), { contentType: "image/jpeg", upsert: true }),
    db.storage.from("booth").upload(layerPath, Buffer.from(await layer.arrayBuffer()), { contentType: "image/png", upsert: true }),
  ]);
  if (s.error || l.error) return NextResponse.json({ error: (s.error || l.error)!.message }, { status: 500 });

  const { error } = await db
    .from("photos")
    .update({ signed_path: signedPath, layer_path: layerPath, guest_name: guest || null, signed_at: new Date().toISOString(), frame })
    .eq("id", photoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, signed_path: signedPath, layer_path: layerPath });
}
