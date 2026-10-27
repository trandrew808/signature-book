import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Editor upload. multipart/form-data:
 *   slug   — event slug
 *   pin    — editor PIN for that event
 *   kind   — "photo" (default) or "qr"
 *   file   — one image file
 * The laptop watcher and the Upload page both post here.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const slug = String(form.get("slug") || "");
  const pin = String(form.get("pin") || "");
  const kind = String(form.get("kind") || "photo");
  const file = form.get("file");

  if (!slug || !pin || !(file instanceof File)) {
    return NextResponse.json({ error: "slug, pin and file are required" }, { status: 400 });
  }
  if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(file.type)) {
    return NextResponse.json({ error: "JPEG, PNG, WebP or SVG only" }, { status: 415 });
  }

  const db = supabaseAdmin();
  const { data: ev, error: evErr } = await db
    .from("events")
    .select("id, editor_pin")
    .eq("slug", slug)
    .single();
  if (evErr || !ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (ev.editor_pin !== pin) return NextResponse.json({ error: "Wrong PIN" }, { status: 403 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/svg+xml" ? "svg" : "jpg";
  const bytes = Buffer.from(await file.arrayBuffer());

  if (kind === "qr") {
    const path = `${slug}/qr-${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage.from("booth").upload(path, bytes, { contentType: file.type, upsert: false });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const { error } = await db.from("events").update({ qr_path: path }).eq("id", ev.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, qr_path: path });
  }

  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${slug}/originals/${Date.now()}-${safe.replace(/\.[^.]+$/, "")}.${ext}`;
  const { error: upErr } = await db.storage.from("booth").upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: row, error } = await db
    .from("photos")
    .insert({ event_id: ev.id, original_path: path })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: row.id, original_path: path });
}

/** Remove the QR code for an event. JSON body: { slug, pin, dry? } — dry: true only verifies the PIN. */
export async function DELETE(req: Request) {
  const { slug, pin, dry } = await req.json();
  const db = supabaseAdmin();
  const { data: ev } = await db.from("events").select("id, editor_pin").eq("slug", slug).single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (ev.editor_pin !== pin) return NextResponse.json({ error: "Wrong PIN" }, { status: 403 });
  if (dry) return NextResponse.json({ ok: true });
  await db.from("events").update({ qr_path: null }).eq("id", ev.id);
  return NextResponse.json({ ok: true });
}
