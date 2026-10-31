// Ball Knowledge audio: every sound is synthesized with Web Audio (no asset files).
//   - SFX are pure functions (ctx, out, t, p) so they can be rendered live or into an OfflineAudioContext for testing.
//   - 3D: sounds with a world position go through a PannerNode; the listener follows the camera.
//   - Ambience (crowd murmur, random bar noises) and procedural jukebox music run from update(dt).
// Public API: audio.unlock(), audio.sfx(name, {pos, v}), audio.loop(name, {pos}) -> {stop()}, audio.update(dt, camera),
//             audio.music.next()/toggle(), audio.settings, audio.setVolume(bus, v), audio.ctx / audio.buses (for voice chat).

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- building blocks
const noiseCache = new WeakMap();
function noiseBuf(c) {
  let b = noiseCache.get(c); if (b) return b;
  const len = c.sampleRate * 2; b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; } // pink-ish
  noiseCache.set(c, b); return b;
}
// shaped noise burst through a biquad. o: {type,f,f2,q,g,a,d,at}
function N(c, out, t, dur, o = {}) {
  const s = c.createBufferSource(); s.buffer = noiseBuf(c); s.loop = true; s.playbackRate.value = o.rate || 1;
  const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur); f.Q.value = o.q ?? 1;
  const g = c.createGain(); const peak = o.g ?? 0.5, at = o.at ?? 0.003;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return g;
}
// oscillator with pitch glide + decay envelope. o: {type,f,f2,g,at}
function T(c, out, t, dur, o = {}) {
  const os = c.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f || 440, t); if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g ?? 0.4), t + (o.at ?? 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  os.connect(g); g.connect(out); os.start(t); os.stop(t + dur + 0.05); return os;
}
// metallic/glassy bell from inharmonic partials
function bell(c, out, t, f, dur, g = 0.25, parts = [1, 2.76, 5.4, 8.9]) { parts.forEach((m, i) => T(c, out, t, dur / (1 + i * 0.6), { f: f * m, g: g / (1 + i * 0.9) })); }
const lp = (c, out, f, q = 0.7) => { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; b.connect(out); return b; };

