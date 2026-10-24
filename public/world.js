import * as THREE from 'three';
import { createGames } from './games.js';
import { buildBar, ROOM } from './bar.js';
import { createTV } from './tv.js';
import { createRoulette } from './roulette.js';
import { createFX } from './fx.js';
import { makePerson, animate } from './people.js';
import { label } from './textures.js';

const BK = window.BK;
const canvas = document.getElementById('world');
const promptEl = document.getElementById('prompt');
const cross = Object.assign(document.createElement('div'), { id: 'cross' });
document.body.appendChild(cross); cross.style.display = 'none';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 80);
camera.rotation.order = 'YXZ';
const EYE = 1.65;

// ---------- world ----------
const tv = createTV(BK);
const bar = buildBar({ scene, BK, tv });
const { stations, obstacles } = bar;
const stdMat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const helpers = {
  mat: stdMat, label,
  box: (w, h, d, color, x, y, z, parent = scene, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(color, o)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; },
  cyl: (rt, rb, h, color, x, y, z, seg = 12, parent = scene, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), stdMat(color, o)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; },
};

// ---------- player state ----------
const me = { x: 0, z: 2, yaw: 0, pitch: 0 };
const keys = {};
const games = createGames({ scene, camera, BK, me, keys, helpers, stations, obstacles });
const roulette = createRoulette({ scene, BK, me, stations, obstacles });
BK.onSpin = (m) => roulette.onSpin(m);
BK.leaveGames = () => games.leave();
const fx = createFX(renderer, scene, camera);

const active = () => { const S = BK.S; return S && ['play', 'hunt'].includes(S.phase); };
const nearest = () => stations.filter((s) => Math.hypot(s.x - me.x, s.z - me.z) < s.r).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];

addEventListener('keydown', (e) => {
  if (!active() || BK.ui.open) return;
  keys[e.code] = true;
  if (e.code === 'KeyE') { if (games.active()) games.leave(); else { const s = nearest(); if (s) s.act(); } }
  if (e.code === 'KeyC') { games.leave(); BK.openPanel('crew'); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let lockAt = 0;
document.addEventListener('pointerlockchange', () => { lockAt = performance.now(); if (games.active()) games.setPaused(document.pointerLockElement !== canvas); });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || roulette.lookTarget() || performance.now() - lockAt < 250) return;
  const mx = Math.max(-150, Math.min(150, e.movementX)), my = Math.max(-150, Math.min(150, e.movementY)); // ignore bogus jumps when the lock is (re)acquired
  me.yaw -= mx * 0.0022; me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - my * 0.0022));
  games.clampLook();
});
canvas.addEventListener('mouseup', () => games.up());

// ---------- avatars ----------
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22], SKINS = [0xf0c8a0, 0xc58c5c, 0xe0b890, 0x8d5a3a, 0xf5d0b0, 0xd8a070], HAIRS = [0x2a1a0a, 0x111111, 0x8a5a2a, 0x3a3a3a, 0xb06a2a, 0x5a3a1a];
const avatars = new Map(), pending = new Map();
BK.onPos = (m) => { const a = avatars.get(m.id); if (a) { a.tx = m.x; a.tz = m.z; a.try = m.ry; } else pending.set(m.id, m); };
function syncAvatars() {
  const S = BK.S, inGame = active();
  const ids = new Set(inGame ? S.players.filter((p) => p.id !== S.you).map((p) => p.id) : []);
  for (const [id, a] of avatars) if (!ids.has(id)) { scene.remove(a.P.group); avatars.delete(id); }
  if (!inGame) return;
  for (const p of S.players) {
    if (p.id === S.you) continue;
    let a = avatars.get(p.id);
    if (!a) {
      const P = makePerson({ shirt: SHIRTS[p.color % 6], skin: SKINS[(p.color + 2) % 6], hair: HAIRS[(p.color + 1) % 6], hairStyle: p.color % 3 === 2 ? 'long' : 'short', cap: p.color % 4 === 1 ? SHIRTS[p.color % 6] : null });
      const l = label(p.name, '#fff', 0.8); l.position.y = 2.2; P.group.add(l); scene.add(P.group);
      const pm = pending.get(p.id); P.group.position.set(pm ? pm.x : -3 + p.color * 1.2, 0, pm ? pm.z : 2);
      a = { P, tx: P.group.position.x, tz: P.group.position.z, try: pm ? pm.ry : 0, px: P.group.position.x, pz: P.group.position.z, drunk: 0 }; avatars.set(p.id, a);
    }
    a.drunk = p.drunk;
  }
}

