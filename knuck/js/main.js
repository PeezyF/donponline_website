// ============================================================
// BUCK! - entry point
// ============================================================

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  pixelArt: true,
  backgroundColor: '#05050c',
  parent: 'game',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { gamepad: true, activePointers: 4 },
  scene: [IntroScene, BootScene, TitleScene, ModeSelectScene, CharSelectScene, StageSelectScene, LadderScene, FightScene]
});
window.knuckGame = game;

// F9 toggles CRT scanlines overlay
window.addEventListener('keydown', e => {
  if (e.key === 'F9') {
    const el = document.getElementById('scanlines');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
});
