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
import { createBottles } from './bottles.js';
import { label } from './textures.js';
import { makeDizzy, headPos } from './dizzy.js';
import { createGoonsView } from './goonsview.js';
import { createCine } from './cine.js';
import { createVO } from './vo.js';
import { CATALOG, BY_ID, RARITY, SLOTS, rollCrate, createPreview, applyCosmetics, tickCosmetics } from './cosmetics.js';

const BK = window.BK;
window.BKC = { CATALOG, BY_ID, RARITY, SLOTS, rollCrate, preview: createPreview() };
const canvas = document.getElementById('world');
const promptEl = document.getElementById('prompt');
const cross = Object.assign(document.createElement('div'), { id: 'cross' });
document.body.appendChild(cross); cross.style.display = 'none';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false; // refreshed every other frame in frame()
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
BK.onSession = () => { if (voice.enabled) BK.send({ type: 'rtc', to: '*', data: { k: 'hello' } }); }; // (re)joined: let voice peers find us again
BK.audio = audio; BK.voice = voice; BK.vo = createVO(audio); BK.audioUI = audioUI; BK.sfx = (n, o) => audio.sfx(n, o); BK.onRtc = (m) => voice.onSignal(m);
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button,[onclick]') && !e.target.closest('#audiopanel')) audio.sfx('click'); }, true);
const sfxAt = (n, x, z, y = 1.2, o = {}) => audio.sfx(n, { pos: { x, y, z }, ...o });
BK.sfxAt = sfxAt;
// ---------- bottles + knockouts ----------
const koNow = () => !!(me.koUntil && BK.now() < me.koUntil);
const bottles = createBottles({ scene, camera, BK, me, obstacles, getAvatars: () => avatars, getNpcs: () => bar.npcs, getGoons: () => goons.list(), getBrawlers: () => brawlers.map((b) => ({ P: b.P, side: b.i ? 'blue' : 'red' })), ROOM, busy: () => games.active() || BK.ui.open || BK.ui.shop || koNow() });
BK.bottles = bottles; BK.onBottle = (m) => bottles.remote(m); bottles.addSpots(bar.bottleSpots, stations);
// small or see-through static things (bottles, chips, glasses, little decor) don't need to cast shadows: fewer objects in the shadow pass
{ const _s = new THREE.Vector3(); scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh || !o.castShadow) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); o.getWorldScale(_s);
    const mats = Array.isArray(o.material) ? o.material : [o.material]; if (g.boundingSphere.radius * Math.max(_s.x, _s.y, _s.z) < 0.22 || mats.some((m) => m.transparent && m.opacity < 0.95)) o.castShadow = false; }); }
BK.onKo = (m) => {
  const until = m.until;
  if (m.id && m.id === (BK.S && BK.S.you)) { me.koUntil = until; if (me.sit) BK.stand(); games.leave(); audio.sfx('bonk'); audio.sfx('groan', { delay: 0.2 }); BK.toast && BK.toast('💫 You got bottled! Out cold for 5 seconds.', 'err'); }
  else if (m.id) { const a = avatars.get(m.id); if (a) { a.ko = until; audio.sfx('bonk', { pos: { x: a.P.group.position.x, y: 1.5, z: a.P.group.position.z } }); } }
  else if (m.npc !== undefined) { const n = bar.npcs[m.npc]; if (n) { n.ko = until; audio.sfx('bonk', { pos: { x: n.P.group.position.x, y: 1.5, z: n.P.group.position.z } }); audio.sfx('groan', { delay: 0.25, pos: { x: n.P.group.position.x, y: 1.5, z: n.P.group.position.z } }); } }
};
addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat && active() && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) bottles.throw(); });
addEventListener('contextmenu', (e) => { if (document.pointerLockElement === canvas) { e.preventDefault(); bottles.throw(); } });

