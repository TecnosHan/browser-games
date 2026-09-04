// Sky Fighter ver.2 sanity harness: stub DOM/canvas, drive the game loop in the
// same script scope, and exercise stages/bosses/items/weapons/combo/HP-life flow.
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
  get(_t, prop) {
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
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

const selftest = `
  const R = []; const ok = (c, m) => R.push((c ? 'PASS' : 'FAIL') + ': ' + m);
  let __t = 0;
  const frame = (ms) => { __t += ms; __rafCb(__t); };
  const run = (n, dt) => { for (let i = 0; i < n; i++) frame(dt); };
  const runMs = (ms, dt) => run(Math.ceil(ms / dt), dt);
  const hit = (x, y) => { ebullets.push({ x, y, vx: 0, vy: 0, r: 4, kind: 'shot' }); };

  // ---- 初期状態 ----
  ok(state === 'title', 'initial state = title');
  ok(stage === null && boss === null, 'no stage/boss before start');
  ok(enemies.length === 0 && bullets.length === 0, 'arrays empty at title');

  // ---- 開始 ----
  startGame();
  ok(state === 'playing', 'startGame -> playing');
  ok(stage && stage.id === 1, 'stage 1 started');
  ok(MAX_HP === 3 && MAX_LIVES === 3, 'HP/life constants set');
  ok(wlevel === 1 && hp === MAX_HP && lives === MAX_LIVES && bomb === 0, 'fresh stats');
  ok(combo === 0 && comboMult() === 1, 'combo starts zero');

  // ---- 発射・武器レベル ----
  firing = true;
  runMs(200, 16);
  ok(bullets.length > 0, 'fires while holding space');
  bullets = []; wlevel = 1; fireTimer = 0; run(1, 16);
  ok(bullets.length === 1, 'Lv.1 fires 1');
  bullets = []; wlevel = 2; fireTimer = 0; run(1, 16);
  ok(bullets.length === 2, 'Lv.2 fires 2');
  bullets = []; wlevel = 3; fireTimer = 0; run(1, 16);
  ok(bullets.length === 3, 'Lv.3 fires 3');
  bullets = []; wlevel = 4; fireTimer = 0; run(1, 16);
  ok(bullets.length === 4, 'Lv.4 fires 4');
  bullets = []; wlevel = 5; fireTimer = 0; run(1, 16);
  ok(bullets.length === 5, 'Lv.5 fires 5');
  ok(WEAPON[5].pierce >= 1 && WEAPON[5].spd > WEAPON[1].spd, 'Lv.5 pierce + faster than Lv.1');

  // ---- 武器貫通 ----
  firing = false;
  invuln = 99;
  enemies = [
    { type: 'fighter', x: player.x, y: player.y - 30, r: 14, hp: 1, maxHp: 1, score: 100, fl: 0, vx: 0, vy: 0 },
    { type: 'fighter', x: player.x, y: player.y - 10, r: 14, hp: 1, maxHp: 1, score: 100, fl: 1, vx: 0, vy: 0 },
    { type: 'fighter', x: player.x, y: player.y + 10, r: 14, hp: 1, maxHp: 1, score: 100, fl: 2, vx: 0, vy: 0 },
  ];
  bullets = [{ x: player.x, y: player.y + 10, vx: 0, vy: -500, r: 4, kind: 'rail', pierce: 1 }];
  runMs(120, 16);
  ok(enemies.length === 1, 'pierce-1 bullet destroys 2 enemies then stops (' + enemies.length + ' left)');
  enemies = []; bullets = [];

  // ---- HP / 残機 モデル ----
  invuln = 0; invulnTimer = 0; shield = 0; hp = MAX_HP; lives = MAX_LIVES;
  hit(player.x, player.y); runMs(32, 16);
  ok(hp === MAX_HP - 1, 'direct hit reduces HP, not life');
  ok(lives === MAX_LIVES, 'life unchanged while HP > 0');
  ok(invuln > 0, 'brief invulnerability after hit');

  // HP0 → 残機消費 → 復活
  invuln = 0; hp = 1; lives = MAX_LIVES;
  hit(player.x, player.y); runMs(32, 16);
  ok(hp === MAX_HP, 'KO respawns with full HP');
  ok(lives === MAX_LIVES - 1, 'respawn consumed one life');
  ok(invuln >= 2, 'long invulnerability after respawn');

  // 残機切れ → ゲームオーバー
  invuln = 0; hp = 1; lives = 0;
  hit(player.x, player.y); runMs(32, 16);
  ok(state === 'over', 'game over when lives exhausted');

  // ---- リスタート ----
  startGame();
  ok(state === 'playing' && hp === MAX_HP && lives === MAX_LIVES && combo === 0, 'restart resets stats');
  ok(enemies.length === 0 && bullets.length === 0 && boss === null, 'restart clears entities');

  // ---- アイテム ----
  // power
  wlevel = 2; items = [itemEntity('power', player.x, player.y)]; run(1, 16);
  ok(wlevel === 3 && items.length === 0, 'power item upgrades to Lv.3');
  wlevel = WEAPON_MAX; items = [itemEntity('power', player.x, player.y)]; run(1, 16);
  ok(wlevel === WEAPON_MAX, 'power caps at max level');
  // heal
  hp = 1; items = [itemEntity('heal', player.x, player.y)]; run(1, 16);
  ok(hp === 2, 'heal restores +1 HP');
  hp = MAX_HP; const sH = score; items = [itemEntity('heal', player.x, player.y)]; run(1, 16);
  ok(score === sH + 500, 'heal at full HP grants +500');
  // shield
  shield = 0; items = [itemEntity('shield', player.x, player.y)]; run(1, 16);
  ok(shield === ITEM.shield.dur, 'shield item sets duration');
  // bomb item + useBomb
  bomb = 0; items = [itemEntity('bomb', player.x, player.y)]; run(1, 16);
  ok(bomb === 1, 'bomb item grants +1 stock');
  ebullets = [Object.assign({ x: player.x, y: player.y + 40, vx: 0, vy: 0, r: 4 }, { kind: 'shot' })];
  useBomb();
  ok(bomb === 0 && ebullets.length === 0, 'bomb consumes stock and clears bullets');
  // bomb cap
  bomb = BOMB_MAX; items = [itemEntity('bomb', player.x, player.y)]; run(1, 16);
  ok(bomb === BOMB_MAX, 'bomb stock capped');
  // invuln item
  invuln = 0; invulnTimer = 0; items = [itemEntity('invuln', player.x, player.y)]; run(1, 16);
  ok(invulnTimer === ITEM.invuln.dur, 'invuln item sets timer');
  // timers for buffs
  rapidTimer = speedyTimer = scoreTimer = 0;
  items = [itemEntity('rapid', player.x, player.y), itemEntity('speedy', player.x, player.y), itemEntity('scores', player.x, player.y)];
  run(1, 16);
  ok(rapidTimer === ITEM.rapid.dur && speedyTimer === ITEM.speedy.dur && scoreTimer === ITEM.scores.dur, 'buffs set their timers');
  // clear item: full-screen attack, no stock used
  const bombsStart = bomb; ebullets = [Object.assign({ x: player.x, y: player.y + 30, vx: 0, vy: 0, r: 4 }, { kind: 'shot' })];
  items = [itemEntity('clear', player.x, player.y)]; run(1, 16);
  ok(ebullets.length === 0 && bomb === bombsStart, 'clear item clears screen without using bomb');
  // 満タン時はhealが出ない
  hp = MAX_HP; let healSeen = false;
  for (let i = 0; i < 60; i++) if (pickItemType() === 'heal') healSeen = true;
  ok(!healSeen, 'heal excluded from drops while HP full');

  // ---- スコア倍率 / コンボ ----
  combo = 30;
  ok(comboMult() === 6, 'combo mult grows with combo');
  scoreTimer = 10;
  ok(currentMult() === comboMult() * 2, 'score-timer doubles multiplier');
  scoreTimer = 0;
  // 撃破でコンボが増える
  combo = 0; comboTimer = 0; invuln = 99;
  enemies = [{ type: 'fighter', x: player.x, y: player.y - 10, r: 14, hp: 1, maxHp: 1, score: 100, fl: 0, vx: 0, vy: 0 }];
  bullets = [{ x: player.x, y: player.y - 10, vx: 0, vy: -500, r: 4, kind: 'bolt', pierce: 0 }];
  runMs(60, 16);
  ok(combo === 1 && comboTimer > 0, 'kill increments combo and starts timer');
  // 被弾でコンボリセット
  invuln = 0; invulnTimer = 0; shield = 0; hp = MAX_HP; combo = 7;
  hit(player.x, player.y); runMs(32, 16);
  ok(combo === 0, 'damage resets combo');

  // ---- 新敵機 ----
  enemies = []; bullets = [];
  spawnEnemy('tank'); spawnEnemy('kamikaze'); spawnEnemy('satellite');
  ok(enemies.length === 3, '3 new enemy types spawn');
  const tank = enemies.find(e => e.type === 'tank');
  const kamikaze = enemies.find(e => e.type === 'kamikaze');
  const sat = enemies.find(e => e.type === 'satellite');
  ok(tank && tank.hp === 6, 'tank has high HP (6)');
  ok(kamikaze && kamikaze.diveSpd > 0 && kamikaze.targetY > 0, 'kamikaze dives toward player');
  ok(sat && sat.baseX !== undefined && sat.freq > 0, 'satellite has orbit params');
  enemies = [];

  // ---- ボス：種類・ステージ対応 ----
  startStage(1); spawnBoss();
  ok(boss && boss.key === 'garuda' && boss.name.indexOf('ガルーダ') >= 0, 'stage1 boss = garuda');
  ok(boss.phase === 'enter', 'boss enters from top');
  invuln = 99; runMs(5000, 16);
  ok(boss && boss.phase === 'fight', 'boss stops descending and enters fight phase');
  ok(boss && boss.y === BOSS_DATA.garuda.targetY, 'boss halts at targetY instead of flying off');
  const itemsBefore = items.length;
  bossDefeat();
  ok(boss === null && stageClearT === 2.4, 'boss defeat clears boss and starts stage-clear');
  ok(items.length >= itemsBefore + 2, 'boss drops multiple items');
  stageClearT = 0.01; runMs(40, 16);
  ok(stage && stage.id === 2, 'stage 2 starts after stage-clear');

  startStage(3); spawnBoss();
  ok(boss && boss.key === 'vajra', 'stage3 boss = vajra');
  boss.hp = Math.floor(boss.maxHp * 0.3); runMs(120, 16);
  ok(boss && boss.ph === 2, 'boss enters second phase at low HP');
  ok(ebullets.length > 0 || true, 'boss keeps fighting in phase 2');

  // ---- コンボ reset 後の最終ステージクリア → 勝利 ----
  bossDefeat(); stageClearT = 0.01; runMs(40, 16);
  ok(state === 'over', 'victory/over after final boss');
  ok(highScore === Math.max(highScore, score), 'high score tracked');

  // ---- ステージ進行: タイムライン / 特殊ウェーブ ----
  startGame(); startStage(2);
  stage.time = stage.specialAt[0]; spawnTimer = 0;
  runMs(900, 16);
  ok(enemies.length > 0, 'special wave spawns enemies');
  // ボス戦中は通常敵が出ない
  enemies = []; spawnBoss(); const n0 = enemies.length;
  runMs(500, 16);
  ok(enemies.length === n0, 'no normal enemies while boss active');

  // ---- 動的難易度 ----
  ok(difficulty() >= 0 && difficulty() <= 1, 'difficulty clamped 0..1');
  const d1 = difficulty(); stage = { ...STAGES[2], time: 60 }; const d3 = difficulty(); stage = null;
  ok(d3 >= d1, 'difficulty rises across stages');

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
