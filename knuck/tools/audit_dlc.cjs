// Run with Node: node knuck/tools/audit_dlc.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ Phaser: { Scene: class {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'js/menus.js'), 'utf8'), context);
const { characters, stages, move, Boot } = vm.runInContext('({characters: CHARACTERS, stages: STAGES, move: gridMove, Boot: BootScene})', context);
assert.equal(characters.length, 18);
assert.equal(stages.length, 10);
assert.equal(new Set(characters.map(c => c.id)).size, characters.length);
const missing = [];
const check = file => { if (!fs.existsSync(path.join(root, file))) missing.push(file); };
const poses = ['punch','kick','crouch','block','crouchblock','hit','jump','win','walk','sweep','uppercut','special1','special2'];
for (const c of characters) {
  check(`assets/chars/${c.id}.png`);
  check(`assets/portraits/${c.id}.png`);
  for (const pose of poses) check(`assets/chars/${c.id}_${pose}.png`);
  for (const slot of ['name','s1','s2','win']) check(`assets/voice/${c.id}_${slot}.ogg`);
}
const images = new Map(), audio = new Map();
const shape = new Proxy({}, { get: () => () => shape });
Boot.prototype.preload.call({ add: { rectangle: () => shape, text: () => shape }, load: { on() {}, image: (k,p) => images.set(k,p), audio: (k,p) => audio.set(k,p) } });
for (const stage of stages) {
  check(images.get(stage.id));
  assert(audio.has(stage.music), `Unregistered music: ${stage.music}`);
  check(audio.get(stage.music));
}
for (const [count,cols] of [[18,3],[10,4],[9,3],[17,3]]) {
  for (let i=0;i<count;i++) for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const next=move(i,dx,dy,cols,count);
    assert(next>=0 && next<count, `Invalid navigation ${i} → ${next}`);
  }
  const reached=new Set([0]);
  for(let n=0;n<count;n++) for(const i of [...reached]) for(const [dx,dy] of [[1,0],[0,1]]) reached.add(move(i,dx,dy,cols,count));
  assert.equal(reached.size,count,'Every grid entry must be reachable');
}
assert.deepEqual(missing, [], 'Missing roster/stage assets');
console.log(`PASS: ${characters.length} complete fighters, ${stages.length} stages, registered music, all grid slots reachable.`);
