-- Allow complete-series owners to stream the optimized cross-device master.
drop policy if exists "Crunkville owners can stream full movie" on storage.objects;
create policy "Crunkville owners can stream full movie"
on storage.objects for select to authenticated using (
  bucket_id = 'crunkville-films'
  and name = 'welcome-to-crunkville-full-movie-web.mp4'
  and exists (
    select 1
    from public.crunkville_user_unlocks unlocks
    where unlocks.user_id = auth.uid()
      and unlocks.unlock_type in ('complete_series', 'premium_bundle')
  )
);
