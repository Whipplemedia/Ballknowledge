// Gas-station goods in first person (server: 'gas', 'cigLight', 'cigDrag', 'energy', 'zyn', 'bumCig', 'atm' in server.js).
// The hands are Meshy models in Bub's style (public/models/hands/*.glb, one per grip; see blender/meshy_world.json "hands"):
//   - cig: a lit cigarette in your left hand for 2 minutes, smoke curling off the ember; F brings it to your mouth for a drag (the ember
//     flares, then you breathe out a cloud). G lights one: it goes to your lips and the lighter hand flicks a flame under it.
//   - energy (OVERTIME) / beer (Budget Lite): the can comes up, tilts, you chug. Wired for 60 s: fists up in a jittery guard, punches land hard.
//   - pouch: the hand comes up from the toilet bowl and puts it in your lip. Steady hands (games.js dr()) for 90 s.
//   - fist: punches, a jab from alternating fists (world.js calls punch()).
// Other people see a cigarette in the mouth of anyone smoking (and Dusty, once you've given him one), with smoke and a drag now and then.
// The buff timers (luck / wired / steady) and what's in your pockets sit bottom left.
import * as THREE from 'three';
import { audio } from './audio.js';
import { gltfLoader } from './loading.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const cyl = (r0, r1, h, m, parent, seg = 10) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); parent.add(c); return c; };
const ease = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const D = Math.PI / 180;

// ---------- smoke: soft world-space puffs from one pool ----------
function createSmoke(scene) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c), pool = [];
  for (let i = 0; i < 160; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xd4d6da, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; s.renderOrder = 5; scene.add(s); pool.push({ s, life: 0 }); }
  let next = 0;
  return {
    emit(pos, vel, size, life, alpha = 0.5, grow = 0.25) { const p = pool[next = (next + 1) % pool.length]; p.s.position.copy(pos); p.v = vel.clone(); p.life = p.max = life; p.size = size; p.grow = grow; p.alpha = alpha; p.s.visible = true; p.s.material.rotation = Math.random() * 6.28; },
    update(dt) {
      for (const p of pool) { if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.s.visible = false; continue; }
        p.v.y += 0.12 * dt; p.v.multiplyScalar(1 - dt * 0.9); p.s.position.addScaledVector(p.v, dt); p.size += p.grow * dt;
        const k = p.life / p.max; p.s.scale.setScalar(p.size); p.s.material.opacity = p.alpha * Math.min(1, (1 - k) * 8) * k; }
    },
  };
}

// a cigarette: filter at the origin, pointing down -z to the ember
export function makeCig(len = 0.075) {
  const g = new THREE.Group(), r = 0.0042;
  const filt = cyl(r, r, 0.022, M(0xc98a4a, { roughness: 0.9 }), g); filt.rotation.x = Math.PI / 2; filt.position.z = -0.011;
  const paper = cyl(r, r, len - 0.022, M(0xf4f2ec, { roughness: 0.9 }), g); paper.rotation.x = Math.PI / 2; paper.position.z = -0.022 - (len - 0.022) / 2;
  const emberM = new THREE.MeshBasicMaterial({ color: 0xff5a1a, toneMapped: false }); const ember = cyl(r * 0.95, r, 0.007, emberM, g); ember.rotation.x = Math.PI / 2; ember.position.z = -len - 0.003;
  const ash = cyl(r * 0.9, r * 0.95, 0.006, M(0x777777), g); ash.rotation.x = Math.PI / 2; ash.position.z = -len - 0.009;
  const tip = new THREE.Object3D(); tip.position.z = -len - 0.012; g.add(tip);
  return { g, ember, emberM, tip, set lit(v) { ember.visible = ash.visible = v; } };
}
// The hand models (each normalised by Meshy to ~1.9 units tall, the front of the hand facing +z) are placed in camera space by poses:
// [x, y, z, rx, ry, rz] (metres, degrees; Euler order YXZ). Tuned in a first-person preview at the game's fov; the forearm's cut end
// always leaves the screen. HANDS: file, scale, mirror (the left hand is the right model flipped), marks in model space.
const HANDS = {
  cig: { s: 0.22, mirror: true, tip: [-0.98, 0.35, 0.05] }, lighter: { s: 0.2, flame: [-0.22, 1.02, 0] }, energy: { s: 0.22 }, beer: { s: 0.22 }, pouch: { s: 0.2 },
  fistR: { file: 'fist', s: 0.28 }, fistL: { file: 'fist', s: 0.28, mirror: true },
};
const lerpPose = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
function at(keys, t) { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, a] = keys[i - 1], [t1, b] = keys[i]; return lerpPose(a, b, ease((t - t0) / (t1 - t0))); } return keys[keys.length - 1][1]; }
const put = (o, p) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(p[3] * D, p[4] * D, p[5] * D, 'YXZ'); };

