-- Welcome to Crunkville: catalog, ownership, watch progress, rewards, and atomic purchases.
create table if not exists public.crunkville_episodes (
  id uuid primary key default gen_random_uuid(), episode_number integer not null unique check (episode_number between 1 and 7),
  title text not null, slug text not null unique, description text not null default '', thumbnail_url text,
  video_url text, full_movie_video_url text, start_seconds numeric(10,3) not null default 0 check (start_seconds >= 0),
  end_seconds numeric(10,3) check (end_seconds > start_seconds), duration_seconds integer not null check (duration_seconds > 0),
  token_price integer not null default 60 check (token_price >= 0), is_free boolean not null default false,
  is_published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.crunkville_products (
  id uuid primary key default gen_random_uuid(), product_type text not null check (product_type in ('complete_series','premium_bundle','individual_episode')),
  episode_id uuid references public.crunkville_episodes(id) on delete cascade, title text not null, description text not null default '',
  token_price integer not null check (token_price >= 0), badge_name text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint crunkville_product_shape check ((product_type = 'individual_episode') = (episode_id is not null))
);
create unique index if not exists crunkville_product_type_unique on public.crunkville_products(product_type) where episode_id is null;
create unique index if not exists crunkville_episode_product_unique on public.crunkville_products(episode_id) where episode_id is not null;

create table if not exists public.crunkville_user_unlocks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid references public.crunkville_episodes(id) on delete cascade, product_id uuid references public.crunkville_products(id) on delete cascade,
  unlock_type text not null check (unlock_type in ('free','individual_episode','complete_series','premium_bundle')),
  tokens_spent integer not null default 0 check (tokens_spent >= 0), unlocked_at timestamptz not null default now(),
  constraint crunkville_unlock_item check ((episode_id is not null) or (product_id is not null))
);
create unique index if not exists crunkville_unlock_episode_unique on public.crunkville_user_unlocks(user_id, episode_id) where episode_id is not null;
create unique index if not exists crunkville_unlock_product_unique on public.crunkville_user_unlocks(user_id, product_id) where product_id is not null;

create table if not exists public.crunkville_watch_progress (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.crunkville_episodes(id) on delete cascade, progress_seconds integer not null default 0 check (progress_seconds >= 0),
  completed boolean not null default false, last_watched_at timestamptz not null default now(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(user_id, episode_id)
);

create table if not exists public.user_collectibles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  collectible_key text not null, collectible_type text not null, title text not null, metadata jsonb not null default '{}'::jsonb,
  granted_at timestamptz not null default now(), unique(user_id, collectible_key)
);

insert into public.crunkville_episodes (episode_number,title,slug,description,full_movie_video_url,start_seconds,end_seconds,duration_seconds,token_price,is_free,is_published) values
 (1,'Welcome to Crunkville','welcome-to-crunkville','Before the records and the tours, step inside the place where the story began.','/assets/videos/crunkville/welcome-to-crunkville-full-movie.mp4',0,626.533,626,60,false,true),
 (2,'The Beginning','the-beginning','The first connections, early sessions, and a sound beginning to take shape.','/assets/videos/crunkville/welcome-to-crunkville-full-movie.mp4',626.533,1113.433,487,60,false,true),
 (3,'Building the Movement','building-the-movement','A crew becomes a movement as Atlanta starts paying attention.','/assets/videos/crunkville/welcome-to-crunkville-full-movie.mp4',1113.433,1563.100,450,60,false,true),
 (4,'The Complete Story','the-complete-story','The movement, the pressure, and the legacy of Crunkville.','/assets/videos/crunkville/welcome-to-crunkville-full-movie.mp4',1563.100,2425.267,862,60,false,true)
on conflict (episode_number) do nothing;

insert into public.crunkville_products (product_type,episode_id,title,description,token_price,badge_name)
select 'individual_episode', id, 'Episode '||episode_number||' — '||title, description, token_price, null from public.crunkville_episodes
on conflict (episode_id) where episode_id is not null do nothing;
insert into public.crunkville_products (product_type,title,description,token_price,badge_name) values
 ('complete_series','Unlock Welcome to Crunkville Movie','Permanent access to the complete 40-minute movie and all four episodes.',300,null),
 ('premium_bundle','Crunkville Premium Experience','All episodes, bonus sections, badge, and secret Target Practice character.',500,'Crunkville Founding Viewer')
on conflict (product_type) where episode_id is null do nothing;

