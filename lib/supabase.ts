import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type EventRow = {
  id: string;
  slug: string;
  title: string;
  gallery_token?: string;
  qr_path: string | null;
};

export type PhotoRow = {
  id: string;
  event_id: string;
  original_path: string;
  signed_path: string | null;
  layer_path: string | null;
  guest_name: string | null;
  signed_at: string | null;
  created_at: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

/** Read-only browser client (anon key). */
export function supabaseBrowser(): SupabaseClient {
  if (!browserClient) browserClient = createClient(url!, anon!);
  return browserClient;
}

/** Server client with the service key. Only import from API routes. */
export function supabaseAdmin(): SupabaseClient {
  return createClient(url!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
}

/** Public URL for a file in the "booth" bucket. */
export function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${url}/storage/v1/object/public/booth/${path}`;
}
