// ============================================================
// BUCK! - FIGHT SCENE
// Manual (non-physics) fighting engine: states, hitboxes,
// specials, AI, rounds, slow-mo KO.
// ============================================================

class Fighter {
  constructor(scene, cfg, x, facing, side) {
    this.scene = scene;
    this.cfg = cfg;
    this.side = side; // 'p1' | 'p2'
    this.x = x; this.y = GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.facing = facing; // 1 right, -1 left
    this.state = 'idle';
    this.stateT = 0;          // ms in current state
    this.health = cfg.health;
    this.maxHealth = cfg.health;
    this.attack = null;       // current attack data
    this.attackHitDone = false;
    this.special = null;      // current special def
    this.hitstun = 0;
    this.stun = 0;            // dizzy timer
    this.slowUntil = 0;       // speed debuff
    this.blocking = false;
    this.crouching = false;
    this.airborne = false;
    this.knockedDown = false;
    this.roundsWon = 0;
    this.comboInput = [];     // [{dir, t}] for QCF detection
    this.comboTaken = 0;      // consecutive hits eaten (for combo breaker)
    this.juggleCount = 0;     // times popped up in the current air juggle
    this.chainCount = 0;      // ground chain links used
    this.lastHitT = -9999;
    this.invulnUntil = 0;
    this.prev = { punch: false, kick: false, block: false };
    this.bobT = Math.random() * 1000;

    const tex = scene.textures.get(cfg.id).getSourceImage();
    this.baseScale = cfg.height / tex.height;
    this.sprite = scene.add.image(x, GROUND_Y, cfg.id).setOrigin(0.5, 1);
    this.sprite.setScale(this.baseScale);
    this.w = tex.width * this.baseScale * 0.5; // half-width for spacing
  }

  get speedNow() {
    let s = this.cfg.speed;
    if (this.scene.now < this.slowUntil) s *= 0.5;
    return s;
  }

  hurtbox() {
    const h = this.crouching ? this.cfg.height * 0.6 : this.cfg.height;
    return { x: this.x - this.w * 0.6, y: this.y - h, w: this.w * 1.2, h: h };
  }

  setState(s) { this.state = s; this.stateT = 0; }

  canAct() {
    return !['attack', 'special', 'hitstun', 'down', 'ko', 'win'].includes(this.state) && this.stun <= 0;
  }

  // in: input frame {left,right,up,down,punch,kick,block} (booleans)
  update(dt, inp, opp) {
    const S = this.scene;
    this.stateT += dt;
    this.bobT += dt;
    if (this.stun > 0) { this.stun -= dt; if (this.stun < 0) this.stun = 0; }

    // face opponent when free
    if (!this.airborne && this.canAct()) this.facing = (opp.x >= this.x) ? 1 : -1;

    // ---- edge detection for buttons
    const punchDown = inp.punch && !this.prev.punch;
    const kickDown = inp.kick && !this.prev.kick;

    // ---- QCF buffer (down -> forward)
    const fwd = this.facing === 1 ? inp.right : inp.left;
    if (inp.down) this.pushDir('D');
    if (fwd) this.pushDir('F');
    this.comboInput = this.comboInput.filter(e => S.now - e.t < 450);

    // ---- gravity
    if (this.airborne) {
      this.vy += 1500 * (dt / 1000);
      this.y += this.vy * (dt / 1000);
      this.x += this.vx * (dt / 1000);
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y; this.airborne = false; this.vx = 0; this.vy = 0;
        this.juggleCount = 0;
        if (this.state === 'launched') { this.setState('down'); SFX.heavyHit(); }
        else if (this.state === 'jumpattack' || this.state === 'jump') this.setState('idle');
      }
    }

    // ---- state machine
    switch (this.state) {
      case 'hitstun':
        // COMBO BREAKER: after eating 3+ hits, hold block to break out and hop back
        if (this.comboTaken >= 3 && inp.block) {
          const away = this.x < opp.x ? -1 : 1;
          this.vx = away * 320;
          this.invulnUntil = S.now + 650;
          this.comboTaken = 0;
          this.hitstun = 180; this.stateT = 0;
          this.flashUntil = S.now + 120;
          SFX.block();
          S.sparkAt(this.x, this.y - this.cfg.height * 0.6, 0x66aaff, 10);
        }
        this.x += this.vx * (dt / 1000);
        this.vx *= Math.pow(0.02, dt / 1000);
        if (this.stateT >= this.hitstun) this.setState(inp.block ? 'block' : 'idle');
        break;

      case 'down':
        if (this.stateT >= 700) { this.setState('idle'); this.invulnUntil = this.scene.now + 450; }
        break;

      case 'attack': case 'jumpattack': {
        // GROUND CHAIN: if the hit connected, cancel recovery into the next attack (max 3-hit strings)
        if (this.state === 'attack' && this.attack && this.attackHitDone && this.chainCount < 2) {
          const a = this.attack;
          if (this.stateT > a.startup + a.active) {
            if (punchDown) { this.chainCount++; this.startAttack(inp.down ? 'cpunch' : 'punch'); }
            else if (kickDown) { this.chainCount++; this.startAttack(inp.down ? 'ckick' : 'kick'); }
          }
        }
        this.runAttack(opp);
        break;
      }
      case 'special': this.runSpecial(dt, opp); break;

      case 'ko': case 'win': case 'launched': break;

      default: { // idle / walk / crouch / block / jump control
        if (this.stun > 0) break;
        this.crouching = false; this.blocking = false;

        if (!this.airborne) {
          if (inp.block) {
            this.blocking = true;
            if (inp.down) { this.crouching = true; this.setStateIf('crouchblock'); }
            else this.setStateIf('block');
          } else if (inp.down) {
            this.crouching = true; this.setStateIf('crouch');
            if (punchDown) this.startAttack('cpunch');
            else if (kickDown) this.startAttack('ckick');
          } else {
            // specials first (QCF + button)
            if (punchDown && this.hasQCF()) { this.startSpecial(this.cfg.special1, 1); break; }
            if (kickDown && this.hasQCF()) { this.startSpecial(this.cfg.special2, 2); break; }
            // throw: punch+kick together, close range
            if (punchDown && kickDown === false && inp.kick && Math.abs(opp.x - this.x) < this.w + opp.w + 14 && !opp.airborne) {
              this.doThrow(opp); break;
            }
            if (punchDown) { this.startAttack('punch'); break; }
            if (kickDown) { this.startAttack('kick'); break; }

            if (inp.up) {
              this.airborne = true; this.vy = -this.cfg.jump;
              this.vx = (inp.left ? -1 : inp.right ? 1 : 0) * this.speedNow * 0.9;
              this.setState('jump'); SFX.jump();
            } else if (inp.left) {
              this.x -= this.speedNow * (dt / 1000); this.setStateIf('walk');
            } else if (inp.right) {
              this.x += this.speedNow * (dt / 1000); this.setStateIf('walk');
            } else this.setStateIf('idle');
          }
        } else {
          // air attacks: punch and kick are distinct
          if ((punchDown || kickDown) && this.state === 'jump') {
            this.setState('jumpattack');
            const mk = punchDown ? 'airp' : 'air';
            this.attack = Object.assign({ key: mk }, MOVES[mk]);
            this.attackHitDone = false;
          }
        }
      }
    }

    // keep in bounds & simple body push
    this.x = Phaser.Math.Clamp(this.x, 30, GAME_W - 30);
    const dist = Math.abs(this.x - opp.x);
    const minDist = this.w + opp.w - 10;
    if (dist < minDist && !this.airborne && !opp.airborne) {
      const push = (minDist - dist) / 2;
      if (this.x < opp.x) { this.x -= push; opp.x += push; } else { this.x += push; opp.x -= push; }
    }

