import * as THREE from 'three';
import { createGames } from './games.js';
import { buildBar, ROOM } from './bar.js';
import { createTV } from './tv.js';
import { createRoulette } from './roulette.js';
import { createZones } from './zones.js';
import { onPlace } from './props.js';
import { createOutside, OUT, drawSym } from './outside.js';
import { createFX } from './fx.js';
import { makePreset, animate } from './people.js';
import { audio } from './audio.js';
import { createVoice } from './voice.js';
import { createAudioUI } from './audioui.js';
import { createBottles } from './bottles.js';
import { label } from './textures.js';
import { makeDizzy, headPos } from './dizzy.js';
import { createGoonsView } from './goonsview.js';
import { createBumView } from './bumview.js';
import { createItems } from './items.js';
import { STORY } from './story.js';
import { createBrawl } from './brawl.js';
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
const roulette = createRoulette({ scene, BK, me, stations, obstacles, at: OUT.roulette }); // in the gas-station casino across the street
BK.onSpin = (m) => roulette.onSpin(m);
const outside = createOutside({ scene, BK, stations, obstacles, bar, ROOM });
BK.onSlot = (m) => outside.onSlot(m); BK.slotDraw = drawSym;
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
const bottles = createBottles({ scene, camera, BK, me, obstacles, getAvatars: () => avatars, getNpcs: () => bar.npcs, getGoons: () => [...goons.list(), ...bumView.list()], getBrawlers: () => brawl.list(), ROOM, busy: () => games.active() || BK.ui.open || BK.ui.shop || koNow() });
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
// ---------- the crowd turns on a big loser: the nearest patrons lob bottles at them until the server knocks them out ----------
const pelts = [], PELT_LINES = ['BUM!', 'YOU SUCK!', 'Get outta here!', 'That was MY money too!', 'Learn the game!', 'Booooo!'];
const posOf = (id) => { if (id === (BK.S && BK.S.you)) return new THREE.Vector3(me.x, EYE - 0.2, me.z); const a = avatars.get(id); return a ? new THREE.Vector3(a.P.group.position.x, 1.45, a.P.group.position.z) : null; };
BK.onPelt = (m) => {
  const mine = m.id === (BK.S && BK.S.you), at = posOf(m.id); if (!at) return;
  const throwers = bar.npcs.filter((n) => !['Uncle Sal', 'Bartender', 'Dealer', 'Clerk'].includes(n.name) && n.who !== 'Gina' && !(n.ko > BK.now())).sort((a, b) => a.P.group.position.distanceTo(at) - b.P.group.position.distanceTo(at)).slice(0, 7);
  pelts.push({ id: m.id, end: performance.now() + Math.max(600, m.until - BK.now()), next: performance.now() + 350, k: 0, throwers });
  audio.sfx('boo', { v: 1 }); if (mine) { if (me.sit) BK.stand(); BK.toast && BK.toast('🍾 You lost $500+ on one game. The whole bar is throwing bottles at you!', 'err'); }
};
function updatePelts(t) {
  const now = performance.now();
  for (let i = pelts.length - 1; i >= 0; i--) {
    const pl = pelts[i], at = posOf(pl.id); if (now > pl.end || !at || !pl.throwers.length) { pelts.splice(i, 1); continue; }
    if (now < pl.next) continue; pl.next = now + 240 + Math.random() * 220;
    const n = pl.throwers[pl.k++ % pl.throwers.length], g = n.P.group.position, from = new THREE.Vector3(g.x, g.y + (n.seated ? 1.2 : 1.6), g.z), dir = at.clone().sub(from).setY(0).normalize();
    from.addScaledVector(dir, 0.6); at.x += (Math.random() - 0.5) * 0.15; at.z += (Math.random() - 0.5) * 0.15;
    bottles.lob(from, at, pl.id === (BK.S && BK.S.you)); n.throwT = t + 0.45;
    if (Math.random() < 0.3 && n.bubble && !n.forced) n.forced = { text: PELT_LINES[Math.floor(Math.random() * PELT_LINES.length)], secs: 1.8, shown: false };
  }
}
const hitFlash = document.createElement('div'); hitFlash.id = 'hitflash'; document.body.appendChild(hitFlash);
BK.onPeltHit = () => { me.punch = 1; hitFlash.classList.remove('on'); void hitFlash.offsetWidth; hitFlash.classList.add('on'); };
// ---------- Gina: a drink gets you "I have a boyfriend"; going all in and hitting gets you a kiss ----------
BK.onNpcSay = (m) => { const n = bar.say(m.who, m.text, m.secs || 4); if (n && m.vo && BK.vo) BK.vo.play(m.vo, { x: n.P.group.position.x, y: 1.6, z: n.P.group.position.z }); if (m.by === (BK.S && BK.S.you)) audio.sfx('coin'); };
const kissFx = document.createElement('div'); kissFx.id = 'kissfx'; document.body.appendChild(kissFx);
BK.onKiss = (m) => {
  const mine = m.id === (BK.S && BK.S.you);
  bar.kiss(() => posOf(m.id), () => {
    if (!mine) return;
    me.kissUntil = performance.now() + 2600; // the camera turns to her and holds
    kissFx.innerHTML = '<div class="kf-lips">💋</div><div class="kf-txt">Gina kissed you.</div><div class="kf-sub">Her boyfriend is going to hear about this.</div>'; kissFx.classList.remove('on'); void kissFx.offsetWidth; kissFx.classList.add('on');
    setTimeout(() => kissFx.classList.remove('on'), 6500);
  });
};
function kissLook(dt) {
  if (!(me.kissUntil > performance.now())) return false; const h = bar.ginaHead(); if (!h) return false;
  const dx = h.x - me.x, dz = h.z - me.z, want = Math.atan2(-dx, -dz), wp = Math.atan2(h.y - EYE, Math.hypot(dx, dz)); let d = want - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  me.yaw += d * Math.min(1, dt * 6); me.pitch += (wp - me.pitch) * Math.min(1, dt * 6); return true;
}
addEventListener('keydown', (e) => { // F: a drag when you're smoking, otherwise a bottle. G lights a cigarette, X cracks an energy drink (public/items.js)
  if (e.repeat || !active() || BK.ui.open || BK.ui.shop || koNow() || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
  if (e.code === 'KeyF') { if (!(items.lit() && items.drag())) bottles.throw(); }
  if (e.code === 'KeyG' && !items.light() && BK.S && BK.S.me && !(BK.S.me.inv && BK.S.me.inv.cigs > 0) && !items.lit()) BK.toast && BK.toast('No cigarettes. The gas station counter sells them.', 'info');
  if (e.code === 'KeyX' && !items.chug() && BK.S && BK.S.me && !(BK.S.me.inv && BK.S.me.inv.cans > 0)) BK.toast && BK.toast('No energy drinks. The gas station counter sells them.', 'info');
});
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
  if (heldBy() && e.code === 'Space') { if (!e.repeat) struggle(); return; } // grabbed: mash Space to wrench free
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
  if (games.active() && games.move(mx, my)) return; // the golf trackball
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
const bumView = createBumView({ scene, audio }); BK.onBum = (m) => bumView.onMsg(m); // the pickpocket (server bum.js)
const cine = createCine({ camera, BK, doors: bar.doors, goons, audio, backroom: bar.backroom, owner: bar.owner, dev: bar.dev });
let wasHeld = null;
// guided first night: a regular calls out to you (bubble + voice line when the clip exists)
BK.guideSay = (who, text, vo) => { const n = bar.say(who, text, 7); if (n) { const g = n.P.group.position; BK.vo.play(vo, { x: g.x, y: 1.6, z: g.z }); } };
BK.onGoonDodge = (m) => { goons.dodge(m.id); const o = goons.get(m.id); if (o) audio.sfx('whoosh', { pos: { x: o.P.group.position.x, y: 1.3, z: o.P.group.position.z } }); };
BK.onGoons = (m) => { goons.onMsg(m); const h = goons.held[BK.S && BK.S.you] || null; if (h !== wasHeld) { wasHeld = h; if (h) { if (me.sit) BK.stand(); games.leave(); audio.sfx('groan'); } window.render && window.render(); } };
const heldBy = () => (BK.S && goons.held[BK.S.you]) || null, draggedBy = () => (BK.S && goons.drag[BK.S.you]) || null;
// ---------- bar-fight brawlers (public/brawl.js: choreographed exchanges, the knockout) ----------
const brawl = createBrawl({ scene, audio });
const syncBrawlers = () => brawl.sync(BK.S);
// lights: remember base intensities so blackouts can dim everything
const lightList = []; scene.traverse((o) => { if (o.isLight && !o.userData.noDim) lightList.push([o, o.intensity]); });
const party = new THREE.PointLight(0xff40d0, 0, 14, 2); party.position.set(0, 3.6, 1); scene.add(party);
const ray = new THREE.Raycaster(); ray.layers.enableAll(); // zones.js puts static things on per-zone layers
// grabbed by one of Sal's men: every Space press is a wrench; the server counts them and lets you go when you've fought enough
function struggle() { BK.send({ type: 'struggle' }); me.punch = 0.6; audio.sfx('punch', { v: 0.35 }); BK.struggle = (BK.struggle || 0) + 1; BK.struggleAt = performance.now(); window.render && window.render(); }
canvas.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) { if (active() && !BK.ui.open) canvas.requestPointerLock(); return; }
  if (e.button !== 0 || koNow()) return;
  if (games.active()) return games.down();
  const S = BK.S;
  if (bottles.held > 0 && bottles.throw()) return; // left click throws when you're holding bottles
  const bumNear = bumView.list().filter((o) => Math.hypot(o.P.group.position.x - me.x, o.P.group.position.z - me.z) < 3); // Dusty is around all night: only a punch when he's in reach
  if (goons.active() || bumNear.length) { // punch: whatever goon (or the bum) is under the crosshair, if he's within reach
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hit = ray.intersectObjects([...goons.list(), ...bumNear].map((o) => o.P.group), true)[0], id = hit && hit.object.userData.goonId, o = id && (goons.get(id) || bumView.get(id));
    items.punch();
    if (o && hit.distance < 2.8 && o.state !== 'down') { BK.send({ type: 'attack', g: id }); audio.sfx('punch', { pos: { x: o.P.group.position.x, y: 1.3, z: o.P.group.position.z }, v: items.wired() ? 1.4 : 1 }); me.punch = items.wired() ? 1.6 : 1; }
    else audio.sfx('whoosh', { v: 0.4 });
  }
});

