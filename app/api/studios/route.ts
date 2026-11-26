import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { actorFrom, canManageStudio, getUser } from "@/lib/auth";

export const runtime = "nodejs";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** GET → the signed-in user's studios (admin: all). */
export async function GET(req: Request) {
  const actor = await actorFrom(req);
  if (!actor) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (actor.kind === "admin") {
    const { data } = await supabaseAdmin().from("studios").select("*").order("created_at");
    return NextResponse.json({ studios: data || [] });
  }
  return NextResponse.json({ studios: actor.studios, userId: actor.userId });
}

/** POST { name } → create a studio owned by the signed-in user (14-day trial). */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { name } = await req.json();
  if (!name || !String(name).trim()) return NextResponse.json({ error: "Studio name is required" }, { status: 400 });
  const db = supabaseAdmin();
  const base = slugify(name) || "studio";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await db.from("studios").select("id").eq("slug", slug).maybeSingle();
    if (!data) break; slug = `${base}-${i}`;
  }
  const { data: studio, error } = await db.from("studios").insert({ slug, name: String(name).trim() }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { error: e2 } = await db.from("studio_members").insert({ studio_id: studio.id, user_id: user.id, role: "owner" });
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, studio });
}

/** PATCH { id, name?, branding? } → update a studio you manage. */
export async function PATCH(req: Request) {
  const actor = await actorFrom(req);
  const { id, name, branding } = await req.json();
  if (!canManageStudio(actor, id)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const patch: Record<string, unknown> = {};
  if (name !== undefined) { if (!String(name).trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 }); patch.name = String(name).trim(); }
  if (branding !== undefined && typeof branding === "object") patch.branding = branding;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("studios").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, studio: data });
}
