// ============================================================
// BUCK! - MENU SCENES + shared helpers
// ============================================================

function isTouch() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; }

// ---- gamepad edge detection for menu navigation ----
// padIndex -1 = any pad. Returns {up,down,left,right,ok} true only on the frame the input starts.
function padEdges(scene, padIndex, tag) {
  const pads = scene.input.gamepad ? scene.input.gamepad.gamepads : [];
  const st = { up: false, down: false, left: false, right: false, ok: false };
  const read = pad => {
    if (!pad) return;
    const ax = pad.axes.length ? pad.axes[0].getValue() : 0;
    const ay = pad.axes.length > 1 ? pad.axes[1].getValue() : 0;
    st.up = st.up || pad.up || ay < -0.5;
    st.down = st.down || pad.down || ay > 0.5;
    st.left = st.left || pad.left || ax < -0.5;
    st.right = st.right || pad.right || ax > 0.5;
    st.ok = st.ok || (pad.buttons[0] && pad.buttons[0].pressed) || (pad.buttons[9] && pad.buttons[9].pressed);
  };
  if (padIndex === -1) { for (const p of pads) read(p); } else read(pads[padIndex]);
  const key = '_padPrev_' + tag + '_' + padIndex;
  const prev = scene[key] || {};
  const e = {};
  for (const k in st) e[k] = st[k] && !prev[k];
  scene[key] = st;
  return e;
}

// ---- global music helper (persists across scenes) ----
function playMusic(scene, key, vol) {
  const cur = scene.registry.get('musicKey');
  if (cur === key) return;
  stopMusic(scene);
  if (!scene.cache.audio.exists(key)) return;
  const start = () => {
    if (!scene.scene.isActive() || scene.registry.get('musicKey') === key) return;
    const m = scene.sound.add(key, { loop: true, volume: vol === undefined ? 0.6 : vol });
    m.play();
    scene.registry.set('musicKey', key);
    scene.registry.set('musicObj', m);
  };
  if (scene.sound.locked) scene.sound.once('unlocked', start);
  else start();
}
function stopMusic(scene) {
  const m = scene.registry.get('musicObj');
  if (m) { m.stop(); m.destroy(); }
  scene.registry.set('musicKey', null);
  scene.registry.set('musicObj', null);
}

