-- Unique community handles and Instagram-style @mentions.
create table if not exists public.community_handles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  handle text not null unique,
  updated_at timestamptz not null default now(),
  constraint community_handle_format check (handle ~ '^[a-z0-9][a-z0-9._]{2,23}$')
);

alter table public.community_handles enable row level security;
revoke all on public.community_handles from anon, authenticated;

create or replace function public.ensure_community_handle(p_user uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_handle text; v_base text;
begin
  select handle into v_handle from public.community_handles where user_id=p_user;
  if v_handle is not null then return v_handle; end if;
  select left(regexp_replace(lower(coalesce(display_name,'member')),'[^a-z0-9]','','g'),16)
    into v_base from public.profiles where id=p_user;
  if coalesce(v_base,'')='' then v_base:='member'; end if;
  v_handle:=v_base||'_'||left(replace(p_user::text,'-',''),6);
  insert into public.community_handles(user_id,handle) values(p_user,v_handle)
    on conflict(user_id) do update set updated_at=public.community_handles.updated_at
    returning handle into v_handle;
  return v_handle;
end $$;
revoke all on function public.ensure_community_handle(uuid) from public, anon, authenticated;

insert into public.community_handles(user_id,handle)
select p.id,
  coalesce(nullif(left(regexp_replace(lower(p.display_name),'[^a-z0-9]','','g'),16),''),'member')
  ||'_'||left(replace(p.id::text,'-',''),6)
from public.profiles p
on conflict(user_id) do nothing;

create or replace function public.set_community_handle(p_handle text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_handle text:=lower(trim(coalesce(p_handle,'')));
begin
  v_handle:=regexp_replace(v_handle,'^@','','g');
  if v_user is null then raise exception 'Sign in to update your handle'; end if;
  if v_handle !~ '^[a-z0-9][a-z0-9._]{2,23}$' then
    raise exception 'Use 3–24 lowercase letters, numbers, periods, or underscores';
  end if;
  begin
    insert into public.community_handles(user_id,handle,updated_at) values(v_user,v_handle,now())
    on conflict(user_id) do update set handle=excluded.handle,updated_at=now();
  exception when unique_violation then
    raise exception 'That @handle is already taken';
  end;
  return v_handle;
end $$;
revoke all on function public.set_community_handle(text) from public, anon;
grant execute on function public.set_community_handle(text) to authenticated;

create or replace function public.get_community_status()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_status public.community_member_status%rowtype; v_handle text;
begin
  if v_user is null then raise exception 'Sign in to enter the community'; end if;
  v_handle:=public.ensure_community_handle(v_user);
  select * into v_status from public.community_member_status where user_id=v_user;
  return jsonb_build_object(
    'accepted', exists(select 1 from public.community_rule_acceptances where user_id=v_user and rules_version='2026-08-v1'),
    'rules_version', '2026-08-v1',
    'is_admin', public.is_community_admin(),
    'handle', v_handle,
    'muted_until', v_status.muted_until,
    'banned', v_status.banned_at is not null,
    'reason', coalesce(v_status.reason,'')
  );
end $$;
revoke all on function public.get_community_status() from public, anon;
grant execute on function public.get_community_status() to authenticated;

drop function if exists public.list_community_messages(integer,timestamptz);
create function public.list_community_messages(p_limit integer default 100,p_before timestamptz default null)
returns table(id bigint,user_id uuid,display_name text,handle text,body text,created_at timestamptz,is_own boolean,is_staff boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Sign in to view the community'; end if;
  perform public.ensure_community_handle(v_user);
  return query
  select m.id,m.user_id,p.display_name,public.ensure_community_handle(m.user_id),m.body,m.created_at,m.user_id=v_user,
    lower(coalesce(u.email,'')) in ('donp@donponline.com','donpbeats@gmail.com')
  from public.community_messages m
  join public.profiles p on p.id=m.user_id
  left join auth.users u on u.id=m.user_id
  where m.deleted_at is null and (p_before is null or m.created_at<p_before)
  order by m.created_at desc limit least(greatest(coalesce(p_limit,100),1),100);
end $$;
revoke all on function public.list_community_messages(integer,timestamptz) from public, anon;
grant execute on function public.list_community_messages(integer,timestamptz) to authenticated;
