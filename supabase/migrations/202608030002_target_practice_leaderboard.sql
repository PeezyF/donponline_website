create table if not exists public.target_practice_scores (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  best_score integer not null check (best_score >= 0),
  accuracy integer not null check (accuracy between 0 and 100),
  best_streak integer not null check (best_streak >= 0),
  games_played integer not null default 1 check (games_played > 0),
  achieved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists target_practice_scores_rank_idx
  on public.target_practice_scores(best_score desc, achieved_at asc);

alter table public.target_practice_scores enable row level security;
revoke all on public.target_practice_scores from anon, authenticated;

create or replace function public.get_target_practice_leaderboard(p_limit integer default 10)
returns table (
  rank bigint,
  display_name text,
  best_score integer,
  accuracy integer,
  best_streak integer,
  is_current_player boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    ranked.rank,
    ranked.display_name,
    ranked.best_score,
    ranked.accuracy,
    ranked.best_streak,
    ranked.user_id = auth.uid() as is_current_player
  from (
    select
      row_number() over (order by scores.best_score desc, scores.achieved_at asc) as rank,
      scores.user_id,
      profiles.display_name,
      scores.best_score,
      scores.accuracy,
      scores.best_streak
    from public.target_practice_scores scores
    join public.profiles profiles on profiles.id = scores.user_id
  ) ranked
  order by ranked.rank
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke all on function public.get_target_practice_leaderboard(integer) from public;
grant execute on function public.get_target_practice_leaderboard(integer) to anon, authenticated;

create or replace function public.submit_target_practice_score(
  p_score integer,
  p_hits integer,
  p_attempts integer,
  p_best_streak integer,
  p_duration_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_accuracy integer;
  v_rank bigint;
  v_next_score integer;
begin
  if v_user_id is null then
    raise exception 'Sign in to join the leaderboard';
  end if;

  if p_score < 0 or p_duration_ms < 28000 or p_duration_ms > 45000
    or p_hits < 0 or p_hits > 120
    or p_attempts < p_hits or p_attempts > 160
    or p_best_streak < 0 or p_best_streak > p_hits
    or p_score > greatest(p_hits, 1) * 1200 then
    raise exception 'This round could not be verified';
  end if;

  v_accuracy := case
    when p_attempts = 0 then 0
    else round((p_hits::numeric / p_attempts::numeric) * 100)::integer
  end;

  insert into public.target_practice_scores (
    user_id, best_score, accuracy, best_streak, games_played, achieved_at, updated_at
  ) values (
    v_user_id, p_score, v_accuracy, p_best_streak, 1, now(), now()
  )
  on conflict (user_id) do update set
    best_score = greatest(public.target_practice_scores.best_score, excluded.best_score),
    accuracy = case when excluded.best_score > public.target_practice_scores.best_score then excluded.accuracy else public.target_practice_scores.accuracy end,
    best_streak = case when excluded.best_score > public.target_practice_scores.best_score then excluded.best_streak else public.target_practice_scores.best_streak end,
    achieved_at = case when excluded.best_score > public.target_practice_scores.best_score then now() else public.target_practice_scores.achieved_at end,
    games_played = public.target_practice_scores.games_played + 1,
    updated_at = now();

  select ranked.rank into v_rank
  from (
    select user_id, row_number() over (order by best_score desc, achieved_at asc) as rank
    from public.target_practice_scores
  ) ranked
  where ranked.user_id = v_user_id;

  select min(best_score) into v_next_score
  from public.target_practice_scores
  where best_score > (select best_score from public.target_practice_scores where user_id = v_user_id);

  return jsonb_build_object(
    'status', 'posted',
    'rank', v_rank,
    'next_score', coalesce(v_next_score + 100, 0)
  );
end;
$$;

revoke all on function public.submit_target_practice_score(integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.submit_target_practice_score(integer, integer, integer, integer, integer) to authenticated;