alter table public.crunkville_episodes enable row level security; alter table public.crunkville_products enable row level security;
alter table public.crunkville_user_unlocks enable row level security; alter table public.crunkville_watch_progress enable row level security;
alter table public.user_collectibles enable row level security;
create policy "Published Crunkville episodes are public" on public.crunkville_episodes for select using (is_published or lower(coalesce(auth.jwt()->>'email','')) in ('donp@donponline.com','donpbeats@gmail.com'));
create policy "Active Crunkville products are public" on public.crunkville_products for select using (is_active or lower(coalesce(auth.jwt()->>'email','')) in ('donp@donponline.com','donpbeats@gmail.com'));
create policy "Members read own Crunkville unlocks" on public.crunkville_user_unlocks for select to authenticated using (auth.uid()=user_id);
create policy "Members read own Crunkville progress" on public.crunkville_watch_progress for select to authenticated using (auth.uid()=user_id);
create policy "Members update own Crunkville progress" on public.crunkville_watch_progress for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Members insert own Crunkville progress" on public.crunkville_watch_progress for insert to authenticated with check (auth.uid()=user_id);
create policy "Members read own collectibles" on public.user_collectibles for select to authenticated using (auth.uid()=user_id);
revoke all on public.crunkville_user_unlocks, public.user_collectibles from anon, authenticated;
grant select on public.crunkville_user_unlocks, public.user_collectibles to authenticated;
grant select on public.crunkville_episodes, public.crunkville_products to anon, authenticated;
grant select,insert,update on public.crunkville_watch_progress to authenticated;

create or replace function public.purchase_crunkville(p_product_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_product public.crunkville_products%rowtype; v_balance bigint; v_unlock uuid:=gen_random_uuid(); v_episode public.crunkville_episodes%rowtype;
begin
 if v_user is null then raise exception 'Sign in to unlock Crunkville'; end if;
 select * into v_product from public.crunkville_products where id=p_product_id and is_active for share;
 if not found then raise exception 'This unlock is not available'; end if;
 if exists(select 1 from public.crunkville_user_unlocks where user_id=v_user and unlock_type='premium_bundle') then return jsonb_build_object('status','already_owned','balance',(select balance from public.wallets where user_id=v_user)); end if;
 if v_product.product_type='complete_series' and exists(select 1 from public.crunkville_user_unlocks where user_id=v_user and unlock_type in ('complete_series','premium_bundle')) then return jsonb_build_object('status','already_owned','balance',(select balance from public.wallets where user_id=v_user)); end if;
 if v_product.product_type='individual_episode' and (exists(select 1 from public.crunkville_user_unlocks where user_id=v_user and unlock_type in ('complete_series','premium_bundle')) or exists(select 1 from public.crunkville_user_unlocks where user_id=v_user and episode_id=v_product.episode_id)) then return jsonb_build_object('status','already_owned','balance',(select balance from public.wallets where user_id=v_user)); end if;
 select balance into v_balance from public.wallets where user_id=v_user for update; if v_balance is null then raise exception 'Member wallet not found'; end if;
 if v_balance < v_product.token_price then raise exception 'Not enough Motion Coins'; end if;
 update public.wallets set balance=balance-v_product.token_price,lifetime_spent=lifetime_spent+v_product.token_price,updated_at=now() where user_id=v_user;
 insert into public.crunkville_user_unlocks(id,user_id,episode_id,product_id,unlock_type,tokens_spent) values(v_unlock,v_user,v_product.episode_id,v_product.id,v_product.product_type,v_product.token_price);
 insert into public.coin_ledger(user_id,amount,entry_type,reference_key,metadata) values(v_user,-v_product.token_price,'unlock','crunkville:'||v_unlock,jsonb_build_object('description','Unlocked '||v_product.title,'product_id',v_product.id));
 if v_product.product_type='premium_bundle' then
   insert into public.user_collectibles(user_id,collectible_key,collectible_type,title,metadata) values
    (v_user,'crunkville-founding-viewer','badge','Crunkville Founding Viewer','{"series":"welcome-to-crunkville"}'),
    (v_user,'target-practice-crunkville-secret','game_character','Secret Crunkville Character','{"game":"target-practice"}') on conflict do nothing;
 end if;
 return jsonb_build_object('status','unlocked','balance',v_balance-v_product.token_price,'product_type',v_product.product_type);
end $$;
revoke all on function public.purchase_crunkville(uuid) from public,anon; grant execute on function public.purchase_crunkville(uuid) to authenticated;

create or replace function public.save_crunkville_progress(p_episode_id uuid,p_progress_seconds integer,p_completed boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_episode public.crunkville_episodes%rowtype;
begin if v_user is null then raise exception 'Sign in to save progress'; end if; select * into v_episode from public.crunkville_episodes where id=p_episode_id and is_published; if not found then raise exception 'Episode unavailable'; end if;
 if not v_episode.is_free and not exists(select 1 from public.crunkville_user_unlocks where user_id=v_user and (episode_id=p_episode_id or unlock_type in ('complete_series','premium_bundle'))) then raise exception 'Episode is locked'; end if;
 insert into public.crunkville_watch_progress(user_id,episode_id,progress_seconds,completed,last_watched_at,updated_at) values(v_user,p_episode_id,least(greatest(p_progress_seconds,0),v_episode.duration_seconds),p_completed,now(),now())
 on conflict(user_id,episode_id) do update set progress_seconds=excluded.progress_seconds,completed=public.crunkville_watch_progress.completed or excluded.completed,last_watched_at=now(),updated_at=now(); end $$;
revoke all on function public.save_crunkville_progress(uuid,integer,boolean) from public,anon; grant execute on function public.save_crunkville_progress(uuid,integer,boolean) to authenticated;