// ---- sitting: take a seat from bar.seats; camera drops to seated eye height and movement locks until E/Space/WASD ----
me.sit = null;
BK.sit = (s) => { if (me.sit || games.active()) return; audio.sfx('sit'); me.sit = s; me.x = s.x; me.z = s.z; me.yaw = s.yaw; me.pitch = -0.05; BK.toast && BK.toast('Sitting - press E, Space or WASD to stand up'); };
const clearAt = (x, z, m = 0.32) => Math.abs(x) < ROOM.x - 0.7 && Math.abs(z) < ROOM.z - 0.7 && !obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + m);
// standing up drops you at the nearest clear floor spot (booth ends are walled in by neighbouring booths, so booths exit into the aisle)
function exitSpot(s) {
  let best = null;
  for (let r = 0.9; r < 4.5 && !best; r += 0.25) for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r; if (s.text === 'booth' && z > 5.0) continue; if (clearAt(x, z, 0.55) && (!best || Math.hypot(x - s.exit[0], z - s.exit[1]) < best.d)) best = { x, z, d: Math.hypot(x - s.exit[0], z - s.exit[1]) }; }
  return best ? [best.x, best.z] : s.exit;
}
BK.stand = () => { const s = me.sit; if (!s) return; audio.sfx('stand'); me.sit = null; const e = clearAt(s.exit[0], s.exit[1]) ? s.exit : exitSpot(s); me.x = e[0]; me.z = e[1]; };
const active = () => { const S = BK.S; return S && ['play', 'hunt'].includes(S.phase); };
const nearest = () => (bottles.aimedStation && bottles.aimedStation()) || stations.filter((s) => (!s.on || s.on()) && Math.hypot(s.x - me.x, s.z - me.z) < s.r).sort((a, b) => (b.prio || 0) - (a.prio || 0) || Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];

addEventListener('keydown', (e) => {
  if (!active() || BK.ui.open || BK.ui.shop) return;
  keys[e.code] = true;
  if (me.sit && (e.code === 'KeyE' || e.code === 'Space' || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code))) { BK.stand(); return; }
  if (koNow()) return;
  if (e.code === 'Space' && !e.repeat && !games.active() && !me.sit && !(me.jy > 0)) { me.vy = 4.2; audio.sfx('step', { v: 0.5 }); }
  if (e.code === 'KeyE') { if (games.active()) games.leave(); else { const s = nearest(); if (s) s.act(); } }
  if (e.code === 'KeyC') { games.leave(); BK.openPanel('crew'); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let lockAt = 0;
document.addEventListener('pointerlockchange', () => {
  lockAt = performance.now(); if (games.active()) games.setPaused(document.pointerLockElement !== canvas);
  if (document.pointerLockElement === canvas) { BK.freeMouse = false; if (BK.ui.menu) { BK.ui.menu = false; window.render && window.render(); } return; }
  // mouse released by Esc / clicking away (not by a panel, the shop, Tab or the sound panel): show the Esc menu
  if (active() && !BK.ui.open && !BK.ui.shop && !BK.freeMouse && !BK.ui.menu) BK.openMenu();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || roulette.lookTarget() || performance.now() - lockAt < 250 || koNow()) return;
  const mx = Math.max(-150, Math.min(150, e.movementX)), my = Math.max(-150, Math.min(150, e.movementY)); // ignore bogus jumps when the lock is (re)acquired
  const ks = 0.0022 * ((BK.settings && BK.settings.sens) || 1), inv = BK.settings && BK.settings.invert ? -1 : 1; me.yaw -= mx * ks; me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - my * ks * inv));
  if (me.sit) { const d = Math.atan2(Math.sin(me.yaw - me.sit.yaw), Math.cos(me.yaw - me.sit.yaw)); if (Math.abs(d) > 1.75) me.yaw = me.sit.yaw + Math.sign(d) * 1.75; me.pitch = Math.max(-0.9, Math.min(0.8, me.pitch)); }
  games.clampLook();
});
canvas.addEventListener('mouseup', () => games.up());

