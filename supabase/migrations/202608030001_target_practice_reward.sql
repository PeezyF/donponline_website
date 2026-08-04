create or replace function public.claim_target_practice_reward(
  p_score integer,
  p_hits integer,
  p_duration_ms integer
)
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
    raise exception 'Sign in to collect your Motion Coins';
  end if;

  if p_score < 2000 then
    raise exception 'Reach 2,000 points to unlock this prize';
  end if;

  if p_duration_ms < 28000 or p_duration_ms > 45000
    or p_hits < 7 or p_hits > 120
    or p_score > p_hits * 1200 then
    raise exception 'This round could not be verified';
  end if;

  v_reference := 'target-practice-4:first-win:' || v_user_id::text;

  if exists (select 1 from public.coin_ledger where reference_key = v_reference) then
    select balance into v_balance from public.wallets where user_id = v_user_id;
    return jsonb_build_object(
      'status', 'already_claimed',
      'message', 'This account already collected the Target Practice prize',
      'balance', v_balance
    );
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = v_user_id
  for update;

  if v_balance is null then
    raise exception 'Member wallet not found';
  end if;

  insert into public.coin_ledger (user_id, amount, entry_type, reference_key, metadata)
  values (
    v_user_id,
    5,
    'reward',
    v_reference,
    jsonb_build_object(
      'description', 'Target Practice 4 score prize',
      'score', p_score,
      'hits', p_hits
    )
  );

  update public.wallets
  set balance = balance + 5,
      lifetime_earned = lifetime_earned + 5,
      updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object(
    'status', 'credited',
    'message', '5 Motion Coins added',
    'balance', v_balance + 5
  );
exception
  when unique_violation then
    select balance into v_balance from public.wallets where user_id = v_user_id;
    return jsonb_build_object('status', 'already_claimed', 'balance', v_balance);
end;
$$;

revoke all on function public.claim_target_practice_reward(integer, integer, integer) from public, anon;
grant execute on function public.claim_target_practice_reward(integer, integer, integer) to authenticated;
