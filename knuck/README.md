# BUCK! — A-Town Throwdown (playable prototype)

16-bit style 2D fighter. 9 fighters, 5 Atlanta stages, your beats.

## RUN IT

The game must be served over HTTP (browsers block local audio/images from `file://`).

```
cd buck
python3 -m http.server 8000
```

Open **http://localhost:8000** in Chrome/Firefox/Edge. Needs internet once (Phaser loads from CDN).

## CONTROLS

|            | P1              | P2               |
|------------|-----------------|------------------|
| Move       | A / D           | ← / →            |
| Jump       | W               | ↑                |
| Crouch     | S               | ↓                |
| Punch      | F               | K                |
| Kick       | G               | L                |
| Block      | H               | O                |

- **Special 1**: down, forward + PUNCH (quarter-circle)
- **Special 2**: down, forward + KICK
- **Throw**: hold KICK, tap PUNCH point-blank
- **Low attacks**: crouch + punch/kick. High punches whiff on crouchers.
- Gamepads: auto-detected (pad 1 = P1, pad 2 = P2). Stick/dpad + A=punch, B=kick, shoulder=block.
- Touch devices: on-screen controls appear automatically (P1).
- **ESC** = quit match. **F9** = CRT scanlines on/off. **T** in Training = dummy block toggle.

## MODES

- **VS CPU** — solo fight vs the computer: pick your fighter, pick the CPU opponent, pick a stage.
- **2 PLAYERS** — versus on one keyboard or two gamepads, best of 3.
- **COMBO BREAKER** — after eating 3 hits in a row, hold BLOCK to break out, hop back and get brief invulnerability (flicker).
- **ARCADE TOWER** — fight all 8 other fighters, rising AI difficulty, random stages, champion screen.
- **TRAINING** — dummy + floating damage numbers for balance testing.

## ADDING VOICE AD-LIBS (no coding needed)

Drop OGG files into `assets/voice/` with these names — they play automatically, missing files are skipped:

```
{charId}_s1.ogg    ad-lib on special 1   (liljon_s1.ogg = "WHAT?!")
{charId}_s2.ogg    ad-lib on special 2   (liljon_s2.ogg = "OKAAAY!")
{charId}_win.ogg   victory line
{charId}_name.ogg  announcer callout on character select
ann_choose.ogg  ann_round1.ogg  ann_round2.ogg  ann_round3.ogg  ann_fight.ogg  ann_ko.ogg
```

charIds: `donp liljon scrappy pastortroy bonecrusher diamond princess yyt youngbloodz`

## ADDING A FIGHTER (DLC pipeline)

1. Drop a cutout PNG (transparent bg, facing right, ~340px tall) into `assets/chars/{id}.png`
2. Add an entry to `CHARACTERS` in `js/data.js`:

```js
{ id:'zaytoven', name:'ZAYTOVEN',
  height:158, health:100, speed:180, jump:550, weight:1.0, dmg:1.0,
  special1:{ name:'PIANO KEYS', type:'projectile', color:0xffffff, dmg:12 },
  special2:{ name:'ORGAN CRUSH', type:'rush', color:0xffaa00, dmg:16 } }
```

Special types available: `projectile`, `rush`, `area`, `flurry`, `uppercut`, `assist`.
Optional props: `stun: ms` (dizzy), `slow: ms` (speed debuff), `shake: true` (camera quake).

The select grid auto-fills row by row.

## ADDING A STAGE

1. PNG 1280x720 into `assets/stages/{id}.png` (keep the bottom ~25% floor strip clear)
2. Entry in `STAGES` in `js/data.js`: `{ id:'stankonia', name:'STANKONIA STUDIO', music:'beat1' }`
3. New music: OGG loop into `assets/music/`, add a `this.load.audio(...)` line in BootScene (js/menus.js).

## FUTURE: REAL SPRITE SHEETS

The renderer fakes animation from one static pose (lean/lunge/flash/squash). When real
pixel animations are ready, use one sheet per fighter, fixed grid, frames left→right:

```
row 0: idle x4 | row 1: walk x6 | row 2: jump x3 | row 3: crouch x2
row 4: punch x3 | row 5: kick x3 | row 6: block x1 | row 7: hit x2
row 8: special1 x4 | row 9: special2 x4 | row 10: win x4 | row 11: down/ko x2
```

Swap the `add.image` in the `Fighter` class for a spritesheet + Phaser anims — game
logic (states, hitboxes, specials) stays untouched.