// ---------- avatars ----------
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22], SKINS = [0xf0c8a0, 0xc58c5c, 0xe0b890, 0x8d5a3a, 0xf5d0b0, 0xd8a070], HAIRS = [0x2a1a0a, 0x111111, 0x8a5a2a, 0x3a3a3a, 0xb06a2a, 0x5a3a1a], CAPS = [0x9c9ca2, 0xb02a2a, 0x2a5aa8, 0x2f8f5a, 0xd0a020, 0x7a3fa0];
const avatars = new Map(), pending = new Map();
BK.onPos = (m) => { const a = avatars.get(m.id); if (a) { a.tx = m.x; a.tz = m.z; a.try = m.ry; a.sit = m.sit || 0; a.jy = m.jy || 0; a.lp = m.p || 0; } else pending.set(m.id, m); };
function syncAvatars() {
  const S = BK.S, inGame = active();
  const ids = new Set(inGame ? S.players.filter((p) => p.id !== S.you).map((p) => p.id) : []);
  for (const [id, a] of avatars) if (!ids.has(id)) { scene.remove(a.P.group); if (a.dizzy) scene.remove(a.dizzy.root); if (a.life) bar.life.remove(a.life); avatars.delete(id); }
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

// ---------- loose chips (dropped by knocked-out players): walk over a stack to grab it ----------
const drops = new Map(), chipGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.009, 14), chipMats = [0xc0182a, 0x1d8a4a, 0x1c1c20, 0xe0a020].map((c) => stdMat(c, { roughness: 0.4 }));
function syncDrops() {
  const want = new Set(((BK.S && BK.S.drops) || []).map((d) => d.id));
  for (const [id, o] of drops) if (!want.has(id)) { scene.remove(o.g); drops.delete(id); audio.sfx('chip', { pos: { x: o.x, y: 0.1, z: o.z } }); }
  for (const d of (BK.S && BK.S.drops) || []) if (!drops.has(d.id)) { const g = new THREE.Group(); for (let k = 0; k < Math.min(8, Math.ceil(d.amt / 6)); k++) { const m = new THREE.Mesh(chipGeo, chipMats[k % 4]); m.position.set((k % 3) * 0.05 - 0.05, 0.006 + Math.floor(k / 3) * 0.0095, (k % 2) * 0.04); g.add(m); } g.position.set(d.x, 0, d.z); scene.add(g); drops.set(d.id, { g, x: d.x, z: d.z, asked: 0 }); }
}
function grabDrops() { for (const [id, o] of drops) if (Math.hypot(o.x - me.x, o.z - me.z) < 1.1 && performance.now() - o.asked > 800) { o.asked = performance.now(); BK.send({ type: 'pickup', id }); } }
// ---------- Sal's muscle: hitmen + collectors are simulated on the server (goons.js) and streamed here ----------
const goons = createGoonsView({ scene, BK, audio }); BK.goons = goons;
const cine = createCine({ camera, BK, doors: bar.doors, goons, audio });
let wasHeld = null;
// guided first night: a regular calls out to you (bubble + voice line when the clip exists)
BK.guideSay = (who, text, vo) => { const n = bar.say(who, text, 7); if (n) { const g = n.P.group.position; BK.vo.play(vo, { x: g.x, y: 1.6, z: g.z }); } };
BK.onGoonDodge = (m) => { goons.dodge(m.id); const o = goons.get(m.id); if (o) audio.sfx('whoosh', { pos: { x: o.P.group.position.x, y: 1.3, z: o.P.group.position.z } }); };
BK.onGoons = (m) => { goons.onMsg(m); const h = goons.held[BK.S && BK.S.you] || null; if (h !== wasHeld) { wasHeld = h; if (h) { if (me.sit) BK.stand(); games.leave(); audio.sfx('groan'); } window.render && window.render(); } };
const heldBy = () => (BK.S && goons.held[BK.S.you]) || null, draggedBy = () => (BK.S && goons.drag[BK.S.you]) || null;
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
  if (koNow()) return;
  if (games.active()) return games.down();
  const S = BK.S;
  if (goons.active()) { // punch: whatever goon is under the crosshair, if he's within reach
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hit = ray.intersectObjects(goons.list().map((o) => o.P.group), true)[0], id = hit && hit.object.userData.goonId, o = id && goons.get(id);
    if (o && hit.distance < 2.8 && o.state !== 'down') { BK.send({ type: 'attack', g: id }); audio.sfx('punch', { pos: { x: o.P.group.position.x, y: 1.3, z: o.P.group.position.z } }); me.punch = 1; }
    else audio.sfx('whoosh', { v: 0.4 });
  }
});

