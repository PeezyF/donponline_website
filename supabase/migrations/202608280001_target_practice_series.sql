-- Target Practice 4: five paid episodes, complete-season access, and secure playback.
create table if not exists public.target_practice_series_episodes (
  id uuid primary key default gen_random_uuid(),
  episode_number integer not null unique check (episode_number between 1 and 5),
  title text not null, slug text not null unique, description text not null default '',
  video_path text not null unique, duration_seconds integer not null check (duration_seconds > 0),
  coin_price integer not null default 75 check (coin_price > 0), is_published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.target_practice_series_products (
  id uuid primary key default gen_random_uuid(), product_type text not null check (product_type in ('individual_episode','complete_season')),
  episode_id uuid references public.target_practice_series_episodes(id) on delete cascade, title text not null, description text not null default '',
  coin_price integer not null check (coin_price > 0), is_active boolean not null default true, created_at timestamptz not null default now(),
  constraint target_practice_series_product_shape check ((product_type='individual_episode')=(episode_id is not null))
);
create unique index if not exists target_practice_series_episode_product_unique on public.target_practice_series_products(episode_id) where episode_id is not null;
create unique index if not exists target_practice_series_season_product_unique on public.target_practice_series_products(product_type) where episode_id is null;
create table if not exists public.target_practice_series_unlocks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid references public.target_practice_series_episodes(id) on delete cascade, product_id uuid not null references public.target_practice_series_products(id) on delete cascade,
  unlock_type text not null check (unlock_type in ('individual_episode','complete_season')), coins_spent integer not null check (coins_spent >= 0), unlocked_at timestamptz not null default now()
);
create unique index if not exists target_practice_series_unlock_episode_unique on public.target_practice_series_unlocks(user_id,episode_id) where episode_id is not null;
create unique index if not exists target_practice_series_unlock_product_unique on public.target_practice_series_unlocks(user_id,product_id);
create table if not exists public.target_practice_series_progress (
  user_id uuid not null references auth.users(id) on delete cascade, episode_id uuid not null references public.target_practice_series_episodes(id) on delete cascade,
  progress_seconds integer not null default 0 check (progress_seconds >= 0), completed boolean not null default false,
  last_watched_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key(user_id,episode_id)
);

insert into public.target_practice_series_episodes(episode_number,title,slug,description,video_path,duration_seconds) values
 (1,'Episode One','episode-one','The Target Practice 4 story begins.','season-1/target-practice-4-episode-1.mp4',295),
 (2,'Episode Two','episode-two','The pressure rises as the next target comes into focus.','season-1/target-practice-4-episode-2.mp4',433),
 (3,'Episode Three','episode-three','The season reaches its midpoint and the mission gets real.','season-1/target-practice-4-episode-3.mp4',442),
 (4,'Episode Four','episode-four','One move from the finale, every decision counts.','season-1/target-practice-4-episode-4.mp4',413),
 (5,'Season One Finale','season-one-finale','The Target Practice 4 season-one finale.','season-1/target-practice-4-episode-5.mp4',409)
on conflict(episode_number) do update set title=excluded.title,slug=excluded.slug,description=excluded.description,video_path=excluded.video_path,duration_seconds=excluded.duration_seconds,coin_price=75,is_published=true,updated_at=now();
insert into public.target_practice_series_products(product_type,episode_id,title,description,coin_price)
select 'individual_episode',id,'Target Practice 4 — '||title,'Permanent access to '||title||'.',75 from public.target_practice_series_episodes
on conflict(episode_id) where episode_id is not null do update set coin_price=75,is_active=true;
insert into public.target_practice_series_products(product_type,title,description,coin_price) values ('complete_season','Target Practice 4 — Complete Season','Permanent access to all five episodes of season one.',300)
on conflict(product_type) where episode_id is null do update set title=excluded.title,description=excluded.description,coin_price=excluded.coin_price,is_active=true;

