// Temp fuzz harness: simulate many random frames, catch exceptions / NaN / broken invariants.
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('plane-battle.html', 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

function el() {
  return { textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, blur() {}, addEventListener() {} };
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
  let __t = 0;
  const frame = (ms) => { __t += ms; __rafCb(__t); };
  const runMs = (ms, dt) => { for (let n = Math.ceil(ms / dt), i = 0; i < n; i++) frame(dt); };

  // Number helpers check "isFinite" (catches NaN/Infinity)
  const badNums = (obj) => {
    const bad = [];
    const walk = (v, p) => {
      if (typeof v === 'number' && !isFinite(v)) bad.push(p + '=' + v);
      else if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) walk(v[k], p + '.' + k);
      }
    };
    walk(obj, '');
    return bad;
  };

  let failures = 0;
  let totalFrames = 0;
  const TMP = { failures: 0, errs: [] };

  function runScenario(label, msPer, frames, opts) {
    startGame();
    try {
      for (let f = 0; f < frames; f++) {
        // random inputs
        for (const p of Object.keys(keys)) keys[p] = false;
        if (Math.random() < 0.7) {
          const dirs = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown','KeyA','KeyD','KeyW','KeyS'];
          keys[dirs[Math.floor(Math.random()*dirs.length)]] = true;
        }
        firing = Math.random() < 0.85;
        // occasionally set lives/hp states
        if (Math.random() < 0.002) { shield = Math.random()*15; wlevel = 1 + Math.floor(Math.random()*MAX_WEAPON); }
        frame(msPer);
        totalFrames++;
        // check invariants each 500 frames
        if (f % 500 === 0) {
          for (const [nm, arr] of [['player', player], ['bullets', bullets], ['ebullets', ebullets], ['enemies', enemies]]) {
            if (nm === 'player') {
              if (!isFinite(player.x) || !isFinite(player.y) || !isFinite(player.tilt)) {
                TMP.failures++; TMP.errs.push(label + ': player NaN ' + badNums(player).join(','));
              }
            } else {
              for (let i = 0; i < arr.length; i++) {
                const bad = badNums(arr[i]);
                if (bad.length) { TMP.failures++; TMP.errs.push(label + ': ' + nm + '[' + i + '] ' + bad.join(',')); break; }
              }
            }
          }
          // list size sanity (unbounded growth = leak)
          if (bullets.length > 400) { TMP.failures++; TMP.errs.push(label + ': bullets leaked (' + bullets.length + ')'); }
          if (ebullets.length > 2000) { TMP.failures++; TMP.errs.push(label + ': ebullets leaked (' + ebullets.length + ')'); }
          if (enemies.length > 200) { TMP.failures++; TMP.errs.push(label + ': enemies leaked (' + enemies.length + ')'); }
          if (particles.length > 1000) { TMP.failures++; TMP.errs.push(label + ': particles leaked (' + particles.length + ')'); }
          if (items.length > 200) { TMP.failures++; TMP.errs.push(label + ': items leaked (' + items.length + ')'); }
        }
        if (state === 'over') break;
      }
    } catch (e) {
      TMP.failures++; TMP.errs.push(label + ': EXCEPTION ' + e.stack);
      state = 'over';
    }
  }

  // Scenario 1: normal play with boss forced early
  score = 100000;  // trigger boss quickly
  runScenario('s1-normal', 16, 9000, {});

  // Scenario 2: survive several bosses (force timers short)
  startGame();
  elapsed = 0; bossCount = 0; bossNextScore = 200; bossNextAt = 1;  // fast 1st boss via score, then 1s timer
  score = 0;
  invuln = 999; // practically immune, focus on boss logic
  runScenario('s2-manyboss', 16, 20000, {});

  // Scenario 3: heavy bullet spam near player (collision hotspots)
  startGame();
  invuln = 999;
  for (let i = 0; i < 60; i++) ebullets.push({ x: player.x + rand(-30,30), y: player.y + rand(-30,30), vx: rand(-200,200), vy: rand(-200,200), r: rand(2,6), kind: ['shot','blast','needle','orb','shell'][Math.floor(rand(0,5))] });
  firing = true;
  runScenario('s3-collide', 16, 4000, {});

  // Scenario 4: immediate death path
  startGame();
  lives = 1; invuln = 0; shield = 0;
  ebullets.push({ x: player.x, y: player.y, vx: 0, vy: 0, r: 4 });
  frame(16);
  if (state !== 'over') { TMP.failures++; TMP.errs.push('s4: not game-over after lethal hit'); }

  // Scenario 5: game-over state, keep drawing (should not throw / ops on arrays)
  try {
    for (let i = 0; i < 200; i++) frame(16);
  } catch (e) { TMP.failures++; TMP.errs.push('s5: draw after game over EXCEPTION ' + e.stack); }

  this.__TMP = TMP;
`;

sandbox.runScenario = null;
vm.runInContext(code + selftest, sandbox);
const R = sandbox.__TMP;
console.log('fuzz frames simulated:', R.fails ? '?' : 'done');
if (R.failures) {
  for (const e of R.errs) console.log('  FAIL: ' + e);
  console.log('\n' + R.failures + ' FUZZ FAILURE(S)');
  process.exit(1);
}
console.log('FUZZ OK: no exceptions, no NaN, no unbounded leaks');