// ---- simple vertical menu panel ----
function buildMenuPanel(scene, title, options, yStart, step) {
  yStart = yStart || 130; step = step || 36;
  if (title) scene.add.text(GAME_W / 2, yStart - 46, title, { fontFamily: 'monospace', fontSize: '20px', color: '#ffe066', stroke: '#000', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(0.5).setDepth(21);
  let idx = 0;
  const texts = options.map((o, i) =>
    scene.add.text(GAME_W / 2, yStart + i * step, o[0], { fontFamily: 'monospace', fontSize: '17px', color: '#ffffff', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5).setDepth(21).setInteractive()
  );
  const paint = () => texts.forEach((t, i) => t.setColor(i === idx ? '#ffcc22' : '#ffffff').setScale(i === idx ? 1.15 : 1));
  paint();
  const K = Phaser.Input.Keyboard.KeyCodes;
  const keys = scene.input.keyboard.addKeys({ w: K.W, s: K.S, up: K.UP, down: K.DOWN, f: K.F, k: K.K, enter: K.ENTER, space: K.SPACE });
  const handler = () => {
    const pe = padEdges(scene, -1, 'menu');
    if (Phaser.Input.Keyboard.JustDown(keys.w) || Phaser.Input.Keyboard.JustDown(keys.up) || pe.up) { idx = (idx + options.length - 1) % options.length; SFX.select(); paint(); }
    if (Phaser.Input.Keyboard.JustDown(keys.s) || Phaser.Input.Keyboard.JustDown(keys.down) || pe.down) { idx = (idx + 1) % options.length; SFX.select(); paint(); }
    if (Phaser.Input.Keyboard.JustDown(keys.f) || Phaser.Input.Keyboard.JustDown(keys.k) || Phaser.Input.Keyboard.JustDown(keys.enter) || Phaser.Input.Keyboard.JustDown(keys.space) || pe.ok) {
      SFX.confirm(); scene.events.off('update', handler); options[idx][1]();
    }
  };
  scene.events.on('update', handler);
  texts.forEach((t, i) => t.on('pointerdown', () => { SFX.confirm(); scene.events.off('update', handler); options[i][1](); }));
}

// ---- on-screen touch controls for P1 ----
function buildTouchControls(scene) {
  scene.touchState = { left: false, right: false, up: false, down: false, punch: false, kick: false, block: false };
  const mk = (x, y, w, h, label, key, round) => {
    const zone = round
      ? scene.add.circle(x, y, w, 0xffffff, 0.14).setDepth(30).setScrollFactor(0)
      : scene.add.rectangle(x, y, w, h, 0xffffff, 0.12).setDepth(30).setScrollFactor(0);
    zone.setStrokeStyle(2, 0xffe066, 0.5).setInteractive();
    scene.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '13px', color: '#ffe066' }).setOrigin(0.5).setDepth(31).setAlpha(0.8);
    zone.on('pointerdown', () => { scene.touchState[key] = true; });
    zone.on('pointerup', () => { scene.touchState[key] = false; });
    zone.on('pointerout', () => { scene.touchState[key] = false; });
    return zone;
  };
  const objs = [
    mk(60, GAME_H - 58, 44, 44, '<', 'left'),
    mk(140, GAME_H - 58, 44, 44, '>', 'right'),
    mk(100, GAME_H - 98, 44, 40, '^', 'up'),
    mk(100, GAME_H - 22, 44, 36, 'v', 'down'),
    mk(GAME_W - 140, GAME_H - 90, 26, 0, 'P', 'punch', true),
    mk(GAME_W - 78, GAME_H - 90, 26, 0, 'K', 'kick', true),
    mk(GAME_W - 109, GAME_H - 34, 26, 0, 'B', 'block', true)
  ];
  scene.touchDestroy = () => objs.forEach(o => o.destroy());
  scene.input.addPointer(3);
}

// ============================================================
class IntroScene extends Phaser.Scene {
  constructor() { super('Intro'); }
  preload() {
    this.load.image('mintlab', 'assets/stages/mintlab.png');
    this.load.audio('studio_tag', 'assets/music/studio_tag.ogg');
  }
  create() {
    this.cameras.main.setBackgroundColor('#000000');
    const logo = this.add.image(GAME_W / 2, GAME_H / 2, 'mintlab').setDisplaySize(GAME_W, GAME_H).setAlpha(0);
    const playTag = () => { if (this.cache.audio.exists('studio_tag')) this.sound.play('studio_tag', { volume: 1 }); };
    // browsers may block audio before the first user gesture - play on unlock if needed
    if (this.sound.locked) this.sound.once('unlocked', () => { if (this.scene.isActive('Intro')) playTag(); });
    else playTag();
    this.tweens.add({ targets: logo, alpha: 1, duration: 450, ease: 'Quad.easeOut' });
    this.time.delayedCall(2300, () => {
      this.tweens.add({ targets: logo, alpha: 0, duration: 450, onComplete: () => this.scene.start('Boot') });
    });
    // any input skips straight to loading
    const skip = () => { if (this.scene.isActive('Intro')) this.scene.start('Boot'); };
    this.input.keyboard.once('keydown', skip);
    this.input.once('pointerdown', skip);
  }
}

// ============================================================
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const bar = this.add.rectangle(GAME_W / 2, GAME_H / 2, 10, 14, 0xffcc22).setOrigin(0, 0.5).setX(GAME_W / 2 - 120);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, 244, 18).setStrokeStyle(2, 0xffe066);
    this.add.text(GAME_W / 2, GAME_H / 2 - 30, 'LOADING...', { fontFamily: 'monospace', fontSize: '14px', color: '#ffe066' }).setOrigin(0.5);
    this.load.on('progress', v => bar.setSize(240 * v, 14));

    for (const c of CHARACTERS) this.load.image(c.id, 'assets/chars/' + c.id + '.png');
    // optional pose sprites: {id}_punch/_kick/_crouch/_block/_hit/_win/_jump.png
    // drop them into assets/chars/ and they're used automatically (missing = procedural fallback)
    const POSES = ['punch', 'kick', 'crouch', 'block', 'crouchblock', 'hit', 'win', 'jump', 'walk', 'special1', 'special2', 'sweep', 'uppercut'];
    for (const c of CHARACTERS) for (const p of POSES) this.load.image(c.id + '_' + p, 'assets/chars/' + c.id + '_' + p + '.png');
    for (const s of STAGES) this.load.image(s.id, 'assets/stages/' + s.id + '.png');
    this.load.image('opening1', 'assets/stages/opening1.png');
    this.load.image('opening2', 'assets/stages/opening2.png');
    this.load.image('charbg', 'assets/stages/charbg.png');
    this.load.audio('beat1', 'assets/music/beat1.ogg');
    this.load.audio('beat2_menu', 'assets/music/beat2_menu.ogg');
    this.load.audio('beat3', 'assets/music/beat3.ogg');
    this.load.audio('beat4', 'assets/music/beat4.ogg');
    this.load.audio('beat5', 'assets/music/beat5.ogg');
    this.load.audio('beat6', 'assets/music/beat6.ogg');
    // digitized close-up portraits (optional per character - missing files are skipped)
    for (const c of CHARACTERS) this.load.image('port_' + c.id, 'assets/portraits/' + c.id + '.png');
    // optional voice slots - missing files are fine
    for (const k of VOICE_KEYS) this.load.audio(k, 'assets/voice/' + k + '.ogg');
    this.load.on('loaderror', () => {}); // ignore missing optional files
  }
  create() { this.scene.start('Title'); }
}

