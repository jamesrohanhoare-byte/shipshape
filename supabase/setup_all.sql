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
-- ============================================================
-- ShipShape 00002 — inventory: units, categories, items, and the
-- stock_movements ledger (source of truth) with a trigger that keeps
-- items.current_quantity in sync. Role-gated RLS.
-- ============================================================

-- ── Units of measure ──────────────────────────────────────────
create table public.units (
  id           uuid primary key default gen_random_uuid(),
  boat_id      uuid not null references public.boats(id) on delete cascade,
  name         text not null,
  abbreviation text not null default ''
);
create index on public.units(boat_id);

-- ── Categories ────────────────────────────────────────────────
create table public.categories (
  id      uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  name    text not null
);
create index on public.categories(boat_id);

-- ── Items ─────────────────────────────────────────────────────
create table public.items (
  id               uuid primary key default gen_random_uuid(),
  boat_id          uuid not null references public.boats(id) on delete cascade,
  name             text not null,
  category_id      uuid references public.categories(id) on delete set null,
  unit_id          uuid references public.units(id) on delete set null,
  price_per_unit   numeric(12,2) not null default 0,
  par_level        numeric(12,2) not null default 0,
  current_quantity numeric(12,2) not null default 0,
  location         text,
  photo_url        text,
  created_at       timestamptz not null default now()
);
create index on public.items(boat_id);

-- ── Stock movements (immutable ledger) ────────────────────────
create table public.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  boat_id    uuid not null references public.boats(id) on delete cascade,
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null default auth.uid(),
  change_qty numeric(12,2) not null,                 -- signed: deduct negative, add positive
  type       text not null check (type in ('add','deduct','adjust','stocktake')),
  note       text,
  created_at timestamptz not null default now()
);
create index on public.stock_movements(boat_id);
create index on public.stock_movements(item_id);
create index on public.stock_movements(created_at);

-- ── Keep items.current_quantity in sync from the ledger ───────
create or replace function public.apply_stock_movement()
returns trigger language plpgsql
set search_path = public as $$
begin
  update public.items
     set current_quantity = greatest(0, current_quantity + new.change_qty)
   where id = new.item_id;
  return new;
end;
$$;

create trigger trg_apply_stock_movement
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ── RLS ───────────────────────────────────────────────────────
alter table public.units           enable row level security;
alter table public.categories      enable row level security;
alter table public.items           enable row level security;
alter table public.stock_movements enable row level security;

-- Units & categories: read by boat; managed by captain/manager
create policy "units_select" on public.units for select
  using (boat_id = public.get_user_boat_id());
create policy "units_write" on public.units for all
  using (boat_id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager'))
  with check (boat_id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager'));

create policy "categories_select" on public.categories for select
  using (boat_id = public.get_user_boat_id());
create policy "categories_write" on public.categories for all
  using (boat_id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager'))
  with check (boat_id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager'));

-- Items: read by boat; create/edit/delete by captain/manager
create policy "items_select" on public.items for select
  using (boat_id = public.get_user_boat_id());
create policy "items_write" on public.items for all
  using (boat_id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager'))
  with check (boat_id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager'));

-- Movements: read by boat. Insert: deduct by anyone on the boat;
-- add/adjust/stocktake only by captain/manager. Ledger is immutable (no update/delete).
create policy "movements_select" on public.stock_movements for select
  using (boat_id = public.get_user_boat_id());
create policy "movements_insert" on public.stock_movements for insert
  with check (
    boat_id = public.get_user_boat_id()
    and (type = 'deduct' or public.get_user_role() in ('captain','manager'))
  );
-- ============================================================
-- ShipShape 00003 — engineer/crew tasks + manual sleep logs.
-- ============================================================

-- ── Tasks ─────────────────────────────────────────────────────
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.boats(id) on delete cascade,
  title       text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  status      text not null default 'open' check (status in ('open','in_progress','done')),
  due_date    date,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on public.tasks(boat_id);

alter table public.tasks enable row level security;

-- Everyone on the boat can read tasks.
create policy "tasks_select" on public.tasks for select
  using (boat_id = public.get_user_boat_id());
-- Captain, manager, engineer manage tasks. Deckhands may update a task
-- assigned to them (e.g. tick it done) but not create/delete.
create policy "tasks_insert" on public.tasks for insert
  with check (boat_id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager','engineer'));
create policy "tasks_update" on public.tasks for update
  using (
    boat_id = public.get_user_boat_id()
    and (public.get_user_role() in ('captain','manager','engineer') or assigned_to = auth.uid())
  )
  with check (boat_id = public.get_user_boat_id());
create policy "tasks_delete" on public.tasks for delete
  using (boat_id = public.get_user_boat_id() and public.get_user_role() in ('captain','manager','engineer'));

-- ── Sleep logs (strictly user-scoped) ─────────────────────────
create table public.sleep_logs (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.boats(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  log_date    date not null default current_date,
  sleep_start time,
  sleep_end   time,
  hours       numeric(4,1) not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);
create index on public.sleep_logs(user_id);

alter table public.sleep_logs enable row level security;

-- Owner only — a crew member sees and manages only their own sleep.
create policy "sleep_own" on public.sleep_logs for all
  using (user_id = auth.uid() and boat_id = public.get_user_boat_id())
  with check (user_id = auth.uid() and boat_id = public.get_user_boat_id());
-- ============================================================
-- ShipShape 00004 — storage bucket for boat logos (branding).
-- Public read (logos appear in-app and on reports). Writes restricted
-- to captain/manager of the owning boat. Path convention: {boat_id}/...
-- ============================================================

insert into storage.buckets (id, name, public)
values ('boat-logos', 'boat-logos', true)
on conflict (id) do nothing;

-- Anyone can read logos (they render in the app and on shared reports)
create policy "logos_public_read" on storage.objects for select
  using (bucket_id = 'boat-logos');

-- Upload/replace/remove only within your own boat's folder, captain/manager only
create policy "logos_insert" on storage.objects for insert
  with check (
    bucket_id = 'boat-logos'
    and (storage.foldername(name))[1] = public.get_user_boat_id()::text
    and public.get_user_role() in ('captain','manager')
  );
create policy "logos_update" on storage.objects for update
  using (
    bucket_id = 'boat-logos'
    and (storage.foldername(name))[1] = public.get_user_boat_id()::text
    and public.get_user_role() in ('captain','manager')
  );
create policy "logos_delete" on storage.objects for delete
  using (
    bucket_id = 'boat-logos'
    and (storage.foldername(name))[1] = public.get_user_boat_id()::text
    and public.get_user_role() in ('captain','manager')
  );
-- ============================================================
-- ShipShape 00005 — boat-level notification preference.
-- Controls how chatty low-stock/usage pushes are.
--   all  — push on every usage (default)
--   low  — push only when an item crosses par (low/out)
--   off  — no usage/low pushes
-- ============================================================

alter table public.boats
  add column if not exists notify_mode text not null default 'all'
  check (notify_mode in ('all', 'low', 'off'));
-- ============================================================
-- ShipShape 00006 — per-user onboarding flag.
-- Drives the first-run walkthrough; flips true when finished.
-- (Replay = set back to false from Settings.)
-- ============================================================

alter table public.profiles
  add column if not exists onboarded boolean not null default false;
