// ============================================================
// BUCK! - GAME DATA
// Add a new fighter: add an entry to CHARACTERS + drop a PNG
// into assets/chars/. Add a stage: entry in STAGES + PNG in
// assets/stages/. That's the whole DLC pipeline.
// ============================================================

const CHARACTERS = [
  {
    id: 'donp', name: 'DON P',
    height: 160, health: 100, speed: 170, jump: 560, weight: 1.0, dmg: 1.0,
    special1: { name: 'CHAIN SNATCH', type: 'projectile', color: 0xffcc33, dmg: 12 },
    special2: { name: 'NEVA EVA RUSH', type: 'rush', color: 0xff4433, dmg: 16 },
    special3: { name: 'RED EYE LASERS', type: 'eyelasers', color: 0xff1028, dmg: 18 }
  },
  {
    id: 'liljon', name: 'LIL JON',
    height: 158, health: 100, speed: 165, jump: 540, weight: 1.0, dmg: 1.05,
    special1: { name: 'WHAT?! WAVE', type: 'projectile', color: 0x33ddff, dmg: 13 },
    special2: { name: 'CRUNK JUICE', type: 'area', color: 0xbb44ff, dmg: 8, stun: 1200 },
    special3: { name: 'DRED WHIP', type: 'dreadwhip', color: 0xd8a43b, dmg: 17 }
  },
  {
    id: 'scrappy', name: 'LIL SCRAPPY',
    height: 156, health: 92, speed: 205, jump: 600, weight: 0.85, dmg: 0.95,
    special1: { name: 'HEAD BUSSA', type: 'rush', color: 0xffaa22, dmg: 15 },
    special2: { name: 'MONEY IN THE BANK', type: 'uppercut', color: 0x44ff88, dmg: 14 }
  },
  {
    id: 'pastortroy', name: 'PASTOR TROY',
    height: 164, health: 105, speed: 160, jump: 520, weight: 1.1, dmg: 1.1,
    special1: { name: 'DSGB QUAKE', type: 'area', color: 0xff6622, dmg: 14, shake: true },
    special2: { name: 'CONGREGATION SLAM', type: 'rush', color: 0xffee44, dmg: 17 },
    special3: { name: 'CHOKE THROW', type: 'chokethrow', color: 0xff5a24, dmg: 19 }
  },
  {
    id: 'bonecrusher', name: 'BONE CRUSHER',
    height: 172, health: 120, speed: 125, jump: 450, weight: 1.45, dmg: 1.25,
    special1: { name: 'SEISMIC STOMP', type: 'area', color: 0xcc8844, dmg: 16, shake: true },
    special2: { name: 'NEVER SCARED', type: 'rush', color: 0xff2222, dmg: 20 }
  },
  {
    id: 'diamond', name: 'DIAMOND',
    height: 150, health: 90, speed: 215, jump: 590, weight: 0.8, dmg: 0.9,
    special1: { name: 'KNUCK FURY', type: 'flurry', color: 0xff55aa, dmg: 5 },
    special2: { name: 'DOUBLE SLAP DASH', type: 'rush', color: 0xff88cc, dmg: 14 }
  },
  {
    id: 'princess', name: 'PRINCESS',
    height: 150, health: 90, speed: 210, jump: 600, weight: 0.8, dmg: 0.9,
    special1: { name: 'EARRING SHURIKEN', type: 'projectile', color: 0xff66dd, dmg: 11 },
    special2: { name: 'STILETTO STRIKE', type: 'uppercut', color: 0xffaaee, dmg: 15 },
    special3: { name: 'ROYAL BACKBEND', type: 'backbendkick', input: 'kick', color: 0xff4fc8, dmg: 18 }
  },
  {
    id: 'djscream', name: 'DJ SCREAM',
    height: 160, health: 100, speed: 175, jump: 550, weight: 1.0, dmg: 1.0,
    special1: { name: 'SCREAM', type: 'projectile', color: 0xffdd33, dmg: 13 },
    special2: { name: 'SCREAM TEAM RUSH', type: 'rush', color: 0xff3333, dmg: 16 }
  },
  {
    id: 'djmontay', name: 'DJ MONTAY',
    height: 158, health: 100, speed: 180, jump: 560, weight: 0.95, dmg: 0.95,
    special1: { name: 'BEAT DROP', type: 'area', color: 0xff8822, dmg: 14, shake: true },
    special2: { name: 'LEAN WIT IT', type: 'rush', color: 0x4488ff, dmg: 15 }
  }
];

const STAGES = [
  { id: 'atrium',     name: 'CLUB ATRIUM',     music: 'beat1' },
  { id: 'magiccity',  name: 'MAGIC CITY',      music: 'beat3' },
  { id: 'trapmuseum', name: 'TRAP MUSEUM',     music: 'beat4' },
  { id: 'cascade',    name: 'CASCADE RINK',    music: 'beat5' },
  { id: 'parkinglot', name: 'THE PARKING LOT', music: 'beat6' }
];

// Universal moveset frame data (ms) - shared by every fighter
const MOVES = {
  punch:  { startup: 80,  active: 90,  recover: 150, reach: 46, dmg: 6,  kb: 70,  high: true },
  kick:   { startup: 120, active: 100, recover: 210, reach: 62, dmg: 9,  kb: 110, high: false },
  cpunch: { startup: 110, active: 80,  recover: 330, reach: 42, dmg: 9,  kb: 50,  launch: true }, // MK-style uppercut launcher
  ckick:  { startup: 130, active: 100, recover: 240, reach: 58, dmg: 8,  kb: 90,  low: true, sweep: true },
  air:    { startup: 70,  active: 160, recover: 100, reach: 52, dmg: 8,  kb: 90,  high: true },
  airp:   { startup: 60,  active: 140, recover: 90,  reach: 42, dmg: 6,  kb: 60,  high: true }
};

const GAME_W = 640, GAME_H = 360, GROUND_Y = 332;

// Voice slots - drop OGG files with these names into assets/voice/
// and they play automatically. Missing files are silently skipped.
//   {charId}_s1.ogg   - ad-lib on special 1  (e.g. liljon_s1.ogg = "WHAT?!")
//   {charId}_s2.ogg   - ad-lib on special 2
//   {charId}_win.ogg  - victory line
//   {charId}_name.ogg - announcer name callout on character select
//   ann_choose.ogg, ann_round1.ogg, ann_round2.ogg, ann_round3.ogg,
//   ann_fight.ogg, ann_ko.ogg
const VOICE_KEYS = (() => {
  const keys = ['ann_choose', 'ann_round1', 'ann_round2', 'ann_round3', 'ann_fight', 'ann_ko'];
  for (const c of CHARACTERS) keys.push(c.id + '_s1', c.id + '_s2', c.id + '_win', c.id + '_name');
  return keys;
})();