// ============================================================
class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    this.add.image(GAME_W / 2, GAME_H / 2, 'opening1').setDisplaySize(GAME_W, GAME_H);
    const press = this.add.text(GAME_W / 2, GAME_H * 0.86, isTouch() ? 'TAP TO START' : 'PRESS START', { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(GAME_W - 6, GAME_H - 6, 'v3.7', { fontFamily: 'monospace', fontSize: '10px', color: '#ffe066', stroke: '#000', strokeThickness: 2 }).setOrigin(1, 1);
    this.tweens.add({ targets: press, alpha: 0.15, yoyo: true, repeat: -1, duration: 550 });
    const go = () => { unlockAudio(); SFX.confirm(); this.scene.start('ModeSelect'); };
    this.input.keyboard.once('keydown', go);
    this.input.once('pointerdown', go);
    if (this.input.gamepad) this.input.gamepad.once('down', go);
  }
}

// ============================================================
class ModeSelectScene extends Phaser.Scene {
  constructor() { super('ModeSelect'); }
  create() {
    this.add.image(GAME_W / 2, GAME_H / 2, 'opening1').setDisplaySize(GAME_W, GAME_H);
    playMusic(this, 'beat2_menu', 0.55);
    buildMenuPanel(this, '', [
      ['VS CPU', () => this.scene.start('CharSelect', { mode: 'vscpu' })],
      ['2 PLAYERS', () => this.scene.start('CharSelect', { mode: 'vs' })],
      ['ARCADE TOWER', () => this.scene.start('CharSelect', { mode: 'tower' })],
      ['TRAINING', () => this.scene.start('CharSelect', { mode: 'training' })]
    ], 226, 32);
    this.add.text(GAME_W / 2, 352,
      'P1: WASD + F/G/H   P2: ARROWS + K/L/O   SPECIAL: down,forward+attack   ESC quit   F9 CRT',
      { fontFamily: 'monospace', fontSize: '9px', color: '#ccccdd', align: 'center', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5);
  }
}

// ============================================================
class CharSelectScene extends Phaser.Scene {
  constructor() { super('CharSelect'); }
  init(d) { this.mode = d.mode; }
  create() {
    this.add.image(GAME_W / 2, GAME_H / 2, 'charbg').setDisplaySize(GAME_W, GAME_H);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000010, 0.25);
    playMusic(this, 'beat2_menu', 0.55);
    playVoice(this, 'ann_choose');
    this.add.text(GAME_W / 2, 20, 'CHOOSE YOUR FIGHTER', { fontFamily: 'monospace', fontSize: '17px', color: '#ffe066', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5);

    // ---- two close-up portrait slots: P1 left, P2/CPU right ----
    const PF_W = 150, PF_H = 190, P_Y = 150, PX_L = 86, PX_R = GAME_W - 86;
    this.pxL = PX_L; this.pxR = PX_R; this.pY = P_Y;
    this.frameL = this.add.rectangle(PX_L, P_Y, PF_W + 8, PF_H + 8, 0x0a0a1a, 0.7).setStrokeStyle(3, 0xff5555);
    this.frameR = this.add.rectangle(PX_R, P_Y, PF_W + 8, PF_H + 8, 0x0a0a1a, 0.7).setStrokeStyle(3, 0x5588ff);
    this.portraitL = this.add.image(PX_L, P_Y, CHARACTERS[0].id);
    this.portraitR = this.add.image(PX_R, P_Y, CHARACTERS[0].id).setVisible(false);
    this.nameL = this.add.text(PX_L, P_Y + PF_H / 2 + 14, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3, fontStyle: 'bold' }).setOrigin(0.5);
    this.nameR = this.add.text(PX_R, P_Y + PF_H / 2 + 14, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3, fontStyle: 'bold' }).setOrigin(0.5);
    this.frameR.setVisible(this.mode === 'vs' || this.mode === 'vscpu');

