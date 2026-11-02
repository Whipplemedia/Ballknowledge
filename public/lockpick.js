// Picking the squad car's lock (server n3.js 'pickStart' / 'pickDone' / 'pickCancel'). You crouch at the rear door; the lock fills the
// screen: tension wrench in the bottom of the keyway, the pick lifting one pin at a time. Each pin bounces in its chamber - press Space
// (or click) when its top crosses the shear line to set it. Four pins and the cylinder turns. Three slips and the pick snaps.
// Drunker = jumpier pins and a thinner shear line. Any cop who comes close while you're at it arrests you on the spot (server).
const PINS = 4, SLIPS = 3, MIN_MS = 4700;

export function createLockpick({ BK, audio }) {
  const el = document.createElement('div'); el.id = 'lockpick';
  el.innerHTML = '<div class="lp-card"><div class="lp-head"><b>PICKING THE LOCK</b><span class="lp-slips"></span></div><canvas width="520" height="360"></canvas><div class="lp-help">Press <kbd>Space</kbd> (or click) when the pin\'s top crosses the gold line · <kbd>Esc</kbd> to back off</div></div>';
  document.body.append(el);
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), slipsEl = el.querySelector('.lp-slips');
  let run = null; // { t, pin, set: [heights], phase: [..], slips, done, turn, start, drunk }

  function start() {
    const d = Math.min(1, Math.max(0, ((BK.drunk || 0) - 15) / 75));
    run = { t: 0, pin: 0, set: [], ph: Array.from({ length: PINS }, () => Math.random() * 6), sp: Array.from({ length: PINS }, (_, i) => 2.2 + i * 0.45 + d * 1.6), slips: 0, done: false, turn: 0, start: performance.now(), drunk: d, flash: 0, shake: 0 };
    el.classList.add('on'); audio.sfx('click');
  }
  function stop(cancel) { if (!run) return; if (cancel && !run.done) BK.send({ type: 'pickCancel' }); run = null; el.classList.remove('on'); }
  const ZONE = () => 0.075 - run.drunk * 0.03; // half-height of the shear-line band, in pin travel (0..1)
  const lift = (i) => 0.5 + 0.5 * Math.sin(run.ph[i]); // how high pin i's top is in its chamber (0..1)
  function press() {
    if (!run || run.done) return; const y = lift(run.pin), target = 0.72;
    if (Math.abs(y - target) <= ZONE()) { run.set.push(target); run.pin++; run.flash = 1; audio.sfx('tick'); if (run.pin >= PINS) { run.done = true; run.turn = 0.001; } }
    else { run.slips++; run.shake = 1; audio.sfx('buzz', { v: 0.4 }); if (run.pin > 0 && Math.random() < 0.5) { run.pin--; run.set.pop(); } // a pin falls back down
      if (run.slips >= SLIPS) { run.done = true; BK.send({ type: 'pickDone', ok: false }); audio.sfx('bonk', { v: 0.5 }); setTimeout(() => stop(false), 900); } }
  }
  function key(e) {
    if (!run) return false; e.preventDefault();
    if (e.type !== 'keydown' || e.repeat) return true;
    if (e.code === 'Space') press(); else if (e.code === 'Escape' || /^Key[WASD]$/.test(e.code)) stop(true);
    return true;
  }
  function update(dt) {
    if (!run) return; run.t += dt; run.flash = Math.max(0, run.flash - dt * 3); run.shake = Math.max(0, run.shake - dt * 4);
    for (let i = run.pin; i < PINS; i++) run.ph[i] += dt * run.sp[i] * (i === run.pin ? 1 : 0.15);
    if (run.turn) { run.turn += dt / 1.1; if (run.turn >= 1 && performance.now() - run.start >= MIN_MS && !run.sent) { run.sent = true; BK.send({ type: 'pickDone', ok: true }); audio.sfx('knock', { v: 0.6 }); setTimeout(() => stop(false), 500); } }
    draw();
  }
  function draw() {
    const W = 520, H = 360, r = run, sx = (Math.random() - 0.5) * r.shake * 8; g.save(); g.clearRect(0, 0, W, H); g.translate(sx, 0);
    // the door panel and the lock's brass face
    g.fillStyle = '#0d0f14'; g.fillRect(0, 0, W, H); const cx = W / 2, cy = H / 2 + 20, R = 150;
    const rg = g.createRadialGradient(cx - 40, cy - 50, 20, cx, cy, R); rg.addColorStop(0, '#f2d27a'); rg.addColorStop(1, '#8a6a22'); g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5a4210'; g.lineWidth = 6; g.stroke();
    // the cylinder (turns at the end)
    g.save(); g.translate(cx, cy); g.rotate(r.turn ? Math.min(1, r.turn) * Math.PI / 2 : 0);
    g.fillStyle = '#c9a548'; g.beginPath(); g.arc(0, 0, 92, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#6d5114'; g.lineWidth = 3; g.stroke();
    // pin chambers across the top of the plug, the shear line, the pins
    const x0 = -84, step = 42, top = -150, bot = -20, shear = -56;
    for (let i = 0; i < PINS; i++) {
      const x = x0 + 20 + i * step; g.fillStyle = '#2a2014'; g.fillRect(x - 11, top, 22, bot - top);
      const y = i < r.pin ? r.set[i] : lift(i), py = bot - y * (bot - top) * 0.62; // the top of the key pin
      g.fillStyle = i < r.pin ? '#7dff6a' : i === r.pin ? '#f4f4f4' : '#a8a8a8'; g.fillRect(x - 8, py, 16, bot - py - 2); // key pin
      g.fillStyle = '#7a7a86'; g.fillRect(x - 8, top + 4, 16, Math.max(6, py - top - 8)); // driver pin above it
      if (i === r.pin && !r.done) { g.strokeStyle = '#ffffff60'; g.lineWidth = 2; g.strokeRect(x - 13, top - 2, 26, bot - top + 4); }
    }
    const shearY = bot - 0.72 * (bot - top) * 0.62, z = ZONE() * (bot - top) * 0.62; g.fillStyle = '#ffd04a40'; g.fillRect(x0 + 6, shearY - z, PINS * step + 2, z * 2);
    g.strokeStyle = r.flash ? '#7dff6a' : '#ffd04a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 4, shearY); g.lineTo(x0 + 8 + PINS * step, shearY); g.stroke();
    // the keyway, the tension wrench, the pick under the current pin
    g.fillStyle = '#120d06'; g.beginPath(); g.moveTo(-70, -6); g.lineTo(84, -6); g.lineTo(84, 14); g.lineTo(-70, 14); g.fill();
    g.strokeStyle = '#d8dde6'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-60, 10); g.lineTo(60, 10); g.lineTo(60, 60); g.stroke(); // tension wrench
    const pi = Math.min(r.pin, PINS - 1), px = x0 + 20 + pi * step, py = r.done ? -10 : -10 - lift(pi) * 18 + 10;
    g.strokeStyle = '#eef2f8'; g.lineWidth = 4; g.beginPath(); g.moveTo(160, 40); g.lineTo(px + 14, py + 8); g.lineTo(px, py); g.stroke(); // the pick, lifting
    g.restore();
    g.restore();
    g.fillStyle = '#fff'; g.font = '800 18px system-ui'; g.textAlign = 'left'; g.fillText(r.done && r.turn ? 'Turning...' : `Pin ${Math.min(PINS, r.pin + 1)} of ${PINS}`, 16, 28);
    slipsEl.textContent = `Slips ${r.slips}/${SLIPS}`;
  }
  return { start, stop, key, update, press, active: () => !!run };
}