const CIG_REST = [-0.3, -0.3, -0.55, 0, 0, 0], CIG_MOUTH = [-0.1, -0.27, -0.32, 20, -10, -20], CIG_OFF = [-0.36, -0.75, -0.5, 0, 0, 0], CIG_GIVE = [-0.12, -0.22, -0.7, 0, 30, -60];
const LIGHT_UP = [0.1, -0.24, -0.36, 0, 20, 10], R_OFF = [0.32, -0.75, -0.5, 0, 0, 0];
const CAN_HOLD = [0.2, -0.2, -0.48, -10, 0, 10], CAN_SIP = [0.08, -0.1, -0.36, -65, 0, 20], CAN_TIP = [0.07, -0.08, -0.35, -75, 0, 20];
const POUCH_LOW = [0.15, -0.6, -0.4, 30, 0, 0], POUCH_UP = [0.1, -0.3, -0.4, 10, 0, 0], POUCH_LIP = [0.08, -0.18, -0.34, 15, 0, 0];
const guard = (side) => [side * 0.24, -0.26, -0.48, -10, 180, -25 * side], jabAt = (side) => [side * 0.04, -0.17, -0.52, -40, 180 + 10 * side, -45 * side], fistOff = (side) => [side * 0.3, -0.75, -0.45, -10, 180, -25 * side];

