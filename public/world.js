import * as THREE from 'three';
import { createGames } from './games.js';
import { buildBar, ROOM } from './bar.js';
import { createTV } from './tv.js';
import { createRoulette } from './roulette.js';
import { createFX } from './fx.js';
import { makePreset, animate } from './people.js';
import { audio } from './audio.js';
import { createVoice } from './voice.js';
import { createAudioUI } from './audioui.js';
import { label } from './textures.js';
import { CATALOG, BY_ID, RARITY, SLOTS, rollCrate, createPreview, applyCosmetics, tickCosmetics } from './cosmetics.js';

const BK = window.BK;
window.BKC = { CATALOG, BY_ID, RARITY, SLOTS, rollCrate, preview: createPreview() };
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
BK.startGame = (name, ch) => games.start(name, ch);
const fx = createFX(renderer, scene, camera);
// ---------- sound + voice ----------
const voice = createVoice(BK), audioUI = createAudioUI(voice, BK);
BK.audio = audio; BK.voice = voice; BK.sfx = (n, o) => audio.sfx(n, o); BK.onRtc = (m) => voice.onSignal(m);
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button,[onclick]') && !e.target.closest('#audiopanel')) audio.sfx('click'); }, true);
const sfxAt = (n, x, z, y = 1.2, o = {}) => audio.sfx(n, { pos: { x, y, z }, ...o });
BK.sfxAt = sfxAt;

// ---- sitting: take a seat from bar.seats; camera drops to seated eye height and movement locks until E/Space/WASD ----
me.sit = null;
BK.sit = (s) => { if (me.sit || games.active()) return; audio.sfx('sit'); me.sit = s; me.x = s.x; me.z = s.z; me.yaw = s.yaw; me.pitch = -0.05; BK.toast && BK.toast('Sitting - press E, Space or WASD to stand up'); };
BK.stand = () => { const s = me.sit; if (!s) return; audio.sfx('stand'); me.sit = null; me.x = s.exit[0]; me.z = s.exit[1]; };
const active = () => { const S = BK.S; return S && ['play', 'hunt'].includes(S.phase); };
const nearest = () => stations.filter((s) => Math.hypot(s.x - me.x, s.z - me.z) < s.r).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];

addEventListener('keydown', (e) => {
  if (!active() || BK.ui.open || BK.ui.shop) return;
  keys[e.code] = true;
  if (me.sit && (e.code === 'KeyE' || e.code === 'Space' || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code))) { BK.stand(); return; }
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
  if (me.sit) { const d = Math.atan2(Math.sin(me.yaw - me.sit.yaw), Math.cos(me.yaw - me.sit.yaw)); if (Math.abs(d) > 1.75) me.yaw = me.sit.yaw + Math.sign(d) * 1.75; me.pitch = Math.max(-0.9, Math.min(0.8, me.pitch)); }
  games.clampLook();
});
canvas.addEventListener('mouseup', () => games.up());

