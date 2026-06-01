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
-- SECURITY DEFINER so the cached-quantity update runs with owner privileges and
-- isn't blocked by RLS when a deckhand (who may only *insert a deduct*, not edit
-- items) logs usage. The movement insert itself stays RLS-gated below.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer
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
