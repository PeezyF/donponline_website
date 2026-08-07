-- Individual episodes must be purchased in chronological order.
-- Complete-series and premium purchases still unlock the whole film immediately.
create or replace function public.purchase_crunkville(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_product public.crunkville_products%rowtype; v_balance bigint; v_unlock uuid:=gen_random_uuid(); v_episode public.crunkville_episodes%rowtype;
begin
  if v_user is null then raise exception 'Sign in to unlock Crunkville'; end if;
  select * into v_product from public.crunkville_products where id=p_product_id and is_active for share;
  if not found then raise exception 'This unlock is not available'; end if;
  if exists(select 1 from public.crunkville_user_unlocks where user_id=v_user and unlock_type='premium_bundle') then return jsonb_build_object('status','already_owned','balance',(select balance from public.wallets where user_id=v_user)); end if;
  if v_product.product_type='complete_series' and exists(select 1 from public.crunkville_user_unlocks where user_id=v_user and unlock_type in ('complete_series','premium_bundle')) then return jsonb_build_object('status','already_owned','balance',(select balance from public.wallets where user_id=v_user)); end if;
  if v_product.product_type='individual_episode' then
    select * into v_episode from public.crunkville_episodes where id=v_product.episode_id and is_published;
    if not found then raise exception 'This episode is not available'; end if;
    if exists(select 1 from public.crunkville_user_unlocks where user_id=v_user and (unlock_type in ('complete_series','premium_bundle') or episode_id=v_product.episode_id)) then return jsonb_build_object('status','already_owned','balance',(select balance from public.wallets where user_id=v_user)); end if;
    if v_episode.episode_number>1 and not exists(
      select 1 from public.crunkville_episodes previous
      where previous.episode_number=v_episode.episode_number-1 and (previous.is_free or exists(
        select 1 from public.crunkville_user_unlocks owned
        where owned.user_id=v_user and (owned.episode_id=previous.id or owned.unlock_type in ('complete_series','premium_bundle'))
      ))
    ) then raise exception 'Unlock Episode % before Episode %',v_episode.episode_number-1,v_episode.episode_number; end if;
  end if;
  select balance into v_balance from public.wallets where user_id=v_user for update;
  if v_balance is null then raise exception 'Member wallet not found'; end if;
  if v_balance<v_product.token_price then raise exception 'Not enough Motion Coins'; end if;
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
revoke all on function public.purchase_crunkville(uuid) from public,anon;
grant execute on function public.purchase_crunkville(uuid) to authenticated;
