-- ============================================================
-- ShipShape 00006 — per-user onboarding flag.
-- Drives the first-run walkthrough; flips true when finished.
-- (Replay = set back to false from Settings.)
-- ============================================================

alter table public.profiles
  add column if not exists onboarded boolean not null default false;