// ---------- hitmen ----------
const hitmen = [];
function makeHitman() {
  const P = makePerson({ skin: 0xc79a72, shirt: 0x0e0e14, pants: 0x0a0a10, hair: 0x050505, hairStyle: 'short', scale: 1.08, shoe: 0x050505 });
  const hat = new THREE.Group(), crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.16, 14), stdMat(0x050505)); crown.position.y = 0.09; hat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16), stdMat(0x050505)), crown); hat.position.y = 0.17; P.head.add(hat);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(3) })); e.position.set(s * 0.07, 0.03, -0.17); P.head.add(e); }
  P.group.traverse((o) => { o.userData.hitman = P; });
  return P;
}
function syncHitmen() {
  const on = BK.S && BK.S.phase === 'hunt';
  if (on && !hitmen.length) for (let i = 0; i < 3; i++) { const P = makeHitman(); P.group.position.set(-2 + i * 2, 0, ROOM.z - 2); scene.add(P.group); hitmen.push({ P, flash: 0, ph: i * 2 }); }
  if (!on && hitmen.length) { hitmen.forEach((h) => scene.remove(h.P.group)); hitmen.length = 0; }
}
const ray = new THREE.Raycaster();
canvas.addEventListener('mousedown', () => {
  if (document.pointerLockElement !== canvas) { if (active() && !BK.ui.open) canvas.requestPointerLock(); return; }
  if (games.active()) return games.down();
  const S = BK.S;
  if (S && S.phase === 'hunt') {
    BK.send({ type: 'attack' });
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hit = ray.intersectObjects(hitmen.map((h) => h.P.group), true)[0];
    if (hit) { const h = hitmen.find((q) => q.P === hit.object.userData.hitman); if (h) h.flash = 1; }
  }
});

// ---------- movement ----------
function move(dt, t, drunkAmt) {
  if (BK.ui.open || games.active()) return;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sp = keys.ShiftLeft ? 6.2 : 3.8, sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  let dx = -sin * f + cos * s, dz = -cos * f - sin * s; const len = Math.hypot(dx, dz) || 1;
  const moving = f || s;
  dx = (dx / len) * sp * dt * (moving ? 1 : 0); dz = (dz / len) * sp * dt * (moving ? 1 : 0);
  if (drunkAmt > 0.25) { const drift = Math.sin(t * 1.3) * drunkAmt * 1.4 * dt * (moving ? 1 : 0.3); dx += cos * drift; dz += -sin * drift; }
  me.x += dx; me.z += dz;
  me.x = Math.max(-ROOM.x + 0.6, Math.min(ROOM.x - 0.6, me.x)); me.z = Math.max(-ROOM.z + 0.6, Math.min(ROOM.z - 0.6, me.z));
  for (const o of obstacles) { const ex = me.x - o.x, ez = me.z - o.z, d = Math.hypot(ex, ez), min = o.r + 0.3; if (d < min && d > 0) { me.x = o.x + (ex / d) * min; me.z = o.z + (ez / d) * min; } }
}
let lastSend = 0, lastPos = '';
function netSend(t) {
  if (t - lastSend < 80) return; lastSend = t;
  const k = `${me.x.toFixed(2)},${me.z.toFixed(2)},${me.yaw.toFixed(2)}`;
  if (k === lastPos) return; lastPos = k; BK.send({ type: 'pos', x: me.x, z: me.z, ry: me.yaw });
}