export function createItems({ scene, camera, BK, me, games, getAvatars, bumView }) {
  const smoke = createSmoke(scene);
  // ---- first person rig: one holder per grip, filled when its model arrives (nothing shows until then)
  const H = {}, tmpEmber = new THREE.Vector3();
  const emberM = new THREE.MeshBasicMaterial({ color: 0xff5a1a, toneMapped: false }), flameM = new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false, transparent: true, opacity: 0.9 });
  for (const [k, h] of Object.entries(HANDS)) {
    const o = new THREE.Group(); o.visible = false; camera.add(o); H[k] = o;
    gltfLoader().loadAsync('models/hands/' + (h.file || k) + '.glb').then((g) => {
      const m = g.scene; m.scale.set(h.s * (h.mirror ? -1 : 1), h.s, h.s); m.traverse((c) => { if (c.isMesh) { c.frustumCulled = false; c.renderOrder = 6; } }); o.add(m);
      if (h.tip) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), emberM); e.position.set(...h.tip); m.add(e); o.userData.ember = e; } // the glowing end, in model units
      if (h.flame) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), flameM); f.position.set(...h.flame); f.scale.set(1, 2.2, 1); f.visible = false; m.add(f); o.userData.flame = f; }
    }).catch(() => {});
  }
  const myTip = () => (H.cig.userData.ember ? H.cig.userData.ember.getWorldPosition(tmpEmber) : null);

  let act = null; // the current one-shot: { kind, t0, dur }
  let jab = null, jabSide = 1;
  const now = () => performance.now() / 1000;
  const S = () => BK.S && BK.S.me;
  const lit = () => !!(S() && S().cigUntil > BK.now()), wired = () => !!(S() && S().wiredUntil > BK.now()), steady = () => !!(S() && S().zynUntil > BK.now());
  BK.zyn = steady; BK.wired = wired;
  const blocked = () => games.active() || BK.ui.open || BK.ui.shop || (BK.S && BK.S.cine && BK.now() < BK.S.cine.until) || (BK.S && BK.S.me && BK.S.me.held);
  const start = (kind, dur) => { act = { kind, t0: now(), dur }; };

  // ---- the HUD: buff timers + pockets
  const hud = document.createElement('div'); hud.id = 'buffs'; document.body.appendChild(hud);
  const wiredFx = document.createElement('div'); wiredFx.id = 'wiredfx'; document.body.appendChild(wiredFx);
  const gross = document.createElement('div'); gross.id = 'grossfx'; document.body.appendChild(gross);
  let hudSig = '';
  function paintHud() {
    const s = S(); if (!s || !BK.S || !['play', 'hunt'].includes(BK.S.phase)) { if (hudSig) { hud.innerHTML = ''; hudSig = ''; } return; }
    const n = BK.now(), row = (on, until, total, icon, label, cls) => on ? `<div class="buff ${cls}"><b>${icon}</b><span>${label}</span><i>${Math.ceil((until - n) / 1000)}s</i><u style="width:${Math.max(0, Math.min(100, (until - n) / total * 100))}%"></u></div>` : '';
    const inv = s.inv || {};
    const html = row(lit(), s.cigUntil, 120000, '🚬', 'LUCKY +15% · F drag', 'luck') + row(wired(), s.wiredUntil, 60000, '⚡', 'WIRED · punches hit hard', 'wired') + row(steady(), s.zynUntil, 90000, '🟢', 'ZYN · steady hands', 'zyn')
      + ((inv.cigs || inv.cans) ? `<div class="pockets">${inv.cigs ? `🚬 ×${inv.cigs} <kbd>${lit() ? '' : 'G'}</kbd>` : ''}${inv.cans ? ` ⚡ ×${inv.cans} <kbd>X</kbd>` : ''}${s.bumPass ? ' · 🥫 Dusty owes you' : ''}</div>` : s.bumPass ? '<div class="pockets">🥫 Dusty owes you one</div>' : '');
    if (html !== hudSig) { hudSig = html; hud.innerHTML = html; }
  }

  // ---- third person: whoever is smoking has one in his mouth
  const worn = new Map(); // P -> { cig, next, drag }
  function wear(P, on) {
    let w = worn.get(P);
    if (on && !w) { const c = makeCig(0.07); c.g.position.set(0.045, -0.13, -0.25); c.g.rotation.set(0.32, -0.45, 0); c.g.scale.setScalar(1.35); P.head.add(c.g); w = { cig: c, next: 0, drag: 0, P }; worn.set(P, w); }
    if (!on && w) { P.head.remove(w.cig.g); worn.delete(P); }
    return w;
  }
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();

  const api = {
    lit, wired, steady, smoke,
    // G: light one up
    light() { const s = S(); if (!s || lit() || !(s.inv && s.inv.cigs > 0) || blocked() || (act && act.kind !== 'drag')) return false; start('light', 1.7); BK.send({ type: 'cigLight' }); return true; },
    // F: a drag (when you're smoking)
    drag() { if (!lit() || blocked() || act) return false; start('drag', 2.6); BK.send({ type: 'cigDrag' }); return true; },
    // X: the energy drink
    chug() { const s = S(); if (!s || !(s.inv && s.inv.cans > 0) || blocked() || act) return false; start('energy', 2.4); BK.send({ type: 'energy' }); return true; },
    give() { start('give', 1.0); }, // E at Dusty: hold one out
    punch() { jabSide = -jabSide; jab = { t0: now(), side: lit() ? 1 : jabSide }; }, // smoking: the cigarette stays in the left, the right does the work
    onFx(m) { // the server confirmed something you bought / did
      if (m.kind === 'zyn') { start('zyn', 2.2); audio.sfx('squelch'); gross.classList.remove('on'); void gross.offsetWidth; gross.classList.add('on'); }
      if (m.kind === 'buy' && m.item === 'beer') start('beer', 2.4);
      if (m.kind === 'buy' && (m.item === 'cig' || m.item === 'pack' || m.item === 'energy')) audio.sfx('chip');
      if (m.kind === 'atm') audio.sfx('cash');
    },
    onDrag(m) { const a = getAvatars().get(m.id); const w = a && worn.get(a.P); if (w) w.drag = now(); },
    update(dt) {
      const t = now(), hidden = blocked();
      smoke.update(dt); if (BK.zynPouch) BK.zynPouch.visible = !(BK.S && BK.S.zynAt > BK.now()); // the pouch in the men's room toilet (public/bar.js)
      // --- who's smoking (other players, Dusty)
      const want = new Set();
      if (BK.S && BK.S.players) for (const p of BK.S.players) { if (p.id === BK.S.you || !(p.smoking > BK.now())) continue; const a = getAvatars().get(p.id); if (a) want.add(a.P); }
      const b = bumView.list()[0]; if (b && b.smoking) want.add(b.P);
      for (const P of [...worn.keys()]) if (!want.has(P) || !P.group.parent) wear(P, false);
      for (const P of want) { const w = wear(P, true); if (!w) continue;
        if (!w.drag && Math.random() < dt / 14) w.drag = t; // now and then he takes a drag on his own
        const dk = w.drag ? t - w.drag : 9; w.cig.emberM.color.setHex(dk < 1.1 ? 0xffc040 : 0xff5a1a);
        if (dk > 1.4 && dk < 1.6 && !w.puffed) { w.puffed = true; w.cig.g.getWorldPosition(tmp); P.group.getWorldDirection(fwd); for (let i = 0; i < 10; i++) smoke.emit(tmp, fwd.clone().multiplyScalar(-0.5 - Math.random() * 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.05 + Math.random() * 0.1, (Math.random() - 0.5) * 0.3)), 0.05 + Math.random() * 0.04, 2.0, 0.22, 0.3); }
        if (dk > 3) { w.drag = 0; w.puffed = false; }
        if ((w.next -= dt) <= 0) { w.next = 0.18; w.cig.tip.getWorldPosition(tmp); smoke.emit(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.04, 0.22, (Math.random() - 0.5) * 0.04), 0.035, 2.4, 0.3, 0.09); } }

      // --- first person
      for (const o of Object.values(H)) o.visible = false;
      if (hidden) { act = null; return paintHud(); }
      const smoking = lit();
      if (act && t - act.t0 > act.dur) act = null;
      const k = act ? t - act.t0 : 0, ember = H.cig.userData.ember, flame = H.lighter.userData.flame;
      // the cigarette hand (left)
      let litNow = smoking || (act && act.kind === 'light' && k > 1.0);
      if (act && act.kind === 'light') { // the cigarette goes to your lips, the lighter comes up under it and flicks, a first puff
        H.cig.visible = H.lighter.visible = true; put(H.cig, at([[0, CIG_OFF], [0.35, CIG_MOUTH], [1.25, CIG_MOUTH], [1.7, CIG_REST]], k));
        put(H.lighter, at([[0, R_OFF], [0.45, LIGHT_UP], [1.1, LIGHT_UP], [1.5, R_OFF]], k));
        if (flame) { flame.visible = k > 0.55 && k < 1.15; flame.scale.set(1, 2 + Math.sin(t * 40) * 0.4, 1); }
        if (k > 0.55 && !act.click) { act.click = true; audio.sfx('lighter'); } if (k > 0.9 && !act.dr) { act.dr = true; audio.sfx('drag', { v: 0.6 }); }
      } else if (act && act.kind === 'drag') { // up to the lips, the ember flares, down, and out comes the smoke
        H.cig.visible = true; put(H.cig, at([[0, CIG_REST], [0.4, CIG_MOUTH], [1.3, CIG_MOUTH], [1.75, CIG_REST]], k));
        if (k > 0.35 && !act.dr) { act.dr = true; audio.sfx('drag'); }
        if (k > 1.75 && !act.ex) { act.ex = true; audio.sfx('exhale'); }
        if (k > 1.75 && k < 2.45) { camera.getWorldPosition(tmp); camera.getWorldDirection(fwd); tmp.addScaledVector(fwd, 0.42); tmp.y -= 0.1; // breathe it out in a stream
          for (let i = 0; i < 2; i++) smoke.emit(tmp, fwd.clone().multiplyScalar(0.9 + Math.random() * 0.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.05 + Math.random() * 0.12, (Math.random() - 0.5) * 0.35)), 0.03 + Math.random() * 0.03, 1.4 + Math.random(), 0.17, 0.38); }
      } else if (act && act.kind === 'give') { H.cig.visible = true; put(H.cig, at([[0, smoking ? CIG_REST : CIG_OFF], [0.35, CIG_GIVE], [0.7, CIG_GIVE], [1.0, CIG_OFF]], k)); litNow = false; }
      else if (smoking) { H.cig.visible = true; put(H.cig, CIG_REST); H.cig.position.y += Math.sin(t * 1.3) * 0.004; }
      const flare = act && ((act.kind === 'drag' && k > 0.4 && k < 1.35) || (act.kind === 'light' && k > 0.9 && k < 1.25));
      if (ember) { ember.visible = litNow; emberM.color.setHex(flare ? 0xffd060 : 0xff5a1a); ember.scale.setScalar(flare ? 1.35 : 1); }
      if (litNow && H.cig.visible && !flare && Math.random() < dt * 7) { const tp = myTip(); if (tp) smoke.emit(tp, new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.2, (Math.random() - 0.5) * 0.03), 0.02, 1.6, 0.25, 0.07); }
      // the right hand: a can (OVERTIME / Budget Lite), the pouch
      if (act && (act.kind === 'energy' || act.kind === 'beer')) {
        const o = H[act.kind]; o.visible = true; put(o, at([[0, R_OFF], [0.35, CAN_HOLD], [0.6, CAN_HOLD], [0.95, CAN_SIP], [1.75, CAN_TIP], [2.05, CAN_HOLD], [2.4, R_OFF]], k));
        camera.rotation.x += Math.sin(Math.min(1, Math.max(0, (k - 0.9) / 0.9)) * Math.PI) * 0.12; // head tips back with it
        if (k > 0.45 && !act.op) { act.op = true; audio.sfx('canOpen'); } if (k > 1.0 && !act.gl) { act.gl = true; audio.sfx('gulp'); } if (k > 1.85 && !act.cr) { act.cr = true; audio.sfx(act.kind === 'energy' ? 'canCrush' : 'burp'); }
      } else if (act && act.kind === 'zyn') { H.pouch.visible = true; put(H.pouch, at([[0, POUCH_LOW], [0.45, POUCH_UP], [1.05, POUCH_LIP], [1.5, POUCH_LIP], [2.2, R_OFF]], k)); }
      // fists: up in a guard while you're wired; a jab whenever you swing
      const jk = jab ? t - jab.t0 : 9, up = wired() && !(act && (act.kind === 'energy' || act.kind === 'beer' || act.kind === 'zyn'));
      const rightBusy = H.lighter.visible || H.energy.visible || H.beer.visible || H.pouch.visible;
      for (const [f, side] of [[H.fistL, -1], [H.fistR, 1]]) {
        if (side < 0 ? H.cig.visible : rightBusy) continue;
        const G = guard(side); G[1] += Math.sin(t * 7 + side) * 0.008 + (up ? Math.sin(t * 31 + side) * 0.004 : 0); // bob, and the caffeine jitter
        const base = up ? G : fistOff(side), hit = jabAt(side);
        if (jab && jab.side === side && jk < 0.42) { f.visible = true; put(f, at([[0, base], [0.09, hit], [0.16, hit], [0.42, base]], jk)); }
        else if (up) { f.visible = true; put(f, G); }
      }
      // wired: the screen pulses with your heartbeat
      const w = wired(); wiredFx.classList.toggle('on', w); if (w) { if ((api._hb = (api._hb || 0) - dt) <= 0) { api._hb = 0.62; audio.sfx('heart', { v: 0.4 }); } }
      paintHud();
    },
  };
  return api;
}