// ---------- avatars ----------
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22], SKINS = [0xf0c8a0, 0xc58c5c, 0xe0b890, 0x8d5a3a, 0xf5d0b0, 0xd8a070], HAIRS = [0x2a1a0a, 0x111111, 0x8a5a2a, 0x3a3a3a, 0xb06a2a, 0x5a3a1a], CAPS = [0x9c9ca2, 0xb02a2a, 0x2a5aa8, 0x2f8f5a, 0xd0a020, 0x7a3fa0];
const avatars = new Map(), pending = new Map();
BK.onPos = (m) => { const a = avatars.get(m.id); if (a) { a.tx = m.x; a.tz = m.z; a.try = m.ry; a.sit = m.sit || 0; } else pending.set(m.id, m); };
function syncAvatars() {
  const S = BK.S, inGame = active();
  const ids = new Set(inGame ? S.players.filter((p) => p.id !== S.you).map((p) => p.id) : []);
  for (const [id, a] of avatars) if (!ids.has(id)) { scene.remove(a.P.group); avatars.delete(id); }
  if (!inGame) return;
  for (const p of S.players) {
    if (p.id === S.you) continue;
    let a = avatars.get(p.id);
    if (!a) {
      const P = makePreset('bub', { shirt: SHIRTS[p.color % 6], skin: SKINS[(p.color + 2) % 6], hair: HAIRS[(p.color + 1) % 6], hairStyle: p.color % 3 === 2 ? 'long' : 'short', hat: p.color % 3 === 1 ? null : { color: CAPS[p.color % 6], backwards: p.color % 2 === 0 }, shorts: p.color % 2 === 0, pants: p.color % 2 === 0 ? 0x2a2a30 : 0x2c3e50, backpack: p.color % 2 === 0 });
      const l = label(p.name, '#fff', 0.8); l.position.y = 2.2; P.group.add(l); scene.add(P.group);
      const pm = pending.get(p.id); P.group.position.set(pm ? pm.x : -3 + p.color * 1.2, 0, pm ? pm.z : 2);
      a = { id: p.id, P, tx: P.group.position.x, tz: P.group.position.z, try: pm ? pm.ry : 0, px: P.group.position.x, pz: P.group.position.z, drunk: 0 }; avatars.set(p.id, a);
    }
    a.drunk = p.drunk;
    const ck = JSON.stringify(p.cos || {}); if (a.cosKey !== ck) { a.cosKey = ck; applyCosmetics(a.P, p.cos || {}); }
  }
}

// ---------- hitmen ----------
const hitmen = [];
function makeHitman() {
  const P = makePreset('hitman');
  P.group.traverse((o) => { o.userData.hitman = P; });
  return P;
}
function syncHitmen() {
  const on = BK.S && (BK.S.phase === 'hunt' || BK.S.shake);
  if (on && !hitmen.length) { audio.sfx('sting'); audio.sfx('knock', { delay: 0.6 }); }
  if (on && !hitmen.length) for (let i = 0; i < 3; i++) { const P = makeHitman(); P.group.position.set(-2 + i * 2, 0, ROOM.z - 2); scene.add(P.group); hitmen.push({ P, flash: 0, ph: i * 2 }); }
  if (!on && hitmen.length) { hitmen.forEach((h) => scene.remove(h.P.group)); hitmen.length = 0; }
}
// ---------- bar-fight brawlers ----------
const brawlers = [];
function syncBrawlers() {
  const be = BK.S && BK.S.barEvent, on = be && be.kind === 'fight';
  if (on && !brawlers.length) {
    [['jock', { shirt: 0xb02a2a, number: '1' }, 0.4, be.red], ['dieHard', { shirt: 0x2a5aa8, number: 'B' }, 1.6, be.blue]].forEach(([pre, over, x, nm], i) => {
      const P = makePreset(pre, over); P.group.position.set(x, 0, -2.2); P.group.rotation.y = i ? Math.PI / 2 : -Math.PI / 2; const l = label(nm, i ? '#7ab0ff' : '#ff7a88', 0.9); l.position.y = 2.35; P.group.add(l); scene.add(P.group); brawlers.push({ P, x, i });
    });
  }
  if (!on && brawlers.length) { brawlers.forEach((b) => scene.remove(b.P.group)); brawlers.length = 0; }
}
// lights: remember base intensities so blackouts can dim everything
const lightList = []; scene.traverse((o) => { if (o.isLight) lightList.push([o, o.intensity]); });
const party = new THREE.PointLight(0xff40d0, 0, 14, 2); party.position.set(0, 3.6, 1); scene.add(party);
const ray = new THREE.Raycaster();
canvas.addEventListener('mousedown', () => {
  if (document.pointerLockElement !== canvas) { if (active() && !BK.ui.open) canvas.requestPointerLock(); return; }
  if (games.active()) return games.down();
  const S = BK.S;
  if (S && (S.phase === 'hunt' || S.shake)) {
    BK.send({ type: 'attack' });
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hit = ray.intersectObjects(hitmen.map((h) => h.P.group), true)[0];
    if (hit) { const h = hitmen.find((q) => q.P === hit.object.userData.hitman); if (h) { h.flash = 1; audio.sfx('punch', { pos: { x: h.P.group.position.x, y: 1.3, z: h.P.group.position.z } }); } }
  }
});

