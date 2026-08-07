-- Each purchased episode is stored as a separate private object. The browser can
-- request a short-lived signed URL only when the signed-in member owns that
-- episode, the complete series, or the premium bundle.
drop policy if exists "Crunkville owners can stream full movie" on storage.objects;
create policy "Crunkville owners can stream full movie"
on storage.objects for select to authenticated
using (
  bucket_id = 'crunkville-films'
  and name = 'Welcome to Crunkville Donponline 1.mp4'
  and exists (
    select 1 from public.crunkville_user_unlocks unlocks
    where unlocks.user_id = auth.uid()
      and unlocks.unlock_type in ('complete_series', 'premium_bundle')
  )
);

drop policy if exists "Crunkville owners can stream episodes" on storage.objects;
create policy "Crunkville owners can stream episodes"
on storage.objects for select to authenticated
using (
  bucket_id = 'crunkville-films'
  and name in (
    'welcome to crunkville episodes 1-4/welcome to crunkville epis 1 .mp4',
    'welcome to crunkville episodes 1-4/welcome to crunkville ep 2 .mp4',
    'welcome to crunkville episodes 1-4/welcome to crunkville ep 3 .mp4',
    'welcome to crunkville episodes 1-4/welcome to crunkville ep 4 .mp4'
  )
  and exists (
    select 1
    from public.crunkville_user_unlocks unlocks
    left join public.crunkville_episodes episode on episode.id = unlocks.episode_id
    where unlocks.user_id = auth.uid()
      and (
        unlocks.unlock_type in ('complete_series', 'premium_bundle')
        or episode.video_url = storage.objects.name
      )
  )
);

update public.crunkville_episodes
set video_url = case episode_number
  when 1 then 'welcome to crunkville episodes 1-4/welcome to crunkville epis 1 .mp4'
  when 2 then 'welcome to crunkville episodes 1-4/welcome to crunkville ep 2 .mp4'
  when 3 then 'welcome to crunkville episodes 1-4/welcome to crunkville ep 3 .mp4'
  when 4 then 'welcome to crunkville episodes 1-4/welcome to crunkville ep 4 .mp4'
end,
updated_at = now()
where episode_number between 1 and 4;
