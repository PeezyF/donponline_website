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
  'exclusive-beat',
  'Exclusive Beat',
  'Choose a beat from the available DONPONLINE catalog and submit your request.',
  'access',
  50000,
  true,
  25
)
on conflict (item_key) do update set
  title = excluded.title,
  description = excluded.description,
  item_type = excluded.item_type,
  price_coins = excluded.price_coins,
  active = excluded.active,
  sort_order = excluded.sort_order;