// ---------- movement ----------
// the bar, plus the restroom through the door past Sal's booth (open while the bar is: no hiding in there from collectors or hitmen)
// where you can be: the bar, plus (while the bar is open, i.e. no collectors or hitmen) the restroom, the street, the gas-station lot and its casino,
// joined by doorway lanes. px/pz: how close to a space's edges you can walk; h: its ceiling (bottles shatter on it)
const openOut = () => !!(BK.S && BK.S.phase === 'play'); // the street, the lot and the store stay open when Sal's collectors come (they follow you out there); the hitmen at closing time pull everyone in
const openRest = () => openOut() && !BK.S.shake; // no hiding in the men's room from the collectors
const SPACES = (() => { const B = bar.backroom.bounds, D = OUT.door, C = OUT.casino, S = OUT.street, L = OUT.lot;
  return [
    { x0: -ROOM.x, x1: ROOM.x, z0: -ROOM.z, z1: ROOM.z, px: 0.6, pz: 0.6, h: ROOM.h },
    { x0: ROOM.x - 0.7, x1: ROOM.x + 0.5, z0: B.dz0, z1: B.dz1, px: 0, pz: 0.28, h: 2.34, gated: 'rest' },            // restroom doorway
    { x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, px: 0.32, pz: 0.32, h: 3, gated: 'rest' },                                 // restroom
    { x0: D.x - D.w / 2, x1: D.x + D.w / 2, z0: ROOM.z - 0.7, z1: ROOM.z + 0.9, px: 0.28, pz: 0, h: D.h, gated: true },  // front door
    { x0: -36, x1: 40, z0: ROOM.z + 0.3, z1: S.z1 + 4, px: 0.3, pz: 0.3, h: 60, gated: true },                           // sidewalks + street
    { x0: L.x0, x1: L.x1, z0: S.z1 + 3, z1: C.z0, px: 0.3, pz: 0.3, h: 60, gated: true },                                // gas-station lot
    { x0: C.door.x - C.door.w / 2, x1: C.door.x + C.door.w / 2, z0: C.z0 - 0.5, z1: C.z0 + 0.5, px: 0.28, pz: 0, h: C.door.h, gated: true },
    { x0: C.x0 + 0.06, x1: C.x1 - 0.06, z0: C.z0 + 0.06, z1: C.z1 - 0.06, px: 0.32, pz: 0.32, h: C.h, gated: true },   // casino
  ]; })();
