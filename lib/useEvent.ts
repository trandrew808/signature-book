"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser, EventRow, PhotoRow } from "./supabase";

/** Loads an event by slug and keeps its photos live via Supabase Realtime. */
export function useEvent(slug: string) {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    const sb = supabaseBrowser();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: ev, error } = await sb.from("events").select("id, slug, title, qr_path").eq("slug", slug).single();
      if (cancelled) return;
      if (error || !ev) { setStatus(error && error.code !== "PGRST116" ? "error" : "missing"); return; }
      setEvent(ev as EventRow);
      const { data: rows } = await sb.from("photos").select("*").eq("event_id", ev.id).order("created_at", { ascending: false }).limit(600);
      if (cancelled) return;
      setPhotos((rows as PhotoRow[]) || []);
      setStatus("ready");

      channel = sb
        .channel(`event-${ev.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "photos", filter: `event_id=eq.${ev.id}` }, (payload) => {
          setPhotos((prev) => {
            if (payload.eventType === "DELETE") return prev.filter((p) => p.id !== (payload.old as any).id);
            const row = payload.new as PhotoRow;
            const i = prev.findIndex((p) => p.id === row.id);
            if (i === -1) return [row, ...prev];
            const next = prev.slice(); next[i] = row; return next;
          });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events", filter: `id=eq.${ev.id}` }, (payload) => {
          setEvent((prev) => ({ ...(prev as EventRow), ...(payload.new as EventRow) }));
        })
        .subscribe();
    })();

    // Fallback refresh every 30 s in case realtime drops on venue wifi
    const timer = setInterval(async () => {
      if (!event?.id && status !== "ready") return;
      const { data: ev } = await sb.from("events").select("id").eq("slug", slug).single();
      if (!ev) return;
      const { data: rows } = await sb.from("photos").select("*").eq("event_id", ev.id).order("created_at", { ascending: false }).limit(600);
      if (rows) setPhotos(rows as PhotoRow[]);
    }, 30000);

    return () => { cancelled = true; clearInterval(timer); if (channel) sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return { event, photos, status };
}
