import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Remove one photo and its files. JSON: { id, slug?, pin? }.
 * Authorized by either the admin PIN (x-admin-pin header) or that event's editor PIN (slug + pin in the body).
 */
export async function DELETE(req: Request) {
  const { id, slug, pin } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const db = supabaseAdmin();

  const { data: p } = await db.from("photos").select("event_id, original_path, signed_path, layer_path").eq("id", id).single();
  if (!p) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const adminOk = !!process.env.ADMIN_PIN && req.headers.get("x-admin-pin") === process.env.ADMIN_PIN;
  let editorOk = false;
  if (!adminOk && slug && pin) {
    const { data: ev } = await db.from("events").select("id, editor_pin").eq("slug", slug).single();
    editorOk = !!ev && ev.id === p.event_id && ev.editor_pin === pin;
  }
  if (!adminOk && !editorOk) return NextResponse.json({ error: "Wrong PIN" }, { status: 403 });

  const paths = [p.original_path, p.signed_path, p.layer_path].filter(Boolean) as string[];
  if (paths.length) await db.storage.from("booth").remove(paths);
  await db.from("photos").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