// ---------- loop ----------
let prev = performance.now(), spawned = false, t0 = performance.now();
function resize() { renderer.setSize(innerWidth, innerHeight, false); fx.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
BK.onRender = () => {
  syncAvatars(); syncHitmen();
  if (active() && !spawned) { spawned = true; const S = BK.S, mp = S.players.find((p) => p.id === S.you); me.x = -3 + (mp ? mp.color : 0) * 1.2; me.z = 2; me.yaw = 0; me.pitch = 0; }
  if (!active()) spawned = false;
};

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now; const t = (now - t0) / 1000;
  const on = active(); cross.style.display = on && !BK.ui.open ? 'block' : 'none';
  if (!on) { promptEl.classList.add('hidden'); return; }
  const drunkAmt = Math.pow(Math.min(1, Math.max(0, (BK.drunk - 12) / 88)), 1.4);
  const look = roulette.lookTarget();
  if (look) { const k = Math.min(1, dt * 3); me.x += (look.x - me.x) * k; me.z += (look.z - me.z) * k; me.yaw += (look.yaw - me.yaw) * k; me.pitch += (look.pitch - me.pitch) * k; }
  else move(dt, t, drunkAmt);
  netSend(now);
  const moving = !games.active() && !BK.ui.open && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD);
  camera.position.set(me.x, EYE + Math.sin(now / 180) * (moving ? 0.03 : 0.004), me.z);
  const off = games.camOffset(now);
  camera.rotation.set(me.pitch + off.p + Math.sin(t * 0.7) * drunkAmt * 0.03, me.yaw + off.y + Math.sin(t * 0.5) * drunkAmt * 0.05, Math.sin(t * 0.9) * drunkAmt * 0.07);
  games.update(dt); roulette.update(dt); bar.update(t, dt, me); tv.draw(BK.S, now);
  for (const a of avatars.values()) {
    const g = a.P.group, k = Math.min(1, dt * 10); g.position.x += (a.tx - g.position.x) * k; g.position.z += (a.tz - g.position.z) * k;
    let d = a.try - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * k;
    const sp = Math.hypot(g.position.x - a.px, g.position.z - a.pz) / Math.max(dt, 0.001); a.px = g.position.x; a.pz = g.position.z;
    animate(a.P, a.drunk >= 40 && sp < 0.4 ? 'stagger' : sp > 0.5 ? 'walk' : 'idle', t, Math.min(1.4, sp / 3.5));
  }
  hitmen.forEach((h, i) => {
    const g = h.P.group, tx = Math.sin(t / 1.5 + h.ph) * 4, tz = ROOM.z - 5 + Math.cos(t / 1.9 + h.ph) * 2.2;
    g.position.x += (tx - g.position.x) * dt * 0.8; g.position.z += (tz - g.position.z) * dt * 0.8;
    g.rotation.y = Math.atan2(-(me.x - g.position.x), -(me.z - g.position.z)) + Math.PI; h.flash = Math.max(0, h.flash - dt * 4); g.scale.setScalar(1.08 + h.flash * 0.25);
    animate(h.P, 'walk', t + h.ph, 0.5);
  });
  const st = nearest();
  if (st && !BK.ui.open && !games.active()) { promptEl.textContent = st.text; promptEl.classList.remove('hidden'); } else promptEl.classList.add('hidden');
  if (!st && !games.active() && !BK.ui.open && document.pointerLockElement !== canvas) { promptEl.textContent = 'Click to look around'; promptEl.classList.remove('hidden'); }
  fx.setDrunk(drunkAmt, t);
  fx.render();
}
window.__dbg = { renderer, scene, camera, me, games, roulette, bar, fx, tv };
requestAnimationFrame(frame);
