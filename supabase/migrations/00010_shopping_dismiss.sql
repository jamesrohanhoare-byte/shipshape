-- ============================================================
-- ShipShape 00010 — let a manager remove an item from the auto
-- shopping list. The list is COMPUTED (everything at/below par),
-- so "remove" = dismiss until it's restocked above par and dips
-- again. The dismissal auto-clears on restock via the stock trigger.
-- ============================================================

alter table public.items
  add column if not exists shopping_dismissed boolean not null default false;

-- Re-create the cached-quantity trigger to ALSO clear a dismissal once the
-- item is restocked above par, so it re-appears next time it runs low.
-- Stays SECURITY DEFINER (a deckhand may insert a deduct but can't update items).
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  update public.items
     set current_quantity = greatest(0, current_quantity + new.change_qty)
   where id = new.item_id;

  -- Restocked above par → forget any previous shopping-list dismissal.
  update public.items
     set shopping_dismissed = false
   where id = new.item_id
     and shopping_dismissed = true
     and current_quantity > par_level;

  return new;
end;
$$;
