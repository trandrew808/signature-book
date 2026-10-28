import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/** Remove one photo (and its files). JSON: { id }. Needs the admin PIN in x-admin-pin. */
export async function DELETE(req: Request) {
  const pin = process.env.ADMIN_PIN;
  if (!pin || req.headers.get("x-admin-pin") !== pin) return NextResponse.json({ error: "Wrong admin PIN" }, { status: 403 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const db = supabaseAdmin();
  const { data: p } = await db.from("photos").select("original_path, signed_path, layer_path").eq("id", id).single();
  if (!p) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const paths = [p.original_path, p.signed_path, p.layer_path].filter(Boolean) as string[];
  if (paths.length) await db.storage.from("booth").remove(paths);
  await db.from("photos").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
