import { audio } from './audio.js';
import * as THREE from 'three';
import { canvasTex, felt, label, neon } from './textures.js';

// European wheel order. The server picks the number; we solve the ball's path so it lands in that exact pocket.
export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');
const HEX = { red: 0xc0182a, black: 0x15151a, green: 0x0f7a3a };
const STEP = (Math.PI * 2) / 37;
// wheel-local heights/radii: the rotor's pockets are flush colored floors with low metal frets, so the resting ball sits on top of its color
const TRACK_Y = 0.07, ROTOR_Y = 0.05, SURF = 0.012, BALL_R = 0.017, FRET_H = 0.014, POCKET_IN = 0.2, POCKET_OUT = 0.29, REST_R = 0.245;
const REST_Y = ROTOR_Y + SURF + BALL_R, ROLL_Y = TRACK_Y + BALL_R;

// at: where the table goes. Everything below is laid out around the table's original spot in the bar (TX, TZ) inside a group moved by (at - that spot).
export function createRoulette({ scene: world, BK, me, stations, obstacles, at = { x: -6.9, z: -5.3 } }) {
  const TX = -6.9, TZ = -5.3, WX = -5.75, WY = 0.94, DX = at.x - TX, DZ = at.z - TZ;
  const scene = new THREE.Group(); scene.position.set(DX, 0, DZ); world.add(scene);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  // table
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.7), std(0x3a2210, { roughness: 0.4 })); top.position.set(TX, 0.9, TZ); top.castShadow = top.receiveShadow = true; scene.add(top);
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 1.5), std(0x2a170b)); body.position.set(TX, 0.43, TZ); body.castShadow = true; scene.add(body);
  // felt layout (canvas 1024x400 on a 2.3m x 0.9m plane); LAYC gives each bet spot's centre in canvas px, so chips can sit on it
  const LX0 = 90, LCW = 62, LY0 = 28, LCH = 70, LAYC = {};
  LAYC['0'] = [55, LY0 + LCH * 1.5];
  for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) LAYC[String(col * 3 + (3 - row))] = [LX0 + col * LCW + LCW / 2, LY0 + row * LCH + LCH / 2];
  ['c3', 'c2', 'c1'].forEach((c, row) => (LAYC[c] = [LX0 + 12 * LCW + LCW / 2, LY0 + row * LCH + LCH / 2]));
  ['d1', 'd2', 'd3'].forEach((d, i) => (LAYC[d] = [LX0 + i * 4 * LCW + 2 * LCW, LY0 + 3 * LCH + 30]));
  ['low', 'even', 'red', 'black', 'odd', 'high'].forEach((k, i) => (LAYC[k] = [LX0 + i * 2 * LCW + LCW, LY0 + 3 * LCH + 92]));
  const layout = canvasTex(1024, 400, (g, w, h) => {
    const f = felt('#0b6b34'); g.drawImage(f.c, 0, 0, w, h);
    g.strokeStyle = '#e8e0b0'; g.lineWidth = 3; g.textAlign = 'center'; g.textBaseline = 'middle';
    const cell = (x, y, cw, ch, fill, text, font) => { if (fill) { g.fillStyle = fill; g.fillRect(x, y, cw, ch); } g.strokeRect(x, y, cw, ch); g.fillStyle = '#fff'; g.font = font; g.fillText(text, x + cw / 2, y + ch / 2 + 1); };
    cell(24, LY0, 66, LCH * 3, '#0f7a3a', '0', '900 40px system-ui');
    for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) { const n = col * 3 + (3 - row); cell(LX0 + col * LCW, LY0 + row * LCH, LCW, LCH, colorOf(n) === 'red' ? '#c0182a' : '#15151a', String(n), '800 28px system-ui'); }
    for (let row = 0; row < 3; row++) cell(LX0 + 12 * LCW, LY0 + row * LCH, LCW, LCH, null, '2:1', '800 22px system-ui');
    ['1st 12', '2nd 12', '3rd 12'].forEach((l, i) => cell(LX0 + i * 4 * LCW, LY0 + 3 * LCH + 4, 4 * LCW, 52, null, l, '800 26px system-ui'));
    [['1-18'], ['EVEN'], ['RED', '#c0182a'], ['BLACK', '#15151a'], ['ODD'], ['19-36']].forEach(([l, c], i) => cell(LX0 + i * 2 * LCW, LY0 + 3 * LCH + 64, 2 * LCW, 56, c || null, l, '800 24px system-ui'));
  }).t;
  const lay = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.9), new THREE.MeshStandardMaterial({ map: layout, roughness: 1 })); lay.rotation.x = -Math.PI / 2; lay.position.set(TX - 0.55, 0.955, TZ); scene.add(lay);

  // chips + sign
  const chipCols = [0xe4e4ea, 0xc0182a, 0x1d6ab0, 0x1c1c20, 0x1d8a4a, 0xe0a020];
  const chipStack = (x, z, n, ci) => { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.009, 18), std(chipCols[ci], { roughness: 0.4 })); m.position.set(x + (i % 2) * 0.002, 0.962 + i * 0.0098, z); m.castShadow = true; scene.add(m); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.004, 18), std(0xffffff)); s.position.copy(m.position); s.scale.set(0.5, 1, 0.5); scene.add(s); } };
  [[-8.2, -5.98, 9, 1], [-8.1, -6.02, 6, 0], [-7.98, -5.97, 7, 2], [-7.86, -6.03, 5, 3], [-7.74, -5.98, 8, 4], [-7.62, -6.02, 4, 5], [-7.5, -5.97, 6, 0], [-7.38, -6.03, 5, 1], [-7.26, -5.98, 7, 3]] /* dealer's bank, off the felt */.forEach(([x, z, n, c]) => chipStack(x, z, n, c));
  { const t = neon('HIGH ROLLER', '#ff4ad0', { w: 512, h: 160, size: 70 }).t; const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.69), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })); const sz = at.signZ !== undefined ? at.signZ - DZ : -7.85; m.position.set(TX, at.signY ?? 3.5, sz); scene.add(m); const l = new THREE.PointLight(0xff40c0, 16, 7); l.position.set(TX, Math.min(3.2, (at.signY ?? 3.5) - 0.3), sz + 0.65); scene.add(l); }
  // wheel
  const wheel = new THREE.Group(); wheel.position.set(WX, WY, TZ); wheel.scale.setScalar(1.3); scene.add(wheel);
  // bowl + ball track: an open ring so the rotor below stays visible; the ball rolls on the track (TRACK_Y) then drops into a pocket
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, 0.1, 40), std(0x4a2a12, { roughness: 0.3 })); bowl.position.y = 0.0; wheel.add(bowl);
  const flat = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = Math.PI / 2; m.position.y = y; return m; }; // ring geometry laid flat; angle a maps to th = PI/2 - a
  wheel.add(flat(new THREE.RingGeometry(0.35, 0.47, 48), std(0x8a8a92, { metalness: 0.8, roughness: 0.25, side: THREE.DoubleSide }), TRACK_Y));
  { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 48, 1, true), std(0x5a3418, { roughness: 0.3, side: THREE.DoubleSide })); w.position.y = TRACK_Y + 0.02; wheel.add(w); }
  const D = new THREE.Group(); D.position.y = ROTOR_Y; wheel.add(D);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.02, 48), std(0xb08a2a, { metalness: 0.7, roughness: 0.35 })); D.add(base);
  const fretM = std(0xd8d8e0, { metalness: 0.9, roughness: 0.2 });
  ORDER.forEach((n, k) => {
    const col = std(HEX[colorOf(n)], { roughness: 0.45, side: THREE.DoubleSide }), a0 = Math.PI / 2 - (k + 1) * STEP;
    D.add(flat(new THREE.RingGeometry(POCKET_IN, POCKET_OUT, 3, 1, a0, STEP), col, SURF));        // the pocket floor: flush, the ball sits on it
    D.add(flat(new THREE.RingGeometry(POCKET_OUT, 0.343, 3, 1, a0, STEP), col, SURF + 0.0005)); // number ring
    const th = (k + 0.5) * STEP, r = 0.322;
    const { t } = canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.font = '800 40px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 34); });
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.036), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    num.rotation.set(-Math.PI / 2, th, 0, 'YXZ'); // flat, top of the digit toward the hub num.position.set(r * Math.sin(th), SURF + 0.002, r * Math.cos(th)); D.add(num);
    // metal fret on the boundary between this pocket and the next
    const fa = (k + 1) * STEP, fr = (POCKET_IN + POCKET_OUT) / 2, fret = new THREE.Mesh(new THREE.BoxGeometry(0.005, FRET_H, POCKET_OUT - POCKET_IN), fretM);
    fret.position.set(fr * Math.sin(fa), SURF + FRET_H / 2, fr * Math.cos(fa)); fret.rotation.y = fa; D.add(fret);
  });
  { const rim = new THREE.Mesh(new THREE.CylinderGeometry(POCKET_IN, POCKET_IN, FRET_H, 40, 1, true), fretM); rim.position.y = SURF + FRET_H / 2; D.add(rim); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.06, 24), std(0x5a3a18, { roughness: 0.3 })); hub.position.y = 0.04; D.add(hub);
  const tur = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 12), std(0xd8b04a, { metalness: 0.9, roughness: 0.2 })); tur.position.y = 0.13; D.add(tur);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 14, 10), std(0xffffff, { roughness: 0.1, metalness: 0.3 })); ball.castShadow = true; ball.visible = false; wheel.add(ball);
  obstacles.push({ x: TX - 0.9 + DX, z: TZ + DZ, r: 1.0 }, { x: TX + 0.2 + DX, z: TZ + DZ, r: 1.0 }, { x: WX + DX, z: TZ + DZ, r: 0.95 });
  const sl = label('🎰 ROULETTE'); sl.position.set(TX, 2.3, TZ); scene.add(sl);
  stations.push({ x: -6.2 + DX, z: -3.5 + DZ, r: 2.3, text: 'E - Roulette table', act: () => BK.openPanel('wheel') });

  // the spinner's bets as chip stacks on the felt (everyone sees them), cleared after the result
  const betChips = new THREE.Group(); scene.add(betChips);
  const CHIPC = [[500, 0xe0a020], [250, 0x7a2ab8], [100, 0x1c1c20], [50, 0xc0182a], [25, 0x1d8a4a], [10, 0x8a8a96]];
  const layXZ = (pk) => { const c = LAYC[pk]; if (!c) return null; return [TX - 0.55 - 1.15 + (c[0] / 1024) * 2.3, TZ - 0.45 + (c[1] / 400) * 0.9]; };
  function showBets(bets) {
    betChips.clear();
    for (const b of bets || []) { const p = layXZ(b.pick); if (!p) continue; let left = b.stake, h = 0;
      for (const [v, col] of CHIPC) while (left >= v && h < 12) { left -= v; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 16), std(col, { roughness: 0.4 })); m.position.set(p[0] + (h % 2) * 0.002, 0.962 + h * 0.0085, p[1]); m.castShadow = true; betChips.add(m); h++; } }
  }
  // result popup
  const pop = document.createElement('div'); pop.id = 'spinres'; pop.className = 'hidden'; document.body.appendChild(pop);
  let spin = null, psi = 0;
  const wheelW = 1.0, tauW = 6;
  const psiAt = (t, p0) => p0 + wheelW * tauW * (1 - Math.exp(-t / tauW));
  const trueMod = (x) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  return {
    onSpin(m) {
      const k = ORDER.indexOf(m.n), T = m.ms / 1000, p0 = psi;
      const thetaK = (k + 0.5) * STEP, psiT = psiAt(T, p0), thetaT = thetaK + psiT, th0 = Math.random() * Math.PI * 2;
      const delta = trueMod(th0 - thetaT), A = Math.PI * 2 * 5 + delta;
      spin = { start: performance.now(), T, p0, k, n: m.n, color: m.color, mine: m.mine, th0, A, thetaK, shown: false }; showBets(m.bets);
      pop.classList.add('hidden');
    },
    active: () => !!spin && (performance.now() - spin.start) / 1000 < spin.T + 4.5,
    debug() { const th = Math.atan2(ball.position.x, ball.position.z), rel = trueMod(th - D.rotation.y); return { under: ORDER[Math.floor(rel / STEP)], expected: spin ? spin.n : null, t: spin ? (performance.now() - spin.start) / 1000 : null, popup: !pop.classList.contains('hidden'), popText: pop.textContent, radius: Math.hypot(ball.position.x, ball.position.z) }; },
    lookTarget() { const at = { x: -5.75 + DX, z: -3.6 + DZ, yaw: 0, pitch: -0.5 }; return spin && spin.mine && (performance.now() - spin.start) / 1000 < spin.T + 2.5 && Math.hypot(me.x - at.x, me.z - at.z) < 5 ? at : null; }, // betting by phone (the hunt): no walk to the table
    update(dt) {
      if (!spin) { psi += wheelW * 0.15 * dt; D.rotation.y = psi; return; }
      const t = (performance.now() - spin.start) / 1000, T = spin.T;
      psi = psiAt(t, spin.p0); D.rotation.y = psi;
      ball.visible = true; let th, r, y;
      if (t < T) {
        const tauB = T * 0.28, s = (1 - Math.exp(-t / tauB)) / (1 - Math.exp(-T / tauB)); th = spin.th0 - spin.A * s;
        const u = Math.min(1, Math.max(0, (t / T - 0.5) / 0.3)), e = u * u * (3 - 2 * u);
        r = 0.41 + (REST_R - 0.41) * e + (u >= 1 ? Math.sin((t / T - 0.8) * 60) * 0.012 * Math.exp(-(t / T - 0.8) * 28) : 0);
        y = ROLL_Y + (REST_Y - ROLL_Y) * e + (u > 0.35 ? Math.abs(Math.sin(t * 9)) * 0.03 * (1 - e) : 0) + (u >= 1 ? Math.abs(Math.sin((t / T - 0.8) * 60)) * 0.012 * Math.exp(-(t / T - 0.8) * 28) : 0);
      } else { th = spin.thetaK + psi; r = REST_R; y = REST_Y; }
      ball.position.set(r * Math.sin(th), y + 0.0, r * Math.cos(th));
      { const wp = { x: -5.75 + DX, y: 1.0, z: -3.6 + DZ }; // sound: wheel whir while spinning, pocket ticks as the ball skitters over the pockets, a drop-in rattle at the end
        if (t < T) { if (!spin.snd) { spin.snd = audio.loop('wheel', { pos: wp, g: 0.2 }); spin.cell = -1; } spin.snd.set(0.2 * (1 - t / T) + 0.02);
          if (t / T > 0.55) { const cell = Math.floor(trueMod(th - psi) / STEP); if (cell !== spin.cell) { spin.cell = cell; audio.sfx('rTick', { pos: wp, pitch: 0.85 + Math.random() * 0.4, ref: 2.5 }); } } }
        else if (!spin.dropped) { spin.dropped = true; if (spin.snd) { spin.snd.stop(); spin.snd = null; } audio.sfx('rDrop', { pos: wp, ref: 2.5 }); } }
      if (t >= T && !spin.shown) { spin.shown = true; pop.textContent = `${spin.n}  ${spin.color.toUpperCase()}`; pop.style.color = spin.color === 'red' ? '#ff4d5e' : spin.color === 'green' ? '#27e08a' : '#e8ecff'; pop.classList.remove('hidden'); setTimeout(() => { pop.classList.add('hidden'); if (!spin || spin.shown) betChips.clear(); }, 4200); }
    },
  };
}
