import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/** Admin auth: an ADMIN_PIN env var on Vercel. Sent as the x-admin-pin header. */
function authorized(req: Request) {
  const pin = process.env.ADMIN_PIN;
  return !!pin && req.headers.get("x-admin-pin") === pin;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

/** List events with counts. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Wrong admin PIN" }, { status: 403 });
  const db = supabaseAdmin();
  const { data: events, error } = await db.from("events").select("id, slug, title, editor_pin, gallery_token, qr_path, created_at").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: photos } = await db.from("photos").select("event_id, signed_path");
  const counts: Record<string, { total: number; signed: number }> = {};
  for (const p of photos || []) {
    counts[p.event_id] ||= { total: 0, signed: 0 };
    counts[p.event_id].total++; if (p.signed_path) counts[p.event_id].signed++;
  }
  return NextResponse.json({ events: (events || []).map((e) => ({ ...e, ...(counts[e.id] || { total: 0, signed: 0 }) })) });
}

/** Create an event. JSON: { title, date?, pin? } → slug is derived from title + date. */
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Wrong admin PIN" }, { status: 403 });
  const { title, date, pin } = await req.json();
  if (!title || !String(title).trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const base = slugify(`${title}${date ? "-" + date : ""}`) || "event";
  const db = supabaseAdmin();
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await db.from("events").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }
  const editor_pin = pin && /^\d{4,8}$/.test(String(pin)) ? String(pin) : randomPin();
  const { data: row, error } = await db.from("events").insert({ slug, title: String(title).trim(), editor_pin }).select("slug, title, editor_pin, gallery_token").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, event: row });
}

/** Rename an event. JSON: { slug, title } */
export async function PATCH(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Wrong admin PIN" }, { status: 403 });
  const { slug, title } = await req.json();
  if (!title || !String(title).trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const { error } = await supabaseAdmin().from("events").update({ title: String(title).trim() }).eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Delete an event and its files. JSON: { slug } */
export async function DELETE(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Wrong admin PIN" }, { status: 403 });
  const { slug } = await req.json();
  const db = supabaseAdmin();
  const { data: ev } = await db.from("events").select("id").eq("slug", slug).single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });
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
