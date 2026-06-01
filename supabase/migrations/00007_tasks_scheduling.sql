-- ============================================================
-- ShipShape 00007 — task scheduling: shift flag, recurrence,
-- and per-occurrence completions for recurring tasks.
-- ============================================================

-- ── Extend tasks ──────────────────────────────────────────────
alter table public.tasks
  add column if not exists shift text not null default 'day'
    check (shift in ('day','night')),
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurrence_type text
    check (recurrence_type in ('daily','weekly','monthly')),
  add column if not exists recurrence_start_date date;

-- ── Per-occurrence completion for recurring tasks ─────────────
-- A recurring task is a single tasks row (the template). Each day it
-- "occurs", its done/skipped state for THAT day lives here. One-off
-- tasks ignore this table and use tasks.status directly.
create table if not exists public.task_completions (
  id              uuid primary key default gen_random_uuid(),
  boat_id         uuid not null references public.boats(id) on delete cascade,
  task_id         uuid not null references public.tasks(id) on delete cascade,
  occurrence_date date not null,
  done            boolean not null default false,
  skipped         boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (task_id, occurrence_date)
);
create index if not exists task_completions_boat_idx on public.task_completions(boat_id);
create index if not exists task_completions_task_idx on public.task_completions(task_id);

alter table public.task_completions enable row level security;

-- Boat-scoped: everyone on the boat can read and write completions.
-- Ticking a recurring chore is part of the daily loop for ALL roles
-- (mirrors stock-deduct being allowed for everyone). Tenant isolation
-- is enforced by boat_id; this is NOT a blanket auth.uid() IS NOT NULL.
create policy "task_completions_select" on public.task_completions for select
  using (boat_id = public.get_user_boat_id());
create policy "task_completions_insert" on public.task_completions for insert
  with check (boat_id = public.get_user_boat_id());
create policy "task_completions_update" on public.task_completions for update
  using (boat_id = public.get_user_boat_id())
  with check (boat_id = public.get_user_boat_id());
create policy "task_completions_delete" on public.task_completions for delete
  using (boat_id = public.get_user_boat_id());
