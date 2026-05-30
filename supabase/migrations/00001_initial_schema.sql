-- ============================================================
-- ShipShape 00001 — tenancy (boats), people (profiles), roles,
-- helper functions, captain self-signup, and RLS.
-- One boat = one tenant. Captain registers the boat, then creates crew.
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Boats (tenants) ───────────────────────────────────────────
create table public.boats (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null,
  logo_url     text,
  accent_color text default '#0E7490',
  theme_mode   text not null default 'light' check (theme_mode in ('light','dark','auto')),
  created_at   timestamptz not null default now()
);

-- ── Profiles (auth.users ↔ boat + role) ───────────────────────
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  boat_id    uuid not null references public.boats(id) on delete cascade,
  email      text not null,
  full_name  text not null default '',
  role       text not null default 'deckhand'
               check (role in ('captain','manager','deckhand','engineer')),
  created_at timestamptz not null default now()
);
create index on public.profiles(boat_id);

-- ── Helper functions (security definer → bypass RLS, no recursion) ──
create or replace function public.get_user_boat_id()
returns uuid language sql security definer stable
set search_path = public as $$
  select boat_id from public.profiles where id = auth.uid()
$$;

create or replace function public.get_user_role()
returns text language sql security definer stable
set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Profile + boat for the current user (consumed by the app on login)
create or replace function public.get_my_context()
returns json language sql security definer stable
set search_path = public as $$
  select json_build_object(
    'profile', to_json(p),
    'boat', to_json(b)
  )
  from public.profiles p
  join public.boats b on b.id = p.boat_id
  where p.id = auth.uid()
$$;

-- Captain self-signup: create the boat + captain profile + seed defaults.
-- Called by the client immediately after auth.signUp (no profile must exist yet).
create or replace function public.create_boat_and_profile(
  p_boat_name text,
  p_full_name text
)
returns json language plpgsql security definer
set search_path = public as $$
declare
  v_boat_id uuid;
  v_slug    text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profile already exists';
  end if;

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_boat_name), ''), 'boat'), '[^a-z0-9]+', '-', 'gi'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.boats (name, slug)
  values (coalesce(nullif(trim(p_boat_name), ''), 'My Boat'), v_slug)
  returning id into v_boat_id;

  insert into public.profiles (id, boat_id, email, full_name, role)
  values (
    auth.uid(),
    v_boat_id,
    coalesce((select email from auth.users where id = auth.uid()), ''),
    coalesce(nullif(trim(p_full_name), ''), 'Captain'),
    'captain'
  );

  -- Seed common units
  insert into public.units (boat_id, name, abbreviation) values
    (v_boat_id, 'Each', 'ea'),
    (v_boat_id, 'Bottle', 'btl'),
    (v_boat_id, 'Litre', 'L'),
    (v_boat_id, 'Kilogram', 'kg'),
    (v_boat_id, 'Pack', 'pk'),
    (v_boat_id, 'Roll', 'roll'),
    (v_boat_id, 'Case', 'case');

  -- Seed common categories
  insert into public.categories (boat_id, name) values
    (v_boat_id, 'Beverages'),
    (v_boat_id, 'Galley & Food'),
    (v_boat_id, 'Cleaning'),
    (v_boat_id, 'Toiletries'),
    (v_boat_id, 'Engine & Spares'),
    (v_boat_id, 'General');

  return public.get_my_context();
end;
$$;

-- ── RLS ───────────────────────────────────────────────────────
alter table public.boats    enable row level security;
alter table public.profiles enable row level security;

-- Boats: members read their boat; captain/manager edit it.
create policy "boats_select" on public.boats for select
  using (id = public.get_user_boat_id());
create policy "boats_update" on public.boats for update
  using (id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager'))
  with check (id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager'));

-- Profiles: members see crew of their boat; own edits + captain manages crew.
create policy "profiles_select" on public.profiles for select
  using (boat_id = public.get_user_boat_id());
create policy "profiles_update" on public.profiles for update
  using (id = auth.uid() or (public.get_user_role() = 'captain' and boat_id = public.get_user_boat_id()))
  with check (id = auth.uid() or (public.get_user_role() = 'captain' and boat_id = public.get_user_boat_id()));
create policy "profiles_delete" on public.profiles for delete
  using (public.get_user_role() = 'captain' and boat_id = public.get_user_boat_id() and id <> auth.uid());

grant execute on function public.get_my_context() to authenticated;
grant execute on function public.create_boat_and_profile(text, text) to authenticated;
