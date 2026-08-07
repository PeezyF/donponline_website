update public.crunkville_episodes
set token_price = 60, is_free = false, updated_at = now()
where episode_number = 1;

insert into public.crunkville_products (product_type, episode_id, title, description, token_price)
select 'individual_episode', id, 'Episode 1 — ' || title, description, 60
from public.crunkville_episodes where episode_number = 1
on conflict (episode_id) where episode_id is not null do update
set token_price = 60, title = excluded.title, description = excluded.description, is_active = true, updated_at = now();