    this.prev = { punch: inp.punch, kick: inp.kick, block: inp.block };
    this.render();
  }

  setStateIf(s) { if (this.state !== s) this.setState(s); }
  pushDir(d) {
    const last = this.comboInput[this.comboInput.length - 1];
    if (!last || last.dir !== d) this.comboInput.push({ dir: d, t: this.scene.now });
  }
  hasQCF() {
    const seq = this.comboInput;
    for (let i = 0; i < seq.length - 1; i++)
      if (seq[i].dir === 'D' && seq[i + 1].dir === 'F') return true;
    return false;
  }

  startAttack(key) {
    this.attack = Object.assign({ key }, MOVES[key]);
    this.attackT = 0; this.attackHitDone = false;
    if (this.state !== 'jumpattack') this.setState('attack');
  }

  runAttack(opp) {
    const a = this.attack; if (!a) { this.setState('idle'); return; }
    const t = this.stateT;
    if (t > a.startup && t < a.startup + a.active && !this.attackHitDone) {
      this.tryHit(opp, a.reach, a.dmg * this.cfg.dmg, a.kb, a);
    }
    if (t > a.startup + a.active + a.recover) { this.attack = null; this.chainCount = 0; this.setState('idle'); }
  }

  tryHit(opp, reach, dmg, kb, opts) {
    opts = opts || {};
    const hb = { x: this.x + (this.facing === 1 ? 0 : -reach - this.w), y: this.y - this.cfg.height * (opts.low ? 0.25 : 0.75),
                 w: reach + this.w, h: this.cfg.height * 0.4 };
    const ob = opp.hurtbox();
    if (opts.high && opp.crouching) return false;            // high whiffs on crouch
    if (!(hb.x < ob.x + ob.w && hb.x + hb.w > ob.x && hb.y < ob.y + ob.h && hb.y + hb.h > ob.y)) return false;
    this.attackHitDone = true;
    opp.takeHit(dmg, kb * this.facing / opp.cfg.weight, this, opts);
    return true;
  }

  takeHit(dmg, kbvx, from, opts) {
    opts = opts || {};
    if (this.state === 'ko') return;
    const S = this.scene;
    if (S.now < this.invulnUntil || this.state === 'down') return;  // no hitting grounded / broken-out fighters
    if (this.blocking && !opts.unblockable) {
      this.health -= dmg * 0.15;
      this.vx = kbvx * 0.5;
      this.setState('hitstun'); this.hitstun = 120;
      this.comboTaken = 0;
      SFX.block();
      S.sparkAt(this.x, this.y - this.cfg.height * 0.6, 0x8899ff, 4);
    } else {
      // ---- AIR JUGGLE: hitting an airborne target pops them back up ----
      if (this.airborne || this.state === 'launched') {
        dmg *= Math.pow(0.72, this.juggleCount);          // damage scaling per juggle hit
        this.juggleCount++;
        this.health -= dmg;
        this.vx = kbvx * 0.8;
        if (this.juggleCount > 3) {
          // juggle limit: knocked away, can't be hit again until grounded
          this.vy = -140; this.invulnUntil = S.now + 700;
        } else {
          this.vy = -310;                                  // re-pop
        }
        this.airborne = true;
        this.setState('launched');
        dmg >= 10 ? SFX.heavyHit() : SFX.hit();
        this.flashUntil = S.now + 80;
        S.sparkAt(this.x, this.y - this.cfg.height * 0.5, 0xffdd44, 8);
        S.impactSprayAt(this.x, this.y - this.cfg.height * 0.62, Math.sign(kbvx) || from.facing, dmg >= 10);
        S.hitPause(60);
        if (S.mode === 'training') S.floatDamage(this.x, this.y - this.cfg.height, Math.round(dmg));
        if (this.health <= 0) { this.health = 0; S.onKO(this, from); }
        return;
      }
      this.health -= dmg;
      this.vx = kbvx;
      // combo tracking for breaker
      this.comboTaken = (S.now - this.lastHitT < 1400) ? this.comboTaken + 1 : 1;
      this.lastHitT = S.now;
      this.stun = opts.stun ? opts.stun : this.stun;
      if (opts.slow) this.slowUntil = S.now + opts.slow;
      if (opts.launch) { this.airborne = true; this.vy = -520; this.setState('launched'); }
      else if (opts.sweep || opts.knockdown) { this.setState('down'); this.vx = kbvx * 1.2; this.comboTaken = 0; }
      else { this.setState('hitstun'); this.hitstun = Math.min(420, 260 + dmg * 6); }
      dmg >= 12 ? SFX.heavyHit() : SFX.hit();
      this.flashUntil = S.now + 80;
      S.sparkAt(this.x, this.y - this.cfg.height * 0.65, 0xffdd44, 8);
      S.impactSprayAt(
        this.x,
        this.y - this.cfg.height * 0.68,
        Math.sign(kbvx) || from.facing,
        dmg >= 12 || opts.launch || opts.sweep || opts.knockdown || opts.unblockable
      );
      S.hitPause(dmg >= 12 ? 90 : 45);
      if (S.mode === 'training') S.floatDamage(this.x, this.y - this.cfg.height, Math.round(dmg));
    }
    if (this.health <= 0) { this.health = 0; S.onKO(this, from); }
  }

  doThrow(opp) {
    if (opp.state === 'ko') return;
    this.setState('attack');
    this.attack = { key: 'throw', startup: 60, active: 60, recover: 300, reach: 30, dmg: 0, kb: 0 };
    this.attackT = 0; this.attackHitDone = true;
    opp.takeHit(10 * this.cfg.dmg, 260 * this.facing / opp.cfg.weight, this, { unblockable: true, knockdown: true });
  }

  // -------- SPECIALS --------
  startSpecial(def, slot) {
    this.special = def; this.specialSlot = slot;
    this.comboInput = [];
    this.setState('special');
    this.specialDone = false;
    SFX.special();
    playVoice(this.scene, this.cfg.id + '_s' + slot, 1);
    this.scene.announceSpecial(this, def);
  }

  runSpecial(dt, opp) {
    const d = this.special; const S = this.scene; const t = this.stateT;
    if (!d) { this.setState('idle'); return; }
    switch (d.type) {
      case 'projectile':
        if (t > 200 && !this.specialDone) {
          this.specialDone = true;
          S.spawnProjectile(this, d);
        }
        if (t > 480) this.endSpecial();
        break;

      case 'rush': {
        if (t > 140 && t < 420) {
          this.x += this.facing * 620 * (dt / 1000);
          if (!this.specialDone) {
            S.trailAt(this.x, this.y - this.cfg.height * 0.5, d.color);
            if (this.tryHit(opp, 30, d.dmg * this.cfg.dmg, 300, { knockdown: true })) this.specialDone = true;
          }
        }
        if (t > 620) this.endSpecial();
        break;
      }

      case 'area':
        if (t > 260 && !this.specialDone) {
          this.specialDone = true;
          S.shockRing(this.x, this.y, d.color);
          if (d.shake) S.cameras.main.shake(250, 0.012);
          if (!opp.airborne && Math.abs(opp.x - this.x) < 150) {
            opp.takeHit(d.dmg * this.cfg.dmg, 200 * this.facing / opp.cfg.weight, this,
              { knockdown: !d.stun, stun: d.stun, unblockable: false });
          }
        }
        if (t > 700) this.endSpecial();
        break;

      case 'flurry': {
        const hitTimes = [150, 300, 450];
        for (const ht of hitTimes) {
          if (t > ht && !this['fl' + ht]) {
            this['fl' + ht] = true;
            this.tryHit(opp, 40, d.dmg * this.cfg.dmg, 60, {});
            S.sparkAt(this.x + this.facing * this.w, this.y - this.cfg.height * 0.6, d.color, 5);
          }
        }
        if (t > 650) { this.fl150 = this.fl300 = this.fl450 = false; this.endSpecial(); }
        break;
      }

      case 'uppercut':
        if (t > 120 && !this.specialDone) {
          this.specialDone = true;
          this.airborne = true; this.vy = -600; this.vx = this.facing * 80;
          this.tryHit(opp, 44, d.dmg * this.cfg.dmg, 120, { launch: true });
          S.trailAt(this.x, this.y - this.cfg.height * 0.6, d.color);
        }
        if (!this.airborne && t > 400) this.endSpecial();
        break;

      case 'assist':
        if (t > 180 && !this.specialDone) {
          this.specialDone = true;
          S.spawnAssist(this, d);
        }
        if (t > 550) this.endSpecial();
        break;

      default: this.endSpecial();
    }
  }

  endSpecial() { this.special = null; this.setState('idle'); }

  // pick the best pose texture for the current state (falls back to base sprite)
  poseKey() {
    const id = this.cfg.id;
    const has = k => this.scene.textures.exists(id + '_' + k);
    switch (this.state) {
      case 'attack': case 'jumpattack': {
        const a = this.attack;
        if (!a) return id;
        if (a.key === 'cpunch' && has('uppercut')) return id + '_uppercut';
        if (a.key === 'ckick' && has('sweep')) return id + '_sweep';
        const isKick = a.key === 'kick' || a.key === 'ckick' || a.key === 'air';
        if (isKick && has('kick')) return id + '_kick';
        if (!isKick && has('punch')) return id + '_punch';
        return id;
      }
      case 'special': {
        const sk = 'special' + (this.specialSlot || 1);
        if (has(sk)) return id + '_' + sk;
        return has('punch') ? id + '_punch' : id;
      }
      case 'walk': return has('walk') ? id + '_walk' : id;
      case 'crouch': return has('crouch') ? id + '_crouch' : id;
      case 'block': return has('block') ? id + '_block' : id;
      case 'crouchblock':
        if (has('crouchblock')) return id + '_crouchblock';
        return has('crouch') ? id + '_crouch' : id;
      case 'hitstun': case 'launched': case 'down': case 'ko': return has('hit') ? id + '_hit' : id;
      case 'win': return has('win') ? id + '_win' : id;
      case 'jump': return has('jump') ? id + '_jump' : id;
      default: return id;
    }
  }

  // -------- RENDER (programmatic animation of static sprite) --------
  render() {
    const s = this.sprite;
    const key = this.poseKey();
    if (this.curTexKey !== key) {
      this.curTexKey = key;
      s.setTexture(key);
    }
    const usingPose = key !== this.cfg.id;
    // pose files are pre-normalized to the same pixel scale as the base sprite
    const B = this.baseScale;
    s.x = this.x; s.y = this.y;
    s.setFlipX(this.facing === -1);
    let sx = B, sy = B, angle = 0, oy = 0;

    switch (this.state) {
      case 'idle':   oy = Math.sin(this.bobT / 260) * 2; break;
      case 'walk':   oy = Math.abs(Math.sin(this.bobT / 110)) * -3; angle = this.facing * 2; break;
      case 'crouch': case 'block': case 'crouchblock':
        if (usingPose) {
          // real pose art: no squash needed, tiny breathing only
          oy = Math.sin(this.bobT / 300) * 1;
          if (this.state !== 'crouch') s.setTint(0xaaaacc);
        } else if (this.state === 'crouch') {
          sy = B * 0.78; sx = B * 1.07;
          angle = this.facing * 6;
        } else if (this.state === 'crouchblock') {
          sy = B * 0.75; sx = B * 1.08;
          s.setTint(0x9999bb);
        } else {
          sy = B * 0.92; sx = B * 1.02;
          s.setTint(0x9999bb);
        }
        break;
      case 'jump': case 'jumpattack':
        if (!usingPose) {
          sy = B * (this.vy < 0 ? 1.06 : 0.96);
          sx = B * (this.vy < 0 ? 0.95 : 1.04);
        }
        if (this.state === 'jumpattack') angle = this.facing * (usingPose ? 8 : 18);
        break;
      case 'attack': {
        const a = this.attack;
        if (a) {
          const isKick = a.key === 'kick' || a.key === 'ckick';
          const inActive = this.stateT > a.startup && this.stateT < a.startup + a.active;
          const p = this.stateT < a.startup ? -6 : inActive ? (isKick ? 20 : 14) : 4;
          s.x = this.x + this.facing * p;
          if (usingPose) {
            // pose art carries the choreography; just add momentum
            angle = this.facing * (inActive ? 4 : 1);
            const isSweepArt = key === this.cfg.id + '_sweep';
            if (a.key === 'cpunch') { angle = -this.facing * (inActive ? 12 : 4); oy = inActive ? -10 : 0; }
            else if (isSweepArt) { angle = 0; }                       // dedicated sweep art: render 1:1, no squash
            else if (a.key === 'ckick') {
              // no dedicated sweep art yet: pin the kick pose low to the ground
              sy = B * 0.6; sx = B * 1.12; angle = this.facing * 10;
            }
          } else if (isKick) {
            angle = this.facing * (inActive ? 16 : 8);
            sx = B * 1.05;
          } else {
            angle = this.facing * (inActive ? 7 : 3);
            sy = B * (inActive ? 1.02 : 1);
          }
          if (a.low && !usingPose) { sy = B * 0.78; sx = B * 1.07; }
        }
        break;
      }
      case 'special':
        angle = this.facing * (usingPose ? 4 : 8);
        s.x = this.x + this.facing * 8;
        break;
      case 'hitstun': angle = -this.facing * (usingPose ? 5 : 9); break;
      case 'launched': angle = -this.facing * 40; break;
      case 'down': angle = -this.facing * 82; sy = B * 0.9; break;
      case 'ko':   angle = -this.facing * 90; break;
      case 'win':  oy = usingPose ? 0 : Math.abs(Math.sin(this.stateT / 180)) * -8; break;
    }
    if (this.scene.now < (this.flashUntil || 0)) s.setTintFill(0xffffff);
    else if (this.stun > 0) s.setTint(0xffff66);
    else if (this.state !== 'block' && this.state !== 'crouchblock') s.clearTint();
    s.setScale(sx, sy);
    s.setAngle(angle);
    s.y = this.y + oy;
  }
}

// ============================================================
class FightScene extends Phaser.Scene {
  constructor() { super('Fight'); }

  init(data) {
    this.p1CharId = data.p1CharId;
    this.p2CharId = data.p2CharId;
    this.stageId = data.stageId;
    this.mode = data.mode;               // 'vs' | 'vscpu' | 'tower' | 'training'
    this.aiLevel = data.aiLevel !== undefined ? data.aiLevel : (data.mode === 'vscpu' ? 3 : 0);
    this.ladder = data.ladder || null;
  }

  create() {
    this.now = 0; this.slowmo = 1; this.pauseT = 0;
    const stage = STAGES.find(s => s.id === this.stageId);
    const bg = this.add.image(GAME_W / 2, GAME_H / 2, stage.id).setDisplaySize(GAME_W * 1.06, GAME_H * 1.06);
    this.bg = bg;

    const c1 = CHARACTERS.find(c => c.id === this.p1CharId);
    const c2 = CHARACTERS.find(c => c.id === this.p2CharId);
    this.p1 = new Fighter(this, c1, GAME_W * 0.3, 1, 'p1');
    this.p2 = new Fighter(this, c2, GAME_W * 0.7, -1, 'p2');
    this.projectiles = [];
    this.assists = [];
    this.fxG = this.add.graphics().setDepth(7);   // limb/impact streaks drawn every frame

    this.fightMusicKey = stage.music;
    this.ensureFightMusic = () => playMusic(this, this.fightMusicKey, 0.62);
    this.ensureFightMusic();
    // A fight-control tap is a guaranteed mobile user gesture. Retry here in
    // case the browser suspended audio during the scene transition.
    this.input.on('pointerdown', this.ensureFightMusic);
    this.buildHUD(c1, c2);
    this.setupInput();
    if (isTouch()) buildTouchControls(this);

    this.roundNum = 1;
    this.roundActive = false;
    this.matchOver = false;
    this.timer = 99;
    this.timerAcc = 0;
    this.coinRewardSettled = false;
    if (this.mode !== 'training' && window.KNUCK_COINS) {
      window.KNUCK_COINS.startMatch({ mode: this.mode });
    }
    if (this.mode === 'training') { this.roundActive = true; this.bigText('TRAINING', 900); }
    else this.startRoundIntro();

    this.events.on('shutdown', () => {
      this.input.off('pointerdown', this.ensureFightMusic);
      if (this.touchDestroy) this.touchDestroy();
    });
  }