    // ---- grid, centered between the portraits ----
    const cols = 3, cw = 92, ch = 84;
    const ox = GAME_W / 2 - cw, oy = 76;
    this.cells = [];
    CHARACTERS.forEach((c, i) => {
      const x = ox + (i % cols) * cw, y = oy + Math.floor(i / cols) * ch;
      const frame = this.add.rectangle(x, y, 84, 76, 0x111122, 0.85).setStrokeStyle(2, 0x555577);
      const img = this.add.image(x, y + 33, c.id).setOrigin(0.5, 1);
      const sc = 64 / this.textures.get(c.id).getSourceImage().height;
      img.setScale(sc);
      frame.setInteractive();
      this.cells.push({ frame, c, i });
      frame.on('pointerdown', () => { if (this.locked) return; if (this.turn === 1) this.p1idx = i; else this.p2idx = i; this.paint(); this.pick(this.turn, i); });
    });

    this.p1idx = 0; this.p2idx = 8;
    this.turn = 1;
    this.p1pick = null; this.p2pick = null;
    // status line BELOW the grid - never overlaps fighters
    this.turnText = this.add.text(GAME_W / 2, 340, 'PLAYER 1 - PICK', { fontFamily: 'monospace', fontSize: '13px', color: '#ff5555', stroke: '#000', strokeThickness: 3, fontStyle: 'bold' }).setOrigin(0.5);

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.k1 = this.input.keyboard.addKeys({ left: K.A, right: K.D, up: K.W, down: K.S, ok: K.F });
    this.k2 = this.input.keyboard.addKeys({ left: K.LEFT, right: K.RIGHT, up: K.UP, down: K.DOWN, ok: K.K });
    this.paint();
  }

  // fit a portrait INSIDE its frame (never overflows)
  setPortrait(img, nameText, charIdx) {
    const c = CHARACTERS[charIdx];
    const IN_W = 146, IN_H = 186;
    if (this.textures.exists('port_' + c.id)) {
      img.setTexture('port_' + c.id);
      img.setCrop();
      img.setOrigin(0.5, 0.5);
      const src = this.textures.get('port_' + c.id).getSourceImage();
      img.setScale(Math.min(IN_W / src.width, IN_H / src.height));
    } else {
      const tex = this.textures.get(c.id).getSourceImage();
      const cx = tex.width * 0.12, cy = tex.height * 0.01, cw = tex.width * 0.76, ch = tex.height * 0.36;
      img.setTexture(c.id);
      img.setCrop(cx, cy, cw, ch);
      img.setScale(Math.min(IN_W / cw, IN_H / ch));
      img.setOrigin((cx + cw / 2) / tex.width, (cy + ch / 2) / tex.height);
    }
    nameText.setText(c.name);
  }

  paint() {
    this.cells.forEach(cell => cell.frame.setStrokeStyle(2, 0x555577));
    if (this.p1pick !== null) this.cells[this.p1pick].frame.setStrokeStyle(3, 0xff5555);
    const cur = this.turn === 1 ? this.p1idx : this.p2idx;
    this.cells[cur].frame.setStrokeStyle(3, this.turn === 1 ? 0xff5555 : 0x5588ff);
    // left portrait: P1 hover (or locked pick), right: P2/CPU hover
    this.setPortrait(this.portraitL, this.nameL, this.p1pick !== null ? this.p1pick : this.p1idx);
    if ((this.mode === 'vs' || this.mode === 'vscpu') && this.turn === 2) {
      this.portraitR.setVisible(true);
      this.setPortrait(this.portraitR, this.nameR, this.p2idx);
    }
  }

  pick(turn, idx) {
    if (this.locked) return;
    this.locked = true;
    SFX.confirm();
    playVoice(this, CHARACTERS[idx].id + '_name');
    // gleam sweep + pop on the picked portrait, THEN proceed
    const img = turn === 1 ? this.portraitL : this.portraitR;
    const px = turn === 1 ? this.pxL : this.pxR;
    if (turn === 2) { this.portraitR.setVisible(true); this.setPortrait(this.portraitR, this.nameR, idx); }
    else this.setPortrait(this.portraitL, this.nameL, idx);
    // shine bar sweeping across the portrait frame
    const shine = this.add.rectangle(px - 95, this.pY, 26, 210, 0xffffff, 0.45).setAngle(16).setDepth(5);
    const mask = this.add.rectangle(px, this.pY, 154, 194).setVisible(false);
    shine.setMask(mask.createGeometryMask());
    this.tweens.add({ targets: shine, x: px + 95, duration: 480, ease: 'Cubic.easeInOut', onComplete: () => { shine.destroy(); mask.destroy(); } });
    this.tweens.add({ targets: img, scaleX: img.scaleX * 1.07, scaleY: img.scaleY * 1.07, duration: 200, yoyo: true, ease: 'Quad.easeOut' });

    this.time.delayedCall(1050, () => {
      this.locked = false;
      if (turn === 1) {
        this.p1pick = idx;
        if (this.mode === 'vs' || this.mode === 'vscpu') {
          this.turn = 2;
          this.turnText.setText(this.mode === 'vscpu' ? 'PICK CPU OPPONENT' : 'PLAYER 2 - PICK')
            .setColor(this.mode === 'vscpu' ? '#ffaa33' : '#5588ff');
          this.paint();
        } else this.launch();
      } else { this.p2pick = idx; this.launch(); }
    });
  }

  launch() {
    const p1 = CHARACTERS[this.p1pick].id;
    if (this.mode === 'vs' || this.mode === 'vscpu') {
      this.scene.start('StageSelect', { mode: this.mode, p1CharId: p1, p2CharId: CHARACTERS[this.p2pick].id });
    } else if (this.mode === 'training') {
      this.scene.start('StageSelect', { mode: 'training', p1CharId: p1, p2CharId: p1 });
    } else {
      const opps = CHARACTERS.filter(c => c.id !== p1).map(c => c.id);
      Phaser.Utils.Array.Shuffle(opps);
      this.scene.start('Ladder', { ladder: { charId: p1, opponents: opps, stage: 0 }, result: null, charId: p1 });
    }
  }

  update() {
    if (this.locked) { padEdges(this, 0, 'cs'); padEdges(this, 1, 'cs'); return; }
    const pe0 = padEdges(this, 0, 'cs');
    const pe1 = padEdges(this, 1, 'cs');
    const step = (keys, who, pe) => {
      if (this.turn !== who) return;
      let idx = who === 1 ? this.p1idx : this.p2idx;
      let moved = false;
      if (Phaser.Input.Keyboard.JustDown(keys.left) || (pe && pe.left)) { idx = this.idxMove(idx, -1, 0); moved = true; }
      if (Phaser.Input.Keyboard.JustDown(keys.right) || (pe && pe.right)) { idx = this.idxMove(idx, 1, 0); moved = true; }
      if (Phaser.Input.Keyboard.JustDown(keys.up) || (pe && pe.up)) { idx = this.idxMove(idx, 0, -1); moved = true; }
      if (Phaser.Input.Keyboard.JustDown(keys.down) || (pe && pe.down)) { idx = this.idxMove(idx, 0, 1); moved = true; }
      if (moved) { SFX.select(); if (who === 1) this.p1idx = idx; else this.p2idx = idx; this.paint(); }
      if (Phaser.Input.Keyboard.JustDown(keys.ok) || (pe && pe.ok)) this.pick(who, idx);
    };
    step(this.k1, 1, pe0);
    if (this.mode === 'vs') step(this.k2, 2, pe1);
    else { step(this.k2, 1, null); if (this.turn === 2) { step(this.k1, 2, pe0); step(this.k2, 2, pe1); } }
  }

  idxMove(idx, dx, dy) {
    let cx = idx % 3, cy = Math.floor(idx / 3);
    cx = (cx + dx + 3) % 3; cy = (cy + dy + 3) % 3;
    return cy * 3 + cx;
  }
}

