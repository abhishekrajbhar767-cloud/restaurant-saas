-- 0034_staff_push_tokens.sql
-- FCM registration for the waitstaff Android app. Tokens are scoped to a
-- restaurant_members row so a device that clocks into restaurant A cannot
-- receive restaurant B's alerts, and a deactivated member stops getting them
-- the moment is_active flips.

create table if not exists public.staff_push_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.restaurant_members(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_push_tokens_token_unique unique (token),
  constraint staff_push_tokens_platform_check check (platform in ('android', 'ios', 'web'))
);

create index if not exists staff_push_tokens_restaurant_idx
  on public.staff_push_tokens (restaurant_id);

create index if not exists staff_push_tokens_member_idx
  on public.staff_push_tokens (member_id);

alter table public.staff_push_tokens enable row level security;

create policy staff_push_tokens_select_own
  on public.staff_push_tokens for select
  to authenticated
  using (
    member_id in (select m.id from public.restaurant_members m where m.user_id = auth.uid() and m.is_active)
    or public.auth_is_super_admin()
  );

create policy staff_push_tokens_insert_own
  on public.staff_push_tokens for insert
  to authenticated
  with check (
    member_id = public.auth_member_id(restaurant_id)
    and restaurant_id in (select public.auth_restaurant_ids())
  );

create policy staff_push_tokens_update_own
  on public.staff_push_tokens for update
  to authenticated
  using (member_id in (select m.id from public.restaurant_members m where m.user_id = auth.uid() and m.is_active))
  with check (member_id in (select m.id from public.restaurant_members m where m.user_id = auth.uid() and m.is_active));

create policy staff_push_tokens_delete_own
  on public.staff_push_tokens for delete
  to authenticated
  using (member_id in (select m.id from public.restaurant_members m where m.user_id = auth.uid() and m.is_active));

-- Upsert from the Android WebView after FCM issues a token. SECURITY DEFINER
-- so the caller doesn't have to know their restaurant_members.id — we derive
-- it from auth.uid() the same way every other staff RPC does.
create or replace function public.register_staff_push_token(p_token text, p_platform text default 'android')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.restaurant_members%rowtype;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Missing push token' using errcode = 'P0001';
  end if;

  select * into v_member
    from public.restaurant_members
    where user_id = auth.uid()
      and is_active
      and restaurant_id is not null
    limit 1;

  if not found then
    raise exception 'No active restaurant membership' using errcode = 'P0004';
  end if;

  insert into public.staff_push_tokens (member_id, restaurant_id, token, platform)
  values (v_member.id, v_member.restaurant_id, trim(p_token), coalesce(nullif(p_platform, ''), 'android'))
  on conflict (token) do update
    set member_id = excluded.member_id,
        restaurant_id = excluded.restaurant_id,
        platform = excluded.platform,
        updated_at = now();
end;
$$;

revoke all on function public.register_staff_push_token(text, text) from public;
grant execute on function public.register_staff_push_token(text, text) to authenticated;
