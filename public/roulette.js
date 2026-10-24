import * as THREE from 'three';
import { canvasTex, felt, label, neon } from './textures.js';

// European wheel order. The server picks the number; we solve the ball's path so it lands in that exact pocket.
export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');
const HEX = { red: 0xc0182a, black: 0x15151a, green: 0x0f7a3a };
const STEP = (Math.PI * 2) / 37;

export function createRoulette({ scene, BK, me, stations, obstacles }) {
  const TX = -6.9, TZ = -5.3, WX = -5.75, WY = 0.94;
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  // table
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 1.7), std(0x3a2210, { roughness: 0.4 })); top.position.set(TX, 0.9, TZ); top.castShadow = top.receiveShadow = true; scene.add(top);
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 1.5), std(0x2a170b)); body.position.set(TX, 0.43, TZ); body.castShadow = true; scene.add(body);
  const layout = canvasTex(1024, 400, (g, w, h) => {
    const f = felt('#0b6b34'); g.drawImage(f.c, 0, 0, w, h);
    g.strokeStyle = '#e8e0b0'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    const cw = 62, ch = 80, x0 = 90, y0 = 40;
    g.fillStyle = HEX.green.toString(16).padStart(6, '0') && '#0f7a3a'; g.fillRect(24, y0, 62, ch * 3); g.strokeRect(24, y0, 62, ch * 3);
    g.fillStyle = '#fff'; g.font = '900 40px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('0', 55, y0 + ch * 1.5);
    for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row), c = colorOf(n); g.fillStyle = c === 'red' ? '#c0182a' : '#15151a'; g.fillRect(x0 + col * cw, y0 + row * ch, cw - 2, ch - 2);
      g.fillStyle = '#fff'; g.font = '800 28px system-ui'; g.fillText(String(n), x0 + col * cw + cw / 2, y0 + row * ch + ch / 2);
    }
    ['1st 12', '2nd 12', '3rd 12'].forEach((l, i) => { g.strokeStyle = '#e8e0b0'; g.strokeRect(x0 + i * 4 * cw, y0 + ch * 3 + 6, 4 * cw - 2, 56); g.fillStyle = '#e8e0b0'; g.font = '800 26px system-ui'; g.fillText(l, x0 + i * 4 * cw + 2 * cw, y0 + ch * 3 + 36); });
    [['RED', '#c0182a'], ['BLACK', '#15151a']].forEach(([l, c], i) => { g.fillStyle = c; g.fillRect(x0 + i * 6 * cw + 6, y0 + ch * 3 + 76, 6 * cw - 14, 56); g.fillStyle = '#fff'; g.fillText(l, x0 + i * 6 * cw + 3 * cw, y0 + ch * 3 + 106); });
  }).t;
  const lay = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.9), new THREE.MeshStandardMaterial({ map: layout, roughness: 1 })); lay.rotation.x = -Math.PI / 2; lay.position.set(TX - 0.55, 0.955, TZ); scene.add(lay);

  // chips + sign
  const chipCols = [0xe4e4ea, 0xc0182a, 0x1d6ab0, 0x1c1c20, 0x1d8a4a, 0xe0a020];
  const chipStack = (x, z, n, ci) => { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.009, 18), std(chipCols[ci], { roughness: 0.4 })); m.position.set(x + (i % 2) * 0.002, 0.962 + i * 0.0098, z); m.castShadow = true; scene.add(m); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.004, 18), std(0xffffff)); s.position.copy(m.position); s.scale.set(0.5, 1, 0.5); scene.add(s); } };
  [[-7.7, -5.0, 9, 1], [-7.62, -4.95, 6, 0], [-7.55, -5.05, 7, 2], [-7.2, -4.7, 5, 3], [-6.9, -5.6, 8, 4], [-6.8, -5.55, 4, 5], [-7.9, -5.5, 6, 0], [-6.4, -4.8, 5, 1], [-6.3, -5.7, 7, 3]].forEach(([x, z, n, c]) => chipStack(x, z, n, c));
  { const t = neon('HIGH ROLLER', '#ff4ad0', { w: 512, h: 160, size: 70 }).t; const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.69), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })); m.position.set(TX, 3.5, -7.85); scene.add(m); const l = new THREE.PointLight(0xff40c0, 16, 7); l.position.set(TX, 3.2, -7.2); scene.add(l); }
  // wheel
  const wheel = new THREE.Group(); wheel.position.set(WX, WY, TZ); wheel.scale.setScalar(1.3); scene.add(wheel);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, 0.1, 40), std(0x4a2a12, { roughness: 0.3 })); bowl.position.y = 0.0; wheel.add(bowl);
  const track = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 40), std(0x8a8a92, { metalness: 0.8, roughness: 0.25 })); track.position.y = 0.05; wheel.add(track);
  const D = new THREE.Group(); D.position.y = 0.08; wheel.add(D);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 40), std(0xb08a2a, { metalness: 0.7, roughness: 0.35 })); D.add(base);
  ORDER.forEach((n, k) => {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 4, 1, false, k * STEP + STEP * 0.04, STEP * 0.92), std(HEX[colorOf(n)], { roughness: 0.4 })); seg.position.y = 0.02; D.add(seg);
    const th = (k + 0.5) * STEP, r = 0.285;
    const { t } = canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.font = '800 34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 34); });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(0.075, 0.075, 1); sp.position.set(r * Math.sin(th), 0.075, r * Math.cos(th)); D.add(sp);
  });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.06, 24), std(0x5a3a18, { roughness: 0.3 })); hub.position.y = 0.045; D.add(hub);
  const tur = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 12), std(0xd8b04a, { metalness: 0.9, roughness: 0.2 })); tur.position.y = 0.15; D.add(tur);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), std(0xffffff, { roughness: 0.1, metalness: 0.3 })); ball.castShadow = true; ball.visible = false; wheel.add(ball);
  obstacles.push({ x: TX - 0.9, z: TZ, r: 1.0 }, { x: TX + 0.2, z: TZ, r: 1.0 }, { x: WX, z: TZ, r: 0.95 });
  const sl = label('🎰 ROULETTE'); sl.position.set(TX, 2.3, TZ); scene.add(sl);
  stations.push({ x: -6.2, z: -3.5, r: 2.3, text: 'E - Roulette table', act: () => BK.openPanel('wheel') });

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
      spin = { start: performance.now(), T, p0, k, n: m.n, color: m.color, mine: m.mine, th0, A, thetaK, shown: false };
      pop.classList.add('hidden');
    },
    active: () => !!spin && (performance.now() - spin.start) / 1000 < spin.T + 4.5,
    debug() { const th = Math.atan2(ball.position.x, ball.position.z), rel = trueMod(th - D.rotation.y); return { under: ORDER[Math.floor(rel / STEP)], expected: spin ? spin.n : null, t: spin ? (performance.now() - spin.start) / 1000 : null, popup: !pop.classList.contains('hidden'), popText: pop.textContent, radius: Math.hypot(ball.position.x, ball.position.z) }; },
    lookTarget() { return spin && spin.mine && (performance.now() - spin.start) / 1000 < spin.T + 2.5 ? { x: -5.75, z: -3.6, yaw: 0, pitch: -0.5 } : null; },
    update(dt) {
      if (!spin) { psi += wheelW * 0.15 * dt; D.rotation.y = psi; return; }
      const t = (performance.now() - spin.start) / 1000, T = spin.T;
      psi = psiAt(t, spin.p0); D.rotation.y = psi;
      ball.visible = true; let th, r, y;
      if (t < T) {
        const tauB = T * 0.28, s = (1 - Math.exp(-t / tauB)) / (1 - Math.exp(-T / tauB)); th = spin.th0 - spin.A * s;
        const u = Math.min(1, Math.max(0, (t / T - 0.5) / 0.3)), e = u * u * (3 - 2 * u);
        r = 0.4 + (0.265 - 0.4) * e + (u >= 1 ? Math.sin((t / T - 0.8) * 60) * 0.012 * Math.exp(-(t / T - 0.8) * 28) : 0);
        y = 0.11 - 0.05 * e + (u > 0.35 ? Math.abs(Math.sin(t * 9)) * 0.025 * (1 - e) : 0);
      } else { th = spin.thetaK + psi; r = 0.265; y = 0.075; }
      ball.position.set(r * Math.sin(th), y + 0.0, r * Math.cos(th));
      if (t >= T && !spin.shown) { spin.shown = true; pop.textContent = `${spin.n}  ${spin.color.toUpperCase()}`; pop.style.color = spin.color === 'red' ? '#ff4d5e' : spin.color === 'green' ? '#27e08a' : '#e8ecff'; pop.classList.remove('hidden'); setTimeout(() => pop.classList.add('hidden'), 4200); }
    },
  };
}
