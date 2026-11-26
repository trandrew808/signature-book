import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Refreshes the Supabase session cookie on every request and gates /app behind sign-in. */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) req.cookies.set(c.name, c.value);
        res = NextResponse.next({ request: req });
        for (const c of list) res.cookies.set(c.name, c.value, c.options);
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;
  if (!user && (path === "/app" || path.startsWith("/app/") || path === "/start")) {
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = req.nextUrl.clone(); url.pathname = req.nextUrl.searchParams.get("next") || "/app"; url.search = "";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/app/:path*", "/app", "/start", "/login", "/api/events/:path*", "/api/events", "/api/photos", "/api/studios/:path*", "/api/studios"] };
