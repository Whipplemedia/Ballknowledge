// Amateur Night (night 3, The End Zone): a rhythm game on the pole. Arrows (or WASD) scroll up to the line on a synthesized
// club beat; hit them on the beat. Every 4 in a row is a pole move the whole club sees (server n3.js 'danceMove' -> the
// stand-in at the pole, public/club.js); 4 misses in a row and you slide down the pole. Drunk players get wobbly arrows.
// At the end the score (0-1) goes to the server, which pays the crowd's tips (up to $350).
const LANES = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'], WASD = { KeyA: 0, KeyS: 1, KeyW: 2, KeyD: 3 }, ICON = ['◀', '▼', '▲', '▶'];
const BPM = 112, BEAT = 60 / BPM, LEN = 38, LEAD = 1.6; // seconds of song, seconds an arrow takes to reach the line
const WIN = { perfect: 0.07, great: 0.14 };
const MOVES = ['poleSpin', 'bodyRoll', 'hairFlip', 'poleKick', 'poleClimb', 'clubDance3', 'hipHop'];

export function createPoleGame({ BK, audio, club }) {
  const el = document.createElement('div'); el.id = 'polegame'; el.innerHTML = '<div class="pg-head"><b>AMATEUR NIGHT</b><span class="pg-score"></span></div><div class="pg-lanes"></div><div class="pg-judge"></div><div class="pg-help">Hit the arrows (or W A S D) as they cross the line</div>';
  document.body.append(el);
  const lanesEl = el.querySelector('.pg-lanes'), judgeEl = el.querySelector('.pg-judge'), scoreEl = el.querySelector('.pg-score');
  lanesEl.innerHTML = LANES.map((_, i) => `<div class="pg-lane"><div class="pg-target">${ICON[i]}</div></div>`).join('');
  const laneEls = [...lanesEl.querySelectorAll('.pg-lane')];
  let run = null; // { t0 (audio time), notes: [{t, lane, el, hit}], score, max, combo, miss, move }
  // a chart from a seed: quarter notes, eighths in the busy bars, the odd jump (two lanes), denser as the song goes on
  function chart(seed) {
    let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); const out = [];
    for (let b = 4; b * BEAT < LEN - 2; b += 0.5) {
      const bar = Math.floor(b / 4), busy = bar % 4 === 3 || b > LEN / BEAT * 0.6; if (b % 1 && !(busy && rnd() < 0.55)) continue; if (!(b % 1) && rnd() < 0.15) continue;
      const lane = Math.floor(rnd() * 4); out.push({ t: b * BEAT, lane }); if (busy && !(b % 1) && rnd() < 0.18) out.push({ t: b * BEAT, lane: (lane + 2) % 4 });
    }
    return out;
  }
  // the beat: kick on every beat, clap on 2 and 4, hats on the eighths, a bass note that walks with the bar
  function beat(ctx, t0) {
    const out = ctx.createGain(); out.gain.value = 0.45; out.connect((audio.buses && audio.buses.music) || ctx.destination); const nodes = [out];
    const kick = (t) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g).connect(out); o.start(t); o.stop(t + 0.32); };
    const noise = (t, len, hp, v) => { const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = v; s.connect(f).connect(g).connect(out); s.start(t); };
    const bass = (t, f) => { const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 380; g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 0.9); o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + BEAT); };
    const ROOT = [55, 55, 65.4, 49]; // A, A, C, G
    for (let b = 0; b * BEAT < LEN; b++) { const t = t0 + b * BEAT; kick(t); if (b % 2) noise(t, 0.12, 1800, 0.35); noise(t + BEAT / 2, 0.04, 7000, 0.12); noise(t, 0.03, 7000, 0.08); bass(t + BEAT / 2, ROOT[Math.floor(b / 4) % 4]); }
    return () => { try { out.disconnect(); } catch {} };
  }
  function start() {
    const ctx = audio.unlock ? audio.unlock() : null; if (!ctx) return;
    const t0 = ctx.currentTime + LEAD + 0.3, notes = chart(Math.floor(Math.random() * 1e9)).map((n) => ({ ...n, el: null, hit: false }));
    for (const n of notes) { const a = document.createElement('div'); a.className = 'pg-note l' + n.lane; a.textContent = ICON[n.lane]; laneEls[n.lane].append(a); n.el = a; }
    run = { ctx, t0, notes, score: 0, max: notes.length, combo: 0, miss: 0, stop: beat(ctx, t0), done: false, drunk: Math.min(1, Math.max(0, ((BK.drunk || 0) - 20) / 70)) };
    el.classList.add('on'); judge(''); BK.polePlaying = true;
  }
  function judge(text, cls = '') { judgeEl.textContent = text; judgeEl.className = 'pg-judge ' + cls; if (text) { judgeEl.style.animation = 'none'; void judgeEl.offsetWidth; judgeEl.style.animation = ''; } }
  const move = (m) => { club.setMove(m); BK.send({ type: 'danceMove', move: m, combo: run ? run.combo : 0 }); };
  function press(lane) {
    if (!run || run.done) return; const now = run.ctx.currentTime - run.t0;
    let best = null; for (const n of run.notes) if (!n.hit && n.lane === lane && Math.abs(n.t - now) < WIN.great + 0.04) { if (!best || Math.abs(n.t - now) < Math.abs(best.t - now)) best = n; }
    laneEls[lane].classList.add('press'); setTimeout(() => laneEls[lane].classList.remove('press'), 90);
    if (!best) return; const dt = Math.abs(best.t - now); best.hit = true; best.el.classList.add('gone');
    const q = dt < WIN.perfect ? 1 : dt < WIN.great ? 0.6 : 0.25; run.score += q; run.combo++; run.miss = 0; judge(q === 1 ? 'PERFECT' : q > 0.5 ? 'GREAT' : 'OK', q === 1 ? 'p' : 'g');
    if (run.combo % 4 === 0) move(MOVES[(run.combo / 4 - 1) % MOVES.length]);
  }
  function key(e) {
    if (!run || run.done) return false; const lane = LANES.indexOf(e.code) >= 0 ? LANES.indexOf(e.code) : WASD[e.code];
    if (lane === undefined || lane < 0) return false; e.preventDefault(); if (!e.repeat) press(lane); return true;
  }
  function update() {
    if (!run) return; const now = run.ctx.currentTime - run.t0, H = lanesEl.clientHeight || 420, line = 60, wob = run.drunk;
    for (const n of run.notes) {
      if (n.hit) { if (n.el && now - n.t > 0.25) { n.el.remove(); n.el = null; } continue; }
      if (now - n.t > WIN.great) { n.hit = true; n.el.classList.add('miss'); run.combo = 0; run.miss++; judge('MISS', 'm'); if (run.miss === 4) move('poleFail'); continue; }
      const y = line + (n.t - now) / LEAD * (H - line), x = wob ? Math.sin(now * 3 + n.t * 2) * 26 * wob : 0;
      n.el.style.transform = `translate(${x}px, ${Math.round(y)}px)`; n.el.style.opacity = y > H ? 0 : 1;
    }
    scoreEl.textContent = `${Math.round(run.score / Math.max(1, run.max) * 100)}% · combo ${run.combo}`;
    if (!run.done && now > LEN + 0.6) { run.done = true; const frac = run.score / Math.max(1, run.max); BK.send({ type: 'danceEnd', score: frac }); judge(frac > 0.85 ? 'THE CLUB GOES WILD' : frac > 0.6 ? 'NOT BAD, ROOKIE' : 'TOUGH CROWD', frac > 0.6 ? 'p' : 'm'); setTimeout(stop, 2600); }
  }
  function stop() { if (!run) return; run.stop(); for (const n of run.notes) if (n.el) n.el.remove(); run = null; el.classList.remove('on'); BK.polePlaying = false; club.setMove('idle'); }
  return { start, stop, update, key, active: () => !!run };
}
