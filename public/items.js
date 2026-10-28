// Gas-station goods in first person (server: 'gas', 'cigLight', 'cigDrag', 'energy', 'zyn', 'bumCig', 'atm' in server.js).
//   - a lit cigarette in your left hand for 2 minutes: smoke curls off the ember; F brings it to your mouth for a drag (the ember flares,
//     then you breathe out a cloud). G lights one (the lighter comes up in your right hand).
//   - the energy drink (X): the can comes up, you chug, crush it; for 60 s your fists are up in a guard, jittery, and punches land hard.
//   - the pouch from the men's room toilet: your hand comes up from the bowl and puts it in. Steady hands (games.js dr()) for 90 s.
//   - gas-station beer: same can move as the energy drink.
//   - punches: a jab from alternating fists (world.js calls punch()).
// Other people see a cigarette in the mouth of anyone smoking (and Dusty, once you've given him one), with smoke and a drag now and then.
// The buff timers (luck / wired / steady) and what's in your pockets sit above the bottle counter.
import * as THREE from 'three';
import { audio } from './audio.js';

const SKIN = 0xd6a07c, SLEEVE = 0x2b3448;
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const box = (w, h, d, m, x, y, z, parent) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
const cyl = (r0, r1, h, m, parent, seg = 10) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); parent.add(c); return c; };
const ease = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

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
// a 12 oz can with a printed wrap
function makeCan(kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  if (kind === 'energy') { g.fillStyle = '#101418'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#39ff6a'; g.font = '900 54px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.fillText('VOLT', 64, 82); g.fillText('VOLT', 192, 82); g.strokeStyle = '#39ff6a'; g.lineWidth = 6; g.beginPath(); for (let x = 0; x <= 256; x += 16) g.lineTo(x, 104 + (x / 16 % 2 ? 8 : -8)); g.stroke(); }
  else { g.fillStyle = '#d8dde4'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#1d4fa8'; g.fillRect(0, 34, 256, 58); g.fillStyle = '#fff'; g.font = '800 30px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.fillText('BUDGET LITE', 64, 74); g.fillText('BUDGET LITE', 192, 74); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group(); const body = cyl(0.033, 0.033, 0.122, new THREE.MeshStandardMaterial({ map: t, metalness: 0.5, roughness: 0.35 }), grp, 20);
  const top = cyl(0.029, 0.033, 0.008, M(0xc8ccd2, { metalness: 0.9, roughness: 0.25 }), grp, 20); top.position.y = 0.065; body.userData.can = true; return grp;
}
// first-person hands: an open hand (fingers forward along -z) and a fist; each on a forearm in a sleeve
function makeHand(side, fist) {
  const g = new THREE.Group(), skin = M(SKIN, { roughness: 0.6 }), sl = M(SLEEVE, { roughness: 0.9 });
  if (fist) { const kn = M(0xc48c68, { roughness: 0.6 }); box(0.08, 0.06, 0.07, skin, 0, 0, 0, g); // back of the hand, four knuckles, curled fingers, the thumb across the front
    for (let i = 0; i < 4; i++) { box(0.018, 0.02, 0.022, kn, (i - 1.5) * 0.02, 0.026, -0.04, g); box(0.018, 0.034, 0.02, skin, (i - 1.5) * 0.02, 0.0, -0.05, g); }
    box(0.05, 0.018, 0.02, kn, -side * 0.012, -0.024, -0.052, g); }
  else { box(0.074, 0.026, 0.08, skin, 0, 0, 0, g); for (let i = 0; i < 4; i++) { const f = box(0.016, 0.017, 0.052, skin, (i - 1.5) * 0.019, 0.002, -0.064, g); f.rotation.x = -0.25 - i * 0.04; }
    const th = box(0.018, 0.018, 0.045, skin, -side * 0.046, -0.004, -0.018, g); th.rotation.y = side * 0.7; }
  box(0.062, 0.05, 0.05, skin, 0, -0.002, 0.058, g); box(0.078, 0.07, 0.36, sl, 0, -0.004, 0.25, g); // wrist, forearm
  g.visible = false; return g;
}
// poses: [x, y, z, rx, ry, rz] in camera space; keyframes [[t, pose], ...] eased between
const lerpPose = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
function at(keys, t) { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, a] = keys[i - 1], [t1, b] = keys[i]; return lerpPose(a, b, ease((t - t0) / (t1 - t0))); } return keys[keys.length - 1][1]; }
const put = (o, p) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(p[3], p[4], p[5]); };