// ============================================================
class StageSelectScene extends Phaser.Scene {
  constructor() { super('StageSelect'); }
  init(d) { this.params = d; }
  create() {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0a0a18);
    this.add.text(GAME_W / 2, 26, 'SELECT STAGE', { fontFamily: 'monospace', fontSize: '18px', color: '#ffe066', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5);
    this.idx = 0;
    // big thumbnails, 2 rows: 3 + 2
    const positions = [
      [140, 120], [320, 120], [500, 120],
      [230, 246], [410, 246]
    ];
    this.thumbs = STAGES.map((s, i) => {
      const [x, y] = positions[i];
      const img = this.add.image(x, y, s.id).setDisplaySize(164, 92).setInteractive();
      const fr = this.add.rectangle(x, y, 170, 98).setStrokeStyle(3, 0x555577);
      img.on('pointerdown', () => { this.idx = i; this.go(); });
      return { img, fr, s };
    });
    this.nameText = this.add.text(GAME_W / 2, GAME_H - 34, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5);
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard.addKeys({ left: K.A, right: K.D, l2: K.LEFT, r2: K.RIGHT, ok: K.F, ok2: K.K, enter: K.ENTER });
    this.paint();
  }
  paint() {
    this.thumbs.forEach((t, i) => t.fr.setStrokeStyle(i === this.idx ? 4 : 3, i === this.idx ? 0xffcc22 : 0x555577));
    this.nameText.setText(STAGES[this.idx].name);
  }
  go() {
    SFX.confirm();
    stopMusic(this);
    this.scene.start('Fight', Object.assign({}, this.params, { stageId: STAGES[this.idx].id }));
  }
  update() {
    const k = this.keys;
    const pe = padEdges(this, -1, 'stage');
    if (Phaser.Input.Keyboard.JustDown(k.left) || Phaser.Input.Keyboard.JustDown(k.l2) || pe.left) { this.idx = (this.idx + STAGES.length - 1) % STAGES.length; SFX.select(); this.paint(); }
    if (Phaser.Input.Keyboard.JustDown(k.right) || Phaser.Input.Keyboard.JustDown(k.r2) || pe.right) { this.idx = (this.idx + 1) % STAGES.length; SFX.select(); this.paint(); }
    if (Phaser.Input.Keyboard.JustDown(k.ok) || Phaser.Input.Keyboard.JustDown(k.ok2) || Phaser.Input.Keyboard.JustDown(k.enter) || pe.ok) this.go();
  }
}