// ---------------------------------------------------------------- SFX library  (c = context, out = destination node, t = start time, p = params {v: 0..1 intensity})
export const SFX = {
  click: (c, o, t) => { T(c, o, t, 0.04, { f: 1900, f2: 1000, g: 0.25 }); N(c, o, t, 0.015, { f: 4000, g: 0.1 }); },
  tick: (c, o, t, p) => { T(c, o, t, 0.02, { type: 'triangle', f: 2600 * (p.pitch || 1), g: 0.18 }); N(c, o, t, 0.012, { f: 5000, g: 0.12 }); },
  bet: (c, o, t) => { SFX.chip(c, o, t); T(c, o, t + 0.05, 0.1, { f: 900, f2: 1300, g: 0.18, type: 'triangle' }); },
  chip: (c, o, t) => { for (let i = 0; i < 3; i++) { const u = t + i * 0.045 + rnd(0, 0.01); T(c, o, u, 0.05, { type: 'triangle', f: rnd(2000, 2600), f2: 1500, g: 0.2 }); N(c, o, u, 0.025, { f: rnd(3500, 5000), q: 2, g: 0.15 }); } },
  vibrate: (c, o, t) => { for (let i = 0; i < 2; i++) { T(c, o, t + i * 0.24, 0.18, { type: 'square', f: 118, g: 0.16 }); T(c, o, t + i * 0.24, 0.18, { type: 'sawtooth', f: 236, g: 0.05 }); } }, // phone on vibrate
  coin: (c, o, t) => { T(c, o, t, 0.12, { type: 'square', f: 1318, g: 0.1 }); T(c, o, t + 0.07, 0.4, { type: 'square', f: 1975, g: 0.1 }); bell(c, o, t + 0.07, 1975, 0.5, 0.08, [1, 2.01]); },
  cash: (c, o, t) => { for (let i = 0; i < 6; i++) N(c, o, t + i * 0.035, 0.03, { f: 3000 + i * 300, q: 3, g: 0.14 }); bell(c, o, t + 0.25, 2093, 0.9, 0.22, [1, 2.4, 4.1]); },
  win: (c, o, t) => { [523, 659, 784, 1047].forEach((f, i) => { T(c, o, t + i * 0.09, 0.35, { type: 'triangle', f, g: 0.22 }); T(c, o, t + i * 0.09, 0.35, { type: 'square', f: f * 2, g: 0.04 }); }); bell(c, o, t + 0.36, 2093, 0.8, 0.12); },
  bigwin: (c, o, t) => { SFX.win(c, o, t); SFX.win(c, o, t + 0.42); for (let i = 0; i < 14; i++) T(c, o, t + 0.2 + i * 0.07, 0.15, { f: rnd(2400, 5200), g: 0.05 }); },
  lose: (c, o, t) => { [392, 349, 294].forEach((f, i) => { const g = lp(c, o, 900); T(c, g, t + i * 0.16, 0.4, { type: 'sawtooth', f, f2: f * 0.97, g: 0.2 }); }); },
  buzz: (c, o, t) => { const g = lp(c, o, 700); T(c, g, t, 0.22, { type: 'sawtooth', f: 110, f2: 90, g: 0.25 }); T(c, g, t, 0.22, { type: 'square', f: 113, g: 0.12 }); },
  glass: (c, o, t) => { bell(c, o, t, rnd(2300, 2700), 0.5, 0.2, [1, 1.51, 2.3, 3.7]); N(c, o, t, 0.012, { f: 6000, q: 2, g: 0.15 }); },
  bottle: (c, o, t) => { N(c, o, t, 0.04, { f: 900, q: 3, g: 0.3 }); T(c, o, t, 0.08, { f: 340, f2: 260, g: 0.25 }); },
  pour: (c, o, t) => { N(c, o, t, 1.0, { f: 1500, f2: 2600, q: 0.8, g: 0.18, at: 0.08 }); for (let i = 0; i < 7; i++) T(c, o, t + 0.1 + i * 0.12 + rnd(0, 0.04), 0.07, { f: rnd(220, 420), f2: rnd(500, 800), g: 0.07 }); },
  gulp: (c, o, t) => { for (let i = 0; i < 3; i++) T(c, o, t + i * 0.2, 0.12, { f: 190, f2: 110, g: 0.28 }); },
  burp: (c, o, t) => { const g = lp(c, o, 600); T(c, g, t, 0.45, { type: 'sawtooth', f: 90, f2: 60, g: 0.3 }); N(c, o, t, 0.4, { type: 'lowpass', f: 400, g: 0.1 }); },
  bell: (c, o, t) => { bell(c, o, t, 1568, 1.1, 0.3, [1, 2.4, 4.8]); },
  // ---- gas station goods (public/items.js)
  lighter: (c, o, t) => { N(c, o, t, 0.02, { f: 5200, q: 4, g: 0.3 }); N(c, o, t + 0.03, 0.05, { f: 3000, q: 2, g: 0.18 }); N(c, o, t + 0.06, 0.5, { type: 'lowpass', f: 900, g: 0.12, at: 0.05 }); }, // flint wheel, then the flame
  drag: (c, o, t) => { N(c, o, t, 0.9, { type: 'highpass', f: 2800, g: 0.1, at: 0.2 }); for (let i = 0; i < 9; i++) N(c, o, t + 0.1 + i * 0.08 + rnd(0, 0.04), 0.012, { f: rnd(3500, 6500), q: 3, g: 0.1 }); }, // the inhale + the paper crackling
  exhale: (c, o, t) => { N(c, o, t, 1.1, { type: 'bandpass', f: 1100, f2: 500, q: 0.6, g: 0.16, at: 0.12 }); },
  canOpen: (c, o, t) => { N(c, o, t, 0.03, { f: 2400, q: 2, g: 0.35 }); N(c, o, t + 0.02, 0.5, { type: 'highpass', f: 4000, f2: 7000, g: 0.16, at: 0.01 }); T(c, o, t, 0.05, { f: 900, f2: 500, g: 0.12 }); }, // the tab, then the fizz
  canCrush: (c, o, t) => { for (let i = 0; i < 5; i++) N(c, o, t + i * 0.03 + rnd(0, 0.02), 0.04, { f: rnd(1500, 3500), q: 2, g: 0.22 }); T(c, o, t, 0.12, { type: 'triangle', f: 300, f2: 180, g: 0.15 }); },
  squelch: (c, o, t) => { N(c, o, t, 0.25, { type: 'lowpass', f: 700, f2: 250, q: 3, g: 0.35 }); T(c, o, t + 0.05, 0.15, { f: 240, f2: 120, g: 0.12 }); },
  scratch: (c, o, t) => { N(c, o, t, 0.07, { type: 'highpass', f: 3000, q: 1, g: 0.12 }); },
  heart: (c, o, t) => { T(c, o, t, 0.1, { f: 70, f2: 45, g: 0.3 }); T(c, o, t + 0.16, 0.1, { f: 62, f2: 42, g: 0.22 }); },
  step: (c, o, t, p) => { const v = p.v ?? 0.6; N(c, o, t, 0.07, { type: 'lowpass', f: 380 * rnd(0.85, 1.2), q: 0.5, g: 0.18 * v }); T(c, o, t, 0.07, { f: 95 * rnd(0.9, 1.1), f2: 55, g: 0.2 * v }); },
  sit: (c, o, t) => { N(c, o, t, 0.25, { type: 'lowpass', f: 320, f2: 120, g: 0.3 }); T(c, o, t, 0.15, { f: 75, f2: 45, g: 0.25 }); },
  stand: (c, o, t) => { N(c, o, t, 0.18, { type: 'lowpass', f: 260, f2: 400, g: 0.16 }); },
  // ---- pool
  cue: (c, o, t, p) => { const v = p.v ?? 0.5; T(c, o, t, 0.06, { f: 520, f2: 260, g: 0.22 + v * 0.3 }); N(c, o, t, 0.03, { f: 2600, q: 1.5, g: 0.18 + v * 0.3 }); },
  ballHit: (c, o, t, p) => { const v = Math.min(1, Math.max(0.1, p.v ?? 0.5)); T(c, o, t, 0.055, { f: 2200 + v * 900, f2: 1500, g: 0.12 + v * 0.45 }); T(c, o, t, 0.03, { type: 'triangle', f: 3600, g: 0.1 + v * 0.2 }); N(c, o, t, 0.02, { f: 4500, q: 2, g: 0.15 + v * 0.3 }); },
  poolBreak: (c, o, t) => { T(c, o, t, 0.12, { f: 1500, f2: 700, g: 0.4 }); N(c, o, t, 0.09, { type: 'highpass', f: 2500, g: 0.3 }); T(c, o, t, 0.2, { f: 240, f2: 120, g: 0.3 }); for (let i = 0; i < 8; i++) SFX.ballHit(c, o, t + 0.03 + i * 0.035 + rnd(0, 0.03), { v: rnd(0.2, 0.6) }); },
  cushion: (c, o, t, p) => { const v = Math.min(1, p.v ?? 0.5); T(c, o, t, 0.07, { type: 'triangle', f: 300, f2: 190, g: 0.1 + v * 0.35 }); N(c, o, t, 0.05, { type: 'lowpass', f: 1500, g: 0.06 + v * 0.15 }); },
  pocket: (c, o, t) => { T(c, o, t, 0.12, { f: 170, f2: 100, g: 0.4 }); N(c, o, t, 0.16, { type: 'lowpass', f: 900, f2: 300, g: 0.2 }); for (let i = 0; i < 4; i++) SFX.ballHit(c, o, t + 0.16 + i * (0.09 - i * 0.015), { v: 0.22 - i * 0.04 }); },
  // ---- darts
  dartThrow: (c, o, t) => { N(c, o, t, 0.16, { f: 2600, f2: 900, q: 1.2, g: 0.45, at: 0.04 }); },
  dartHit: (c, o, t) => { T(c, o, t, 0.09, { f: 170, f2: 80, g: 0.45 }); N(c, o, t, 0.05, { f: 1500, q: 1.5, g: 0.3 }); T(c, o, t + 0.01, 0.06, { type: 'triangle', f: 900, f2: 600, g: 0.1 }); },
  dartBull: (c, o, t) => { SFX.dartHit(c, o, t); bell(c, o, t + 0.05, 1760, 0.9, 0.22, [1, 2.4]); },
  dartMiss: (c, o, t) => { T(c, o, t, 0.1, { f: 110, f2: 70, g: 0.3 }); N(c, o, t, 0.08, { type: 'lowpass', f: 600, g: 0.2 }); },
  // ---- bowling
  bowlRelease: (c, o, t) => { T(c, o, t, 0.14, { f: 90, f2: 50, g: 0.5 }); N(c, o, t, 0.1, { type: 'lowpass', f: 500, g: 0.3 }); },
  pinHit: (c, o, t, p) => { const n = 3 + Math.floor((p.v ?? 0.5) * 6); for (let i = 0; i < n; i++) { const u = t + i * rnd(0.018, 0.045); T(c, o, u, 0.05, { type: 'triangle', f: rnd(650, 1300), f2: rnd(400, 700), g: rnd(0.12, 0.3) }); N(c, o, u, 0.03, { f: rnd(1500, 2600), q: 2, g: 0.2 }); } T(c, o, t, 0.2, { f: 130, f2: 70, g: 0.35 }); },
  pinCrash: (c, o, t, p) => { const n = 6 + Math.floor((p.v ?? 0.6) * 10); T(c, o, t, 0.4, { f: 120, f2: 55, g: 0.5 }); N(c, o, t, 0.5, { type: 'lowpass', f: 1200, f2: 300, g: 0.3 }); for (let i = 0; i < n; i++) { const u = t + rnd(0, 0.65); T(c, o, u, 0.06, { type: 'triangle', f: rnd(500, 1400), f2: rnd(300, 600), g: rnd(0.08, 0.25) }); N(c, o, u, 0.03, { f: rnd(1400, 2800), q: 2, g: 0.15 }); } },
  gutter: (c, o, t) => { N(c, o, t, 0.9, { type: 'lowpass', f: 380, f2: 220, g: 0.3, at: 0.1 }); T(c, o, t, 0.8, { f: 62, g: 0.2, at: 0.1 }); },
  // ---- cornhole
  bagThrow: (c, o, t) => { N(c, o, t, 0.16, { type: 'lowpass', f: 900, f2: 400, g: 0.4, at: 0.05 }); },
  bagThud: (c, o, t) => { T(c, o, t, 0.13, { f: 95, f2: 50, g: 0.5 }); N(c, o, t, 0.1, { type: 'lowpass', f: 520, g: 0.28 }); },
  bagHole: (c, o, t) => { SFX.bagThud(c, o, t); N(c, o, t + 0.08, 0.35, { f: 1000, f2: 200, q: 1, g: 0.14, at: 0.05 }); T(c, o, t + 0.3, 0.2, { f: 160, f2: 90, g: 0.25 }); bell(c, o, t + 0.12, 1320, 0.6, 0.12, [1, 2]); },
  bagMiss: (c, o, t) => { T(c, o, t, 0.1, { f: 80, f2: 55, g: 0.3 }); N(c, o, t, 0.08, { type: 'lowpass', f: 450, g: 0.18 }); },
  // ---- roulette
  rTick: (c, o, t, p) => { T(c, o, t, 0.03, { type: 'triangle', f: 1700 * (p.pitch || 1), f2: 1100, g: 0.18 }); N(c, o, t, 0.015, { f: 4200, q: 2, g: 0.1 }); },
  rDrop: (c, o, t) => { for (let i = 0; i < 6; i++) T(c, o, t + i * (0.07 - i * 0.008), 0.05, { type: 'triangle', f: rnd(900, 1500), f2: 600, g: 0.2 - i * 0.025 }); T(c, o, t + 0.4, 0.15, { f: 180, f2: 110, g: 0.3 }); },
  // ---- crowd / bar
  cheer: (c, o, t, p) => { const v = p.v ?? 0.7, d = 1.4 + v * 1.2; [[700, 0.9], [1250, 0.7], [2600, 0.4]].forEach(([f, q]) => N(c, o, t, d, { f, q, g: 0.12 + v * 0.12, at: 0.25 })); for (let i = 0; i < 12 * v + 3; i++) N(c, o, t + rnd(0.1, d), 0.04, { f: rnd(1200, 2500), q: 1, g: 0.12 }); },
  kiss: (c, o, t) => { N(c, o, t, 0.07, { f: 2400, q: 2, g: 0.22 }); T(c, o, t + 0.04, 0.14, { type: 'sine', f: 700, f2: 1700, g: 0.22 }); N(c, o, t + 0.12, 0.05, { f: 3800, q: 3, g: 0.18 }); }, // mwah
  boo: (c, o, t, p) => { const v = p.v ?? 0.7, g = lp(c, o, 650); for (let i = 0; i < 11; i++) { const f = rnd(92, 185), st = t + rnd(0, 0.35), d = rnd(1.3, 2.1) * (0.8 + v * 0.4); T(c, g, st, d, { type: 'sawtooth', f, f2: f * 0.8, g: 0.03 + v * 0.03, at: 0.28 }); } N(c, o, t, 1.9, { f: 380, q: 1.3, g: 0.08 + v * 0.08, at: 0.3 }); }, // a room full of "booooo"
  groan: (c, o, t) => { const g = lp(c, o, 900); T(c, g, t, 1.0, { type: 'sawtooth', f: 240, f2: 130, g: 0.14, at: 0.2 }); T(c, g, t, 1.0, { type: 'sawtooth', f: 310, f2: 170, g: 0.1, at: 0.2 }); N(c, o, t, 1.0, { f: 700, q: 0.8, g: 0.1, at: 0.2 }); },
  laugh: (c, o, t) => { for (let i = 0; i < 5; i++) { const u = t + i * 0.14; const g = lp(c, o, 1400); T(c, g, u, 0.11, { type: 'sawtooth', f: 330 - i * 15, f2: 300 - i * 15, g: 0.1 }); N(c, o, u, 0.1, { f: 1500, q: 1, g: 0.07 }); } },
  murmur: (c, o, t) => { const d = rnd(0.5, 1.2); const f = rnd(350, 700); N(c, o, t, d, { f, f2: f * rnd(0.8, 1.4), q: 3, g: 0.5, at: d * 0.4 }); N(c, o, t, d, { f: f * 2.4, q: 3, g: 0.3, at: d * 0.4 }); },
  punch: (c, o, t) => { N(c, o, t, 0.08, { type: 'lowpass', f: 1000, g: 0.4 }); T(c, o, t, 0.12, { f: 140, f2: 55, g: 0.5 }); },
  knock: (c, o, t) => { for (let i = 0; i < 3; i++) { T(c, o, t + i * 0.22, 0.12, { f: 120, f2: 80, g: 0.5 }); N(c, o, t + i * 0.22, 0.06, { type: 'lowpass', f: 700, g: 0.3 }); } },
  sting: (c, o, t) => { const g = lp(c, o, 600); T(c, g, t, 1.1, { type: 'sawtooth', f: 55, f2: 52, g: 0.4, at: 0.05 }); T(c, g, t, 1.1, { type: 'sawtooth', f: 58.3, g: 0.3, at: 0.05 }); T(c, g, t + 0.5, 0.7, { type: 'sawtooth', f: 41, g: 0.3 }); },
  horn: (c, o, t) => { const g = lp(c, o, 1800); [220, 277, 330].forEach((f) => T(c, g, t, 0.9, { type: 'sawtooth', f, f2: f * 1.01, g: 0.12, at: 0.05 })); },
  blackout: (c, o, t) => { T(c, o, t, 0.9, { type: 'sawtooth', f: 260, f2: 35, g: 0.25, at: 0.01 }); N(c, o, t, 0.5, { type: 'lowpass', f: 900, f2: 120, g: 0.25 }); T(c, o, t + 0.05, 0.12, { f: 90, g: 0.4 }); },
  powerOn: (c, o, t) => { T(c, o, t, 0.5, { type: 'sawtooth', f: 40, f2: 300, g: 0.18, at: 0.1 }); N(c, o, t + 0.3, 0.08, { f: 2500, g: 0.3 }); },
  crate: (c, o, t) => { N(c, o, t, 0.5, { f: 400, f2: 3500, q: 1.5, g: 0.2, at: 0.3 }); for (let i = 0; i < 9; i++) T(c, o, t + 0.35 + i * 0.05, 0.14, { f: 1400 + i * 260, g: 0.08, type: 'triangle' }); },
  rare: (c, o, t) => { SFX.crate(c, o, t); SFX.bigwin(c, o, t + 0.6); },
  glassBreak: (c, o, t) => { N(c, o, t, 0.09, { type: 'highpass', f: 3000, g: 0.6 }); T(c, o, t, 0.06, { f: 1700, f2: 900, g: 0.35 }); N(c, o, t + 0.01, 0.35, { type: 'highpass', f: 5200, g: 0.28, at: 0.02 });
    for (let i = 0; i < 16; i++) { const u = t + 0.03 + Math.pow(i / 16, 1.6) * 0.75 + rnd(0, 0.02); bell(c, o, u, rnd(2600, 6800), rnd(0.12, 0.3), rnd(0.05, 0.16) * (1 - i / 26), [1, 1.5, 2.3]); } },
  bonk: (c, o, t) => { T(c, o, t, 0.16, { f: 220, f2: 70, g: 0.5 }); N(c, o, t, 0.08, { type: 'lowpass', f: 900, g: 0.35 }); for (let i = 0; i < 4; i++) bell(c, o, t + 0.12 + i * 0.1, 1400 + i * 260, 0.3, 0.08, [1, 2.1]); },
  boing: (c, o, t) => { T(c, o, t, 0.4, { type: 'sine', f: 180, f2: 520, g: 0.25 }); T(c, o, t + 0.1, 0.4, { type: 'triangle', f: 360, f2: 900, g: 0.1 }); },
  cork: (c, o, t) => { T(c, o, t, 0.05, { f: 520, f2: 180, g: 0.5 }); N(c, o, t, 0.03, { f: 1800, q: 1.5, g: 0.5 }); N(c, o, t + 0.04, 1.2, { type: 'highpass', f: 3500, f2: 6000, g: 0.2, at: 0.02 }); }, // champagne: the pop, then the spray
  rev: (c, o, t) => { const g = lp(c, o, 900); T(c, g, t, 2.2, { type: 'sawtooth', f: 55, f2: 190, g: 0.32, at: 0.08 }); T(c, g, t, 2.2, { type: 'square', f: 110, f2: 380, g: 0.1, at: 0.08 }); N(c, o, t + 0.1, 0.5, { type: 'lowpass', f: 600, g: 0.2 }); }, // a supercar leaving in a hurry
  crash: (c, o, t) => { T(c, o, t, 0.9, { f: 70, f2: 28, g: 0.9 }); N(c, o, t, 1.6, { type: 'lowpass', f: 2200, f2: 160, g: 0.7 }); for (let i = 0; i < 18; i++) { const u = t + rnd(0.05, 1.2); N(c, o, u, 0.08, { f: rnd(500, 3000), q: 2, g: rnd(0.1, 0.3) }); } SFX.glassBreak(c, o, t + 0.05); }, // the wrecking ball
  siren: (c, o, t) => { const g = lp(c, o, 2600); for (let i = 0; i < 3; i++) T(c, g, t + i * 0.9, 0.85, { type: 'square', f: i % 2 ? 960 : 640, f2: i % 2 ? 640 : 960, g: 0.09, at: 0.03 }); }, // a squad car's two-tone whoop
  whoosh: (c, o, t) => { N(c, o, t, 0.35, { f: 600, f2: 2500, q: 0.8, g: 0.4, at: 0.15 }); },
  roll: (c, o, t) => { N(c, o, t, 0.5, { type: 'lowpass', f: 300, g: 0.14 }); },
};

