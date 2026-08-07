-- DONPONLINE members-only community chat with rules, rate limits, reports, and moderation.
create table if not exists public.community_rule_acceptances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  rules_version text not null,
  accepted_at timestamptz not null default now()
);

create table if not exists public.community_member_status (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  muted_until timestamptz,
  banned_at timestamptz,
  reason text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.community_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create index if not exists community_messages_created_idx
  on public.community_messages(created_at desc);

create table if not exists public.community_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  message_id bigint not null references public.community_messages(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 3 and 300),
  status text not null default 'open' check (status in ('open','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now(),
  unique(reporter_id, message_id)
);

alter table public.community_rule_acceptances enable row level security;
alter table public.community_member_status enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_reports enable row level security;

drop policy if exists "Members read community messages" on public.community_messages;
create policy "Members read community messages"
  on public.community_messages for select to authenticated
  using (deleted_at is null);

drop policy if exists "Members read own rule acceptance" on public.community_rule_acceptances;
create policy "Members read own rule acceptance"
  on public.community_rule_acceptances for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members read own community status" on public.community_member_status;
create policy "Members read own community status"
  on public.community_member_status for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members read own reports" on public.community_reports;
create policy "Members read own reports"
  on public.community_reports for select to authenticated
  using (reporter_id = auth.uid());

revoke all on public.community_rule_acceptances, public.community_member_status, public.community_messages, public.community_reports from anon, authenticated;
grant select on public.community_rule_acceptances, public.community_member_status, public.community_messages, public.community_reports to authenticated;

create or replace function public.is_community_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select lower(coalesce(auth.jwt()->>'email','')) in ('donp@donponline.com','donpbeats@gmail.com')
$$;
revoke all on function public.is_community_admin() from public, anon;
grant execute on function public.is_community_admin() to authenticated;

create or replace function public.get_community_status()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_status public.community_member_status%rowtype;
begin
  if v_user is null then raise exception 'Sign in to enter the community'; end if;
  select * into v_status from public.community_member_status where user_id=v_user;
  return jsonb_build_object(
    'accepted', exists(select 1 from public.community_rule_acceptances where user_id=v_user and rules_version='2026-08-v1'),
    'rules_version', '2026-08-v1',
    'is_admin', public.is_community_admin(),
    'muted_until', v_status.muted_until,
    'banned', v_status.banned_at is not null,
    'reason', coalesce(v_status.reason,'')
  );
end $$;
revoke all on function public.get_community_status() from public, anon;
grant execute on function public.get_community_status() to authenticated;

create or replace function public.accept_community_rules()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Sign in to accept the community rules'; end if;
  insert into public.community_rule_acceptances(user_id,rules_version,accepted_at)
  values(v_user,'2026-08-v1',now())
  on conflict(user_id) do update set rules_version=excluded.rules_version,accepted_at=now();
end $$;
revoke all on function public.accept_community_rules() from public, anon;
grant execute on function public.accept_community_rules() to authenticated;

create or replace function public.list_community_messages(p_limit integer default 100, p_before timestamptz default null)
returns table(id bigint,user_id uuid,display_name text,body text,created_at timestamptz,is_own boolean,is_staff boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Sign in to view the community'; end if;
  return query
  select m.id,m.user_id,p.display_name,m.body,m.created_at,m.user_id=v_user,
    lower(coalesce(u.email,'')) in ('donp@donponline.com','donpbeats@gmail.com')
  from public.community_messages m
  join public.profiles p on p.id=m.user_id
  left join auth.users u on u.id=m.user_id
  where m.deleted_at is null and (p_before is null or m.created_at<p_before)
  order by m.created_at desc limit least(greatest(coalesce(p_limit,100),1),100);
end $$;
revoke all on function public.list_community_messages(integer,timestamptz) from public, anon;
grant execute on function public.list_community_messages(integer,timestamptz) to authenticated;

create or replace function public.post_community_message(p_body text)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_body text:=trim(coalesce(p_body,'')); v_status public.community_member_status%rowtype; v_id bigint;
begin
  if v_user is null then raise exception 'Sign in to post'; end if;
  if not exists(select 1 from public.community_rule_acceptances where user_id=v_user and rules_version='2026-08-v1') then raise exception 'Accept the community rules before posting'; end if;
  if char_length(v_body)<1 or char_length(v_body)>500 then raise exception 'Messages must be between 1 and 500 characters'; end if;
  select * into v_status from public.community_member_status where user_id=v_user;
  if v_status.banned_at is not null then raise exception 'Your community access is suspended'; end if;
  if v_status.muted_until is not null and v_status.muted_until>now() then raise exception 'You are muted until %',to_char(v_status.muted_until,'Mon DD at HH12:MI AM'); end if;
  if exists(select 1 from public.community_messages where user_id=v_user and created_at>now()-interval '3 seconds') then raise exception 'Please wait a moment before posting again'; end if;
  if (select count(*) from public.community_messages where user_id=v_user and created_at>now()-interval '1 minute')>=8 then raise exception 'Posting too quickly. Please wait a minute'; end if;
  insert into public.community_messages(user_id,body) values(v_user,v_body) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.post_community_message(text) from public, anon;
grant execute on function public.post_community_message(text) to authenticated;

create or replace function public.report_community_message(p_message_id bigint,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_reason text:=trim(coalesce(p_reason,''));
begin
  if v_user is null then raise exception 'Sign in to report a message'; end if;
  if char_length(v_reason)<3 or char_length(v_reason)>300 then raise exception 'Please provide a brief reason'; end if;
  if not exists(select 1 from public.community_messages where id=p_message_id and deleted_at is null) then raise exception 'Message unavailable'; end if;
  insert into public.community_reports(reporter_id,message_id,reason) values(v_user,p_message_id,v_reason)
  on conflict(reporter_id,message_id) do update set reason=excluded.reason,status='open',created_at=now();
end $$;
revoke all on function public.report_community_message(bigint,text) from public, anon;
grant execute on function public.report_community_message(bigint,text) to authenticated;

create or replace function public.moderate_community_message(p_message_id bigint,p_action text,p_reason text default '')
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_target uuid;
begin
  if not public.is_community_admin() then raise exception 'Admin access required'; end if;
  select user_id into v_target from public.community_messages where id=p_message_id;
  if v_target is null then raise exception 'Message unavailable'; end if;
  if p_action='delete' then
    update public.community_messages set deleted_at=now(),deleted_by=auth.uid() where id=p_message_id;
  elsif p_action='mute_24h' then
    insert into public.community_member_status(user_id,muted_until,reason,updated_at) values(v_target,now()+interval '24 hours',left(coalesce(p_reason,''),300),now())
    on conflict(user_id) do update set muted_until=excluded.muted_until,reason=excluded.reason,updated_at=now();
  elsif p_action='ban' then
    insert into public.community_member_status(user_id,banned_at,reason,updated_at) values(v_target,now(),left(coalesce(p_reason,''),300),now())
    on conflict(user_id) do update set banned_at=now(),reason=excluded.reason,updated_at=now();
  else raise exception 'Unknown moderation action'; end if;
end $$;
revoke all on function public.moderate_community_message(bigint,text,text) from public, anon;
grant execute on function public.moderate_community_message(bigint,text,text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_messages') then
    alter publication supabase_realtime add table public.community_messages;
  end if;
end $$;
