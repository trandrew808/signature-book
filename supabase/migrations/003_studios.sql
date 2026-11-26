-- 003: multi-tenant studios. Run once in the Supabase SQL editor (or via the MCP apply_migration).

-- A studio is a paying customer: a photography studio or booth company.
create table if not exists studios (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                 -- short handle, e.g. "photo-lounge"
  name text not null,                        -- "Photo Lounge by Redefined Weddings"
  plan text not null default 'trial',        -- trial | starter | studio | white_label
  plan_status text not null default 'trialing', -- trialing | active | past_due | canceled
  trial_ends_at timestamptz default now() + interval '14 days',
  stripe_customer_id text,
  stripe_subscription_id text,
  branding jsonb not null default '{}'::jsonb, -- { logo_path, accent, bg, fg, thank_you, powered_by }
  created_at timestamptz default now()
);

-- Who can manage a studio. One person can belong to several studios.
create table if not exists studio_members (
  studio_id uuid not null references studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',        -- owner | editor
  created_at timestamptz default now(),
  primary key (studio_id, user_id)
);
create index if not exists studio_members_user on studio_members (user_id);

alter table events add column if not exists studio_id uuid references studios(id) on delete cascade;
create index if not exists events_studio_created on events (studio_id, created_at desc);

-- Existing events belong to the first studio: Photo Lounge.
insert into studios (slug, name, plan, plan_status, trial_ends_at)
values ('photo-lounge', 'Photo Lounge by Redefined Weddings', 'white_label', 'active', null)
on conflict (slug) do nothing;
update events set studio_id = (select id from studios where slug = 'photo-lounge') where studio_id is null;

-- RLS: members read their own studios and memberships. All writes go through the API (service key).
alter table studios enable row level security;
alter table studio_members enable row level security;

drop policy if exists "members read studios" on studios;
create policy "members read studios" on studios for select
  using (exists (select 1 from studio_members m where m.studio_id = studios.id and m.user_id = auth.uid()));

drop policy if exists "members read memberships" on studio_members;
create policy "members read memberships" on studio_members for select
  using (user_id = auth.uid());

alter publication supabase_realtime add table studios;

-- Invites: an email that becomes a member the first time it signs in (used to seed owners and add editors).
create table if not exists studio_invites (
  studio_id uuid not null references studios(id) on delete cascade,
  email text not null,
  role text not null default 'owner',
  created_at timestamptz default now(),
  primary key (studio_id, email)
);
alter table studio_invites enable row level security;
