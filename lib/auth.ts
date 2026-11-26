// Server-side auth helpers. Supabase Auth (magic links) + studio membership.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase";

export type Studio = {
  id: string;
  slug: string;
  name: string;
  plan: "trial" | "starter" | "studio" | "white_label";
  plan_status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  branding: Branding;
  created_at: string;
};

export type Branding = {
  logo_path?: string | null;
  accent?: string;   // e.g. "#C9A3A0"
  thank_you?: string; // headline on the thanks screen
  powered_by?: boolean; // false only on white_label
};

/** Supabase client bound to the request's auth cookies (read-only cookie access is fine in route handlers / RSC). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { for (const c of list) store.set(c.name, c.value, c.options); } catch { /* RSC: middleware refreshes */ } },
    },
  });
}

export async function getUser() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

/** Studios the signed-in user belongs to (service key, so RLS is not in play). Claims any invites addressed to their email first. */
export async function studiosFor(userId: string, email?: string | null): Promise<Studio[]> {
  const db = supabaseAdmin();
  if (email) {
    const { data: inv } = await db.from("studio_invites").select("studio_id, role").ilike("email", email);
    if (inv?.length) {
      await db.from("studio_members").upsert(inv.map((i) => ({ studio_id: i.studio_id, user_id: userId, role: i.role })), { onConflict: "studio_id,user_id", ignoreDuplicates: true });
      await db.from("studio_invites").delete().ilike("email", email);
    }
  }
  const { data: m } = await db.from("studio_members").select("studio_id").eq("user_id", userId);
  const ids = (m || []).map((x) => x.studio_id);
  if (!ids.length) return [];
  const { data } = await db.from("studios").select("*").in("id", ids).order("created_at");
  return (data || []) as Studio[];
}

export type Actor =
  | { kind: "admin" }                       // ADMIN_PIN header: sees everything
  | { kind: "user"; userId: string; studios: Studio[] }
  | null;

/** Who is calling an API route: the super-admin (PIN header) or a signed-in studio member. */
export async function actorFrom(req: Request): Promise<Actor> {
  const pin = process.env.ADMIN_PIN;
  if (pin && req.headers.get("x-admin-pin") === pin) return { kind: "admin" };
  const user = await getUser();
  if (!user) return null;
  return { kind: "user", userId: user.id, studios: await studiosFor(user.id, user.email) };
}

export function canManageStudio(actor: Actor, studioId: string | null | undefined) {
  if (!actor) return false;
  if (actor.kind === "admin") return true;
  return !!studioId && actor.studios.some((s) => s.id === studioId);
}