// ============================================================
class LadderScene extends Phaser.Scene {
  constructor() { super('Ladder'); }
  init(d) { this.ladder = d.ladder; this.result = d.result; this.charId = d.charId; }
  create() {
    this.add.image(GAME_W / 2, GAME_H / 2, 'opening2').setDisplaySize(GAME_W, GAME_H).setAlpha(0.5);
    playMusic(this, 'beat2_menu', 0.55);
    const L = this.ladder;

    if (this.result === 'win') L.stage++;
    if (L.stage >= L.opponents.length) {
      this.add.text(GAME_W / 2, GAME_H * 0.3, 'CHAMPION OF THE A', { fontFamily: 'monospace', fontSize: '26px', color: '#ffcc22', stroke: '#000', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(0.5);
      const c = CHARACTERS.find(x => x.id === this.charId);
      const img = this.add.image(GAME_W / 2, GAME_H * 0.78, c.id).setOrigin(0.5, 1);
      img.setScale(150 / this.textures.get(c.id).getSourceImage().height);
      this.add.text(GAME_W / 2, GAME_H * 0.84, c.name + ' RUNS THE CITY', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
      buildMenuPanel(this, 'TOWER COMPLETE', [['MAIN MENU', () => this.scene.start('ModeSelect')]]);
      return;
    }

    const title = this.result === 'lose' ? 'CONTINUE?' : 'THE TOWER';
    this.add.text(GAME_W / 2, 26, title, { fontFamily: 'monospace', fontSize: '20px', color: this.result === 'lose' ? '#ff4444' : '#ffe066', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5);

    // ladder list, next opponent highlighted
    for (let i = 0; i < L.opponents.length; i++) {
      const c = CHARACTERS.find(x => x.id === L.opponents[i]);
      const y = GAME_H - 60 - i * 28;
      const isNext = i === L.stage;
      const done = i < L.stage;
      this.add.text(GAME_W / 2, y, (done ? '[X] ' : isNext ? '>>> ' : '    ') + c.name,
        { fontFamily: 'monospace', fontSize: isNext ? '15px' : '12px', color: done ? '#557755' : isNext ? '#ffcc22' : '#aaaacc', stroke: '#000', strokeThickness: 3, fontStyle: isNext ? 'bold' : 'normal' }).setOrigin(0.5);
    }

    const fight = () => {
      stopMusic(this);
      const stage = STAGES[Phaser.Math.Between(0, STAGES.length - 1)].id;
      this.scene.start('Fight', {
        mode: 'tower', p1CharId: this.charId, p2CharId: L.opponents[L.stage],
        stageId: stage, aiLevel: L.stage, ladder: L
      });
    };
    const opts = [[this.result === 'lose' ? 'RETRY' : 'FIGHT', fight], ['GIVE UP', () => this.scene.start('ModeSelect')]];
    buildMenuPanel(this, 'NEXT: ' + CHARACTERS.find(x => x.id === L.opponents[L.stage]).name, opts);
  }
}