const spaceAt = (x, z, walk = true) => { for (const s of SPACES) { if (walk && s.gated && !(s.gated === 'rest' ? openRest() : openOut())) continue; const px = walk ? s.px : 0, pz = walk ? s.pz : 0; if (x >= s.x0 + px && x <= s.x1 - px && z >= s.z0 + pz && z <= s.z1 - pz) return s; } return null; };
BK.spaceAt = spaceAt;
function walkClamp(ox, oz) { // slide along whichever axis still lands somewhere walkable
  if (spaceAt(me.x, me.z)) return; if (spaceAt(me.x, oz)) { me.z = oz; return; } if (spaceAt(ox, me.z)) { me.x = ox; return; } if (spaceAt(ox, oz)) { me.x = ox; me.z = oz; return; }
  if (me.x > ROOM.x - 0.6 && me.z < 0) { me.x = ROOM.x - 0.9; me.z = -6.6; return; } // a space closed with you in it: you're shown back into the bar
  const spot = [[-6.5, -3.5], [-3, -5.5], [-8.5, 1], [3, -5.5], [-1, 2]].find(([x, z]) => clearAt(x, z)) || [-6.5, -3.5]; me.x = spot[0]; me.z = spot[1]; // the far side of the room, away from the front door Sal's men come in by
}
function move(dt, t, drunkAmt) {
  if (kissLook(dt)) return;
  if (BK.ui.open || games.active() || me.sit || koNow() || heldBy() || draggedBy() || (BK.S && BK.S.cine && BK.now() < BK.S.cine.until)) return;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sp = (keys.ShiftLeft ? 6.2 : 3.8) * (items.wired() ? 1.18 : 1), sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  let dx = -sin * f + cos * s, dz = -cos * f - sin * s; const len = Math.hypot(dx, dz) || 1;
  const moving = f || s;
  dx = (dx / len) * sp * dt * (moving ? 1 : 0); dz = (dz / len) * sp * dt * (moving ? 1 : 0);
  if (drunkAmt > 0.25) { const drift = Math.sin(t * 1.3) * drunkAmt * 1.4 * dt * (moving ? 1 : 0.3); dx += cos * drift; dz += -sin * drift; }
  const ox = me.x, oz = me.z; me.x += dx; me.z += dz;
  walkClamp(ox, oz);
  for (const o of obstacles) { const ex = me.x - o.x, ez = me.z - o.z, d = Math.hypot(ex, ez), min = o.r + 0.3; if (d < min && d > 0) { me.x = o.x + (ex / d) * min; me.z = o.z + (ez / d) * min; } }
  if (!spaceAt(me.x, me.z)) { me.x = ox; me.z = oz; } // pushed off a table into a wall
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
let prev = performance.now(), spawned = false, t0 = performance.now(), shadowTick = 0, shadowPick = 0;
// auto performance ('auto' graphics): the render resolution follows the frame rate. Under ~45fps it steps down (to 60% at most),
// with headroom for a while it steps back up (and stays put for a minute if that made it stutter again); still slow at the
// lowest step: shadows and bloom go too (performance mode)
const perf = { done: !!navigator.webdriver || /[?&]quality=high/.test(location.search), low: /[?&]quality=low/.test(location.search), lvl: 0, n: 0, acc: 0, good: 0, cool: 0, cap: 0, capT: 0, upAt: 0, lowOn: false };
const RES = [1, 0.85, 0.72, 0.6], basePR = () => Math.min(devicePixelRatio, 1.5);
function setRes(l) { perf.lvl = l; renderer.setPixelRatio(basePR() * RES[l]); resize(); }
function autoRes(rawDt, t) {
  if (perf.done || !(rawDt > 0 && rawDt < 0.25)) return; perf.acc += rawDt; if (++perf.n < 45) return; // tab switches and loading hitches don't count
  const avg = perf.acc / perf.n; perf.n = 0; perf.acc = 0; if (t < perf.cool) return;
  if (avg > 1 / 45) { perf.good = 0;
    if (t - perf.upAt < 4) { perf.cap = perf.lvl + 1; perf.capT = t + 60; } // stepping up didn't hold: stay below that for a minute
    if (perf.lvl < RES.length - 1) { setRes(perf.lvl + 1); perf.cool = t + 2; } else if (!perf.lowOn && avg > 1 / 36) { perf.lowOn = true; setLowQuality(); } }
  else if (avg < 1 / 57 && perf.lvl > 0 && ++perf.good >= 8 && !(perf.lvl - 1 < perf.cap && t < perf.capT)) { perf.good = 0; setRes(perf.lvl - 1); perf.upAt = t; perf.cool = t + 2; }
}
function setLowQuality() { renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1)); renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); } }); fx.setBloom(false); resize(); console.log('Ball Knowledge: performance mode on'); }
function setHighQuality() { renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.needsUpdate = true; scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); } }); fx.setBloom(true); resize(); }
// graphics setting from the Esc menu: 'low' / 'high' are fixed; 'auto' keeps the first-seconds check (or leaves things as they are)
BK.setQuality = (q) => { if (q === 'low') { perf.done = true; setLowQuality(); } else if (q === 'high') { perf.done = true; perf.lvl = 0; setHighQuality(); } else if (!navigator.webdriver) perf.done = false; };
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
  if ((shadowTick = (shadowTick + 1) % 2) === 0 && zones.barOn) renderer.shadowMap.needsUpdate = true; // shadows refresh at half rate, and only while the bar (the one shadow light's room) is in view
  const rawDt = (now - prev) / 1000, dt = Math.min(0.1, rawDt); prev = now; const t = (now - t0) / 1000;
  if (perf.low) { perf.low = false; setLowQuality(); }
  if (active() && t > 1) autoRes(rawDt, t);
  const on = active(); cross.style.display = on && !BK.ui.open ? 'block' : 'none';
  if (!on) { // title / lobby: slow cinematic drift through the bar
    promptEl.classList.add('hidden'); cine.update(dt, null); goons.update(dt, t, null);
    const k = t * 0.06; camera.position.set(Math.sin(k) * 3 - 1.2, 2.5 + Math.sin(k * 1.7) * 0.2, 0.4 + Math.cos(k * 0.8) * 0.8); camera.lookAt(Math.sin(k * 0.7) * 5, 1.9, -6); camera.rotation.z = 0;
    const mm = { x: camera.position.x, z: camera.position.z }; bar.update(t, dt, mm); roulette.update(dt); tv.draw(BK.S, now); fx.setDrunk(0, t); zones.update(); fx.render(); return;
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
  { const cOn = !!(BK.S && BK.S.cine && BK.now() < BK.S.cine.until), gOn = games.active() || cOn; const ring = brawl.spot(); for (const n of bar.npcs) { if (n.cine) continue; /* cine.js shows/hides the developer */ const g = n.P.group, hide = (ring && !n.seated && Math.hypot(g.position.x - ring.x, g.position.z - ring.z) < 1.5) || gOn && !(cOn && /^(opening|checkIn|verdict)$/.test(BK.S.cine.kind)) && Math.hypot(g.position.x - camera.position.x, g.position.z - camera.position.z) < (cOn ? 2.6 : 1.1) && !n.seated; /* the story's scenes frame their own close-ups */ if (g.visible === hide) g.visible = !hide; } }
  // ---- audio frame: listener, footsteps, bar-event cues, voice
  audio.update(dt, camera); audioUI.show(active()); voice.update(dt, avatars);
  grabDrops(); for (const o of drops.values()) o.g.rotation.y += dt * 0.6;
  updatePelts(t); bottles.update(dt); bottles.updateSpots(dt); { const left = koNow() ? (me.koUntil - BK.now()) / 1000 : 0; myDizzy.update(dt, t, null, left > 0); bottles.setKo(left); if (!left && me.koUntil) { me.koUntil = 0; audio.sfx('boing'); } if (left) { camera.position.y = 0.32; camera.rotation.z = 1.25; camera.rotation.x = 0.4; } }
  { const h = heldBy(), o = h && goons.get(h); // grabbed: you're turned to face him and shaken about
    if (o) { const g = o.P.group.position, want = Math.atan2(-(g.x - me.x), -(g.z - me.z)); let d = want - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); me.yaw += d * Math.min(1, dt * 6); me.pitch += (-0.22 - me.pitch) * Math.min(1, dt * 4); camera.rotation.set(me.pitch + Math.sin(t * 13) * 0.02, me.yaw + Math.sin(t * 9) * 0.03, Math.sin(t * 7) * 0.05); } }
  items.update(dt); // first-person hands, smoke, buff timers (after the camera is placed)
  if (me.punch) { me.punch = Math.max(0, me.punch - dt * 6); camera.position.y -= me.punch * 0.04; camera.rotation.z += me.punch * 0.03; }
  const cineOn = !!cine.update(dt, BK.S && BK.S.you); if (cineOn) cross.style.display = 'none';
  { const c = BK.S && BK.S.cine, sal = bar.npcs.find((n) => n.name === 'Uncle Sal'); // Sal talks through the opening scene
    if (sal) sal.P.group.visible = !(cineOn && c && c.kind === 'kill'); // he's in the back room with the bat
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
  brawl.update(dt, t, BK.now());
  for (const n of bar.npcs) n.offscreen = !(zones.mask & n.P.group.layers.mask);
  if ((shadowPick -= dt) <= 0) { shadowPick = 0.5; // characters only cast shadows near you, where they show: skinning every one of them into the shadow map costs a lot
    const c = camera.position, near = (g) => Math.hypot(g.position.x - c.x, g.position.z - c.z) < 9;
    for (const g of [...bar.npcs.map((n) => n.P.group), ...[...avatars.values()].map((a) => a.P.group), ...goons.list().map((o) => o.P.group), ...brawl.list().map((b) => b.P.group)]) { const on = near(g); g.traverse((o) => { if (!o.isMesh) return; if (o.userData.cs0 === undefined) o.userData.cs0 = o.castShadow; o.castShadow = on && o.userData.cs0; }); } }
  roulette.update(dt); bar.update(t, dt, me); if (zones.barOn) tv.draw(BK.S, now); // the TVs are all in the bar
  games.idle(t, zones.barOn); // the golf cabinet's attract screen
  { const c = BK.S && BK.S.cine, killOn = !!(c && c.kind === 'kill' && BK.now() < c.until + 200), dn = (x, z) => Math.hypot(x - ROOM.x, z + 6.6) < 1.8; // restroom door: opens for anyone near it (the kill scene drives it itself)
    const near = openRest() && (dn(me.x, me.z) || [...avatars.values()].some((a) => dn(a.P.group.position.x, a.P.group.position.z))); bar.backroom.tick(dt, t, killOn ? null : near);
    const cineOnNow = !!(c && BK.now() < c.until + 200), fn = (x, z) => Math.hypot(x - OUT.door.x, z - ROOM.z) < 2.0; // the street door: same, unless a cutscene is using it
    bar.frontDoor(dt, cineOnNow ? null : (fn(me.x, me.z) && openOut()) || [...avatars.values(), ...bumView.list(), ...goons.list()].some((a) => fn(a.P.group.position.x, a.P.group.position.z))); // it swings for players, the bum and Sal's men
    if (!spaceAt(me.x, me.z) && !cineOnNow && !me.sit) walkClamp(me.x, me.z); // outside when collectors or hitmen showed up: back in the bar
    outside.update(dt, BK.now()); }

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
  bumView.update(dt, t);
  goons.update(dt, t, BK.S && BK.S.cine && BK.now() < BK.S.cine.until ? BK.S.cine.kind : null);
  const st = nearest();
  if (st && !cineOn && !BK.ui.open && !BK.ui.shop && !BK.ui.menu && !me.sit && !games.active()) { promptEl.textContent = st.text; promptEl.classList.remove('hidden'); } else promptEl.classList.add('hidden');
  if (!st && !cineOn && !games.active() && !BK.ui.open && !BK.ui.shop && !BK.ui.menu && document.pointerLockElement !== canvas) { promptEl.textContent = 'Click to look around'; promptEl.classList.remove('hidden'); }
  fx.setDrunk(drunkAmt, t);
  zones.update(); fx.render();
}
// ---------- zone culling + light pool (zones.js): only draw the parts of the map the camera can see into ----------
for (const d of [bar.doors.front, bar.doors.back]) d.traverse((o) => { o.userData.zone = 'all'; });
const zones = (() => { const B = bar.backroom.bounds, C = OUT.casino, V = (x, y, z) => new THREE.Vector3(x, y, z), fd = bar.doors.front, bd = bar.doors.back, fBase = fd.rotation.y, bBase = bd.rotation.y;
  return createZones({ scene, camera, bar: new THREE.Box3(V(-ROOM.x, -1, -ROOM.z), V(ROOM.x - 0.25, 12, ROOM.z - 0.25)), rest: new THREE.Box3(V(B.x0, -1, B.z0), V(B.x1, 12, B.z1)),
    store: new THREE.Box3(V(C.x0, -1, C.z0), V(C.x1, 12, C.z1)), frontDoor: { x: OUT.door.x, z: ROOM.z }, backDoor: { x: ROOM.x, z: (B.dz0 + B.dz1) / 2 }, storeDoor: { x: C.door.x, z: C.z0 },
    frontOpen: () => Math.abs(fd.rotation.y - (fd.userData.base ?? fBase)) > 0.03, backOpen: () => Math.abs(bd.rotation.y - (bd.userData.base ?? bBase)) > 0.03 }); })();
