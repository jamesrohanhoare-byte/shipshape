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
