-- Point protected playback at the latest replacement Episode 1 and full movie files.
drop policy if exists "Crunkville owners can stream full movie" on storage.objects;
create policy "Crunkville owners can stream full movie" on storage.objects for select to authenticated using (
  bucket_id='crunkville-films' and name='welcome to crunkville full movie 1 nbb.mp4'
  and exists (select 1 from public.crunkville_user_unlocks unlocks where unlocks.user_id=auth.uid() and unlocks.unlock_type in ('complete_series','premium_bundle'))
);
drop policy if exists "Crunkville owners can stream episodes" on storage.objects;
create policy "Crunkville owners can stream episodes" on storage.objects for select to authenticated using (
  bucket_id='crunkville-films' and name in (
    'welcome to crunkville episodes 1-4/welcome t crunkville epis 1 nbbb yes.mp4',
    'welcome to crunkville episodes 1-4/welcome to crunkville ep 2 .mp4',
    'welcome to crunkville episodes 1-4/welcome to crunkville ep 3 .mp4',
    'welcome to crunkville episodes 1-4/welcome to crunkville ep 4 .mp4'
  ) and exists (
    select 1 from public.crunkville_user_unlocks unlocks
    left join public.crunkville_episodes episode on episode.id=unlocks.episode_id
    where unlocks.user_id=auth.uid() and (unlocks.unlock_type in ('complete_series','premium_bundle') or episode.video_url=storage.objects.name)
  )
);
update public.crunkville_episodes set video_url='welcome to crunkville episodes 1-4/welcome t crunkville epis 1 nbbb yes.mp4',updated_at=now() where episode_number=1;