// ---------- movement ----------
function move(dt, t, drunkAmt) {
  if (BK.ui.open || games.active() || me.sit) return;
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
let lastSend = 0, lastPos = '', lastBeat = 0;
function netSend(t) {
  if (t - lastSend < 80) return; lastSend = t;
  const sitH = me.sit ? me.sit.sit : 0, k = `${me.x.toFixed(2)},${me.z.toFixed(2)},${me.yaw.toFixed(2)},${sitH}`;
  if (k === lastPos && !(sitH && t - lastBeat > 2500)) return; lastPos = k; lastBeat = t; BK.send({ type: 'pos', x: me.x, z: me.z, ry: me.yaw, sit: sitH });
}

// ---------- loop ----------
let prev = performance.now(), spawned = false, t0 = performance.now();
// auto performance mode: if the first ~2 seconds average under ~30fps, drop shadows, bloom and resolution
const perf = { frames: 0, acc: 0, done: !!navigator.webdriver || /[?&]quality=high/.test(location.search), low: /[?&]quality=low/.test(location.search) };
function setLowQuality() { renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); } }); fx.setBloom(false); resize(); console.log('Ball Knowledge: performance mode on'); }
function resize() { renderer.setSize(innerWidth, innerHeight, false); fx.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
BK.onRender = () => {
  syncAvatars(); syncHitmen(); syncBrawlers();
  if (active() && !spawned) { spawned = true; const S = BK.S, mp = S.players.find((p) => p.id === S.you); me.x = -3 + (mp ? mp.color : 0) * 1.2; me.z = 2; me.yaw = 0; me.pitch = 0; }
  if (!active()) spawned = false;
};

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - prev) / 1000, dt = Math.min(0.1, rawDt); prev = now; const t = (now - t0) / 1000;
  if (perf.low) { perf.low = false; setLowQuality(); }
  if (!perf.done && active() && t > 1) { perf.acc += rawDt; if (++perf.frames >= 90) { perf.done = true; if (perf.acc / 90 > 0.034) setLowQuality(); } }
  const on = active(); cross.style.display = on && !BK.ui.open ? 'block' : 'none';
  if (!on) { // title / lobby: slow cinematic drift through the bar
    promptEl.classList.add('hidden');
    const k = t * 0.06; camera.position.set(Math.sin(k) * 3 - 1.2, 2.5 + Math.sin(k * 1.7) * 0.2, 0.4 + Math.cos(k * 0.8) * 0.8); camera.lookAt(Math.sin(k * 0.7) * 5, 1.9, -6); camera.rotation.z = 0;
    const mm = { x: camera.position.x, z: camera.position.z }; bar.update(t, dt, mm); roulette.update(dt); tv.draw(BK.S, now); fx.setDrunk(0, t); fx.render(); return;
  }
  const drunkAmt = Math.pow(Math.min(1, Math.max(0, (BK.drunk - 8) / 80)), 1.1);
  const look = roulette.lookTarget();
  if (look) { const k = Math.min(1, dt * 3); me.x += (look.x - me.x) * k; me.z += (look.z - me.z) * k; me.yaw += (look.yaw - me.yaw) * k; me.pitch += (look.pitch - me.pitch) * k; }
  else move(dt, t, drunkAmt);
  netSend(now);
  const moving = !games.active() && !BK.ui.open && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD);
  if (me.sit) { const s = me.sit, fx = -Math.sin(s.yaw) * 0.1, fz = -Math.cos(s.yaw) * 0.1; camera.position.set(s.x + fx, s.sit + 0.09 + (EYE - 0.98) + Math.sin(now / 900) * 0.004, s.z + fz); }
  else camera.position.set(me.x, EYE + Math.sin(now / 180) * (moving ? 0.03 : 0.004), me.z);
  const off = games.camOffset(now);
  camera.rotation.set(me.pitch + off.p + Math.sin(t * 0.7) * drunkAmt * 0.03, me.yaw + off.y + Math.sin(t * 0.5) * drunkAmt * 0.05, Math.sin(t * 0.9) * drunkAmt * 0.07);
  games.update(dt); games.rig(camera);
  // ---- audio frame: listener, footsteps, bar-event cues, voice
  audio.update(dt, camera); audioUI.show(active()); voice.update(dt, avatars);
  { const mvd = Math.hypot(me.x - (me._lx ?? me.x), me.z - (me._lz ?? me.z)); me._lx = me.x; me._lz = me.z;
    if (!me.sit && !games.active() && mvd < 1.2) { me._step = (me._step || 0) + mvd; if (me._step > (keys.ShiftLeft ? 0.95 : 0.7)) { me._step = 0; audio.sfx('step', { v: keys.ShiftLeft ? 0.9 : 0.6 }); } } }
  { const be = BK.S && BK.S.barEvent, kind = be ? be.kind : null; if (kind !== audio._ev) { const prev = audio._ev; audio._ev = kind;
      if (kind === 'happy') { audio.sfx('horn'); audio.sfx('cheer', { v: 0.8, delay: 0.3 }); } else if (kind === 'fight') { audio.sfx('whoosh'); audio.sfx('cheer', { v: 0.6, delay: 0.4 }); } else if (kind === 'blackout') audio.sfx('blackout'); else if (kind === 'tip') audio.sfx('coin');
      if (prev === 'blackout') audio.sfx('powerOn'); }
    if (kind === 'fight' && Math.random() < dt * 2.2) audio.sfx(Math.random() < 0.8 ? 'punch' : 'groan', { pos: { x: 1, y: 1.3, z: -2.2 } });
    const sh = !!(BK.S && BK.S.shake); if (sh !== audio._shake) { audio._shake = sh; if (sh) { audio.sfx('sting'); audio.sfx('knock', { delay: 0.5 }); } }
    const evs = BK.S && BK.S.events; if (evs) { const open = evs.find((e) => e.status === 'open'), oi = open ? open.idx : -1; if (oi !== audio._open) { if (audio._open !== undefined && oi >= 0) audio.sfx('bell'); audio._open = oi; } } }
  const ev = BK.S && BK.S.barEvent, blackout = !!(ev && ev.kind === 'blackout'), happy = !!(ev && ev.kind === 'happy');
  tv.blackout = blackout;
  { const tgt = blackout ? (Math.random() < 0.06 ? 0.5 : 0.05) : 1; for (const [l, base] of lightList) l.intensity += (base * tgt - l.intensity) * Math.min(1, dt * 9); party.intensity += ((happy ? 26 : 0) - party.intensity) * Math.min(1, dt * 4); party.color.setHSL((t * 0.25) % 1, 1, 0.55); }
  brawlers.forEach((b, k) => { const g = b.P.group, sway = Math.sin(t * 3 + k) * 0.35; g.position.x = b.x + sway * (k ? -1 : 1) * 0.6; g.position.z = -2.2 + Math.sin(t * 2.3 + k * 2) * 0.35; animate(b.P, 'fight', t + k, 1); });
  roulette.update(dt); bar.update(t, dt, me); tv.draw(BK.S, now);
  for (const a of avatars.values()) {
    const g = a.P.group, k = Math.min(1, dt * 10); g.position.x += (a.tx - g.position.x) * k; g.position.z += (a.tz - g.position.z) * k;
    let d = a.try - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * k;
    const sp = Math.hypot(g.position.x - a.px, g.position.z - a.pz) / Math.max(dt, 0.001); a.px = g.position.x; a.pz = g.position.z;
    const sitY = a.sit ? a.sit + 0.09 - (a.P.hipY || 0.98) : 0; a.P.baseY = (a.P.baseY || 0) + (sitY - (a.P.baseY || 0)) * Math.min(1, dt * 10);
    if (!!a.sit !== !!a._sat) { a._sat = !!a.sit; audio.sfx(a.sit ? 'sit' : 'stand', { pos: { x: g.position.x, y: 0.6, z: g.position.z } }); }
    if (!a.sit && sp > 0.6) { a._sd = (a._sd || 0) + sp * dt; if (a._sd > 0.8) { a._sd = 0; audio.sfx('step', { v: 0.5, pos: { x: g.position.x, y: 0.1, z: g.position.z } }); } }
    { const dx = g.position.x - me.x, dz = g.position.z - me.z, dist = Math.hypot(dx, dz);
      if (a.lab === undefined) { a.lab = g.children.find((o) => o.isSprite && o.position.y > 2 && o.position.y < 2.4); if (a.lab) a.labS = a.lab.scale.clone(); }
      if (a.lab) { const k = Math.min(1.25, Math.max(0.45, dist * 0.32)); a.lab.scale.set(a.labS.x * k, a.labS.y * k, 1); a.lab.material.opacity = dist < 1.1 ? Math.max(0, (dist - 0.5) / 0.6) : 1; }
      const near = dist < 0.55; if (a.hideNear !== near) { a.hideNear = near; g.children.forEach((o) => { if (!o.isSprite) o.visible = !near; }); } }
    if (!a.mic) { a.mic = label('🎙', '#2ee09a', 0.55); a.mic.position.y = 2.65; a.mic.visible = false; g.add(a.mic); } const spk = voice.speaking(a.id); if (a.mic.visible !== spk) a.mic.visible = spk;
    animate(a.P, a.sit ? 'sit' : a.drunk >= 40 && sp < 0.4 ? 'stagger' : sp > 0.5 ? 'walk' : 'idle', t, Math.min(1.4, sp / 3.5)); tickCosmetics(a.P, t);
  }
  hitmen.forEach((h, i) => {
    const g = h.P.group, R = 3.3 + Math.sin(t / 2.3 + h.ph) * 0.7, tx = Math.max(-ROOM.x + 1, Math.min(ROOM.x - 1, me.x + Math.cos(t / 3 + h.ph * 2.1) * R)), tz = Math.max(-ROOM.z + 1, Math.min(ROOM.z - 1, me.z + Math.sin(t / 3 + h.ph * 2.1) * R)); // circle the player they're hunting
    g.position.x += (tx - g.position.x) * dt * 0.8; g.position.z += (tz - g.position.z) * dt * 0.8;
    g.rotation.y = Math.atan2(-(me.x - g.position.x), -(me.z - g.position.z)) + Math.PI; h.flash = Math.max(0, h.flash - dt * 4); g.scale.setScalar(1.08 + h.flash * 0.25);
    animate(h.P, 'walk', t + h.ph, 0.5);
  });
  const st = nearest();
  if (st && !BK.ui.open && !BK.ui.shop && !me.sit && !games.active()) { promptEl.textContent = st.text; promptEl.classList.remove('hidden'); } else promptEl.classList.add('hidden');
  if (!st && !games.active() && !BK.ui.open && !BK.ui.shop && document.pointerLockElement !== canvas) { promptEl.textContent = 'Click to look around'; promptEl.classList.remove('hidden'); }
  fx.setDrunk(drunkAmt, t);
  fx.render();
}
window.__dbg = { renderer, scene, camera, me, games, roulette, bar, fx, tv };
requestAnimationFrame(frame);