  buildHUD(c1, c2) {
    const g = this.add.graphics().setDepth(10);
    this.hudG = g;
    const style = { fontFamily: 'monospace', fontSize: '13px', color: '#ffe066', stroke: '#000', strokeThickness: 3 };
    this.add.text(14, 24, c1.name, style).setDepth(11);
    this.add.text(GAME_W - 14, 24, c2.name, style).setOrigin(1, 0).setDepth(11);
    this.timerText = this.add.text(GAME_W / 2, 8, '99', { fontFamily: 'monospace', fontSize: '22px', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(11);
    this.centerText = this.add.text(GAME_W / 2, GAME_H * 0.38, '', { fontFamily: 'monospace', fontSize: '38px', color: '#ffcc22', stroke: '#220000', strokeThickness: 6, fontStyle: 'bold' }).setOrigin(0.5).setDepth(12);
    this.subText = this.add.text(GAME_W / 2, GAME_H * 0.52, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(12);
  }

  drawHUD() {
    const g = this.hudG; g.clear();
    const bw = 240, bh = 12;
    // P1 bar (right-anchored fill like MK)
    g.fillStyle(0x111122, 0.85).fillRect(12, 10, bw, bh);
    g.fillStyle(0xdd2222).fillRect(12, 10, bw * Math.max(0, this.p1.health / this.p1.maxHealth), bh);
    g.fillStyle(0x111122, 0.85).fillRect(GAME_W - 12 - bw, 10, bw, bh);
    const p2r = Math.max(0, this.p2.health / this.p2.maxHealth);
    g.fillStyle(0xdd2222).fillRect(GAME_W - 12 - bw * p2r, 10, bw * p2r, bh);
    g.lineStyle(2, 0xffe066).strokeRect(12, 10, bw, bh).strokeRect(GAME_W - 12 - bw, 10, bw, bh);
    // round pips
    g.fillStyle(0xffe066);
    for (let i = 0; i < this.p1.roundsWon; i++) g.fillCircle(20 + i * 14, 32 + 14, 4);
    for (let i = 0; i < this.p2.roundsWon; i++) g.fillCircle(GAME_W - 20 - i * 14, 32 + 14, 4);
  }

  setupInput() {
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys1 = this.input.keyboard.addKeys({ left: K.A, right: K.D, up: K.W, down: K.S, punch: K.F, kick: K.G, block: K.H });
    this.keys2 = this.input.keyboard.addKeys({ left: K.LEFT, right: K.RIGHT, up: K.UP, down: K.DOWN, punch: K.K, kick: K.L, block: K.O });
    this.escKey = this.input.keyboard.addKey(K.ESC);
    this.tKey = this.input.keyboard.addKey(K.T);
    this.dummyBlocks = false;
    this.input.gamepad && this.input.gamepad.on('connected', () => {});
  }

  readInput(keys, padIndex, touch) {
    const inp = { left: keys.left.isDown, right: keys.right.isDown, up: keys.up.isDown, down: keys.down.isDown, punch: keys.punch.isDown, kick: keys.kick.isDown, block: keys.block.isDown };
    const pads = this.input.gamepad ? this.input.gamepad.gamepads : [];
    const pad = pads && pads[padIndex];
    if (pad) {
      const ax = pad.axes.length ? pad.axes[0].getValue() : 0;
      const ay = pad.axes.length > 1 ? pad.axes[1].getValue() : 0;
      inp.left = inp.left || pad.left || ax < -0.4;
      inp.right = inp.right || pad.right || ax > 0.4;
      inp.up = inp.up || pad.up || ay < -0.5 || (pad.buttons[3] && pad.buttons[3].pressed);
      inp.down = inp.down || pad.down || ay > 0.5;
      inp.punch = inp.punch || (pad.buttons[0] && pad.buttons[0].pressed) || (pad.buttons[2] && pad.buttons[2].pressed);
      inp.kick = inp.kick || (pad.buttons[1] && pad.buttons[1].pressed);
      inp.block = inp.block || (pad.buttons[5] && pad.buttons[5].pressed) || (pad.buttons[4] && pad.buttons[4].pressed);
    }
    if (touch && this.touchState) {
      const t = this.touchState;
      for (const k of ['left', 'right', 'up', 'down', 'punch', 'kick', 'block']) inp[k] = inp[k] || t[k];
    }
    return inp;
  }

  // ---------------- AI ----------------
  // Design: the CPU fights in bursts, not walls. After any attack it usually
  // pauses or backs off, it leaves gaps to jump in, and it never pressures wakeup.
  aiInput(me, opp) {
    if (!this.aiState) this.aiState = { t: 0, move: null, dur: 0, qcfPhase: 0 };
    const st = this.aiState;
    const inp = { left: false, right: false, up: false, down: false, punch: false, kick: false, block: false };
    st.t -= this.dtLast;                       // ALWAYS tick - even mid-attack (this froze before = spam walls)
    if (!this.roundActive || !me.canAct()) return inp;
    const lvl = this.aiLevel;
    const dist = Math.abs(opp.x - me.x);
    const dir = opp.x > me.x ? 'right' : 'left';
    const away = opp.x > me.x ? 'left' : 'right';

    if (st.t <= 0) {
      if (opp.state === 'down' || this.now < opp.invulnUntil) {
        st.move = Math.random() < 0.5 ? 'wait' : 'retreat';
        st.t = 350 + Math.random() * 300;
      } else {
        st.t = 380 - lvl * 20 + Math.random() * 300;
        const r = Math.random();
        if (dist > 220) {
          if (r < 0.10 + lvl * 0.03) st.move = 'special1';
          else if (r < 0.82) st.move = 'approach';
          else st.move = 'wait';
        } else if (dist > 90) {
          if (r < 0.07 + lvl * 0.03) st.move = 'special2';
          else if (r < 0.26) st.move = 'jumpin';
          else if (r < 0.72) st.move = 'approach';
          else st.move = 'wait';
        } else {
          const agg = 0.20 + lvl * 0.05;
          if (r < 0.14 && lvl > 0) st.move = 'block';
          else if (r < 0.14 + agg) st.move = Math.random() < 0.5 ? 'punch' : 'kick';
          else if (r < 0.14 + agg + 0.10) st.move = 'lowkick';
          else if (r < 0.14 + agg + 0.34) st.move = 'retreat';
          else st.move = 'wait';
        }
      }
    }

    switch (st.move) {
      case 'wait': break;
      case 'retreat': inp[away] = true; break;
      case 'approach': inp[dir] = true; break;
      case 'jumpin': inp[dir] = true; inp.up = true; break;
      case 'block': inp.block = true; break;
      // ONE attack per decision, then a forced breather - the actual anti-spam
      case 'punch':
        inp.punch = true;
        st.move = 'wait'; st.t = 420 - lvl * 22 + Math.random() * 380;
        break;
      case 'kick':
        inp.kick = true;
        st.move = 'wait'; st.t = 440 - lvl * 22 + Math.random() * 380;
        break;
      case 'lowkick':
        inp.down = true; inp.kick = true;
        st.move = 'wait'; st.t = 460 - lvl * 22 + Math.random() * 380;
        break;
      case 'special1': case 'special2': {
        if (!st.qcfPhase) st.qcfPhase = 1;
        if (st.qcfPhase === 1) { inp.down = true; st.qcfPhase = 2; }
        else if (st.qcfPhase === 2) { inp[dir] = true; st.qcfPhase = 3; }
        else {
          inp[dir] = true;
          if (st.move === 'special1') inp.punch = true; else inp.kick = true;
          st.qcfPhase = 0;
          st.move = 'wait'; st.t = 550 - lvl * 20 + Math.random() * 400;
        }
        break;
      }
    }
    return inp;
  }

  dummyInput() {
    return { left: false, right: false, up: false, down: false, punch: false, kick: false, block: this.dummyBlocks };
  }

  // ---------------- effects ----------------
  sparkAt(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const r = this.add.rectangle(x, y, 4, 4, color).setDepth(6);
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
      this.tweens.add({ targets: r, x: x + Math.cos(a) * sp * 0.4, y: y + Math.sin(a) * sp * 0.4, alpha: 0, duration: 260, onComplete: () => r.destroy() });
    }
  }
  // Early-arcade impact spray: sweat on every clean hit, with a restrained
  // pixel-blood accent that gets slightly larger on launchers and heavy blows.
  impactSprayAt(x, y, dir, heavy) {
    const sprayPixel = (color, size, dx, rise, fall, delay) => {
      const drop = this.add.rectangle(x, y, size, Math.max(2, size - 1), color).setDepth(8).setAngle(Phaser.Math.Between(-35, 35));
      this.tweens.add({
        targets: drop,
        x: x + dx * 0.58,
        y: y - rise,
        duration: 120 + delay,
        ease: 'Quad.easeOut',
        onComplete: () => this.tweens.add({
          targets: drop,
          x: x + dx,
          y: y + fall,
          alpha: 0,
          angle: drop.angle + Phaser.Math.Between(-80, 80),
          duration: 190 + delay,
          ease: 'Quad.easeIn',
          onComplete: () => drop.destroy()
        })
      });
    };

    const sweatCount = heavy ? 7 : 5;
    for (let i = 0; i < sweatCount; i++) {
      const spread = dir * Phaser.Math.Between(30, 88) + Phaser.Math.Between(-15, 15);
      sprayPixel(i % 2 ? 0x7fddff : 0xe8fbff, Phaser.Math.Between(2, 4), spread, Phaser.Math.Between(22, 58), Phaser.Math.Between(10, 30), Phaser.Math.Between(0, 55));
    }

    const bloodCount = heavy ? 6 : 3;
    for (let i = 0; i < bloodCount; i++) {
      const spread = dir * Phaser.Math.Between(24, heavy ? 78 : 54) + Phaser.Math.Between(-10, 10);
      sprayPixel(i % 3 ? 0xb20d1d : 0x650611, Phaser.Math.Between(2, heavy ? 5 : 3), spread, Phaser.Math.Between(16, 46), Phaser.Math.Between(16, 38), Phaser.Math.Between(15, 70));
    }
  }
  boneDustAt(x, y, count, dir) {
    const colors = [0xffffff, 0xf0e7cf, 0xd2c29e, 0x8d816d];
    for (let i = 0; i < count; i++) {
      const color = colors[Phaser.Math.Between(0, colors.length - 1)];
      const w = Phaser.Math.Between(2, 6);
      const h = Phaser.Math.Between(1, 3);
      const chip = this.add.rectangle(x, y, w, h, color, Phaser.Math.FloatBetween(0.65, 1)).setDepth(8).setAngle(Phaser.Math.Between(-90, 90));
      const dx = dir * Phaser.Math.Between(18, 90) + Phaser.Math.Between(-65, 65);
      const rise = Phaser.Math.Between(18, 90);
      this.tweens.add({
        targets: chip,
        x: x + dx * 0.55,
        y: y - rise,
        angle: chip.angle + Phaser.Math.Between(-160, 160),
        duration: Phaser.Math.Between(160, 300),
        ease: 'Quad.easeOut',
        onComplete: () => this.tweens.add({
          targets: chip,
          x: x + dx,
          y: y + Phaser.Math.Between(18, 70),
          alpha: 0,
          duration: Phaser.Math.Between(420, 850),
          ease: 'Quad.easeIn',
          onComplete: () => chip.destroy()
        })
      });
    }
  }
  trailAt(x, y, color) {
    const r = this.add.rectangle(x, y, 40, 60, color, 0.4).setDepth(4);
    this.tweens.add({ targets: r, alpha: 0, scaleX: 1.6, duration: 220, onComplete: () => r.destroy() });
  }
  shockRing(x, y, color) {
    const c = this.add.circle(x, y - 10, 20).setStrokeStyle(5, color).setDepth(5);
    this.tweens.add({ targets: c, radius: 150, alpha: 0, duration: 380, onComplete: () => c.destroy() });
  }
  floatDamage(x, y, n) {
    const t = this.add.text(x, y, String(n), { fontFamily: 'monospace', fontSize: '15px', color: '#ffee66', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(12);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }
  hitPause(ms) { this.pauseT = Math.max(this.pauseT, ms); }

  padStartPressed() {
    const pads = this.input.gamepad ? this.input.gamepad.gamepads : [];
    let down = false;
    for (const p of pads) if (p && p.buttons[9] && p.buttons[9].pressed) down = true;
    const edge = down && !this._padStartPrev;
    this._padStartPrev = down;
    return edge;
  }

  // Visual limb streaks: makes punch vs kick readable while sprites are static.
  // Fighters with real pose art get CLEAN animation - no streaks.
  drawAttackFX(f) {
    if (f.curTexKey && f.curTexKey !== f.cfg.id) return;   // pose art active: no overlay
    const a = f.attack;
    if (!a || (f.state !== 'attack' && f.state !== 'jumpattack')) return;
    const t = f.stateT;
    if (t < a.startup || t > a.startup + a.active) return;
    const prog = (t - a.startup) / a.active;               // 0..1 through active frames
    const ext = Math.sin(prog * Math.PI);                  // extends then retracts
    const g = this.fxG;
    const isKick = a.key === 'kick' || a.key === 'ckick';
    const isLow = !!a.low;
    const isAir = a.key === 'air' || a.key === 'airp';
    const h = f.cfg.height;
    let armY, len, thick;
    if (a.key === 'cpunch') {
      // uppercut: vertical rising streak in front of the fighter
      const fx = f.x + f.facing * (f.w * 0.7 + 10);
      const y0 = f.y - h * 0.25, y1 = f.y - h * (0.5 + 0.65 * ext);
      g.fillStyle(0xffe8a0, 0.6);
      g.fillRect(fx - 4, Math.min(y0, y1), 8, Math.abs(y0 - y1));
      if (ext > 0.6) { g.fillStyle(0xffffff, 0.9); g.fillCircle(fx, y1, 4); }
      return;
    }
    if (isAir) { armY = f.y - h * 0.45; len = a.reach; thick = 9; }
    else if (isKick) { armY = f.y - h * (isLow ? 0.12 : 0.42); len = a.reach + 8; thick = 10; }
    else { armY = f.y - h * (isLow ? 0.38 : 0.7); len = a.reach; thick = 8; }
    const x0 = f.x + f.facing * f.w * 0.5;
    const x1 = x0 + f.facing * len * ext;
    // motion streak (thin - accent, not a balloon)
    g.fillStyle(isKick ? 0xffb060 : 0xffe8a0, 0.55);
    g.fillRect(Math.min(x0, x1), armY - thick / 3, Math.abs(x1 - x0), thick * 0.66);
    // impact tip only at full extension
    if (ext > 0.7) { g.fillStyle(0xffffff, 0.9); g.fillCircle(x1, armY, isKick ? 4 : 3); }
  }

  announceSpecial(f, def) {
    const t = this.add.text(f.x, f.y - f.cfg.height - 18, def.name, { fontFamily: 'monospace', fontSize: '12px', color: '#' + def.color.toString(16).padStart(6, '0'), stroke: '#000', strokeThickness: 3, fontStyle: 'bold' }).setOrigin(0.5).setDepth(12);
    this.tweens.add({ targets: t, y: t.y - 22, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  spawnProjectile(owner, def) {
    const p = this.add.ellipse(owner.x + owner.facing * (owner.w + 16), owner.y - owner.cfg.height * 0.62, 30, 18, def.color).setDepth(5);
    const glow = this.add.ellipse(p.x, p.y, 44, 28, def.color, 0.3).setDepth(4);
    this.projectiles.push({ p, glow, vx: owner.facing * 380, owner, def });
  }

  spawnAssist(owner, def) {
    const img = this.add.image(owner.x - owner.facing * 40, GROUND_Y, owner.cfg.id).setOrigin(0.5, 1).setDepth(3);
    img.setScale(owner.baseScale * 0.95).setFlipX(owner.facing === -1).setTint(0xaaffdd).setAlpha(0.85);
    this.assists.push({ img, vx: owner.facing * 520, owner, def, hit: false, life: 900 });
  }

  // ---------------- round flow ----------------
  startRoundIntro() {
    this.roundActive = false;
    this.p1.health = this.p1.maxHealth; this.p2.health = this.p2.maxHealth;
    this.p1.x = GAME_W * 0.3; this.p2.x = GAME_W * 0.7;
    this.p1.y = this.p2.y = GROUND_Y;
    this.p1.setState('idle'); this.p2.setState('idle');
    this.p1.stun = 0; this.p2.stun = 0;
    this.p1.juggleCount = this.p2.juggleCount = 0;
    this.p1.chainCount = this.p2.chainCount = 0;
    this.p1.comboTaken = this.p2.comboTaken = 0;
    this.timer = 99; this.timerAcc = 0;
    for (const pr of this.projectiles) { pr.p.destroy(); pr.glow.destroy(); }
    this.projectiles = [];
    const rn = Math.min(this.roundNum, 3);
    this.bigText('ROUND ' + this.roundNum, 900);
    playVoice(this, 'ann_round' + rn);
    this.time.delayedCall(1000, () => {
      this.bigText('FIGHT!', 600);
      playVoice(this, 'ann_fight');
      this.ensureFightMusic();
      this.roundActive = true;
    });
  }

  bigText(msg, dur, sub) {
    this.centerText.setText(msg).setAlpha(1);
    this.subText.setText(sub || '').setAlpha(sub ? 1 : 0);
    this.tweens.add({ targets: this.centerText, alpha: 0, delay: dur, duration: 300 });
    if (sub) this.tweens.add({ targets: this.subText, alpha: 0, delay: dur + 600, duration: 400 });
  }

  onKO(loser, winner) {
    if (!this.roundActive && this.mode !== 'training') return;
    if (this.mode === 'training') { loser.health = loser.maxHealth; return; }
    this.roundActive = false;
    loser.setState('ko');
    winner.roundsWon++;
    SFX.ko();
    playVoice(this, 'ann_ko');
    this.slowmo = 0.25;
    this.time.delayedCall(900, () => { this.slowmo = 1; });
    this.bigText('K.O.', 1100);
    this.time.delayedCall(1400, () => this.afterRound(winner, loser));
  }

  timeOut() {
    this.roundActive = false;
    const winner = this.p1.health >= this.p2.health ? this.p1 : this.p2;
    const loser = winner === this.p1 ? this.p2 : this.p1;
    winner.roundsWon++;
    this.bigText('TIME OUT', 1000);
    this.time.delayedCall(1300, () => this.afterRound(winner, loser));
  }

  afterRound(winner, loser) {
    if (winner.roundsWon >= 2 && winner.cfg.id === 'donp') {
      this.startDonPFinisher(winner, loser);
      return;
    }
    if (winner.roundsWon >= 2 && winner.cfg.id === 'liljon') {
      this.startLilJonFinisher(winner, loser);
      return;
    }
    if (winner.roundsWon >= 2 && winner.cfg.id === 'scrappy') {
      this.startScrappyFinisher(winner, loser);
      return;
    }
    if (winner.roundsWon >= 2 && winner.cfg.id === 'bonecrusher') {
      this.startBoneCrusherFinisher(winner, loser);
      return;
    }
    if (winner.roundsWon >= 2 && winner.cfg.id === 'pastortroy') {
      this.startPastorTroyFinisher(winner, loser);
      return;
    }
    if (winner.roundsWon >= 2 && winner.cfg.id === 'princess') {
      this.startPrincessFinisher(winner, loser);
      return;
    }
    if (winner.roundsWon >= 2 && winner.cfg.id === 'diamond') {
      this.startDiamondFinisher(winner, loser);
      return;
    }
    if (winner.roundsWon >= 2 && winner.cfg.id === 'djmontay') {
      this.startDjMontayFinisher(winner, loser);
      return;
    }
    if (winner.roundsWon >= 2 && winner.cfg.id === 'djscream') {
      this.startDjScreamFinisher(winner, loser);
      return;
    }
    winner.setState('win');
    playVoice(this, winner.cfg.id + '_win');
    this.bigText(winner.cfg.name + ' WINS', 1200);
    this.time.delayedCall(1700, () => {
      if (winner.roundsWon >= 2) this.endMatch(winner, loser);
      else { this.roundNum++; this.startRoundIntro(); }
    });
  }

  startDonPFinisher(winner, loser) {
    const facing = loser.x >= winner.x ? 1 : -1;
    winner.facing = facing;
    loser.facing = -facing;
    winner.setState('idle');
    loser.setState('hitstun');
    loser.hitstun = 9999;
    stopMusic(this);

    // Pull the energy out of the arena so the announcement and wind-up can breathe.
    const curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x020207, 0).setDepth(9);
    curtain.setStrokeStyle(3, 0x8d0710, 0.85);
    this.tweens.add({ targets: curtain, alpha: 0.48, duration: 520, ease: 'Sine.easeOut' });
    this.centerText.setColor('#ff2b22').setFontSize(46).setScale(1.08);
    this.bigText('CAREER ENDER', 1850, 'DON P FINISHER');
    this.tweens.add({ targets: this.centerText, scaleX: 1.3, scaleY: 1.3, duration: 280, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.cameras.main.flash(260, 120, 0, 0, false);
    this.cameras.main.zoomTo(1.035, 1450, 'Sine.easeInOut');

    // Give the warning a beat on its own, then let Don P stalk into range.
    const finishX = Phaser.Math.Clamp(loser.x - facing * (winner.w + loser.w - 4), 44, GAME_W - 44);
    this.time.delayedCall(320, () => {
      this.tweens.add({ targets: winner, x: finishX, duration: 1380, ease: 'Sine.easeInOut' });
    });

    // Hold on the pose, then slow the world for the uppercut wind-up.
    this.time.delayedCall(1900, () => {
      this.slowmo = 0.3;
      winner.attack = Object.assign({ key: 'cpunch' }, MOVES.cpunch);
      winner.attackHitDone = true;
      winner.setState('attack');
      SFX.special();
      this.cameras.main.shake(500, 0.003);
      this.cameras.main.zoomTo(1.09, 500, 'Sine.easeInOut');

      this.time.delayedCall(520, () => {
        const hitX = loser.x;
        const hitY = loser.y - loser.cfg.height * 0.7;
        SFX.heavyHit();
        this.cameras.main.shake(520, 0.035);
        this.cameras.main.flash(150, 255, 225, 150, false);
        this.sparkAt(hitX, hitY, 0xffe066, 24);
        this.impactSprayAt(hitX, hitY, facing, true);
        this.impactSprayAt(hitX, hitY - 8, facing, true);
        this.time.delayedCall(110, () => this.impactSprayAt(hitX + facing * 12, hitY - 16, facing, true));

        const groundY = loser.y;
        const flightX = Phaser.Math.Clamp(loser.x + facing * 135, 30, GAME_W - 30);
        const body = this.add.image(loser.x, groundY, loser.cfg.id)
          .setOrigin(0.5, 1)
          .setScale(loser.baseScale)
          .setFlipX(loser.facing === -1)
          .setDepth(7);
        loser.sprite.setVisible(false);
        loser.setState('ko');
        winner.flashUntil = this.now + 150;
        this.hitPause(190);

        // Launch the defeated fighter beyond the camera, then bring the body
        // back down for a heavy landing that remains visible.
        this.tweens.add({
          targets: body,
          x: flightX,
          y: -210,
          angle: facing * 110,
          duration: 1350,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: body,
              x: Phaser.Math.Clamp(flightX + facing * 38, 42, GAME_W - 42),
              y: groundY + 7,
              angle: -facing * 88,
              duration: 1050,
              ease: 'Cubic.easeIn',
              onComplete: () => {
                SFX.heavyHit();
                this.cameras.main.shake(460, 0.027);
                this.sparkAt(body.x, groundY - 6, 0x9b8062, 18);
                this.boneDustAt(body.x, groundY - 4, 18, -facing);
              }
            });
          }
        });

        this.time.delayedCall(680, () => {
          winner.attack = null;
          winner.setState('win');
          playVoice(this, 'donp_win');
        });

        // Hold on the landed body before returning to the match result.
        this.time.delayedCall(3000, () => {
          this.slowmo = 1;
          this.cameras.main.zoomTo(1, 320, 'Sine.easeInOut');
          this.centerText.setColor('#ffcc22').setFontSize(38).setScale(1);
          this.tweens.add({ targets: curtain, alpha: 0, duration: 280, onComplete: () => curtain.destroy() });
          this.endMatch(winner, loser);
        });
      });
    });
  }

  startLilJonFinisher(winner, loser) {
    const facing = loser.x >= winner.x ? 1 : -1;
    winner.facing = facing;
    loser.facing = -facing;
    winner.setState('idle');
    loser.setState('hitstun');
    loser.hitstun = 9999;
    stopMusic(this);

    const curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x02040a, 0).setDepth(5);
    curtain.setStrokeStyle(3, 0x168dcc, 0.9);
    this.tweens.add({ targets: curtain, alpha: 0.5, duration: 520, ease: 'Sine.easeOut' });
    this.centerText.setColor('#ff2b22').setFontSize(46).setScale(1.08);
    this.bigText('CAREER ENDER', 1700, 'LIL JON FINISHER');
    this.tweens.add({ targets: this.centerText, scaleX: 1.28, scaleY: 1.28, duration: 270, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.cameras.main.flash(240, 80, 0, 0, false);
    this.cameras.main.zoomTo(1.055, 1400, 'Sine.easeInOut');

    this.time.delayedCall(1750, () => {
      this.slowmo = 0.32;
      winner.special = winner.cfg.special1;
      winner.specialSlot = 1;
      winner.specialDone = true;
      winner.setState('special');
      playVoice(this, 'liljon_win', 1.15);

      const screamX = winner.x + facing * winner.w * 0.75;
      const screamY = winner.y - winner.cfg.height * 0.78;
      this.shockRing(screamX, screamY, 0xffffff);
      this.time.delayedCall(150, () => this.shockRing(screamX + facing * 8, screamY, 0x33ddff));
      this.time.delayedCall(300, () => this.shockRing(screamX + facing * 14, screamY, 0xff3344));
      this.cameras.main.shake(760, 0.009);

      this.time.delayedCall(620, () => {
        const textureKey = loser.cfg.id;
        const source = this.textures.get(textureKey).getSourceImage();
        const cutY = Math.floor(source.height * 0.27);
        const flip = loser.facing === -1;
        const body = this.add.image(loser.x, loser.y, textureKey).setOrigin(0.5, 1).setScale(loser.baseScale).setFlipX(flip).setDepth(6);
        const head = this.add.image(loser.x, loser.y, textureKey).setOrigin(0.5, 1).setScale(loser.baseScale).setFlipX(flip).setDepth(8);
        body.setCrop(0, cutY, source.width, source.height - cutY);
        head.setCrop(0, 0, source.width, cutY);
        loser.sprite.setVisible(false);
        loser.setState('ko');

        const neckY = loser.y - loser.cfg.height * 0.74;
        SFX.heavyHit();
        this.cameras.main.flash(130, 255, 245, 220, false);
        this.cameras.main.shake(520, 0.032);
        this.sparkAt(loser.x, neckY, 0x55ddff, 18);
        this.impactSprayAt(loser.x, neckY, facing, true);
        this.impactSprayAt(loser.x, neckY - 5, facing, true);
        this.hitPause(210);

        this.tweens.add({
          targets: head,
          x: Phaser.Math.Clamp(loser.x + facing * 165, 24, GAME_W - 24),
          y: loser.y - 235,
          angle: facing * 760,
          duration: 1450,
          ease: 'Cubic.easeOut'
        });
        this.time.delayedCall(260, () => {
          this.tweens.add({ targets: body, angle: -facing * 82, y: body.y + 10, duration: 620, ease: 'Bounce.easeOut' });
        });

        this.time.delayedCall(950, () => {
          winner.special = null;
          winner.setState('win');
        });

        this.time.delayedCall(2100, () => {
          this.slowmo = 1;
          this.cameras.main.zoomTo(1, 320, 'Sine.easeInOut');
          this.centerText.setColor('#ffcc22').setFontSize(38).setScale(1);
          this.tweens.add({ targets: curtain, alpha: 0, duration: 280, onComplete: () => curtain.destroy() });
          this.endMatch(winner, loser);
        });
      });
    });
  }

  startScrappyFinisher(winner, loser) {
    const facing = loser.x >= winner.x ? 1 : -1;
    winner.facing = facing;
    loser.facing = -facing;
    winner.setState('idle');
    loser.setState('hitstun');
    loser.hitstun = 9999;
    stopMusic(this);

    const curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x080202, 0).setDepth(5);
    curtain.setStrokeStyle(3, 0xff6a22, 0.9);
    this.tweens.add({ targets: curtain, alpha: 0.46, duration: 480, ease: 'Sine.easeOut' });
    this.centerText.setColor('#ff3a24').setFontSize(46).setScale(1.08);
    this.bigText('CAREER ENDER', 1550, 'LIL SCRAPPY · HEAD BUSSA');
    this.tweens.add({ targets: this.centerText, scaleX: 1.28, scaleY: 1.28, duration: 250, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.cameras.main.flash(220, 120, 15, 0, false);
    this.cameras.main.zoomTo(1.06, 1250, 'Sine.easeInOut');

    const finishX = Phaser.Math.Clamp(loser.x - facing * (winner.w + loser.w - 18), 40, GAME_W - 40);
    this.time.delayedCall(360, () => {
      this.tweens.add({ targets: winner, x: finishX, duration: 1180, ease: 'Sine.easeInOut' });
    });

    this.time.delayedCall(1650, () => {
      this.slowmo = 0.5;
      playVoice(this, 'scrappy_s1', 1.1);

      const faceX = () => loser.x;
      const faceY = () => loser.y - loser.cfg.height * 0.78;
      const punch = (finalHit) => {
        winner.attack = Object.assign({ key: 'punch' }, MOVES.punch);
        winner.attackHitDone = true;
        winner.setState('attack');
        winner.flashUntil = this.now + 90;
        if (!finalHit) {
          SFX.hit();
          this.cameras.main.shake(180, 0.012);
          this.sparkAt(faceX(), faceY(), 0xffd060, 10);
          this.impactSprayAt(faceX(), faceY(), facing, false);
          loser.flashUntil = this.now + 100;
          this.hitPause(85);
          this.tweens.add({ targets: loser, x: Phaser.Math.Clamp(loser.x + facing * 7, 30, GAME_W - 30), duration: 130, yoyo: true, ease: 'Power2' });
        }
      };

      punch(false);
      this.time.delayedCall(430, () => punch(false));
      this.time.delayedCall(900, () => {
        punch(true);
        const textureKey = loser.cfg.id;
        const source = this.textures.get(textureKey).getSourceImage();
        const cutY = Math.floor(source.height * 0.28);
        const flip = loser.facing === -1;
        const body = this.add.image(loser.x, loser.y, textureKey).setOrigin(0.5, 1).setScale(loser.baseScale).setFlipX(flip).setDepth(6);
        body.setCrop(0, cutY, source.width, source.height - cutY);
        loser.sprite.setVisible(false);
        loser.setState('ko');

        const fragmentCols = 3;
        const fragmentRows = 2;
        const pieceW = Math.ceil(source.width / fragmentCols);
        const pieceH = Math.ceil(cutY / fragmentRows);
        for (let row = 0; row < fragmentRows; row++) {
          for (let col = 0; col < fragmentCols; col++) {
            const piece = this.add.image(loser.x, loser.y, textureKey).setOrigin(0.5, 1).setScale(loser.baseScale).setFlipX(flip).setDepth(8);
            piece.setCrop(col * pieceW, row * pieceH, Math.min(pieceW, source.width - col * pieceW), Math.min(pieceH, cutY - row * pieceH));
            const burstX = facing * Phaser.Math.Between(55, 155) + Phaser.Math.Between(-95, 95);
            this.tweens.add({
              targets: piece,
              x: Phaser.Math.Clamp(loser.x + burstX, 18, GAME_W - 18),
              y: loser.y - Phaser.Math.Between(115, 255),
              angle: Phaser.Math.Between(-760, 760),
              alpha: 0,
              delay: Phaser.Math.Between(0, 100),
              duration: Phaser.Math.Between(1150, 1650),
              ease: 'Cubic.easeOut',
              onComplete: () => piece.destroy()
            });
          }
        }

        SFX.heavyHit();
        this.cameras.main.flash(170, 255, 215, 155, false);
        this.cameras.main.shake(620, 0.043);
        this.sparkAt(faceX(), faceY(), 0xffbb33, 28);
        this.impactSprayAt(faceX(), faceY(), facing, true);
        this.impactSprayAt(faceX(), faceY() - 8, facing, true);
        this.time.delayedCall(120, () => this.impactSprayAt(faceX() + facing * 14, faceY() - 12, facing, true));
        this.hitPause(230);

        this.time.delayedCall(260, () => {
          this.tweens.add({ targets: body, angle: -facing * 84, y: body.y + 10, duration: 700, ease: 'Bounce.easeOut' });
        });
        this.time.delayedCall(820, () => {
          winner.attack = null;
          winner.setState('win');
          playVoice(this, 'scrappy_win');
        });
        this.time.delayedCall(2050, () => {
          this.slowmo = 1;
          this.cameras.main.zoomTo(1, 320, 'Sine.easeInOut');
          this.centerText.setColor('#ffcc22').setFontSize(38).setScale(1);
          this.tweens.add({ targets: curtain, alpha: 0, duration: 280, onComplete: () => curtain.destroy() });
          this.endMatch(winner, loser);
        });
      });
    });
  }

  startBoneCrusherFinisher(winner, loser) {
    const facing = loser.x >= winner.x ? 1 : -1;
    winner.facing = facing;
    loser.facing = -facing;
    winner.setState('idle');
    loser.setState('hitstun');
    loser.hitstun = 9999;
    stopMusic(this);

    const curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x070503, 0).setDepth(5);
    curtain.setStrokeStyle(4, 0xc77824, 0.9);
    this.tweens.add({ targets: curtain, alpha: 0.5, duration: 560, ease: 'Sine.easeOut' });
    this.centerText.setColor('#ff9b32').setFontSize(46).setScale(1.08);
    this.bigText('CAREER ENDER', 1750, 'BONE CRUSHER · SEISMIC CRUSH');
    this.tweens.add({ targets: this.centerText, scaleX: 1.3, scaleY: 1.3, duration: 290, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.cameras.main.flash(260, 120, 70, 15, false);
    this.cameras.main.zoomTo(1.06, 1450, 'Sine.easeInOut');

    const finishX = Phaser.Math.Clamp(loser.x - facing * (winner.w * 0.5 + loser.w * 0.35), 48, GAME_W - 48);
    this.time.delayedCall(340, () => {
      this.tweens.add({ targets: winner, x: finishX, duration: 1320, ease: 'Sine.easeInOut' });
    });

    this.time.delayedCall(1800, () => {
      this.slowmo = 0.42;
      playVoice(this, 'bonecrusher_s2', 1.08);
      SFX.special();

      const gripKey = this.textures.exists('bonecrusher_special2') ? 'bonecrusher_special2' : 'bonecrusher_punch';
      const grip = this.add.image(winner.x, winner.y, gripKey).setOrigin(0.5, 1).setScale(winner.baseScale).setFlipX(facing === -1).setDepth(7);
      winner.sprite.setVisible(false);
      const victim = this.add.image(loser.x, loser.y, loser.cfg.id).setOrigin(0.5, 1).setScale(loser.baseScale).setFlipX(loser.facing === -1).setDepth(6);
      loser.sprite.setVisible(false);
      loser.setState('ko');

      const holdX = Phaser.Math.Clamp(winner.x + facing * (winner.w * 0.4), 34, GAME_W - 34);
      this.tweens.add({ targets: victim, x: holdX, y: winner.y - 5, angle: -facing * 5, duration: 460, ease: 'Back.easeIn' });
      this.tweens.add({ targets: grip, scaleX: winner.baseScale * 1.06, scaleY: winner.baseScale * 1.03, duration: 230, yoyo: true, repeat: 1, ease: 'Power2' });
      this.cameras.main.shake(420, 0.008);

      const crunches = [0, 380, 800, 1260];
      crunches.forEach((delay, index) => {
        this.time.delayedCall(520 + delay, () => {
          const power = index + 1;
          const targetScaleX = loser.baseScale * Math.max(0.3, 0.9 - power * 0.14);
          const targetScaleY = loser.baseScale * Math.max(0.28, 0.98 - power * 0.17);
          SFX.heavyHit();
          this.cameras.main.shake(180 + power * 70, 0.01 + power * 0.005);
          this.cameras.main.flash(55 + power * 15, 235, 225, 190, false);
          this.sparkAt(victim.x, victim.y - loser.cfg.height * targetScaleY / loser.baseScale * 0.58, 0xf1e5bf, 7 + power * 3);
          this.boneDustAt(victim.x, victim.y - loser.cfg.height * 0.5, 5 + power * 3, facing);
          this.hitPause(70 + power * 25);
          this.tweens.add({
            targets: victim,
            scaleX: targetScaleX,
            scaleY: targetScaleY,
            y: winner.y + power * 4,
            angle: facing * (power % 2 ? 7 : -7),
            duration: 210,
            ease: 'Back.easeIn'
          });
          this.tweens.add({ targets: grip, scaleX: winner.baseScale * (1.05 + power * 0.025), scaleY: winner.baseScale * 0.97, duration: 120, yoyo: true, ease: 'Power2' });
        });
      });

      this.time.delayedCall(2260, () => {
        const dustY = victim.y - loser.cfg.height * 0.22;
        SFX.ko();
        this.cameras.main.flash(190, 255, 240, 195, false);
        this.cameras.main.shake(760, 0.052);
        this.shockRing(victim.x, dustY, 0xd8c59d);
        this.boneDustAt(victim.x, dustY, 46, facing);
        this.sparkAt(victim.x, dustY, 0xffffff, 26);
        this.hitPause(260);
        this.tweens.add({ targets: victim, scaleX: 0.03, scaleY: 0.03, alpha: 0, y: winner.y + 16, duration: 260, ease: 'Back.easeIn', onComplete: () => victim.destroy() });

        this.time.delayedCall(720, () => {
          grip.destroy();
          winner.sprite.setVisible(true);
          winner.setState('win');
          playVoice(this, 'bonecrusher_win');
        });

        this.time.delayedCall(2100, () => {
          this.slowmo = 1;
          this.cameras.main.zoomTo(1, 340, 'Sine.easeInOut');
          this.centerText.setColor('#ffcc22').setFontSize(38).setScale(1);
          this.tweens.add({ targets: curtain, alpha: 0, duration: 300, onComplete: () => curtain.destroy() });
          this.endMatch(winner, loser);
        });
      });
    });
  }

  startPastorTroyFinisher(winner, loser) {
    const facing = loser.x >= winner.x ? 1 : -1;
    winner.facing = facing;
    loser.facing = -facing;
    winner.setState('idle');
    loser.setState('hitstun');
    loser.hitstun = 9999;
    stopMusic(this);

    const curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x080200, 0).setDepth(5);
    curtain.setStrokeStyle(4, 0xd54a12, 0.92);
    this.tweens.add({ targets: curtain, alpha: 0.5, duration: 560, ease: 'Sine.easeOut' });
    this.centerText.setColor('#ff4b20').setFontSize(46).setScale(1.08);
    this.bigText('CAREER ENDER', 1800, 'PASTOR TROY · CONGREGATION KICK');
    this.tweens.add({ targets: this.centerText, scaleX: 1.3, scaleY: 1.3, duration: 280, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.cameras.main.flash(250, 130, 30, 0, false);
    this.cameras.main.zoomTo(1.06, 1450, 'Sine.easeInOut');

    const finishX = Phaser.Math.Clamp(loser.x - facing * (winner.w + loser.w - 16), 42, GAME_W - 42);
    this.time.delayedCall(380, () => {
      this.tweens.add({ targets: winner, x: finishX, duration: 1260, ease: 'Sine.easeInOut' });
    });

    // Let the announcement land, then hold the raised-leg silhouette before impact.
    this.time.delayedCall(1850, () => {
      this.slowmo = 0.34;
      winner.attack = Object.assign({ key: 'kick' }, MOVES.kick);
      winner.attackHitDone = true;
      winner.setState('attack');
      playVoice(this, 'pastortroy_s2', 1.12);
      SFX.special();
      this.cameras.main.shake(540, 0.006);
      this.cameras.main.zoomTo(1.11, 520, 'Sine.easeInOut');

      this.time.delayedCall(620, () => {
        const victimImage = this.add.image(0, 0, loser.cfg.id)
          .setOrigin(0.5, 1)
          .setScale(loser.baseScale)
          .setFlipX(loser.facing === -1);
        const stomachY = -loser.cfg.height * 0.5;
        const woundRim = this.add.ellipse(0, stomachY, 30, 21, 0x7f0710, 1).setStrokeStyle(3, 0xe12a18, 1);
        const wound = this.add.ellipse(facing * 2, stomachY, 21, 15, 0x050000, 1).setStrokeStyle(2, 0x340005, 1);
        const woundCuts = [
          this.add.rectangle(-13, stomachY - 7, 9, 3, 0xb20d18).setAngle(-25),
          this.add.rectangle(12, stomachY - 6, 8, 3, 0xd3311d).setAngle(28),
          this.add.rectangle(-12, stomachY + 7, 7, 3, 0x7b0610).setAngle(20),
          this.add.rectangle(11, stomachY + 7, 8, 3, 0xa70b14).setAngle(-24)
        ];
        const victim = this.add.container(loser.x, loser.y, [victimImage, woundRim, wound, ...woundCuts]).setDepth(7);
        loser.sprite.setVisible(false);
        loser.setState('ko');

        const hitX = victim.x;
        const hitY = victim.y + stomachY;
        const kickStreak = this.add.rectangle(hitX - facing * 28, hitY, 74, 8, 0xffb52b, 0.9)
          .setDepth(8).setAngle(facing * -4);
        SFX.heavyHit();
        this.cameras.main.flash(180, 255, 190, 90, false);
        this.cameras.main.shake(720, 0.048);
        this.sparkAt(hitX, hitY, 0xffc13b, 30);
        this.impactSprayAt(hitX, hitY, facing, true);
        this.impactSprayAt(hitX + facing * 5, hitY + 5, facing, true);
        this.time.delayedCall(120, () => this.impactSprayAt(hitX + facing * 15, hitY, facing, true));
        this.hitPause(250);
        this.tweens.add({ targets: kickStreak, x: hitX + facing * 42, scaleX: 1.4, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => kickStreak.destroy() });
        this.tweens.add({ targets: [woundRim, wound], scaleX: 1.35, scaleY: 1.35, duration: 150, yoyo: true, repeat: 1, ease: 'Back.easeOut' });

        // The victim hangs on the boot for a beat, then folds and sails away.
        this.time.delayedCall(280, () => {
          this.tweens.add({
            targets: victim,
            x: Phaser.Math.Clamp(victim.x + facing * 145, 24, GAME_W - 24),
            y: victim.y + 14,
            angle: -facing * 78,
            duration: 980,
            ease: 'Cubic.easeOut'
          });
        });

        this.time.delayedCall(880, () => {
          winner.attack = null;
          winner.setState('win');
          playVoice(this, 'pastortroy_win');
        });

        this.time.delayedCall(2200, () => {
          this.slowmo = 1;
          this.cameras.main.zoomTo(1, 340, 'Sine.easeInOut');
          this.centerText.setColor('#ffcc22').setFontSize(38).setScale(1);
          this.tweens.add({ targets: curtain, alpha: 0, duration: 300, onComplete: () => curtain.destroy() });
          this.endMatch(winner, loser);
        });
      });
    });
  }

  startPrincessFinisher(winner, loser) {
    const facing = loser.x >= winner.x ? 1 : -1;
    winner.facing = facing;
    loser.facing = -facing;
    winner.setState('idle');
    loser.setState('hitstun');
    loser.hitstun = 9999;
    stopMusic(this);

    const curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x090104, 0).setDepth(5);
    curtain.setStrokeStyle(4, 0xff6a18, 0.95);
    this.tweens.add({ targets: curtain, alpha: 0.5, duration: 560, ease: 'Sine.easeOut' });
    this.centerText.setColor('#ff6724').setFontSize(46).setScale(1.08);
    this.bigText('CAREER ENDER', 1800, 'PRINCESS · CROWN FIRE');
    this.tweens.add({ targets: this.centerText, scaleX: 1.3, scaleY: 1.3, duration: 280, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.cameras.main.flash(250, 140, 20, 50, false);
    this.cameras.main.zoomTo(1.055, 1400, 'Sine.easeInOut');

    this.time.delayedCall(1800, () => {
      this.slowmo = 0.38;
      winner.special = winner.cfg.special1;
      winner.specialSlot = 1;
      winner.specialDone = true;
      winner.setState('special');
      playVoice(this, 'princess_s1', 1.12);
      SFX.special();

      const handX = winner.x + facing * winner.w * 0.55;
      const handY = winner.y - winner.cfg.height * 0.64;
      const fireball = this.add.circle(handX, handY, 11, 0xff4a0a, 1).setStrokeStyle(5, 0xffd22e, 1).setDepth(9);
      const core = this.add.circle(handX, handY, 5, 0xffffd0, 1).setDepth(10);
      this.tweens.add({ targets: [fireball, core], scaleX: 1.7, scaleY: 1.7, duration: 380, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
      this.cameras.main.shake(520, 0.006);

      this.time.delayedCall(520, () => {
        const targetX = loser.x;
        const targetY = loser.y - loser.cfg.height * 0.56;
        this.tweens.add({ targets: [fireball, core], x: targetX, y: targetY, duration: 430, ease: 'Cubic.easeIn' });

        for (let i = 0; i < 12; i++) {
          this.time.delayedCall(i * 34, () => {
            const ember = this.add.rectangle(
              Phaser.Math.Linear(handX, targetX, i / 12),
              Phaser.Math.Linear(handY, targetY, i / 12) + Phaser.Math.Between(-7, 7),
              Phaser.Math.Between(3, 7), Phaser.Math.Between(3, 7),
              i % 2 ? 0xff3b08 : 0xffc21a, 0.9
            ).setDepth(8);
            this.tweens.add({ targets: ember, y: ember.y - Phaser.Math.Between(8, 22), alpha: 0, duration: 320, onComplete: () => ember.destroy() });
          });
        }

        this.time.delayedCall(430, () => {
          fireball.destroy();
          core.destroy();
          SFX.heavyHit();
          this.cameras.main.flash(210, 255, 145, 30, false);
          this.cameras.main.shake(820, 0.045);
          this.shockRing(targetX, targetY, 0xff7b16);
          this.sparkAt(targetX, targetY, 0xffd12c, 34);
          this.hitPause(230);

          const burning = this.add.image(loser.x, loser.y, loser.cfg.id)
            .setOrigin(0.5, 1)
            .setScale(loser.baseScale)
            .setFlipX(loser.facing === -1)
            .setTint(0xff4a08)
            .setDepth(7);
          loser.sprite.setVisible(false);
          loser.setState('ko');

          const flameBurst = (wave) => {
            if (!burning.active) return;
            for (let i = 0; i < 11; i++) {
              const flameX = burning.x + Phaser.Math.Between(-Math.floor(loser.w * 0.42), Math.floor(loser.w * 0.42));
              const flameY = burning.y - Phaser.Math.Between(12, Math.floor(loser.cfg.height * 0.8));
              const flame = this.add.circle(flameX, flameY, Phaser.Math.Between(3, 8), wave % 2 ? 0xffd21a : 0xff3b08, 0.95).setDepth(9);
              this.tweens.add({
                targets: flame,
                x: flame.x + Phaser.Math.Between(-12, 12),
                y: flame.y - Phaser.Math.Between(24, 62),
                scaleX: 0.25,
                alpha: 0,
                duration: Phaser.Math.Between(330, 590),
                ease: 'Quad.easeOut',
                onComplete: () => flame.destroy()
              });
            }
            this.sparkAt(burning.x, burning.y - loser.cfg.height * 0.5, wave % 2 ? 0xff7a0a : 0xffdc35, 8);
          };

          for (let wave = 0; wave < 8; wave++) {
            this.time.delayedCall(wave * 230, () => flameBurst(wave));
          }
          this.tweens.add({ targets: burning, tint: 0x120a08, duration: 900, yoyo: true, repeat: 1 });
          this.tweens.add({ targets: burning, scaleX: loser.baseScale * 0.9, duration: 90, yoyo: true, repeat: 10 });

          this.time.delayedCall(1750, () => {
            SFX.ko();
            this.cameras.main.shake(520, 0.028);
            const ashY = loser.y - 4;
            const ashColors = [0x141111, 0x26201e, 0x3b302b, 0x5a4538];
            const ashPile = this.add.ellipse(loser.x, ashY, Math.max(48, loser.w * 0.9), 17, 0x211a18, 1).setDepth(7);
            ashPile.setStrokeStyle(3, 0x090707, 0.9);
            for (let i = 0; i < 30; i++) {
              const ash = this.add.rectangle(
                loser.x + Phaser.Math.Between(-Math.floor(loser.w * 0.42), Math.floor(loser.w * 0.42)),
                loser.y - Phaser.Math.Between(8, Math.floor(loser.cfg.height * 0.92)),
                Phaser.Math.Between(2, 6), Phaser.Math.Between(2, 5),
                ashColors[Phaser.Math.Between(0, ashColors.length - 1)], 0.95
              ).setDepth(8).setAngle(Phaser.Math.Between(-90, 90));
              this.tweens.add({
                targets: ash,
                x: loser.x + Phaser.Math.Between(-Math.floor(loser.w * 0.45), Math.floor(loser.w * 0.45)),
                y: ashY - Phaser.Math.Between(1, 8),
                angle: ash.angle + Phaser.Math.Between(-180, 180),
                duration: Phaser.Math.Between(500, 1050),
                ease: 'Quad.easeIn'
              });
            }
            this.tweens.add({ targets: burning, y: ashY, scaleX: loser.baseScale * 0.3, scaleY: 0.03, alpha: 0, duration: 520, ease: 'Back.easeIn', onComplete: () => burning.destroy() });

            this.time.delayedCall(650, () => {
              winner.special = null;
              winner.setState('win');
              playVoice(this, 'princess_win');
            });

            this.time.delayedCall(2050, () => {
              this.slowmo = 1;
              this.cameras.main.zoomTo(1, 340, 'Sine.easeInOut');
              this.centerText.setColor('#ffcc22').setFontSize(38).setScale(1);
              this.tweens.add({ targets: curtain, alpha: 0, duration: 300, onComplete: () => curtain.destroy() });
              this.endMatch(winner, loser);
            });
          });
        });
      });
    });
  }

  startDiamondFinisher(winner, loser) {
    const facing = loser.x >= winner.x ? 1 : -1;
    winner.facing = facing;
    loser.facing = -facing;
    winner.setState('idle');
    loser.setState('hitstun');
    loser.hitstun = 9999;
    stopMusic(this);

    const curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x080106, 0).setDepth(5);
    curtain.setStrokeStyle(4, 0xff3f9f, 0.95);
    this.tweens.add({ targets: curtain, alpha: 0.5, duration: 560, ease: 'Sine.easeOut' });
    this.centerText.setColor('#ff4fae').setFontSize(46).setScale(1.08);
    this.bigText('CAREER ENDER', 1800, 'DIAMOND · HEART OF ICE');
    this.tweens.add({ targets: this.centerText, scaleX: 1.3, scaleY: 1.3, duration: 280, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.cameras.main.flash(250, 145, 20, 85, false);
    this.cameras.main.zoomTo(1.06, 1400, 'Sine.easeInOut');

    const finishX = Phaser.Math.Clamp(loser.x - facing * (winner.w * 0.52 + loser.w * 0.35), 42, GAME_W - 42);
    this.time.delayedCall(360, () => {
      this.tweens.add({ targets: winner, x: finishX, duration: 1300, ease: 'Sine.easeInOut' });
    });

    this.time.delayedCall(1850, () => {
      this.slowmo = 0.34;
      winner.special = winner.cfg.special1;
      winner.specialSlot = 1;
      winner.specialDone = true;
      winner.setState('special');
      playVoice(this, 'diamond_s1', 1.12);
      SFX.special();
      this.cameras.main.shake(560, 0.007);
      this.cameras.main.zoomTo(1.115, 520, 'Sine.easeInOut');

      this.time.delayedCall(620, () => {
        const body = this.add.image(loser.x, loser.y, loser.cfg.id)
          .setOrigin(0.5, 1)
          .setScale(loser.baseScale)
          .setFlipX(loser.facing === -1)
          .setDepth(7);
        loser.sprite.setVisible(false);
        loser.setState('ko');

        const chestX = loser.x;
        const chestY = loser.y - loser.cfg.height * 0.67;
        const chestWound = this.add.circle(chestX, chestY, 11, 0x080003, 1).setStrokeStyle(4, 0x8a061d, 1).setDepth(8);
        const heartLeft = this.add.circle(-6, -3, 8, 0xb40726, 1).setStrokeStyle(2, 0xff345d, 1);
        const heartRight = this.add.circle(6, -3, 8, 0xb40726, 1).setStrokeStyle(2, 0xff345d, 1);
        const heartPoint = this.add.triangle(0, 3, -13, -3, 13, -3, 0, 17, 0xa90622, 1).setStrokeStyle(2, 0xff345d, 1);
        const heartGlow = this.add.circle(0, 0, 16, 0xff174d, 0.16).setStrokeStyle(2, 0xff78a6, 0.65);
        const heart = this.add.container(chestX, chestY, [heartGlow, heartPoint, heartLeft, heartRight]).setDepth(10).setScale(0.7);

        SFX.heavyHit();
        this.cameras.main.flash(180, 255, 195, 225, false);
        this.cameras.main.shake(720, 0.044);
        this.sparkAt(chestX, chestY, 0xff4d91, 28);
        this.impactSprayAt(chestX, chestY, -facing, true);
        this.hitPause(250);

        const raisedX = winner.x + facing * 8;
        const raisedY = winner.y - winner.cfg.height - 32;
        this.time.delayedCall(220, () => {
          this.tweens.add({
            targets: heart,
            x: raisedX,
            y: raisedY,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 920,
            ease: 'Back.easeOut'
          });
          this.tweens.add({ targets: heart, angle: facing * 8, duration: 220, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
        });

        for (let i = 0; i < 9; i++) {
          this.time.delayedCall(160 + i * 105, () => {
            const drop = this.add.circle(
              Phaser.Math.Linear(chestX, raisedX, Math.min(1, i / 7)),
              Phaser.Math.Linear(chestY, raisedY, Math.min(1, i / 7)),
              Phaser.Math.Between(2, 4), i % 2 ? 0x7b0317 : 0xca092b, 0.95
            ).setDepth(9);
            this.tweens.add({ targets: drop, y: drop.y + Phaser.Math.Between(20, 48), alpha: 0, duration: 520, ease: 'Quad.easeIn', onComplete: () => drop.destroy() });
          });
        }

        this.time.delayedCall(520, () => {
          this.tweens.add({ targets: body, angle: -facing * 82, y: body.y + 12, duration: 820, ease: 'Bounce.easeOut' });
          this.tweens.add({ targets: chestWound, x: chestWound.x - facing * 9, y: chestWound.y + loser.cfg.height * 0.3, angle: -facing * 82, duration: 820, ease: 'Bounce.easeOut' });
        });

        this.time.delayedCall(1180, () => {
          winner.special = null;
          winner.setState('win');
          playVoice(this, 'diamond_win');
          this.cameras.main.flash(130, 255, 60, 150, false);
          this.tweens.add({ targets: heart, scaleX: 1.25, scaleY: 1.25, duration: 170, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        });

        // Leave both the defeated fighter and raised heart visible during the result screen.
        this.time.delayedCall(2550, () => {
          this.slowmo = 1;
          this.cameras.main.zoomTo(1, 340, 'Sine.easeInOut');
          this.centerText.setColor('#ffcc22').setFontSize(38).setScale(1);
          this.tweens.add({ targets: curtain, alpha: 0, duration: 300, onComplete: () => curtain.destroy() });
          this.endMatch(winner, loser);
        });
      });
    });
  }

  startDjMontayFinisher(winner, loser) {
    const facing = loser.x >= winner.x ? 1 : -1;
    winner.facing = facing;
    loser.facing = -facing;
    winner.setState('idle');
    loser.setState('hitstun');
    loser.hitstun = 9999;
    stopMusic(this);

    const curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x01040a, 0).setDepth(5);
    curtain.setStrokeStyle(4, 0x2f8dff, 0.95);
    this.tweens.add({ targets: curtain, alpha: 0.52, duration: 560, ease: 'Sine.easeOut' });
    this.centerText.setColor('#45a6ff').setFontSize(46).setScale(1.08);
    this.bigText('CAREER ENDER', 1800, 'DJ MONTAY · SCREEN DROP');
    this.tweens.add({ targets: this.centerText, scaleX: 1.3, scaleY: 1.3, duration: 280, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.cameras.main.flash(250, 20, 75, 150, false);
    this.cameras.main.zoomTo(1.055, 1400, 'Sine.easeInOut');

    const finishX = Phaser.Math.Clamp(loser.x - facing * (winner.w * 0.45 + loser.w * 0.32), 45, GAME_W - 45);
    this.time.delayedCall(360, () => {
      this.tweens.add({ targets: winner, x: finishX, duration: 1250, ease: 'Sine.easeInOut' });
    });

    this.time.delayedCall(1800, () => {
      this.slowmo = 0.38;
      winner.special = winner.cfg.special2;
      winner.specialSlot = 2;
      winner.specialDone = true;
      winner.setState('special');
      playVoice(this, 'djmontay_s2', 1.12);
      SFX.special();

      const victim = this.add.image(loser.x, loser.y, loser.cfg.id)
        .setOrigin(0.5, 1)
        .setScale(loser.baseScale)
        .setFlipX(loser.facing === -1)
        .setDepth(8);
      loser.sprite.setVisible(false);
      loser.setState('ko');

      const holdX = winner.x;
      const holdY = winner.y - winner.cfg.height - 26;
      this.tweens.add({ targets: victim, x: holdX, y: holdY, angle: facing * 6, duration: 650, ease: 'Back.easeOut' });
      this.cameras.main.shake(620, 0.009);
      this.time.delayedCall(380, () => {
        this.sparkAt(holdX, holdY + loser.cfg.height * 0.45, 0x5cb6ff, 14);
      });

      this.time.delayedCall(900, () => {
        const impactX = GAME_W / 2;
        const impactY = GAME_H * 0.73;
        this.cameras.main.zoomTo(1, 210, 'Cubic.easeIn');
        this.tweens.add({
          targets: victim,
          x: impactX,
          y: impactY,
          scaleX: loser.baseScale * 2.35,
          scaleY: loser.baseScale * 2.35,
          angle: -facing * 4,
          duration: 430,
          ease: 'Cubic.easeIn'
        });

        this.time.delayedCall(430, () => {
          SFX.heavyHit();
          this.cameras.main.flash(220, 225, 245, 255, false);
          this.cameras.main.shake(900, 0.058);
          this.sparkAt(impactX, GAME_H * 0.45, 0xd8f2ff, 42);
          this.hitPause(280);

          // Draw the impact cracks over the whole arena and keep them through the result screen.
          const cracks = this.add.graphics().setDepth(30);
          const crackX = impactX;
          const crackY = GAME_H * 0.43;
          cracks.lineStyle(3, 0xe9f8ff, 0.94);
          for (let ray = 0; ray < 13; ray++) {
            const angle = (Math.PI * 2 * ray / 13) + (ray % 2 ? 0.08 : -0.05);
            const midR = 38 + (ray % 3) * 9;
            const endR = 92 + (ray % 4) * 24;
            const midX = crackX + Math.cos(angle) * midR;
            const midY = crackY + Math.sin(angle) * midR;
            const endX = crackX + Math.cos(angle + (ray % 2 ? 0.13 : -0.12)) * endR;
            const endY = crackY + Math.sin(angle + (ray % 2 ? 0.13 : -0.12)) * endR;
            cracks.beginPath();
            cracks.moveTo(crackX, crackY);
            cracks.lineTo(midX, midY);
            cracks.lineTo(endX, endY);
            cracks.strokePath();
            if (ray % 2 === 0) {
              cracks.lineStyle(2, 0x83b7d4, 0.8);
              cracks.beginPath();
              cracks.moveTo(midX, midY);
              cracks.lineTo(midX + Math.cos(angle + 0.72) * 34, midY + Math.sin(angle + 0.72) * 34);
              cracks.strokePath();
              cracks.lineStyle(3, 0xe9f8ff, 0.94);
            }
          }
          cracks.lineStyle(2, 0xffffff, 0.8);
          cracks.strokeCircle(crackX, crackY, 21);
          cracks.strokeCircle(crackX, crackY, 34);
          cracks.setAlpha(0);
          this.tweens.add({ targets: cracks, alpha: 1, duration: 120, ease: 'Stepped' });

          // Keep the body on the foreground glass, hold the impact, then drag it
          // all the way to the bottom edge with visible streaks behind it.
          victim.setDepth(31);
          const glassSmear = this.add.graphics().setDepth(29);
          this.time.delayedCall(650, () => {
            let previousY = victim.y;
            this.tweens.add({
              targets: victim,
              y: GAME_H - 4,
              angle: facing * 12,
              duration: 2200,
              ease: 'Sine.easeIn',
              onUpdate: () => {
                const bodyCenterY = victim.y - victim.displayHeight * 0.48;
                const oldCenterY = previousY - victim.displayHeight * 0.48;
                glassSmear.lineStyle(12, 0xccecff, 0.045).lineBetween(victim.x - 31, oldCenterY, victim.x - 31, bodyCenterY);
                glassSmear.lineStyle(7, 0x9fcbe4, 0.055).lineBetween(victim.x + 24, oldCenterY, victim.x + 24, bodyCenterY);
                glassSmear.lineStyle(2, 0xffffff, 0.16).lineBetween(victim.x + 4, oldCenterY, victim.x + 4, bodyCenterY);
                previousY = victim.y;
              },
              onComplete: () => {
                this.cameras.main.shake(220, 0.012);
                this.tweens.add({
                  targets: victim,
                  y: GAME_H - 10,
                  angle: facing * 15,
                  duration: 180,
                  yoyo: true,
                  ease: 'Quad.easeOut'
                });
              }
            });
          });

          this.time.delayedCall(1000, () => {
            winner.special = null;
            winner.setState('win');
            playVoice(this, 'djmontay_win');
          });

          this.time.delayedCall(3650, () => {
            this.slowmo = 1;
            this.centerText.setColor('#ffcc22').setFontSize(38).setScale(1);
            this.tweens.add({ targets: curtain, alpha: 0, duration: 300, onComplete: () => curtain.destroy() });
            this.endMatch(winner, loser);
          });
        });
      });
    });
  }

  startDjScreamFinisher(winner, loser) {
    const facing = loser.x >= winner.x ? 1 : -1;
    winner.facing = facing;
    loser.facing = -facing;
    winner.setState('idle');
    loser.setState('hitstun');
    loser.hitstun = 9999;
    stopMusic(this);

    const curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x050108, 0).setDepth(5);
    curtain.setStrokeStyle(4, 0xffd52a, 0.95);
    this.tweens.add({ targets: curtain, alpha: 0.5, duration: 560, ease: 'Sine.easeOut' });
    this.centerText.setColor('#ffe039').setFontSize(46).setScale(1.08);
    this.bigText('CAREER ENDER', 1800, 'DJ SCREAM · SCREAM TEAM SKY DROP');
    this.tweens.add({ targets: this.centerText, scaleX: 1.3, scaleY: 1.3, duration: 280, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    this.cameras.main.flash(250, 120, 20, 130, false);
    this.cameras.main.zoomTo(1.06, 1400, 'Sine.easeInOut');

    const finishX = Phaser.Math.Clamp(loser.x - facing * (winner.w * 0.48 + loser.w * 0.34), 44, GAME_W - 44);
    this.time.delayedCall(360, () => {
      this.tweens.add({ targets: winner, x: finishX, duration: 1260, ease: 'Sine.easeInOut' });
    });

    this.time.delayedCall(1800, () => {
      this.slowmo = 0.36;
      winner.special = winner.cfg.special2;
      winner.specialSlot = 2;
      winner.specialDone = true;
      winner.setState('special');
      playVoice(this, 'djscream_s2', 1.12);
      SFX.special();

      const groundY = loser.y;
      const airX = Phaser.Math.Clamp((winner.x + loser.x) * 0.5 + facing * 28, 80, GAME_W - 80);
      const victim = this.add.image(loser.x, groundY, loser.cfg.id)
        .setOrigin(0.5, 1)
        .setScale(loser.baseScale)
        .setFlipX(loser.facing === -1)
        .setDepth(8);
      loser.sprite.setVisible(false);
      loser.setState('ko');

      SFX.heavyHit();
      this.cameras.main.shake(380, 0.018);
      this.sparkAt(loser.x, loser.y - loser.cfg.height * 0.68, 0xffdf39, 18);
      this.tweens.add({
        targets: victim,
        x: airX,
        y: -95,
        angle: facing * 145,
        duration: 980,
        ease: 'Cubic.easeOut'
      });

      this.time.delayedCall(300, () => {
        const jumpKey = this.textures.exists('djscream_jump') ? 'djscream_jump' : 'djscream_special2';
        const jumper = this.add.image(winner.x, winner.y, jumpKey)
          .setOrigin(0.5, 1)
          .setScale(winner.baseScale)
          .setFlipX(facing === -1)
          .setDepth(9);
        winner.sprite.setVisible(false);
        this.tweens.add({
          targets: jumper,
          x: airX - facing * 34,
          y: -65,
          angle: facing * 18,
          duration: 800,
          ease: 'Cubic.easeOut'
        });

        this.time.delayedCall(1050, () => {
          this.slowmo = 0.25;
          this.shockRing(airX, 42, 0xffe34a);
          this.cameras.main.zoomTo(1.1, 260, 'Sine.easeInOut');
          this.cameras.main.shake(300, 0.012);

          this.tweens.add({
            targets: victim,
            x: airX + facing * 22,
            y: groundY,
            angle: -facing * 88,
            duration: 640,
            ease: 'Cubic.easeIn'
          });
          this.tweens.add({
            targets: jumper,
            x: airX - facing * 18,
            y: groundY - 15,
            angle: -facing * 12,
            duration: 700,
            ease: 'Cubic.easeIn'
          });

          this.time.delayedCall(640, () => {
            const blastX = victim.x;
            const blastY = groundY - 10;
            const textureKey = loser.cfg.id;
            const source = this.textures.get(textureKey).getSourceImage();
            const cols = 3;
            const rows = 4;
            const pieceW = Math.ceil(source.width / cols);
            const pieceH = Math.ceil(source.height / rows);

            victim.destroy();
            SFX.ko();
            SFX.heavyHit();
            this.cameras.main.flash(230, 255, 235, 180, false);
            this.cameras.main.shake(950, 0.065);
            this.shockRing(blastX, blastY, 0xffd52a);
            this.sparkAt(blastX, blastY, 0xffee72, 48);
            this.impactSprayAt(blastX, blastY - 18, facing, true);
            this.impactSprayAt(blastX, blastY - 42, -facing, true);
            this.time.delayedCall(120, () => this.impactSprayAt(blastX, blastY - 28, facing, true));
            this.hitPause(300);

            this.add.ellipse(blastX, groundY - 2, Math.max(58, loser.w * 1.15), 17, 0x5b0610, 0.88)
              .setStrokeStyle(3, 0x210004, 0.9).setDepth(7);

            for (let row = 0; row < rows; row++) {
              for (let col = 0; col < cols; col++) {
                const piece = this.add.image(blastX, groundY, textureKey)
                  .setOrigin(0.5, 1)
                  .setScale(loser.baseScale)
                  .setFlipX(loser.facing === -1)
                  .setDepth(8);
                piece.setCrop(
                  col * pieceW,
                  row * pieceH,
                  Math.min(pieceW, source.width - col * pieceW),
                  Math.min(pieceH, source.height - row * pieceH)
                );
                this.tweens.add({
                  targets: piece,
                  x: Phaser.Math.Clamp(blastX + Phaser.Math.Between(-145, 145), 18, GAME_W - 18),
                  y: groundY - Phaser.Math.Between(45, 190),
                  angle: Phaser.Math.Between(-680, 680),
                  duration: Phaser.Math.Between(760, 1250),
                  ease: 'Cubic.easeOut',
                  onComplete: () => this.tweens.add({ targets: piece, y: groundY + 5, alpha: 0.45, duration: 520, ease: 'Quad.easeIn' })
                });
              }
            }

            this.time.delayedCall(460, () => {
              jumper.destroy();
              winner.sprite.setVisible(true);
              winner.special = null;
              winner.setState('win');
              playVoice(this, 'djscream_win');
            });

            this.time.delayedCall(2250, () => {
              this.slowmo = 1;
              this.cameras.main.zoomTo(1, 340, 'Sine.easeInOut');
              this.centerText.setColor('#ffcc22').setFontSize(38).setScale(1);
              this.tweens.add({ targets: curtain, alpha: 0, duration: 300, onComplete: () => curtain.destroy() });
              this.endMatch(winner, loser);
            });
          });
        });
      });
    });
  }

  endMatch(winner) {
    this.matchOver = true;
    stopMusic(this);
    if (!this.coinRewardSettled && window.KNUCK_COINS) {
      this.coinRewardSettled = true;
      window.KNUCK_COINS.finishMatch(winner === this.p1);
    }
    if (this.mode === 'tower') {
      const won = winner === this.p1;
      this.time.delayedCall(600, () => {
        this.scene.start('Ladder', { ladder: this.ladder, result: won ? 'win' : 'lose', charId: this.p1CharId });
      });
    } else {
      this.showEndPanel(winner.cfg.name + ' WINS THE MATCH');
    }
  }

  showEndPanel(title) {
    if (this.panelShown) return;          // never build the panel twice (double text bug)
    this.panelShown = true;
    this.centerText.setText('').setAlpha(0);
    this.subText.setText('').setAlpha(0);
    const opts = [['REMATCH', () => this.scene.restart({ p1CharId: this.p1CharId, p2CharId: this.p2CharId, stageId: this.stageId, mode: this.mode, aiLevel: this.aiLevel, ladder: this.ladder })],
                  ['CHARACTER SELECT', () => this.scene.start('CharSelect', { mode: this.mode })],
                  ['MAIN MENU', () => this.scene.start('ModeSelect')]];
    buildMenuPanel(this, title, opts);
  }

  // ---------------- update ----------------
  update(time, delta) {
    let dt = Math.min(delta, 40);
    if (this.pauseT > 0) { this.pauseT -= delta; this.drawHUD(); return; }
    dt *= this.slowmo;
    this.now += dt;
    this.dtLast = dt;

    if (Phaser.Input.Keyboard.JustDown(this.escKey) || this.padStartPressed()) {
      if (!this.matchOver) {
        this.matchOver = true;
        stopMusic(this);
        if (!this.coinRewardSettled && window.KNUCK_COINS) {
          this.coinRewardSettled = true;
          window.KNUCK_COINS.finishMatch(false);
        }
        this.showEndPanel('PAUSED - MATCH ENDED');
        return;
      }
    }
    if (this.mode === 'training' && Phaser.Input.Keyboard.JustDown(this.tKey)) {
      this.dummyBlocks = !this.dummyBlocks;
      this.bigText(this.dummyBlocks ? 'DUMMY: BLOCK' : 'DUMMY: STAND', 700);
    }
    if (this.matchOver) { this.drawHUD(); return; }

    const inpAllowed = this.roundActive;
    const zero = { left: false, right: false, up: false, down: false, punch: false, kick: false, block: false };
    const i1 = inpAllowed ? this.readInput(this.keys1, 0, true) : zero;
    let i2;
    if (this.mode === 'vs') i2 = inpAllowed ? this.readInput(this.keys2, 1, false) : zero;
    else if (this.mode === 'training') i2 = this.dummyInput();
    else i2 = this.aiInput(this.p2, this.p1);

    this.p1.update(dt, i1, this.p2);
    this.p2.update(dt, i2, this.p1);

    // attack streaks + invulnerability flicker
    this.fxG.clear();
    this.drawAttackFX(this.p1);
    this.drawAttackFX(this.p2);
    for (const f of [this.p1, this.p2]) {
      f.sprite.setAlpha(this.now < f.invulnUntil ? (Math.floor(this.now / 60) % 2 ? 0.45 : 0.9) : 1);
    }

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.p.x += pr.vx * (dt / 1000); pr.glow.x = pr.p.x; pr.glow.y = pr.p.y;
      const target = pr.owner === this.p1 ? this.p2 : this.p1;
      const hb = target.hurtbox();
      let dead = pr.p.x < -40 || pr.p.x > GAME_W + 40;
      if (!dead && pr.p.x > hb.x && pr.p.x < hb.x + hb.w && pr.p.y > hb.y && pr.p.y < hb.y + hb.h && target.state !== 'ko') {
        target.takeHit(pr.def.dmg * pr.owner.cfg.dmg, 160 * Math.sign(pr.vx) / target.cfg.weight, pr.owner, { slow: pr.def.slow });
        this.sparkAt(pr.p.x, pr.p.y, pr.def.color, 8);
        dead = true;
      }
      if (dead) { pr.p.destroy(); pr.glow.destroy(); this.projectiles.splice(i, 1); }
    }

    // assists
    for (let i = this.assists.length - 1; i >= 0; i--) {
      const a = this.assists[i];
      a.img.x += a.vx * (dt / 1000);
      a.life -= dt;
      const target = a.owner === this.p1 ? this.p2 : this.p1;
      if (!a.hit && Math.abs(a.img.x - target.x) < target.w + 26 && target.state !== 'ko') {
        a.hit = true;
        target.takeHit(a.def.dmg * a.owner.cfg.dmg, 280 * Math.sign(a.vx) / target.cfg.weight, a.owner, { knockdown: true });
        this.sparkAt(a.img.x, target.y - target.cfg.height * 0.6, a.def.color, 8);
      }
      if (a.life < 300) a.img.setAlpha(a.life / 300 * 0.85);
      if (a.life <= 0 || a.img.x < -80 || a.img.x > GAME_W + 80) { a.img.destroy(); this.assists.splice(i, 1); }
    }

    // subtle stage parallax follows fight center
    const cx = (this.p1.x + this.p2.x) / 2;
    this.bg.x = GAME_W / 2 - (cx - GAME_W / 2) * 0.04;

    // timer
    if (this.roundActive && this.mode !== 'training') {
      this.timerAcc += dt;
      if (this.timerAcc >= 1000) {
        this.timerAcc -= 1000; this.timer--;
        if (this.timer <= 10 && this.timer > 0) SFX.timer();
        this.timerText.setText(String(Math.max(0, this.timer)));
        if (this.timer <= 0) this.timeOut();
      }
    } else if (this.mode === 'training') this.timerText.setText('--');

    this.drawHUD();
  }
}
