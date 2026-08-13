insert into public.catalog_items (
  item_key,
  title,
  description,
  item_type,
  price_coins,
  active,
  sort_order
)
values (
  'vip-all-access',
  'VIP All Access',
  'Unlock the complete DONPONLINE member experience, including eligible premium content, digital drops, and VIP access opportunities.',
  'content',
  100000,
  true,
  5
)
on conflict (item_key) do update set
  title = excluded.title,
  description = excluded.description,
  item_type = excluded.item_type,
  price_coins = excluded.price_coins,
  active = excluded.active,
  sort_order = excluded.sort_order;

create or replace function public.grant_vip_all_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_premium_product_id uuid;
begin
  if new.item_key <> 'vip-all-access' then return new; end if;

  insert into public.member_unlocks (user_id, item_key, ledger_id)
  select new.user_id, item.item_key, new.ledger_id
  from public.catalog_items item
  where item.active = true
    and item.item_key <> 'vip-all-access'
    and item.item_type in ('character', 'content', 'download')
  on conflict (user_id, item_key) do nothing;

  select id into v_premium_product_id
  from public.crunkville_products
  where product_type = 'premium_bundle' and is_active = true
  limit 1;

  if v_premium_product_id is not null then
    insert into public.crunkville_user_unlocks (
      user_id, product_id, unlock_type, tokens_spent
    ) values (
      new.user_id, v_premium_product_id, 'premium_bundle', 0
    ) on conflict (user_id, product_id) where product_id is not null do nothing;
  end if;

  insert into public.user_collectibles (
    user_id, collectible_key, collectible_type, title, metadata
  ) values
    (new.user_id, 'vip-all-access', 'badge', 'DONPONLINE VIP All Access', '{"tier":"vip"}'::jsonb),
    (new.user_id, 'crunkville-founding-viewer', 'badge', 'Crunkville Founding Viewer', '{"series":"welcome-to-crunkville"}'::jsonb),
    (new.user_id, 'target-practice-crunkville-secret', 'game_character', 'Secret Crunkville Character', '{"game":"target-practice"}'::jsonb)
  on conflict (user_id, collectible_key) do nothing;

  return new;
end;
$$;

drop trigger if exists grant_vip_all_access_after_unlock on public.member_unlocks;
create trigger grant_vip_all_access_after_unlock
after insert on public.member_unlocks
for each row execute function public.grant_vip_all_access();
