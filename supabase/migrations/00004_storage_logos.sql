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
