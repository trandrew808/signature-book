import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { actorFrom, canManageStudio } from "@/lib/auth";

export const runtime = "nodejs";

/** Admin PIN header, a signed-in member of the event's studio, or the event's editor PIN (slug + pin in the body). */
async function authorize(req: Request, db: ReturnType<typeof supabaseAdmin>, photoEventId: string, slug?: string, pin?: string) {
  const { data: ev } = await db.from("events").select("id, editor_pin, studio_id").eq("slug", slug || "").maybeSingle();
  if (slug && pin && ev && ev.id === photoEventId && ev.editor_pin === pin) return true;
  const actor = await actorFrom(req);
  if (!actor) return false;
  if (actor.kind === "admin") return true;
  const { data: owner } = await db.from("events").select("studio_id").eq("id", photoEventId).single();
  return canManageStudio(actor, owner?.studio_id);
}

/** Clear a photo's signature (keeps the original so it can be signed again). JSON: { id, slug?, pin? } */
export async function PATCH(req: Request) {
  const { id, slug, pin } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const db = supabaseAdmin();
  const { data: p } = await db.from("photos").select("event_id, signed_path, layer_path").eq("id", id).single();
  if (!p) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  if (!(await authorize(req, db, p.event_id, slug, pin))) return NextResponse.json({ error: "Wrong PIN" }, { status: 403 });
  const paths = [p.signed_path, p.layer_path].filter(Boolean) as string[];
  if (paths.length) await db.storage.from("booth").remove(paths);
  const { error } = await db.from("photos").update({ signed_path: null, layer_path: null, signed_at: null, guest_name: null, frame: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

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

  if (!(await authorize(req, db, p.event_id, slug, pin))) return NextResponse.json({ error: "Wrong PIN" }, { status: 403 });

  const paths = [p.original_path, p.signed_path, p.layer_path].filter(Boolean) as string[];
  if (paths.length) await db.storage.from("booth").remove(paths);
  await db.from("photos").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
