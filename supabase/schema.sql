-- Run this once against your Supabase project (SQL Editor -> New query -> Run).
--
-- Generic runtime feature-flag table so toggles (like the interactive map) can be flipped
-- from the Supabase dashboard instead of needing a new release + GitHub Pages deploy.
-- Read-only from the app's side: RLS grants anon SELECT only, no insert/update/delete policy
-- exists for anon, so the public anon key (necessarily exposed client-side in a static app)
-- can only ever read flag values, never change them. Flip a flag by editing the row directly
-- in the Supabase Table Editor.

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

create policy "Public read access" on public.feature_flags
  for select
  to anon
  using (true);

insert into public.feature_flags (key, enabled)
values ('map', true)
on conflict (key) do nothing;
