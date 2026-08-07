-- Only complete-series and premium owners may request a signed URL for the private master movie.
drop policy if exists "Crunkville owners can stream full movie" on storage.objects;
create policy "Crunkville owners can stream full movie"
on storage.objects for select to authenticated
using (
  bucket_id = 'crunkville-films'
  and name = 'welcome-to-crunkville-full.mp4'
  and exists (
    select 1 from public.crunkville_user_unlocks unlocks
    where unlocks.user_id = auth.uid()
      and unlocks.unlock_type in ('complete_series', 'premium_bundle')
  )
);

-- Episode playback remains disabled until separate protected episode objects are uploaded.
update public.crunkville_episodes set full_movie_video_url = null;
