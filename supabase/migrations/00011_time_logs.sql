-- ============================================================
-- ShipShape 00011 — crew time tracking (work + sleep) for MLC-style
-- rest-hour compliance. Precise timestamps (not just a date) so rest
-- in any rolling window can be computed. Each crew member logs their
-- OWN time; captain + manager can read the whole crew's logs to run
-- the compliance report.
-- ============================================================

create table if not exists public.time_logs (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.boats(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind        text not null check (kind in ('work','sleep')),
  started_at  timestamptz not null,
  ended_at    timestamptz not null,
  hours       numeric(5,2) not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists time_logs_boat_idx on public.time_logs(boat_id);
create index if not exists time_logs_user_idx on public.time_logs(user_id);
create index if not exists time_logs_started_idx on public.time_logs(started_at);

alter table public.time_logs enable row level security;

-- Read: your own logs always; captain + manager see the whole boat (for reports).
create policy "time_logs_select" on public.time_logs for select
  using (
    boat_id = public.get_user_boat_id()
    and (user_id = auth.uid() or public.get_user_role() in ('captain','manager'))
  );
-- Write: owner only (you log your own time).
create policy "time_logs_insert" on public.time_logs for insert
  with check (user_id = auth.uid() and boat_id = public.get_user_boat_id());
create policy "time_logs_update" on public.time_logs for update
  using (user_id = auth.uid() and boat_id = public.get_user_boat_id())
  with check (user_id = auth.uid() and boat_id = public.get_user_boat_id());
create policy "time_logs_delete" on public.time_logs for delete
  using (user_id = auth.uid() and boat_id = public.get_user_boat_id());

-- Migrate existing sleep_logs into time_logs (once). Best-effort: build precise
-- timestamps from log_date + the recorded times; roll the end to the next day
-- when sleep crossed midnight.
insert into public.time_logs (boat_id, user_id, kind, started_at, ended_at, hours, note, created_at)
select
  boat_id, user_id, 'sleep',
  (log_date + coalesce(sleep_start, time '22:00'))::timestamptz,
  (log_date + coalesce(sleep_end, time '06:00')
    + case when coalesce(sleep_end, time '06:00') <= coalesce(sleep_start, time '22:00')
           then interval '1 day' else interval '0 day' end)::timestamptz,
  hours, note, created_at
from public.sleep_logs
where not exists (select 1 from public.time_logs);
