import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { actorFrom, canManageStudio, type Actor } from "@/lib/auth";

export const runtime = "nodejs";

const deny = (actor: Actor) => NextResponse.json({ error: actor ? "Not allowed" : "Sign in" }, { status: actor ? 403 : 401 });

/** Studio ids this actor may see: null = all (admin). */
const scopeOf = (actor: Exclude<Actor, null>, requested?: string | null) => {
  if (actor.kind === "admin") return requested ? [requested] : null;
  const mine = actor.studios.map((s) => s.id);
  if (requested) return mine.includes(requested) ? [requested] : [];
  return mine;
};

/** Load an event and check the actor may manage its studio. */
async function ownedEvent(actor: Actor, slug: string) {
  const { data: ev } = await supabaseAdmin().from("events").select("id, slug, studio_id").eq("slug", slug).single();
  if (!ev) return { error: NextResponse.json({ error: "Event not found" }, { status: 404 }) };
  if (!canManageStudio(actor, ev.studio_id)) return { error: deny(actor) };
  return { ev };
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const DEFAULT_PIN = "0000"; // every event starts with 0000; change it per event from the admin page

/** List events with counts. */
export async function GET(req: Request) {
  const actor = await actorFrom(req);
  if (!actor) return deny(actor);
  const scope = scopeOf(actor, new URL(req.url).searchParams.get("studio"));
  const db = supabaseAdmin();
  let q = db.from("events").select("id, slug, title, editor_pin, gallery_token, qr_path, created_at, studio_id").order("created_at", { ascending: false });
  if (scope) q = q.in("studio_id", scope);
  const { data: events, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (events || []).map((e) => e.id);
  const { data: photos } = ids.length ? await db.from("photos").select("event_id, signed_path").in("event_id", ids) : { data: [] };
  const counts: Record<string, { total: number; signed: number }> = {};
  for (const p of photos || []) {
    counts[p.event_id] ||= { total: 0, signed: 0 };
    counts[p.event_id].total++; if (p.signed_path) counts[p.event_id].signed++;
  }
  return NextResponse.json({ events: (events || []).map((e) => ({ ...e, ...(counts[e.id] || { total: 0, signed: 0 }) })) });
}

/** Create an event. JSON: { title, date?, pin? } → slug is derived from title + date. */
export async function POST(req: Request) {
  const actor = await actorFrom(req);
  if (!actor) return deny(actor);
  const { title, date, pin, studio_id } = await req.json();
  if (!title || !String(title).trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  // Which studio owns the new event: the one asked for, else the user's first studio, else (admin) Photo Lounge.
  let studioId: string | null = studio_id || (actor.kind === "user" ? actor.studios[0]?.id : null) || null;
  if (!studioId && actor.kind === "admin") { const { data } = await supabaseAdmin().from("studios").select("id").order("created_at").limit(1).single(); studioId = data?.id || null; }
  if (!canManageStudio(actor, studioId)) return deny(actor);
  const base = slugify(`${title}${date ? "-" + date : ""}`) || "event";
  const db = supabaseAdmin();
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await db.from("events").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }
  const editor_pin = pin && /^\d{4,8}$/.test(String(pin)) ? String(pin) : DEFAULT_PIN;
  const { data: row, error } = await db.from("events").insert({ slug, title: String(title).trim(), editor_pin, studio_id: studioId }).select("slug, title, editor_pin, gallery_token").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, event: row });
}

/** Rename an event or change its editor PIN. JSON: { slug, title? , pin? } */
export async function PATCH(req: Request) {
  const actor = await actorFrom(req);
  const { slug, title, pin } = await req.json();
  const owned = await ownedEvent(actor, slug); if (owned.error) return owned.error;
  const patch: Record<string, string> = {};
  if (title !== undefined) { if (!String(title).trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 }); patch.title = String(title).trim(); }
  if (pin !== undefined) { if (!/^\d{4,8}$/.test(String(pin))) return NextResponse.json({ error: "PIN must be 4 to 8 digits" }, { status: 400 }); patch.editor_pin = String(pin); }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const { error } = await supabaseAdmin().from("events").update(patch).eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Delete an event and its files. JSON: { slug } */
export async function DELETE(req: Request) {
  const actor = await actorFrom(req);
  const { slug } = await req.json();
  const owned = await ownedEvent(actor, slug); if (owned.error) return owned.error;
  const ev = owned.ev!;
  const db = supabaseAdmin();
  // remove storage files under the slug folder
  for (const folder of ["originals", "signed", "ink"]) {
    const { data: files } = await db.storage.from("booth").list(`${slug}/${folder}`, { limit: 1000 });
    if (files?.length) await db.storage.from("booth").remove(files.map((f) => `${slug}/${folder}/${f.name}`));
  }
  const { data: root } = await db.storage.from("booth").list(slug, { limit: 100 });
  const rootFiles = (root || []).filter((f) => f.name.startsWith("qr-")).map((f) => `${slug}/${f.name}`);
  if (rootFiles.length) await db.storage.from("booth").remove(rootFiles);
  await db.from("events").delete().eq("id", ev.id); // photos cascade
  return NextResponse.json({ ok: true });
}
