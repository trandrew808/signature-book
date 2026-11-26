import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/auth";

/** DELETE /api/auth → sign out. */
export async function DELETE() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  return NextResponse.json({ ok: true });
}
