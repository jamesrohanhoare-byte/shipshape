-- ============================================================
-- ShipShape 00009 — boat-level currency + optional financial stats.
-- Currency is chosen once per boat (yachts operate in EUR/USD/etc.,
-- not always ZAR). show_financials toggles cost figures on the
-- crew-facing surfaces (dashboard + shopping). Captain-only Reports
-- always show, but respect the chosen currency.
-- ============================================================

alter table public.boats
  add column if not exists currency text not null default 'ZAR',
  add column if not exists show_financials boolean not null default true;
