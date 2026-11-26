import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Magic-link landing: exchange the code for a session cookie, then continue. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/app";
  const res = NextResponse.redirect(new URL(next, url.origin));
  if (!code) return NextResponse.redirect(new URL("/login?error=missing", url.origin));
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: (list) => { for (const c of list) res.cookies.set(c.name, c.value, c.options); } },
  });
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=expired", url.origin));
  return res;
}