// ---------------------------------------------------------------- jukebox songs (scheduled on the audio clock, 1 bar at a time)
const SONGS = [
  { name: 'Last Call Shuffle', bpm: 118, bar(c, o, t, bar) { // 12-bar blues shuffle in A
    const sp = 60 / this.bpm, roots = [57, 57, 57, 57, 62, 62, 57, 57, 64, 62, 57, 64], r = roots[bar % 12], third = (n) => n + 4, tri = sp / 3;
    for (let b = 0; b < 4; b++) { const u = t + b * sp; // walking bass
      T(c, lp(c, o, 500), u, sp * 0.8, { type: 'triangle', f: mtof([r - 12, r - 12 + 4, r - 12 + 7, r - 12 + 9][b]), g: 0.3 }); }
    for (let b = 0; b < 4; b++) for (const k of [0, 2]) { const u = t + b * sp + k * tri; const g = lp(c, o, 1800); [r, r + 4, r + 7, r + 10].forEach((n) => T(c, g, u, tri * 0.9, { type: 'sawtooth', f: mtof(n), g: 0.035 })); }
    for (let b = 0; b < 4; b++) { N(c, o, t + b * sp, 0.1, { type: 'highpass', f: 6000, g: 0.05 }); N(c, o, t + b * sp + 2 * tri, 0.08, { type: 'highpass', f: 6000, g: 0.04 }); if (b % 2) { N(c, o, t + b * sp, 0.12, { f: 1800, g: 0.14 }); T(c, o, t + b * sp, 0.1, { f: 190, f2: 140, g: 0.15 }); } else T(c, o, t + b * sp, 0.15, { f: 110, f2: 45, g: 0.35 }); }
    if (bar % 4 === 3) { const lead = lp(c, o, 2600); [0, 3, 5, 6, 7, 10].forEach((n, i) => T(c, lead, t + (i + 4) * tri * 0.6 + 0.0, 0.2, { type: 'square', f: mtof(81 + n - 12), g: 0.04 })); }
  } },
  { name: 'Neon Overdrive', bpm: 104, bar(c, o, t, bar) { // synthwave: i-VI-III-VII in A minor
    const sp = 60 / this.bpm, chords = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], ch = chords[bar % 4], root = ch[0] - 12;
    for (let i = 0; i < 16; i++) { const u = t + i * sp / 4; T(c, lp(c, o, 700 + (i % 4) * 150, 3), u, sp / 4 * 0.9, { type: 'sawtooth', f: mtof(root + (i % 2 ? 12 : 0)), g: 0.16 }); }
    const pad = lp(c, o, 1200); ch.forEach((n) => { T(c, pad, t, sp * 4, { type: 'sawtooth', f: mtof(n), g: 0.045, at: 0.3 }); T(c, pad, t, sp * 4, { type: 'sawtooth', f: mtof(n) * 1.006, g: 0.04, at: 0.3 }); });
    for (let i = 0; i < 8; i++) { const u = t + i * sp / 2, n = ch[[0, 1, 2, 1, 2, 1, 0, 2][i]] + 24; T(c, lp(c, o, 3500), u, sp / 2 * 0.7, { type: 'square', f: mtof(n), g: 0.05 }); }
    for (let b = 0; b < 4; b++) { T(c, o, t + b * sp, 0.18, { f: 130, f2: 40, g: 0.5 }); N(c, o, t + b * sp + sp / 2, 0.05, { type: 'highpass', f: 7000, g: 0.07 }); if (b % 2) { N(c, o, t + b * sp, 0.2, { f: 2000, q: 0.6, g: 0.22 }); } }
  } },
  { name: 'Honky Tonk Heartbreak', bpm: 132, bar(c, o, t, bar) { // country two-step in G
    const sp = 60 / this.bpm, prog = [55, 55, 60, 62], r = prog[bar % 4];
    for (let b = 0; b < 4; b++) { const u = t + b * sp; const n = b % 2 ? r + 7 - 12 : r - 12; T(c, lp(c, o, 600), u, sp * 0.5, { type: 'triangle', f: mtof(n), g: 0.34 });
      if (b % 2) { const g = lp(c, o, 2800); [r + 12, r + 16, r + 19].forEach((m, i) => T(c, g, u + i * 0.012, sp * 0.35, { type: 'sawtooth', f: mtof(m), f2: mtof(m) * 0.995, g: 0.05 })); N(c, o, u, 0.1, { f: 2200, g: 0.16 }); } else { T(c, o, u, 0.12, { f: 120, f2: 55, g: 0.3 }); }
      N(c, o, u + sp / 2, 0.04, { type: 'highpass', f: 6500, g: 0.05 }); }
    const l = lp(c, o, 3000); [0, 4, 7, 9, 7, 4, 2, 4].forEach((n, i) => { if ((i + bar) % 3 !== 2) T(c, l, t + i * sp / 2, sp * 0.35, { type: 'sawtooth', f: mtof(r + 24 + n), f2: mtof(r + 24 + n) * 0.99, g: 0.04 }); });
  } },
  { name: 'Smoke & Velvet', bpm: 86, bar(c, o, t, bar) { // lounge: ii-V-I-vi jazz in C
    const sp = 60 / this.bpm, chords = [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 60, 64, 67]], ch = chords[bar % 4];
    const g = lp(c, o, 1500); ch.forEach((n, i) => T(c, g, t + i * 0.02, sp * 3.6, { type: 'triangle', f: mtof(n), g: 0.06, at: 0.05 }));
    for (let b = 0; b < 4; b++) { T(c, lp(c, o, 450), t + b * sp, sp * 0.9, { type: 'sine', f: mtof(ch[0] - 24 + (b === 3 ? 2 : 0)), g: 0.42 }); N(c, o, t + b * sp, 0.18, { f: 7000, q: 0.5, g: 0.05 }); if (b % 2 === 1) N(c, o, t + b * sp + sp * 0.66, 0.16, { f: 7500, q: 0.5, g: 0.04 }); }
    if (bar % 2) [0, 2, 4, 7].forEach((n, i) => T(c, lp(c, o, 2200), t + (i + 1) * sp * 0.75, sp * 0.6, { type: 'sine', f: mtof(ch[0] + 24 + n), g: 0.06 }));
  } },
];

