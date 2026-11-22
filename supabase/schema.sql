-- Photo Lounge Signature Book — run once in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- One row per wedding / event
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- short URL segment, e.g. "smith-2026-11-14"
  title text not null,                    -- shown on the iPad, e.g. "Sarah & Kai"
  editor_pin text not null,               -- editor types this on the Upload page
  gallery_token text not null default encode(gen_random_bytes(12), 'hex'),
  qr_path text,                           -- storage path of the pre-registration QR image
  created_at timestamptz default now()
);

-- One row per booth portrait
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  original_path text not null,            -- storage path of the edited export
  signed_path text,                       -- flattened signed JPEG
  layer_path text,                        -- transparent ink layer PNG
  guest_name text,
  signed_at timestamptz,
  frame text,                             -- 'print' (white border + writing band) or 'none'
  created_at timestamptz default now()
);
create index if not exists photos_event_created on photos (event_id, created_at desc);

-- Realtime: the iPad subscribes to inserts/updates on photos and events
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table events;

-- Row level security: the browser (anon key) may READ; all writes go through
-- the Next.js API routes with the service key.
alter table events enable row level security;
alter table photos enable row level security;

create policy "public read events" on events for select using (true);
create policy "public read photos" on photos for select using (true);

-- Storage: one public bucket for everything. Writes only via service key.
insert into storage.buckets (id, name, public)
values ('booth', 'booth', true)
on conflict (id) do nothing;

create policy "public read booth files" on storage.objects
  for select using (bucket_id = 'booth');

-- Example event (edit, then open /<slug> on the iPad):
-- insert into events (slug, title, editor_pin) values ('demo', 'Sarah & Kai', '0000');
