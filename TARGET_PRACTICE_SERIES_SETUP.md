# Target Practice 4 series launch

The storefront is priced at **75 Motion Coins per episode** or **300 Motion Coins for season one**.

## Activate the catalog

Apply `supabase/migrations/202608280001_target_practice_series.sql` to the linked Supabase project.

## Upload the protected 4K masters

Upload to the private `target-practice-series` bucket with these exact object names:

| Episode | Source file | Storage object |
| --- | --- | --- |
| 1 | `episode one TP4Comp 1 4k.mp4` | `season-1/target-practice-4-episode-1.mp4` |
| 2 | `TP4 Episode 2 fin 4k.mp4` | `season-1/target-practice-4-episode-2.mp4` |
| 3 | `Target Practice ep 3 4k.mp4` | `season-1/target-practice-4-episode-3.mp4` |
| 4 | `Target Practice episode 4 4k.mp4` | `season-1/target-practice-4-episode-4.mp4` |
| 5 | `Target Practice episode 5 final season 1 4k.mp4` | `season-1/target-practice-4-episode-5.mp4` |

The bucket is private. Its read policy only permits signed-in members who own the episode or the complete season.

## Verify before launch

1. Confirm the five catalog cards load at `/target-practice-series/`.
2. Buy one episode with a test member and confirm 75 coins are deducted once.
3. Confirm a non-owner cannot create a signed video URL.
4. Confirm an episode owner can play only that episode.
5. Confirm a complete-season owner can play all five episodes.
