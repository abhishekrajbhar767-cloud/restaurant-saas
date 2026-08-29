-- 0010_storage.sql
-- Menu item images live in a public-read bucket (customers need to see them
-- with no auth), but writes are restricted to that restaurant's owner/manager
-- via the object path convention: menu-images/<restaurant_id>/<file>.
-- storage.foldername(name) gives the path segments before the filename, so
-- (storage.foldername(name))[1] is the restaurant_id segment — checked
-- against the SAME auth_has_role_in_restaurant() helper the rest of the app
-- uses, not a separately-trusted client claim.

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

create policy "menu_images_public_read"
  on storage.objects for select
  using (bucket_id = 'menu-images');

create policy "menu_images_owner_manager_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-images'
    and public.auth_has_role_in_restaurant((storage.foldername(name))[1]::uuid, array['owner','manager']::member_role[])
  );

create policy "menu_images_owner_manager_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'menu-images'
    and public.auth_has_role_in_restaurant((storage.foldername(name))[1]::uuid, array['owner','manager']::member_role[])
  );

create policy "menu_images_owner_manager_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menu-images'
    and public.auth_has_role_in_restaurant((storage.foldername(name))[1]::uuid, array['owner','manager']::member_role[])
  );
