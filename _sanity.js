// Sky Fighter sanity harness: stub DOM/canvas, drive the game loop in the same script scope,
// and exercise the new boss/item logic.
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('plane-battle.html', 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

function el() {
  return {
    textContent: '', style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    blur() {}, addEventListener() {},
  };
}
const elements = {};
const ctxProxy = new Proxy({}, {
  get(_t, prop) { if (prop === 'createLinearGradient') return () => ({ addColorStop() {} }); return () => {}; },
  set() { return true; },
});
const canvasStub = { width: 400, height: 600, getContext: () => ctxProxy };
const documentStub = {
  getElementById(id) { return id === 'game' ? canvasStub : (elements[id] = elements[id] || el()); },
  addEventListener() {},
};

const sandbox = {
  document: documentStub,
  canvas: canvasStub,
  performance: { now: () => 0 },
  requestAnimationFrame(cb) { sandbox.__rafCb = cb; return 1; },
  console, Math, JSON,
};
vm.createContext(sandbox);

// Appended selftest code runs in the same script scope as the game, so it can read/write
// the top-level `let` bindings and call the top-level functions directly.
const selftest = `
  const R = []; const ok = (c, m) => R.push((c ? 'PASS' : 'FAIL') + ': ' + m);
  let __t = 0;                        // ミリ秒タイムスタンプ
  const frame = (ms) => { __t += ms; __rafCb(__t); };            // loop() は ms を期待
  const run = (n, dt) => { for (let i = 0; i < n; i++) frame(dt); };
  const runMs = (ms, dt) => run(Math.ceil(ms / dt), dt);

  ok(state === 'ready', 'initial state = ready');

  startGame();
  ok(state === 'playing', 'startGame -> playing');

  firing = true;
  runMs(160, 16);
  ok(bullets.length > 0, 'player bullets spawn while firing');

  score = 15000;
  runMs(160, 16);
  ok(boss !== null, 'boss spawned when score >= threshold (' + bossNextScore + ')');
  ok(bossCount === 1, 'bossCount incremented to 1');
  ok(boss.maxHp === 90, 'first boss HP = 90');
  ok(boss.phase === 'enter' || boss.phase === 'fight', 'boss phase = enter/fight');

  runMs(4000, 16); // 4s: finish entry + fight
  ok(boss && boss.phase === 'fight', 'boss reached fight phase');
  ok(Math.abs(boss.y - 92) < 0.001, 'boss stopped at enterY 92');
  ok(boss.x > 20 && boss.x < 380, 'boss stays in horizontal bounds');
  ok(ebullets.length > 0, 'boss fired bullets during fight');

  boss.hp = 1; bullets.push({ x: boss.x, y: boss.y, vx: 0, vy: -100 });
  runMs(48, 16);
  ok(boss === null, 'boss null after defeat');
  ok(bossCount === 1, 'bossCount kept at 1');
  ok(score >= 15000 + 3000, 'boss score granted (+3000)');
  ok(items.length >= 2, 'boss dropped 2 items');
  ok(bossNextScore > score, 'next boss threshold advanced past score');

  runMs(1920, 16);
  ok(boss === null, 'no boss while score below next threshold');
  ok(Array.isArray(enemies), 'enemies array intact after boss');

  // shield blocks a hit
  shield = 10; invuln = 0; lives = MAX_LIVES;
  ebullets.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: 4 });
  runMs(32, 16);
  ok(shield === 0, 'shield consumed on hit');
  ok(lives === 3, 'lives unchanged with shield');
  ok(invuln > 0, 'brief invuln after shield block');

  // normal hit removes life
  shield = 0; invuln = 0; lives = 3;
  ebullets.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: 4 });
  runMs(32, 16);
  ok(lives === 2, 'life lost on direct hit');
  ok(invuln >= 1.9, '2s invuln after losing life');

  // heal item（前のボス残件をクリア）
  items = [];
  lives = 2;
  items.push(itemEntity('heal', player.x, player.y));
  runMs(32, 16);
  ok(lives === 3, 'heal item restores +1 life');
  ok(items.length === 0, 'heal item consumed on pickup');

  // power-ups
  items = [];
  items.push(itemEntity('rapid', player.x, player.y));
  items.push(itemEntity('three', player.x, player.y));
  run(1, 16);
  ok(Math.abs(power.rapid - 10) < 0.05, 'rapid power-up set (10s)');
  ok(Math.abs(power.three - 10) < 0.05, 'three power-up set (10s)');
  runMs(4800, 16);
  ok(power.rapid < 10, 'rapid timer counts down');
  ok(power.three < 10, 'three timer counts down');

  // death -> game over
  lives = 1; shield = 0; invuln = 0;
  ebullets.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: 4 });
  runMs(32, 16);
  ok(state === 'over', 'state = over after last life');

  startGame();
  ok(boss === null && items.length === 0 && power.rapid === 0 && power.three === 0 && shield === 0, 'reset clears boss/items/powers');
  ok(bossNextScore === 15000, 'next boss threshold reset to 15000');

  this.__results = R;
`;

vm.runInContext(code + selftest, sandbox);
const results = sandbox.__results || [];
let fails = 0;
for (const r of results) {
  console.log('  ' + r);
  if (r.startsWith('FAIL')) fails++;
}
console.log(fails === 0 ? '\nALL TESTS PASSED (' + results.length + ')' : '\n' + fails + ' TEST(S) FAILED');
process.exit(fails === 0 ? 0 : 1);
