create table if not exists public.redemption_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null references public.catalog_items(item_key) on delete restrict,
  ledger_id bigint not null references public.coin_ledger(id) on delete restrict,
  member_name text not null,
  member_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'scheduled', 'fulfilled', 'declined', 'refunded')),
  details jsonb not null default '{}'::jsonb,
  admin_notes text not null default '',
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists redemption_requests_user_created_idx
  on public.redemption_requests(user_id, created_at desc);
create index if not exists redemption_requests_status_created_idx
  on public.redemption_requests(status, created_at desc);

alter table public.redemption_requests enable row level security;

create policy "Members can view their redemption requests"
  on public.redemption_requests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can view all redemption requests"
  on public.redemption_requests for select to authenticated
  using (lower(coalesce((select auth.jwt() ->> 'email'), '')) in ('donp@donponline.com', 'donpbeats@gmail.com'));

revoke all on public.redemption_requests from anon, authenticated;
grant select on public.redemption_requests to authenticated;

insert into public.catalog_items (item_key, title, description, item_type, price_coins, active, sort_order)
values
  ('music-review', 'Professional Music Review', 'Submit one song for focused feedback on the music, presentation, and next-step strategy.', 'access', 750, true, 10),
  ('zoom-consultation', 'Private Zoom Consultation', 'A one-on-one strategy session for practical music-business guidance and industry advice.', 'access', 1500, true, 20),
  ('industry-event-request', 'Exclusive Industry Event Request', 'Submit for consideration for select DONPONLINE music-industry invitations and networking experiences. Invitations are not guaranteed.', 'access', 2000, true, 30),
  ('stage-opportunity', 'Live Performance Opportunity', 'Submit for consideration to perform on a select stage. Redemption starts the review process and does not guarantee a booking.', 'access', 2500, true, 40)
on conflict (item_key) do update set
  title = excluded.title,
  description = excluded.description,
  item_type = excluded.item_type,
  price_coins = excluded.price_coins,
  active = excluded.active,
  sort_order = excluded.sort_order;

create or replace function public.redeem_catalog_item(p_item_key text, p_details jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.catalog_items%rowtype;
  v_balance bigint;
  v_ledger_id bigint;
  v_request_id uuid := gen_random_uuid();
  v_name text;
  v_email text;
begin
  if v_user_id is null then raise exception 'Sign in to redeem this reward'; end if;

  select * into v_item from public.catalog_items
  where item_key = p_item_key and active = true;
  if not found then raise exception 'This reward is not available'; end if;

  if v_item.item_type in ('character', 'content', 'download') and exists (
    select 1 from public.member_unlocks where user_id = v_user_id and item_key = p_item_key
  ) then
    return jsonb_build_object('status', 'already_unlocked', 'message', 'This item is already unlocked');
  end if;

  if v_item.item_type in ('access', 'product') and exists (
    select 1 from public.redemption_requests
    where user_id = v_user_id and item_key = p_item_key and status in ('pending', 'approved', 'scheduled')
  ) then
    return jsonb_build_object('status', 'already_pending', 'message', 'You already have an active request for this reward');
  end if;

  select balance into v_balance from public.wallets where user_id = v_user_id for update;
  if v_balance is null then raise exception 'Member wallet not found'; end if;
  if v_balance < v_item.price_coins then raise exception 'Not enough Motion Coins'; end if;

  select p.display_name, u.email into v_name, v_email
  from auth.users u left join public.profiles p on p.id = u.id where u.id = v_user_id;

  update public.wallets set
    balance = balance - v_item.price_coins,
    lifetime_spent = lifetime_spent + v_item.price_coins,
    updated_at = now()
  where user_id = v_user_id;

  insert into public.coin_ledger (user_id, amount, entry_type, reference_key, metadata)
  values (
    v_user_id, -v_item.price_coins, 'unlock', 'redeem:' || v_request_id::text,
    jsonb_build_object('item_key', p_item_key, 'title', v_item.title, 'request_id', v_request_id)
  ) returning id into v_ledger_id;

  if v_item.item_type in ('character', 'content', 'download') then
    insert into public.member_unlocks (user_id, item_key, ledger_id)
    values (v_user_id, p_item_key, v_ledger_id);
  end if;

  insert into public.redemption_requests (
    id, user_id, item_key, ledger_id, member_name, member_email, status, details
  ) values (
    v_request_id, v_user_id, p_item_key, v_ledger_id,
    coalesce(v_name, split_part(v_email, '@', 1)), v_email,
    case when v_item.item_type in ('character', 'content', 'download') then 'fulfilled' else 'pending' end,
    coalesce(p_details, '{}'::jsonb)
  );

  return jsonb_build_object(
    'status', case when v_item.item_type in ('character', 'content', 'download') then 'unlocked' else 'pending' end,
    'message', case when v_item.item_type in ('character', 'content', 'download')
      then v_item.title || ' unlocked'
      else v_item.title || ' request submitted' end,
    'request_id', v_request_id,
    'balance', v_balance - v_item.price_coins
  );
end;
$$;

revoke all on function public.redeem_catalog_item(text, jsonb) from public, anon;
grant execute on function public.redeem_catalog_item(text, jsonb) to authenticated;

create or replace function public.manage_redemption(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default '',
  p_refund boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_request public.redemption_requests%rowtype;
  v_spent integer;
begin
  if v_email not in ('donp@donponline.com', 'donpbeats@gmail.com') then
    raise exception 'Owner access required';
  end if;
  if p_status not in ('pending', 'approved', 'scheduled', 'fulfilled', 'declined', 'refunded') then
    raise exception 'Invalid redemption status';
  end if;

  select * into v_request from public.redemption_requests where id = p_request_id for update;
  if not found then raise exception 'Redemption request not found'; end if;

  if p_refund and v_request.status <> 'refunded' then
    select abs(amount) into v_spent from public.coin_ledger where id = v_request.ledger_id;
    update public.wallets set
      balance = balance + v_spent,
      lifetime_spent = greatest(0, lifetime_spent - v_spent),
      updated_at = now()
    where user_id = v_request.user_id;
    insert into public.coin_ledger (user_id, amount, entry_type, reference_key, metadata)
    values (
      v_request.user_id, v_spent, 'adjustment', 'refund:' || p_request_id::text,
      jsonb_build_object('request_id', p_request_id, 'reason', 'Redemption refund')
    ) on conflict (reference_key) do nothing;
    p_status := 'refunded';
  end if;

  update public.redemption_requests set
    status = p_status,
    admin_notes = left(coalesce(p_admin_notes, ''), 3000),
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('ok', true, 'status', p_status, 'refunded', p_refund);
end;
$$;

revoke all on function public.manage_redemption(uuid, text, text, boolean) from public, anon;
grant execute on function public.manage_redemption(uuid, text, text, boolean) to authenticated;
