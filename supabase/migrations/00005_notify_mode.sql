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
