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
  'personalized-shoutout',
  'Shout-Out or Birthday Wish',
  'Request a personalized shout-out, birthday wish, celebration, or special message for you or someone you love.',
  'access',
  750,
  true,
  15
)
on conflict (item_key) do update set
  title = excluded.title,
  description = excluded.description,
  item_type = excluded.item_type,
  price_coins = excluded.price_coins,
  active = excluded.active,
  sort_order = excluded.sort_order;
