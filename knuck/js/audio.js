// ============================================================
// BUCK! - retro SFX generator (WebAudio) + voice slot helper
// ============================================================

const SFX = {
  ctx: null,
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },
  _noise(dur, vol, filterFreq, decay) {
    const ctx = this.ensure();
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start();
  },
  _tone(freq, dur, vol, type, slideTo) {
    const ctx = this.ensure();
    const o = ctx.createOscillator(); o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  },
  hit()     { this._noise(0.12, 0.5, 1400, 2); this._tone(140, 0.1, 0.25, 'square', 60); },
  heavyHit(){ this._noise(0.18, 0.6, 900, 2);  this._tone(90, 0.16, 0.3, 'square', 40); },
  block()   { this._noise(0.06, 0.3, 3500, 3); this._tone(500, 0.05, 0.12, 'square'); },
  whiff()   { this._noise(0.08, 0.15, 5000, 4); },
  jump()    { this._tone(220, 0.12, 0.15, 'square', 440); },
  special() { this._tone(300, 0.25, 0.2, 'sawtooth', 900); this._noise(0.2, 0.25, 2500, 2); },
  ko()      { this._tone(300, 0.7, 0.35, 'sawtooth', 40); this._noise(0.5, 0.5, 700, 1.5); },
  select()  { this._tone(660, 0.07, 0.18, 'square'); },
  confirm() { this._tone(440, 0.07, 0.2, 'square'); this._tone(880, 0.12, 0.2, 'square'); },
  timer()   { this._tone(880, 0.05, 0.1, 'square'); }
};

// Mobile browsers create/suspend WebAudio contexts independently. Resume both
// Phaser's context and the procedural-SFX context from the same user gesture.
function unlockAudio() {
  const contexts = [];
  const phaserSound = window.knuckGame && window.knuckGame.sound;

  if (phaserSound) {
    if (typeof phaserSound.unlock === 'function' && phaserSound.locked) phaserSound.unlock();
    if (phaserSound.context) contexts.push(phaserSound.context);
  }

  contexts.push(SFX.ensure().ctx);
  for (const ctx of contexts) {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
}

// Capture the earliest real touch. In particular, the move-list overlay can
// otherwise consume the gesture before Phaser gets a chance to unlock audio.
for (const eventName of ['pointerdown', 'touchend', 'click']) {
  window.addEventListener(eventName, unlockAudio, { capture: true, passive: true });
}

// Play a voice clip if it was successfully loaded; skip silently otherwise
function playVoice(scene, key, vol) {
  if (scene.cache.audio.exists(key)) scene.sound.play(key, { volume: vol === undefined ? 1 : vol });
}
