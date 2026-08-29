-- 0007_triggers.sql

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_restaurants_updated_at before update on public.restaurants
  for each row execute function public.set_updated_at();
create trigger trg_members_updated_at before update on public.restaurant_members
  for each row execute function public.set_updated_at();
create trigger trg_categories_updated_at before update on public.menu_categories
  for each row execute function public.set_updated_at();
create trigger trg_items_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();

-- When a waiter (or manager/owner) membership is created, give them a
-- waiter_status row so realtime free/busy queries never have to handle nulls.
create or replace function public.provision_waiter_status()
returns trigger language plpgsql as $$
begin
  if new.role in ('waiter', 'manager', 'owner') and new.restaurant_id is not null then
    insert into public.waiter_status (member_id, restaurant_id, availability)
    values (new.id, new.restaurant_id, 'offline')
    on conflict (member_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_provision_waiter_status after insert on public.restaurant_members
  for each row execute function public.provision_waiter_status();