alter table public.target_practice_series_episodes enable row level security; alter table public.target_practice_series_products enable row level security;
alter table public.target_practice_series_unlocks enable row level security; alter table public.target_practice_series_progress enable row level security;
create policy "Published Target Practice episodes are public" on public.target_practice_series_episodes for select using (is_published);
create policy "Active Target Practice products are public" on public.target_practice_series_products for select using (is_active);
create policy "Members read own Target Practice unlocks" on public.target_practice_series_unlocks for select to authenticated using ((select auth.uid())=user_id);
create policy "Members read own Target Practice progress" on public.target_practice_series_progress for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.target_practice_series_unlocks,public.target_practice_series_progress from anon,authenticated;
grant select on public.target_practice_series_episodes,public.target_practice_series_products to anon,authenticated;
grant select on public.target_practice_series_unlocks,public.target_practice_series_progress to authenticated;

create or replace function public.purchase_target_practice_series(p_product_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_product public.target_practice_series_products%rowtype; v_balance bigint; v_unlock uuid:=gen_random_uuid();
begin
 if v_user is null then raise exception 'Sign in to unlock Target Practice 4'; end if;
 select * into v_product from public.target_practice_series_products where id=p_product_id and is_active for share; if not found then raise exception 'This unlock is not available'; end if;
 if exists(select 1 from public.target_practice_series_unlocks where user_id=v_user and (unlock_type='complete_season' or product_id=v_product.id)) then return jsonb_build_object('status','already_owned','balance',(select balance from public.wallets where user_id=v_user)); end if;
 select balance into v_balance from public.wallets where user_id=v_user for update; if v_balance is null then raise exception 'Member wallet not found'; end if; if v_balance<v_product.coin_price then raise exception 'Not enough Motion Coins'; end if;
 update public.wallets set balance=balance-v_product.coin_price,lifetime_spent=lifetime_spent+v_product.coin_price,updated_at=now() where user_id=v_user;
 insert into public.target_practice_series_unlocks(id,user_id,episode_id,product_id,unlock_type,coins_spent) values(v_unlock,v_user,v_product.episode_id,v_product.id,v_product.product_type,v_product.coin_price);
 insert into public.coin_ledger(user_id,amount,entry_type,reference_key,metadata) values(v_user,-v_product.coin_price,'unlock','target-practice-series:'||v_unlock,jsonb_build_object('description','Unlocked '||v_product.title,'product_id',v_product.id));
 return jsonb_build_object('status','unlocked','balance',v_balance-v_product.coin_price);
end $$;
revoke all on function public.purchase_target_practice_series(uuid) from public,anon; grant execute on function public.purchase_target_practice_series(uuid) to authenticated;

create or replace function public.save_target_practice_series_progress(p_episode_id uuid,p_progress_seconds integer,p_completed boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_duration integer;
begin
 if v_user is null then raise exception 'Sign in to save progress'; end if; select duration_seconds into v_duration from public.target_practice_series_episodes where id=p_episode_id and is_published; if v_duration is null then raise exception 'Episode unavailable'; end if;
 if not exists(select 1 from public.target_practice_series_unlocks where user_id=v_user and (episode_id=p_episode_id or unlock_type='complete_season')) then raise exception 'Episode is locked'; end if;
 insert into public.target_practice_series_progress(user_id,episode_id,progress_seconds,completed,last_watched_at,updated_at) values(v_user,p_episode_id,least(greatest(p_progress_seconds,0),v_duration),p_completed,now(),now()) on conflict(user_id,episode_id) do update set progress_seconds=excluded.progress_seconds,completed=public.target_practice_series_progress.completed or excluded.completed,last_watched_at=now(),updated_at=now();
end $$;
revoke all on function public.save_target_practice_series_progress(uuid,integer,boolean) from public,anon; grant execute on function public.save_target_practice_series_progress(uuid,integer,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('target-practice-series','target-practice-series',false,4294967296,array['video/mp4']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Owners stream Target Practice series" on storage.objects for select to authenticated using (
 bucket_id='target-practice-series' and exists(select 1 from public.target_practice_series_episodes episode join public.target_practice_series_unlocks unlock on unlock.user_id=(select auth.uid()) and (unlock.episode_id=episode.id or unlock.unlock_type='complete_season') where episode.video_path=storage.objects.name)
);