zones.tagAll(); onPlace(zones.tag);
// gas-station goods: hands, smoke, buffs (made after tagAll so the smoke and the hands stay on the always-drawn layer)
const items = createItems({ scene, camera, BK, me, games, getAvatars: () => avatars, bumView });
BK.onFx = (m) => items.onFx(m); BK.onDrag = (m) => items.onDrag(m);
stations.push({ get x() { const b = bumView.list()[0]; return b ? b.P.group.position.x : 1e9; }, get z() { const b = bumView.list()[0]; return b ? b.P.group.position.z : 1e9; }, r: 2.4, prio: 3,
  get text() { return `E - Give ${STORY.bum ? STORY.bum.name : 'Dusty'} a cigarette (he'll leave you alone next time)`; },
  on: () => !!(BK.S && BK.S.me && BK.S.me.inv && BK.S.me.inv.cigs > 0 && bumView.list()[0] && !['run', 'flee'].includes(bumView.list()[0].state)), act: () => { items.give(); BK.send({ type: 'bumCig' }); } });
window.__dbg = { items, zones, brawl, renderer, scene, camera, me, games, roulette, bar, fx, tv, avatars, bottles, voice, keys };
requestAnimationFrame(frame);
window.__worldReady = true; if (typeof window.render === 'function') window.render(); // drop the loading bar / loading screen