// ---------------------------------------------------------------- engine
const KEY = 'bk_audio_v1';
const DEFAULTS = { master: 0.8, sfx: 0.9, music: 0.45, ambience: 0.5, voice: 1.0, voiceMode: 'ptt', voiceRange: 'near', song: 0, musicOn: true };
const load = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; } };

export const audio = (() => {
  const A = { settings: load(), ctx: null, buses: null, ready: false, listener: { x: 0, y: 1.6, z: 0 }, jukebox: { x: -10.6, y: 1.1, z: 7.1 } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(A.settings)); } catch {} };
  let ambT = 0, musicTimer = 0, nextBar = 0, barNo = 0, music = null, ambBed = null;

  A.unlock = () => {
    if (A.ctx) { if (A.ctx.state !== 'running') A.ctx.resume(); return A.ctx; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    const c = A.ctx = new C({ latencyHint: 'interactive' });
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    const master = c.createGain(); master.gain.value = A.settings.master; master.connect(comp); comp.connect(c.destination);
    const mk = (v) => { const g = c.createGain(); g.gain.value = v; g.connect(master); return g; };
    A.buses = { master, sfx: mk(A.settings.sfx), music: mk(A.settings.music), ambience: mk(A.settings.ambience), voice: mk(A.settings.voice) };
    // little room reverb on sfx+music (generated impulse)
    const ir = c.createBuffer(2, c.sampleRate * 0.9, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2); }
    const conv = c.createConvolver(); conv.buffer = ir; const wet = c.createGain(); wet.gain.value = 0.16; conv.connect(wet); wet.connect(master); A.reverb = conv;
    A.buses.sfx.connect(conv); A.buses.music.connect(conv);
    A.ready = true; startAmbience(); if (A.settings.musicOn) startMusic();
    return c;
  };
  addEventListener('pointerdown', () => A.unlock(), { once: false, passive: true }); addEventListener('keydown', () => A.unlock(), { passive: true });

  const panner = (pos, ref = 2.5, roll = 1.1) => {
    const c = A.ctx, p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 60;
    p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1; p.positionZ.value = pos.z; return p;
  };
  A.sfx = (name, o = {}) => {
    if (!A.ready || !SFX[name] || A.ctx.state !== 'running') return;
    const c = A.ctx; let out = A.buses.sfx;
    if (o.pos) { const p = panner(o.pos, o.ref || 2.5, o.roll ?? 1.1); p.connect(A.buses.sfx); out = p; setTimeout(() => { try { p.disconnect(); } catch {} }, 4500); }
    SFX[name](c, out, c.currentTime + (o.delay || 0.005), o);
  };
  // looping sounds (bowling ball rumble, wheel whir): returns {stop(), setGain(g)}
  A.loop = (name, o = {}) => {
    if (!A.ready) return { stop() {}, set() {} };
    const c = A.ctx, g = c.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(o.g || 0.5, c.currentTime + 0.15); let out = A.buses.sfx;
    let pn = null; if (o.pos) { pn = panner(o.pos, o.ref || 2.5, o.roll ?? 1.1); pn.connect(A.buses.sfx); g.connect(pn); } else g.connect(out);
    const s = c.createBufferSource(); s.buffer = noiseBuf(c); s.loop = true; const f = c.createBiquadFilter(); f.type = 'lowpass'; s.connect(f); f.connect(g);
    const low = c.createOscillator(); low.type = 'sine'; const lg = c.createGain(); lg.gain.value = 0.5; low.connect(lg); lg.connect(g);
    if (name === 'bowlRoll') { f.frequency.value = 420; low.frequency.value = 58; } else if (name === 'wheel') { f.frequency.value = 900; low.frequency.value = 120; lg.gain.value = 0.1; }
    s.start(); low.start();
    return { set(x) { g.gain.setTargetAtTime(Math.max(0.0001, x), c.currentTime, 0.08); }, setPos(q) { if (pn && pn.positionX) { pn.positionX.value = q.x; pn.positionY.value = q.y; pn.positionZ.value = q.z; } }, stop() { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.08); setTimeout(() => { try { s.stop(); low.stop(); g.disconnect(); } catch {} }, 400); } };
  };

  // ---- ambience: a constant crowd bed + scheduled one-shots at random spots in the room
  function startAmbience() {
    const c = A.ctx, out = A.buses.ambience;
    const bed = (f, q, g, lfoHz, lfoDepth) => { const s = c.createBufferSource(); s.buffer = noiseBuf(c); s.loop = true; const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const gg = c.createGain(); gg.gain.value = g; const l = c.createOscillator(); l.frequency.value = lfoHz; const ld = c.createGain(); ld.gain.value = lfoDepth; l.connect(ld); ld.connect(gg.gain); s.connect(b); b.connect(gg); gg.connect(out); s.start(0, Math.random()); l.start(); };
    bed(380, 0.7, 0.07, 0.13, 0.025); bed(820, 0.9, 0.05, 0.21, 0.02); bed(1700, 1.2, 0.022, 0.31, 0.012);
    const hum = c.createOscillator(); hum.frequency.value = 60; const hg = c.createGain(); hg.gain.value = 0.012; hum.connect(hg); hg.connect(out); hum.start(); ambBed = { hum };
  }
  const roomPos = () => ({ x: rnd(-9, 9), y: 1.5, z: rnd(-6, 6) });
  function ambientTick(dt) {
    ambT -= dt; if (ambT > 0) return; ambT = rnd(0.6, 2.2);
    const r = Math.random(), where = roomPos();
    if (r < 0.5) A.sfx('murmur', { pos: where, ref: 3 }); else if (r < 0.62) A.sfx('laugh', { pos: where, ref: 3 }); else if (r < 0.78) A.sfx('glass', { pos: where, ref: 3 });
    else if (r < 0.86) A.sfx('bottle', { pos: { x: 10.5, y: 1.2, z: rnd(-1, 6) }, ref: 3 }); else if (r < 0.92) A.sfx('click', { pos: where, ref: 4 });
    else if (r < 0.97) A.sfx('cheer', { pos: where, v: 0.25, ref: 4 });
  }

  // ---- jukebox music (spatialized at the jukebox, quieter far away)
  function startMusic() {
    const c = A.ctx; if (music) return;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 5000; const g = c.createGain(); g.gain.value = 0.0001;
    const p = panner(A.jukebox, 5, 0.55); filt.connect(p); p.connect(A.buses.music); g.connect(filt);
    music = { g, filt, p }; g.gain.setTargetAtTime(1, c.currentTime, 0.4); nextBar = c.currentTime + 0.15; barNo = 0; musicTimer = 0;
  }
  function stopMusic() { if (!music) return; const m = music; music = null; m.g.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.25); setTimeout(() => { try { m.g.disconnect(); m.filt.disconnect(); m.p.disconnect(); } catch {} }, 1200); }
  A.music = {
    get name() { return SONGS[A.settings.song % SONGS.length].name; }, get on() { return !!music; },
    next() { A.settings.song = (A.settings.song + 1) % SONGS.length; A.settings.musicOn = true; save(); if (A.ready) { stopMusic(); setTimeout(startMusic, 150); } return A.music.name; },
    toggle() { A.settings.musicOn = !A.settings.musicOn; save(); if (A.ready) { A.settings.musicOn ? startMusic() : stopMusic(); } return A.settings.musicOn; },
  };
  function musicTick() {
    if (!music) return; const c = A.ctx, s = SONGS[A.settings.song % SONGS.length];
    while (nextBar < c.currentTime + 0.6) { s.bar(c, music.g, nextBar, barNo++); nextBar += (60 / s.bpm) * 4; }
  }

  A.setVolume = (bus, v) => { A.settings[bus] = v; save(); if (A.buses && A.buses[bus]) A.buses[bus].gain.setTargetAtTime(v, A.ctx.currentTime, 0.05); };
  A.save = save;

  // call once per frame with the 3D camera
  const _f = { x: 0, y: 0, z: -1 };
  A.update = (dt, cam) => {
    if (!A.ready || !A.ctx) return; const c = A.ctx, L = c.listener;
    if (cam) {
      cam.updateMatrixWorld(); const e = cam.matrixWorld.elements; A.listener.x = e[12]; A.listener.y = e[13]; A.listener.z = e[14];
      const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
      if (L.positionX) { L.positionX.value = e[12]; L.positionY.value = e[13]; L.positionZ.value = e[14]; L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz; }
      else { L.setPosition(e[12], e[13], e[14]); L.setOrientation(fx, fy, fz, ux, uy, uz); }
    }
    ambientTick(dt); musicTick();
  };
  return A;
})();

// Render one SFX offline (used by the test harness) -> Float32Array
export async function renderSfx(name, seconds = 2, p = {}) {
  const c = new OfflineAudioContext(1, 44100 * seconds, 44100), g = c.createGain(); g.connect(c.destination);
  SFX[name](c, g, 0.02, p); const b = await c.startRendering(); return b.getChannelData(0);
}
export async function renderSong(i, bars = 2) {
  const s = SONGS[i], sec = bars * 4 * 60 / s.bpm + 0.5, c = new OfflineAudioContext(1, Math.ceil(44100 * sec), 44100), g = c.createGain(); g.connect(c.destination);
  for (let b = 0; b < bars; b++) s.bar(c, g, 0.05 + b * 4 * 60 / s.bpm, b); const r = await c.startRendering(); return r.getChannelData(0);
}
export const SONG_NAMES = SONGS.map((s) => s.name);