const CIG_REST = [-0.24, -0.26, -0.5, 0.35, 0.35, 0.25], CIG_MOUTH = [-0.07, -0.135, -0.22, 0.9, 0.25, 0.95], CIG_OFF = [-0.32, -0.62, -0.42, 0.35, 0.35, 0.25];
const R_OFF = [0.3, -0.62, -0.42, 0, 0, 0];

export function createItems({ scene, camera, BK, me, games, getAvatars, bumView }) {
  const smoke = createSmoke(scene);
  // ---- first person rig
  const lh = makeHand(-1, false), rh = makeHand(1, false), lf = makeHand(-1, true), rf = makeHand(1, true); for (const h of [lh, rh, lf, rf]) camera.add(h);
  const myCig = makeCig(); myCig.g.position.set(0.012, 0.016, -0.075); myCig.g.rotation.set(0, 1.25, 0); myCig.g.scale.setScalar(1.15); lh.add(myCig.g); // between the first two fingers, pointing out to the side
  const lighter = new THREE.Group(); box(0.026, 0.06, 0.014, M(0xc81e3a, { roughness: 0.35 }), 0, 0.035, 0, lighter); box(0.024, 0.012, 0.012, M(0xbfc4c8, { metalness: 0.9, roughness: 0.3 }), 0, 0.071, 0, lighter);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb040, toneMapped: false, transparent: true, opacity: 0.9 })); flame.scale.set(1, 2.2, 1); flame.position.y = 0.092; lighter.add(flame);
  lighter.position.set(0, 0.02, -0.05); lighter.visible = false; rh.add(lighter);
  const cans = { energy: makeCan('energy'), beer: makeCan('beer') }; for (const c of Object.values(cans)) { c.position.set(0, 0.03, -0.035); c.rotation.x = 0; c.visible = false; rh.add(c); }
  const pouch = box(0.03, 0.007, 0.02, M(0xe8ead8, { roughness: 0.4, metalness: 0.05 }), 0.0, 0.012, -0.075, rh); pouch.visible = false;

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
      for (const h of [lh, rh, lf, rf]) h.visible = false; lighter.visible = false; pouch.visible = false; cans.energy.visible = cans.beer.visible = false;
      if (hidden) { act = null; return paintHud(); }
      const smoking = lit();
      if (act && t - act.t0 > act.dur) act = null;
      const k = act ? t - act.t0 : 0;
      // the cigarette hand (left)
      myCig.lit = smoking || (act && act.kind === 'light' && k > 1.0);
      if (act && act.kind === 'light') { // cigarette up to your mouth, lighter flicks, a first puff
        lh.visible = rh.visible = true; put(lh, at([[0, CIG_OFF], [0.35, CIG_MOUTH], [1.25, CIG_MOUTH], [1.7, CIG_REST]], k));
        put(rh, at([[0, R_OFF], [0.45, [0.06, -0.2, -0.27, 0.15, -0.5, 0]], [1.1, [0.06, -0.2, -0.27, 0.15, -0.5, 0]], [1.5, R_OFF]], k)); lighter.visible = k > 0.3 && k < 1.4;
        flame.visible = k > 0.55 && k < 1.15; flame.scale.set(1, 2 + Math.sin(t * 40) * 0.4, 1);
        if (k > 0.55 && !act.click) { act.click = true; audio.sfx('lighter'); } if (k > 0.9 && !act.dr) { act.dr = true; audio.sfx('drag', { v: 0.6 }); }
      } else if (act && act.kind === 'drag') { // up to the lips, the ember flares, down, and out comes the smoke
        lh.visible = true; put(lh, at([[0, CIG_REST], [0.4, CIG_MOUTH], [1.3, CIG_MOUTH], [1.75, CIG_REST]], k));
        if (k > 0.35 && !act.dr) { act.dr = true; audio.sfx('drag'); }
        if (k > 1.75 && !act.ex) { act.ex = true; audio.sfx('exhale'); }
        if (k > 1.75 && k < 2.45) { camera.getWorldPosition(tmp); camera.getWorldDirection(fwd); tmp.addScaledVector(fwd, 0.42); tmp.y -= 0.1; // breathe it out in a stream
          for (let i = 0; i < 2; i++) smoke.emit(tmp, fwd.clone().multiplyScalar(0.9 + Math.random() * 0.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.05 + Math.random() * 0.12, (Math.random() - 0.5) * 0.35)), 0.03 + Math.random() * 0.03, 1.4 + Math.random(), 0.17, 0.38); }
      } else if (act && act.kind === 'give') { lh.visible = true; put(lh, at([[0, CIG_REST], [0.35, [-0.08, -0.2, -0.62, 0.1, 0.6, 0.2]], [0.7, [-0.08, -0.2, -0.62, 0.1, 0.6, 0.2]], [1.0, CIG_OFF]], k)); myCig.lit = false; myCig.g.visible = k < 0.75; }
      else if (smoking) { lh.visible = true; put(lh, CIG_REST); lh.position.y += Math.sin(t * 1.3) * 0.004; }
      if (!(act && act.kind === 'give')) myCig.g.visible = true;
      const flare = act && ((act.kind === 'drag' && k > 0.4 && k < 1.35) || (act.kind === 'light' && k > 0.9 && k < 1.25)); myCig.emberM.color.setHex(flare ? 0xffd060 : 0xff5a1a); myCig.ember.scale.setScalar(flare ? 1.25 : 1);
      if (myCig.lit && lh.visible && !flare && Math.random() < dt * 7) { myCig.tip.getWorldPosition(tmp); smoke.emit(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.2, (Math.random() - 0.5) * 0.03), 0.02, 1.6, 0.25, 0.07); }
      // the right hand: a can (energy drink / beer), the pouch
      if (act && (act.kind === 'energy' || act.kind === 'beer')) {
        rh.visible = true; const can = cans[act.kind]; can.visible = k < 2.0;
        put(rh, at([[0, R_OFF], [0.35, [0.2, -0.25, -0.42, 0, -0.3, 0]], [0.6, [0.2, -0.25, -0.42, 0, -0.3, 0]], [0.95, [0.06, -0.16, -0.36, 0.85, -0.2, 0.15]], [1.75, [0.05, -0.13, -0.34, 1.25, -0.2, 0.15]], [2.05, [0.24, -0.3, -0.45, 0.2, -0.3, 0]], [2.4, R_OFF]], k));
        can.scale.set(1, k > 1.85 ? 0.55 : 1, 1); camera.rotation.x += Math.sin(Math.min(1, Math.max(0, (k - 0.9) / 0.9)) * Math.PI) * 0.12;
        if (k > 0.45 && !act.op) { act.op = true; audio.sfx('canOpen'); } if (k > 1.0 && !act.gl) { act.gl = true; audio.sfx('gulp'); } if (k > 1.85 && !act.cr) { act.cr = true; audio.sfx(act.kind === 'energy' ? 'canCrush' : 'burp'); }
      } else if (act && act.kind === 'zyn') {
        rh.visible = true; pouch.visible = k < 1.5; put(rh, at([[0, [0.12, -0.55, -0.38, -0.9, 0, 0]], [0.45, [0.12, -0.36, -0.36, -0.5, 0, 0]], [1.05, [0.05, -0.2, -0.34, 0.45, -0.3, 0.3]], [1.5, [0.05, -0.2, -0.34, 0.45, -0.3, 0.3]], [2.2, R_OFF]], k));
      }
      // fists: up in a guard while you're wired; a jab whenever you swing
      const jk = jab ? t - jab.t0 : 9, guard = wired() && !(act && (act.kind === 'energy' || act.kind === 'beer' || act.kind === 'zyn'));
      for (const [f, side] of [[lf, -1], [rf, 1]]) {
        const busy = side < 0 ? lh.visible : rh.visible; if (busy) continue;
        const shake = guard ? Math.sin(t * 31 + side) * 0.004 : 0;
        const G = [side * 0.17, -0.18 + Math.sin(t * 7 + side) * 0.008 + shake, -0.4, 0.35, side * -0.2, side * -0.25], low = [side * 0.26, -0.55, -0.4, 0.2, 0, 0];
        const base = guard ? G : low, hit = [side * 0.04, -0.09, -0.72, 0.1, side * -0.05, side * -1.4];
        if (jab && jab.side === side && jk < 0.42) { f.visible = true; put(f, at([[0, base], [0.09, hit], [0.16, hit], [0.42, base]], jk)); }
        else if (guard) { f.visible = true; put(f, G); }
      }
      // wired: the screen pulses with your heartbeat
      const w = wired(); wiredFx.classList.toggle('on', w); if (w) { if ((api._hb = (api._hb || 0) - dt) <= 0) { api._hb = 0.62; audio.sfx('heart', { v: 0.4 }); } }
      paintHud();
    },
  };
  return api;
}
