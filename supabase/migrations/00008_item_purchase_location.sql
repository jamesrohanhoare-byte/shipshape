-- ============================================================
-- ShipShape 00008 — where an item is bought (supplier/store).
-- Distinct from `location` (where it's STORED on the boat).
-- Surfaces on the shopping list so a provisioning run is grouped
-- by where to go. Cost is already `price_per_unit`.
-- ============================================================

alter table public.items
  add column if not exists purchase_location text;
