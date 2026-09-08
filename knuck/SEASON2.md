# KNUCK! Season 2 — v5.0

Adds Soulja Boy, DJ Unk, Fabo, Parlay, Gucci Mane, Young Jeezy, T.I., Shawty Lo, and Nuface. The original nine fighters and combat engine remain intact. Each new fighter includes a base sprite, 13 poses, a select portrait, and four normalized voice clips.

New arenas: South DeKalb Mall, Club Crucial, Mercedes-Benz Stadium, Bankhead Seafood, and Underground Atlanta. The four supplied music tracks are registered as beat7–beat10 in that order; Underground shares beat7. Loops run approximately 67–76 seconds. Tempo and bar boundaries are estimated from onset analysis, with brief seam fades; musical downbeat accuracy still benefits from listening review.

Fighter selection now shows all 18 named portraits with working keyboard/gamepad/touch navigation. Stage selection generates its grid and supports up/down navigation and Escape. The arcade tower displays all 17 opponents in two columns. Script cache versions and the title version label are updated.

## Source corrections and artwork review

- Jeezy's `SPECIAL 2 SNOWMAN STORM.png` maps to special 1, matching its named move.
- DJ Unk's `SPECIAL 1 2 STEP.ogg` maps to special 2; his other special clip maps to special 1. This follows the explicit filename; unlabelled voice content has not been independently transcribed.
- Supplied spelling variants such as HAND PUCH, LEG HIT, and LEG PUNCH map to their corresponding attack poses.
- White backgrounds are removed using border-connected color keying. Enclosed-white cleanup is disabled for the four fighters with white garments after visual review showed it removed clothing detail.
- Soulja Boy, DJ Unk, Parlay, and Nuface use reviewed manual portrait crops. Other portraits use face detection. Parlay's detector initially selected a false positive.
- Stage floor strips are resized to fill the bottom quarter of the canvas.

## Validation and rebuilding

`node tools/audit_dlc.cjs` checks all roster assets, stage/music registration, and navigation reachability including incomplete rows. JavaScript files also pass `node --check`.

Chrome smoke tests passed for keyboard selection, all nine new fighters and both specials, all five added stages, and the expanded tower, with no JavaScript exceptions. The six optional announcer clips were already absent and still return 404; all fighter voice clips load. Responsive layout was checked at 1280×720 and 844×390.

Generated review sheets and import measurements are kept locally in `qa/` and are not part of the production upload. The supplied raw `KNUCK! DLC/` folder is source material and is not required to serve the game. Do not include it in a release upload.

To rebuild artwork and voices: install Pillow, numpy, scipy, opencv-python-headless<5, and imageio-ffmpeg, then run `python tools/import_dlc.py 'KNUCK! DLC'`. Add `--skip-audio` for artwork-only changes. Music conversion additionally requires soundfile: `python tools/import_dlc_music.py`.

Serve the parent website over HTTP and open `/knuck/`. Production URL: https://donponline.com/knuck/.