// ---------- movement ----------
function move(dt, t, drunkAmt) {
  if (BK.ui.open || games.active() || me.sit || koNow() || heldBy() || draggedBy() || (BK.S && BK.S.cine && BK.now() < BK.S.cine.until)) return;
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
// which seat a remote player is on (they only send position + seat height); cached until they move off it
function seatOf(a) {
  if (a.seat && Math.hypot(a.seat.x - a.tx, a.seat.z - a.tz) < 0.3) return a.seat;
  let best = null, bd = 0.6; for (const s of bar.seats) { const dd = Math.hypot(s.x - a.tx, s.z - a.tz); if (dd < bd && Math.abs(s.sit - a.sit) < 0.08) { bd = dd; best = s; } }
  a.seat = best || { x: a.tx, z: a.tz, yaw: a.try, sit: a.sit, text: 'booth' }; return a.seat;
}
// seated remote players get the NPC seated layer: breathing, sway, head following their real look direction,
// talk gestures while they speak on voice, and a sip (with a pint) whenever they order a drink
function seatedLife(a, seat) {
  const opts = { kind: seat.text === 'couch' ? 'lap' : 'table', table: seat.text === 'bar stool' ? 1.14 : 0.78, seat: seat.sit, reach: seat.text === 'bar stool' ? 0.55 : 0.4, baseY: seat.sit + 0.09 - (a.P.hipY || 0.98) };
  if (!a.life) { a.life = bar.life.add({ P: a.P, mode: 'player', name: 'player' }, { ...opts, style: 'player', glass: 'pint', glassOnSip: true, drive: () => {
    const dr = a.drunk > (a._dr ?? a.drunk); a._dr = a.drunk; // drink count went up: take a sip
    return { y: Math.atan2(Math.sin(a.try - (a.seat ? a.seat.yaw : a.try)), Math.cos(a.try - (a.seat ? a.seat.yaw : a.try))), p: -(a.lp || 0), talking: voice.speaking(a.id), sip: dr };
  } }); a.lifeSeat = seat; }
  else if (a.lifeSeat !== seat) { bar.life.refit(a.life, opts); a.lifeSeat = seat; }
}
// your own knockout: stars circling across your (tilted) view
const myDizzy = makeDizzy(camera, { radius: 0.17, scale: 1 }); myDizzy.root.position.set(0, 0.08, -0.55);
let lastSend = 0, lastPos = '', lastBeat = 0;
function netSend(t) {
  if (t - lastSend < 80) return; lastSend = t;
  const sitH = me.sit ? me.sit.sit : 0, jy = +(me.jy || 0).toFixed(2), lp = +me.pitch.toFixed(2), k = `${me.x.toFixed(2)},${me.z.toFixed(2)},${me.yaw.toFixed(2)},${sitH},${jy},${me.sit ? lp : 0}`;
  if (k === lastPos && !(sitH && t - lastBeat > 2500)) return; lastPos = k; lastBeat = t; BK.send({ type: 'pos', x: me.x, z: me.z, ry: me.yaw, sit: sitH, jy, p: me.sit ? lp : 0 });
}

// ---------- loop ----------
let prev = performance.now(), spawned = false, t0 = performance.now(), shadowTick = 0;
// auto performance mode: if the first ~2 seconds average under ~30fps, drop shadows, bloom and resolution
const perf = { frames: 0, acc: 0, done: !!navigator.webdriver || /[?&]quality=high/.test(location.search), low: /[?&]quality=low/.test(location.search) };
function setLowQuality() { renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); } }); fx.setBloom(false); resize(); console.log('Ball Knowledge: performance mode on'); }
function setHighQuality() { renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.needsUpdate = true; scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); } }); fx.setBloom(true); resize(); }
// graphics setting from the Esc menu: 'low' / 'high' are fixed; 'auto' keeps the first-seconds check (or leaves things as they are)
BK.setQuality = (q) => { if (q === 'low') { perf.done = true; setLowQuality(); } else if (q === 'high') { perf.done = true; setHighQuality(); } };
{ const q = BK.settings && BK.settings.quality; if (q === 'low') perf.low = true; else if (q === 'high') perf.done = true; }
function resize() { renderer.setSize(innerWidth, innerHeight, false); fx.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
BK.onRender = () => {
  syncAvatars(); syncBrawlers(); syncDrops();
  if (active() && !spawned) { spawned = true; const S = BK.S, mp = S.players.find((p) => p.id === S.you); me.x = -3 + (mp ? mp.color : 0) * 1.2; me.z = 2; me.yaw = 0; me.pitch = 0; }
  if (!active()) spawned = false;
};

function frame(now) {
  requestAnimationFrame(frame);
  if ((shadowTick = (shadowTick + 1) % 2) === 0) renderer.shadowMap.needsUpdate = true; // shadows refresh at half rate: a big saving, invisible at bar speeds
  const rawDt = (now - prev) / 1000, dt = Math.min(0.1, rawDt); prev = now; const t = (now - t0) / 1000;
  if (perf.low) { perf.low = false; setLowQuality(); }
  if (!perf.done && active() && t > 1) { perf.acc += rawDt; if (++perf.frames >= 90) { perf.done = true; if (perf.acc / 90 > 0.034) setLowQuality(); } }
  const on = active(); cross.style.display = on && !BK.ui.open ? 'block' : 'none';
  if (!on) { // title / lobby: slow cinematic drift through the bar
    promptEl.classList.add('hidden'); cine.update(dt, null); goons.update(dt, t, null);
    const k = t * 0.06; camera.position.set(Math.sin(k) * 3 - 1.2, 2.5 + Math.sin(k * 1.7) * 0.2, 0.4 + Math.cos(k * 0.8) * 0.8); camera.lookAt(Math.sin(k * 0.7) * 5, 1.9, -6); camera.rotation.z = 0;
    const mm = { x: camera.position.x, z: camera.position.z }; bar.update(t, dt, mm); roulette.update(dt); tv.draw(BK.S, now); fx.setDrunk(0, t); fx.render(); return;
  }
  const drunkAmt = Math.pow(Math.min(1, Math.max(0, (BK.drunk - 8) / 80)), 1.1);
  const look = roulette.lookTarget();
  if (look) { const k = Math.min(1, dt * 3); me.x += (look.x - me.x) * k; me.z += (look.z - me.z) * k; me.yaw += (look.yaw - me.yaw) * k; me.pitch += (look.pitch - me.pitch) * k; }
  else move(dt, t, drunkAmt);
  if (me.jy > 0 || me.vy > 0) { if (me.sit || games.active() || koNow()) { me.jy = me.vy = 0; } else { me.vy -= 14 * dt; me.jy = Math.max(0, (me.jy || 0) + me.vy * dt); if (me.jy === 0) { me.vy = 0; audio.sfx('step', { v: 0.8 }); } } }
  netSend(now);
  const moving = !games.active() && !BK.ui.open && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD);
  if (me.sit) { const s = me.sit, fx = -Math.sin(s.yaw) * 0.1, fz = -Math.cos(s.yaw) * 0.1; camera.position.set(s.x + fx, s.sit + 0.09 + (EYE - 0.98) + Math.sin(now / 900) * 0.004, s.z + fz); }
  else camera.position.set(me.x, EYE + (me.jy || 0) + Math.sin(now / 180) * (moving ? 0.03 : 0.004), me.z);
  const off = games.camOffset(now);
  camera.rotation.set(me.pitch + off.p + Math.sin(t * 0.7) * drunkAmt * 0.03, me.yaw + off.y + Math.sin(t * 0.5) * drunkAmt * 0.05, Math.sin(t * 0.9) * drunkAmt * 0.07);
  { const f = (BK.settings && BK.settings.fov) || 72; if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); } }
  games.update(dt); games.rig(camera);
  { const cOn = !!(BK.S && BK.S.cine && BK.now() < BK.S.cine.until), gOn = games.active() || cOn; for (const n of bar.npcs) { const g = n.P.group, hide = gOn && Math.hypot(g.position.x - camera.position.x, g.position.z - camera.position.z) < (cOn ? 2.6 : 1.1) && !n.seated; if (g.visible === hide) g.visible = !hide; } }
  // ---- audio frame: listener, footsteps, bar-event cues, voice
  audio.update(dt, camera); audioUI.show(active()); voice.update(dt, avatars);
  grabDrops(); for (const o of drops.values()) o.g.rotation.y += dt * 0.6;
  bottles.update(dt); bottles.updateSpots(dt); { const left = koNow() ? (me.koUntil - BK.now()) / 1000 : 0; myDizzy.update(dt, t, null, left > 0); bottles.setKo(left); if (!left && me.koUntil) { me.koUntil = 0; audio.sfx('boing'); } if (left) { camera.position.y = 0.32; camera.rotation.z = 1.25; camera.rotation.x = 0.4; } }
  { const h = heldBy(), o = h && goons.get(h); // grabbed: you're turned to face him and shaken about
    if (o) { const g = o.P.group.position, want = Math.atan2(-(g.x - me.x), -(g.z - me.z)); let d = want - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); me.yaw += d * Math.min(1, dt * 6); me.pitch += (-0.22 - me.pitch) * Math.min(1, dt * 4); camera.rotation.set(me.pitch + Math.sin(t * 13) * 0.02, me.yaw + Math.sin(t * 9) * 0.03, Math.sin(t * 7) * 0.05); } }
  if (me.punch) { me.punch = Math.max(0, me.punch - dt * 6); camera.position.y -= me.punch * 0.04; camera.rotation.z += me.punch * 0.03; }
  const cineOn = !!cine.update(dt, BK.S && BK.S.you); if (cineOn) cross.style.display = 'none';
  { const c = BK.S && BK.S.cine, sal = bar.npcs.find((n) => n.name === 'Uncle Sal'); // Sal talks through the opening scene
    if (sal && sal.life) { const talk = cineOn && c && c.kind === 'opening'; if (talk) { sal.life.act = 'talk'; sal.life.actT = 1; sal.life.dur = 99; sal.life.gaze.target = { local: { y: 0, p: 0.05 } }; sal.life.gaze.next = 2; } else if (sal.life.dur === 99) { sal.life.act = null; sal.life.dur = 1; } } }
  { const mvd = Math.hypot(me.x - (me._lx ?? me.x), me.z - (me._lz ?? me.z)); me._lx = me.x; me._lz = me.z;
    if (!me.sit && !games.active() && mvd < 1.2) { me._step = (me._step || 0) + mvd; if (me._step > (keys.ShiftLeft ? 0.95 : 0.7)) { me._step = 0; audio.sfx('step', { v: keys.ShiftLeft ? 0.9 : 0.6 }); } } }
  { const be = BK.S && BK.S.barEvent, kind = be ? be.kind : null; if (kind !== audio._ev) { const prev = audio._ev; audio._ev = kind;
      if (kind === 'happy') { audio.sfx('horn'); audio.sfx('cheer', { v: 0.8, delay: 0.3 }); } else if (kind === 'fight') { audio.sfx('whoosh'); audio.sfx('cheer', { v: 0.6, delay: 0.4 }); } else if (kind === 'blackout') audio.sfx('blackout'); else if (kind === 'tip') audio.sfx('coin');
      if (prev === 'blackout') audio.sfx('powerOn'); }
    if (kind === 'fight' && Math.random() < dt * 2.2) audio.sfx(Math.random() < 0.8 ? 'punch' : 'groan', { pos: { x: 1, y: 1.3, z: -2.2 } });
    const sh = !!(BK.S && BK.S.shake); if (sh !== audio._shake) { audio._shake = sh; if (sh) { audio.sfx('sting'); audio.sfx('knock', { delay: 0.5 }); } }
    const evs = BK.S && BK.S.events; if (evs) { const open = evs.find((e) => e.status === 'open'), oi = open ? open.idx : -1; if (oi !== audio._open) { if (audio._open !== undefined && oi >= 0) audio.sfx('bell'); audio._open = oi; }
      const sig = evs.map((e) => e.status[0]).join(''); if (sig !== audio._evSig) { const was = audio._evSig || ''; audio._evSig = sig; /* the TV announcer: on air / final */
        if (was) { const tv = { x: 0, y: 2.6, z: -7.2 }; if ([...sig].some((c, i) => c === 'a' && was[i] !== 'a')) BK.vo.play('an_underway', tv, { v: 0.8 }); else if ([...sig].some((c, i) => c === 'f' && was[i] !== 'f')) BK.vo.play('an_final', tv, { v: 0.8 }); } } } }
  const ev = BK.S && BK.S.barEvent, blackout = !!(ev && ev.kind === 'blackout'), happy = !!(ev && ev.kind === 'happy');
  tv.blackout = blackout;
  { const cn = BK.S && BK.S.cine, ce = cn ? BK.now() - cn.start : 1e9, flick = cn && /Intro$/.test(cn.kind) && ce > 400 && ce < 1500;
    const tgt = blackout ? (Math.random() < 0.06 ? 0.5 : 0.05) : flick ? (Math.random() < 0.35 ? 0.45 : 0.95) : 1; for (const [l, base] of lightList) l.intensity += (base * tgt - l.intensity) * Math.min(1, dt * 9); party.intensity += ((happy ? 26 : 0) - party.intensity) * Math.min(1, dt * 4); party.color.setHSL((t * 0.25) % 1, 1, 0.55); }
  brawlers.forEach((b, k) => { const g = b.P.group, sway = Math.sin(t * 3 + k) * 0.35; g.position.x = b.x + sway * (k ? -1 : 1) * 0.6; g.position.z = -2.2 + Math.sin(t * 2.3 + k * 2) * 0.35; animate(b.P, 'fight', t + k, 1); });
  roulette.update(dt); bar.update(t, dt, me); tv.draw(BK.S, now);
  for (const a of avatars.values()) {
    const g = a.P.group, k = Math.min(1, dt * 10); g.position.x += (a.tx - g.position.x) * k; g.position.z += (a.tz - g.position.z) * k;
    const dgo = goons.drag[a.id] && goons.get(goons.drag[a.id]), grabbed = goons.held[a.id] || dgo;
    if (dgo) { const gg = dgo.P.group, fx = -Math.sin(gg.rotation.y), fz = -Math.cos(gg.rotation.y); g.position.x = gg.position.x - fx * 0.75; g.position.z = gg.position.z - fz * 0.75; g.rotation.y = gg.rotation.y; }
    const seat = a.sit && !grabbed ? seatOf(a) : null; // seated: the body faces the seat, the head follows where they look
    let d = (seat ? seat.yaw : a.try) - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * k;
    const sp = Math.hypot(g.position.x - a.px, g.position.z - a.pz) / Math.max(dt, 0.001); a.px = g.position.x; a.pz = g.position.z;
    const sitY = (a.sit ? a.sit + 0.09 - (a.P.hipY || 0.98) : 0) + (a.jy || 0); a.P.baseY = (a.P.baseY || 0) + (sitY - (a.P.baseY || 0)) * Math.min(1, dt * 10);
    if (!!a.sit !== !!a._sat) { a._sat = !!a.sit; audio.sfx(a.sit ? 'sit' : 'stand', { pos: { x: g.position.x, y: 0.6, z: g.position.z } }); }
    if (!a.sit && sp > 0.6) { a._sd = (a._sd || 0) + sp * dt; if (a._sd > 0.8) { a._sd = 0; audio.sfx('step', { v: 0.5, pos: { x: g.position.x, y: 0.1, z: g.position.z } }); } }
    { const dx = g.position.x - me.x, dz = g.position.z - me.z, dist = Math.hypot(dx, dz);
      if (a.lab === undefined) { a.lab = g.children.find((o) => o.isSprite && o.position.y > 2 && o.position.y < 2.4); if (a.lab) a.labS = a.lab.scale.clone(); }
      if (a.lab) { const k = Math.min(1.25, Math.max(0.45, dist * 0.32)); a.lab.scale.set(a.labS.x * k, a.labS.y * k, 1); a.lab.material.opacity = dist < 1.1 ? Math.max(0, (dist - 0.5) / 0.6) : 1; }
      const near = dist < 0.55; if (a.hideNear !== near) { a.hideNear = near; g.children.forEach((o) => { if (!o.isSprite) o.visible = !near; }); } }
    if (!a.mic) { a.mic = label('🎙', '#2ee09a', 0.55); a.mic.position.y = 2.65; a.mic.visible = false; g.add(a.mic); } const spk = voice.speaking(a.id); if (a.mic.visible !== spk) a.mic.visible = spk;
    { const down = a.ko && a.ko > BK.now();
      if (a.dizzy) a.dizzy.update(dt, t, headPos(a.P), down);
      if (down || a._koOn) {
        if (down && !a._koOn) { a._koOn = true; g.rotation.order = 'YXZ'; if (!a.dizzy) a.dizzy = makeDizzy(scene); }
        if (down) { animate(a.P, 'idle', t); g.rotation.x += (Math.PI / 2 - g.rotation.x) * Math.min(1, dt * 12); g.position.y = (a.P.baseY || 0) + 0.2; continue; }
        a._koOn = false; g.rotation.x = 0; g.position.y = a.P.baseY || 0; audio.sfx('boing', { pos: { x: g.position.x, y: 1.4, z: g.position.z } });
      } }
    a.P.moveSpeed = sp;
    if (grabbed) { if (a.life) a.life.act = null; animate(a.P, 'clip:help', t); tickCosmetics(a.P, t); continue; }
    if (seat && a.P.skinned) { seatedLife(a, seat); bar.life.tick(a.life, t, dt, {}); animate(a.P, 'seated', t); bar.life.place(a.life); tickCosmetics(a.P, t); continue; }
    if (a.life) { a.life.act = null; if (a.life.glass) a.life.glass.visible = false; }
    animate(a.P, a.sit ? 'sit' : a.drunk >= 40 && sp < 0.4 ? 'stagger' : sp > 0.5 ? 'walk' : 'idle', t, Math.min(1.4, sp / 3.5)); tickCosmetics(a.P, t);
  }
  goons.update(dt, t, BK.S && BK.S.cine && BK.now() < BK.S.cine.until ? BK.S.cine.kind : null);
  const st = nearest();
  if (st && !cineOn && !BK.ui.open && !BK.ui.shop && !BK.ui.menu && !me.sit && !games.active()) { promptEl.textContent = st.text; promptEl.classList.remove('hidden'); } else promptEl.classList.add('hidden');
  if (!st && !cineOn && !games.active() && !BK.ui.open && !BK.ui.shop && !BK.ui.menu && document.pointerLockElement !== canvas) { promptEl.textContent = 'Click to look around'; promptEl.classList.remove('hidden'); }
  fx.setDrunk(drunkAmt, t);
  fx.render();
}
window.__dbg = { renderer, scene, camera, me, games, roulette, bar, fx, tv, avatars, bottles, voice, keys };
requestAnimationFrame(frame);
window.__worldReady = true; if (typeof window.render === 'function') window.render(); // drop the loading bar / loading screen
