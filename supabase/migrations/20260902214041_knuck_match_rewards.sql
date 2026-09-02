-- Award authenticated KNUCK players once per recorded match and victory.
create table if not exists public.knuck_matches (
  match_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('vscpu', 'vs', 'tower')),
  status text not null default 'started' check (status in ('started', 'completed')),
  player_won boolean,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists knuck_matches_user_started_idx
  on public.knuck_matches(user_id, started_at desc);

alter table public.knuck_matches enable row level security;
revoke all on public.knuck_matches from public, anon, authenticated;

create or replace function public.start_knuck_match(p_match_id uuid, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance bigint;
  v_reference text;
begin
  if v_user_id is null then
    raise exception 'Sign in to earn Motion Coins';
  end if;

  if p_match_id is null or p_mode not in ('vscpu', 'vs', 'tower') then
    raise exception 'Invalid KNUCK match';
  end if;

  if exists (
    select 1 from public.knuck_matches
    where user_id = v_user_id
      and match_id <> p_match_id
      and started_at > now() - interval '10 seconds'
  ) then
    select balance into v_balance from public.wallets where user_id = v_user_id;
    return jsonb_build_object('status', 'cooldown', 'balance', v_balance);
  end if;

  if exists (
    select 1 from public.knuck_matches
    where user_id = v_user_id and match_id = p_match_id
  ) then
    select balance into v_balance from public.wallets where user_id = v_user_id;
    return jsonb_build_object('status', 'already_started', 'balance', v_balance);
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = v_user_id
  for update;

  if v_balance is null then
    raise exception 'Member wallet not found';
  end if;

  insert into public.knuck_matches (match_id, user_id, mode)
  values (p_match_id, v_user_id, p_mode);

  v_reference := 'knuck:play:' || v_user_id::text || ':' || p_match_id::text;
  insert into public.coin_ledger (user_id, amount, entry_type, reference_key, metadata)
  values (
    v_user_id,
    1,
    'reward',
    v_reference,
    jsonb_build_object('description', 'KNUCK match played', 'match_id', p_match_id, 'mode', p_mode)
  );

  update public.wallets
  set balance = balance + 1,
      lifetime_earned = lifetime_earned + 1,
      updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object('status', 'credited', 'coins_awarded', 1, 'balance', v_balance + 1);
exception
  when unique_violation then
    select balance into v_balance from public.wallets where user_id = v_user_id;
    return jsonb_build_object('status', 'already_started', 'balance', v_balance);
end;
$$;

create or replace function public.finish_knuck_match(
  p_match_id uuid,
  p_player_won boolean,
  p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.knuck_matches%rowtype;
  v_balance bigint;
  v_reference text;
begin
  if v_user_id is null then
    raise exception 'Sign in to earn Motion Coins';
  end if;

  if p_match_id is null or p_player_won is null
    or p_duration_seconds is null or p_duration_seconds < 0 or p_duration_seconds > 3600 then
    raise exception 'Invalid KNUCK match result';
  end if;

  select * into v_match
  from public.knuck_matches
  where match_id = p_match_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'KNUCK match not found';
  end if;

  select balance into v_balance from public.wallets where user_id = v_user_id for update;

  if v_match.status = 'completed' then
    return jsonb_build_object('status', 'already_finished', 'balance', v_balance);
  end if;

  if p_player_won and (p_duration_seconds < 10 or now() - v_match.started_at < interval '10 seconds') then
    raise exception 'Match ended too quickly to verify the win';
  end if;

  update public.knuck_matches
  set status = 'completed', player_won = p_player_won, completed_at = now()
  where match_id = p_match_id and user_id = v_user_id;

  if not p_player_won then
    return jsonb_build_object('status', 'completed', 'coins_awarded', 0, 'balance', v_balance);
  end if;

  v_reference := 'knuck:win:' || v_user_id::text || ':' || p_match_id::text;
  insert into public.coin_ledger (user_id, amount, entry_type, reference_key, metadata)
  values (
    v_user_id,
    5,
    'reward',
    v_reference,
    jsonb_build_object(
      'description', 'KNUCK match victory',
      'match_id', p_match_id,
      'mode', v_match.mode,
      'duration_seconds', p_duration_seconds
    )
  );

  update public.wallets
  set balance = balance + 5,
      lifetime_earned = lifetime_earned + 5,
      updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object('status', 'credited', 'coins_awarded', 5, 'balance', v_balance + 5);
exception
  when unique_violation then
    select balance into v_balance from public.wallets where user_id = v_user_id;
    return jsonb_build_object('status', 'already_finished', 'balance', v_balance);
end;
$$;

revoke all on function public.start_knuck_match(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_knuck_match(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.start_knuck_match(uuid, text) to authenticated;
grant execute on function public.finish_knuck_match(uuid, boolean, integer) to authenticated;
