create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  lifetime_earned bigint not null default 0 check (lifetime_earned >= 0),
  lifetime_spent bigint not null default 0 check (lifetime_spent >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  entry_type text not null check (entry_type in ('welcome_bonus', 'purchase', 'unlock', 'adjustment', 'reward')),
  reference_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coin_ledger_user_created_idx
  on public.coin_ledger(user_id, created_at desc);

create table if not exists public.catalog_items (
  item_key text primary key check (item_key ~ '^[a-z0-9-]+$'),
  title text not null,
  description text not null default '',
  item_type text not null check (item_type in ('character', 'content', 'download', 'access', 'product')),
  price_coins integer not null check (price_coins > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.member_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null references public.catalog_items(item_key) on delete restrict,
  ledger_id bigint not null references public.coin_ledger(id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

create index if not exists member_unlocks_user_idx
  on public.member_unlocks(user_id);

create table if not exists public.stripe_payments (
  stripe_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  pack_key text not null,
  coins integer not null check (coins > 0),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  processed_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.catalog_items enable row level security;
alter table public.member_unlocks enable row level security;
alter table public.stripe_payments enable row level security;

create policy "Members can view their profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Members can update their profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Members can view their wallet"
  on public.wallets for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Members can view their coin activity"
  on public.coin_ledger for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Anyone can view active catalog items"
  on public.catalog_items for select to anon, authenticated
  using (active = true);

create policy "Members can view their unlocks"
  on public.member_unlocks for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.wallets from anon, authenticated;
revoke all on public.coin_ledger from anon, authenticated;
revoke all on public.member_unlocks from anon, authenticated;
revoke all on public.stripe_payments from anon, authenticated;
grant select on public.wallets, public.coin_ledger, public.member_unlocks to authenticated;
grant select on public.catalog_items to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.handle_new_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display_name text;
begin
  v_display_name := left(
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'member'), '@', 1)
    ),
    50
  );

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name);

  insert into public.wallets (user_id, balance, lifetime_earned)
  values (new.id, 100, 100);

  insert into public.coin_ledger (
    user_id,
    amount,
    entry_type,
    reference_key,
    metadata
  )
  values (
    new.id,
    100,
    'welcome_bonus',
    'welcome:' || new.id::text,
    jsonb_build_object('description', 'New member welcome bonus')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_motion_coins on auth.users;
create trigger on_auth_user_created_motion_coins
  after insert on auth.users
  for each row execute function public.handle_new_member();

create or replace function public.unlock_catalog_item(p_item_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.catalog_items%rowtype;
  v_balance bigint;
  v_ledger_id bigint;
begin
  if v_user_id is null then
    raise exception 'Sign in to unlock this item';
  end if;

  select * into v_item
  from public.catalog_items
  where item_key = p_item_key and active = true;

  if not found then
    raise exception 'This item is not available';
  end if;

  if exists (
    select 1 from public.member_unlocks
    where user_id = v_user_id and item_key = p_item_key
  ) then
    return jsonb_build_object('status', 'already_unlocked', 'message', 'This item is already unlocked');
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = v_user_id
  for update;

  if v_balance is null then
    raise exception 'Member wallet not found';
  end if;

  if v_balance < v_item.price_coins then
    raise exception 'Not enough Motion Coins';
  end if;

  update public.wallets
  set
    balance = balance - v_item.price_coins,
    lifetime_spent = lifetime_spent + v_item.price_coins,
    updated_at = now()
  where user_id = v_user_id;

  insert into public.coin_ledger (
    user_id,
    amount,
    entry_type,
    reference_key,
    metadata
  )
  values (
    v_user_id,
    -v_item.price_coins,
    'unlock',
    'unlock:' || v_user_id::text || ':' || p_item_key,
    jsonb_build_object('item_key', p_item_key, 'title', v_item.title)
  )
  returning id into v_ledger_id;

  insert into public.member_unlocks (user_id, item_key, ledger_id)
  values (v_user_id, p_item_key, v_ledger_id);

  return jsonb_build_object(
    'status', 'unlocked',
    'message', v_item.title || ' unlocked',
    'balance', v_balance - v_item.price_coins
  );
end;
$$;

revoke all on function public.unlock_catalog_item(text) from public, anon;
grant execute on function public.unlock_catalog_item(text) to authenticated;

create or replace function public.credit_stripe_purchase(
  p_user_id uuid,
  p_session_id text,
  p_pack_key text,
  p_coins integer,
  p_amount_cents integer,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted_session text;
begin
  if p_coins <= 0 or p_amount_cents <= 0 then
    raise exception 'Invalid coin purchase';
  end if;

  insert into public.stripe_payments (
    stripe_session_id,
    user_id,
    pack_key,
    coins,
    amount_cents,
    currency
  )
  values (
    p_session_id,
    p_user_id,
    p_pack_key,
    p_coins,
    p_amount_cents,
    lower(p_currency)
  )
  on conflict (stripe_session_id) do nothing
  returning stripe_session_id into v_inserted_session;

  if v_inserted_session is null then
    return false;
  end if;

  update public.wallets
  set
    balance = balance + p_coins,
    lifetime_earned = lifetime_earned + p_coins,
    updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception 'Member wallet not found';
  end if;

  insert into public.coin_ledger (
    user_id,
    amount,
    entry_type,
    reference_key,
    metadata
  )
  values (
    p_user_id,
    p_coins,
    'purchase',
    'stripe:' || p_session_id,
    jsonb_build_object(
      'pack_key', p_pack_key,
      'amount_cents', p_amount_cents,
      'currency', lower(p_currency)
    )
  );

  return true;
end;
$$;

revoke all on function public.credit_stripe_purchase(uuid, text, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.credit_stripe_purchase(uuid, text, text, integer, integer, text)
  to service_role;
