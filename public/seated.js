import * as THREE from 'three';

// Seated NPC life: a layered procedural pose for anyone sitting in a booth, on a stool or the couch.
// Base posture (forearms on the table / hands on the lap) + breathing + idle sway + a gaze that drifts between
// the TVs, neighbours and the player + one-off actions (sip, talk, laugh, phone, stretch, point, cheer, groan).
// Writes channel values into P.sp; people.js animate(P, 'seated') applies them (arm/torso/head values use the
// pre-flip convention of the other gestures: arm forward = negative x, head/torso forward = positive x).
const TVS = [[0, 2.95, -7.9], [-4.8, 2.95, -7.9], [4.8, 2.95, -7.9], [11.8, 3.5, 1.2], [-11.8, 3.5, 0.2]];
const smooth = (x) => x * x * (3 - 2 * x);
// envelope: 0 -> 1 over `a` s, hold, 1 -> 0 over the last `b` s
const env = (t, d, a, b) => (t < 0 || t > d ? 0 : t < a ? smooth(t / a) : t > d - b ? smooth((d - t) / b) : 1);
const lerp = (a, b, k) => a + (b - a) * k;
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// per behaviour style: action weights
const STYLE = {
  drink: { sip: 5, talk: 1, laugh: 1.2, phone: 0.8, stretch: 0.4, lean: 1 },
  idle: { sip: 1.5, talk: 1, laugh: 1, phone: 2, stretch: 0.6, lean: 1.2 },
  cheer: { sip: 2, pump: 2.5, laugh: 1, stretch: 0.3, lean: 0.5 },
  point: { sip: 1.5, point: 3, talk: 1, phone: 0.5, lean: 0.6 },
  boss: { sip: 2, lean: 2, drum: 2 },
  sleep: { jolt: 1 },
  player: {}, // real players: only what they actually do (talk on voice, drink, where they look)
  couch: { sip: 3, laugh: 1, phone: 1.5, chill: 2.5, stretch: 0.6 },
};
const DUR = { sip: 2.8, talk: 3.6, laugh: 1.8, phone: 6, stretch: 2.6, lean: 7, pump: 1.6, point: 2.4, drum: 4, jolt: 2.6, chill: 8, cheer: 1.8, groan: 2.2 };

function makeGlass(kind) {
  const g = new THREE.Group();
  if (kind === 'bottle') {
    const glass = new THREE.MeshStandardMaterial({ color: 0x4a2a0c, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.13, 10), glass); b.position.y = 0.04; g.add(b);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.024, 0.07, 10), glass); n.position.y = 0.14; g.add(n);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.05, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8d8a8, roughness: 0.7 })); l.position.y = 0.04; g.add(l);
  } else if (kind === 'tumbler') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.08, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xddeeff, roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); c.position.y = 0.02; g.add(c);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.03, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xb8661a, roughness: 0.1, transparent: true, opacity: 0.85 })); w.position.y = 0.0; g.add(w);
  } else { // pint
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.15, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.3, side: THREE.DoubleSide })); c.position.y = 0.035; g.add(c);
    const beer = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.032, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xe0a020, roughness: 0.2, transparent: true, opacity: 0.88, emissive: 0x3a2000 })); beer.position.y = 0.02; g.add(beer);
    const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.039, 0.025, 12), new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.9 })); foam.position.y = 0.093; g.add(foam);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makePhone() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.01, 0.17), new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.4 })));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.15), new THREE.MeshBasicMaterial({ color: 0x9ad4ff, toneMapped: false })); s.rotation.x = -Math.PI / 2; s.position.y = 0.0055; g.add(s);
  return g;
}

// planar 2-bone IK in the sagittal plane: shoulder at the origin, target D metres forward and dy up.
// returns the upper-arm forward raise (pre-flip convention, negative = forward) and the elbow bend
function ik(G, D, dy) {
  const { lu, lf } = G, c = Math.max(0.05, Math.min((lu + lf) * 0.985, Math.hypot(D, dy)));
  const tA = Math.atan2(D, -dy), al = Math.acos(Math.max(-1, Math.min(1, (lu * lu + c * c - lf * lf) / (2 * lu * c))));
  const be = Math.acos(Math.max(-1, Math.min(1, (lu * lu + lf * lf - c * c) / (2 * lu * lf))));
  return { x: -(tA - al), f: Math.PI - be };
}
// same, for a target `lat` metres in toward the body's midline: swing the arm inward (y) and reach the full distance
function ik3(G, D, dy, lat) { const r = ik(G, Math.hypot(D, lat), dy); r.y = Math.atan2(Math.max(0, lat), D); return r; }
// face of a skinned character, measured from the vertices skinned to its Head bone (cached per model):
// fwd = how far the face sticks out in front of the Head bone, up = mouth height above it
const FACE = new Map();
function measureFace(P) {
  let mesh = null; P.group.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) return { fwd: 0.12, up: 0.02 };
  const key = mesh.geometry.uuid; if (FACE.has(key)) return FACE.get(key);
  const hi = mesh.skeleton.bones.findIndex((b) => b.name === 'Head'), pos = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  P.group.updateMatrixWorld(true);
  const inv = P.group.matrixWorld.clone().invert(), M = inv.multiply(mesh.matrixWorld), hb = P.bones.Head.getWorldPosition(new THREE.Vector3()).applyMatrix4(P.group.matrixWorld.clone().invert());
  const v = new THREE.Vector3(), pts = [];
  for (let i = 0; i < pos.count; i++) { let w = 0; for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === hi) w += sw.getComponent(i, c); if (w < 0.6) continue; mesh.getVertexPosition(i, v).applyMatrix4(M); pts.push([-(v.z - hb.z), v.y - hb.y]); }
  if (!pts.length) return { fwd: 0.12, up: 0.02 };
  // lower half of the head only (ignores cap brims and hair), robust percentiles (ignores noses and cigars)
  const ys = pts.map((p) => p[1]).sort((a, b) => a - b), mid = ys[Math.floor(ys.length * 0.5)], lo = pts.filter((p) => p[1] < mid);
  const fs = lo.map((p) => p[0]).sort((a, b) => a - b), fwd = fs[Math.floor(fs.length * 0.9)] ?? 0.12;
  const fy = lo.filter((p) => p[0] > fwd - 0.04).map((p) => p[1]).sort((a, b) => a - b);
  const r = { fwd: Math.max(0.06, Math.min(0.25, fwd)), up: Math.max(-0.1, Math.min(0.15, fy[Math.floor(fy.length * 0.25)] ?? 0.02)) }; FACE.set(key, r); return r;
}
export function createSeatedLife({ scene }) {
  const list = [];
  const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

  // n: bar.js npc record (n.P, n.mode, n.bubble). opts: { kind: 'table'|'lap', style, glass: 'pint'|'bottle'|'tumbler'|null }
  function fit(P, opts) {
    const kind = opts.kind || 'table', by = opts.baseY ?? (P.baseY || 0);
    // measure this character: shoulder height when seated, arm bone lengths, mouth height (cartoon proportions vary a lot)
    const Bn = P.bones, wp = (b) => Bn[b].getWorldPosition(new THREE.Vector3());
    const lu = Bn ? wp('RightArm').distanceTo(wp('RightForeArm')) : 0.27, lf = Bn ? wp('RightForeArm').distanceTo(wp('RightHand')) : 0.25;
    const face = Bn ? measureFace(P) : { fwd: 0.12, up: 0.02 }, sh = by + P.arms[1].position.y, mouth = by + P.head.position.y - 0.08 + face.up;
    const G = { lu, lf, sh, face, mdy: mouth - sh, tdy: (opts.table ?? 0.78) + 0.05 - sh, seat: opts.seat ?? 0.5 };
    const sx = Math.abs(P.arms[1].position.x); G.sx = sx;
    const rest = kind === 'lap' ? ik3(G, 0.3, G.seat + 0.14 - sh, sx - 0.14) : ik3(G, opts.reach ?? 0.4, G.tdy, sx - 0.1);
    const base = { ax: rest.x, af: rest.f, ay: rest.y, az: 0, tx: kind === 'lap' ? 0.02 : 0.06 };
    const pose = {
      sip: ik3(G, face.fwd + 0.06, G.mdy - 0.15, sx - 0.05), phone: ik3(G, 0.34, Math.min(-0.02, G.tdy + 0.13), sx - 0.06), talk: ik3(G, 0.34, Math.max(G.tdy + 0.12, -0.12), sx - 0.12),
      lean: ik3(G, 0.3, G.tdy + 0.02, sx - 0.02), sleep: ik3(G, 0.46, G.tdy + 0.03, sx - 0.05), head: ik3(G, face.fwd + 0.02, G.mdy + 0.02, sx - 0.08),
    };
    return { base, pose, G, lf };
  }
  function add(n, opts = {}) {
    const P = n.P, style = opts.style || n.mode, { base, pose, G, lf } = fit(P, opts);
    const L = {
      n, P, base, pose, G, drive: opts.drive || null, style: STYLE[style] ? style : 'idle', act: null, actT: 0, next: 1 + Math.random() * 5,
      gaze: { y: 0, p: 0, ty: 0, tp: 0, next: 0, target: null }, ph: Math.random() * 20, bounce: !opts.drive && Math.random() < 0.35 ? 0.6 + Math.random() * 0.6 : 0,
      glass: null, phone: null, spread: (Math.random() - 0.5) * 0.12, cur: null,
    };
    L.glassOnSip = !!opts.glassOnSip; if (opts.glass && P.bones) { L.glass = makeGlass(opts.glass); L.glass.scale.setScalar(Math.max(0.8, Math.min(1.6, lf / 0.24))); scene.add(L.glass); }
    if (P.bones) { L.phone = makePhone(); L.phone.visible = false; scene.add(L.phone); }
    P.sp = {}; list.push(L); n.life = L; return L;
  }
  // a player avatar sat somewhere else: re-solve the arm poses for that seat
  function refit(L, opts) { Object.assign(L, fit(L.P, opts)); }
  function remove(L) { for (const o of [L.glass, L.phone]) if (o) scene.remove(o); const i = list.indexOf(L); if (i >= 0) list.splice(i, 1); }
  const pick = (w) => { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; };
  const start = (L, act) => { L.act = act; L.actT = 0; L.dur = DUR[act] * (0.85 + Math.random() * 0.3); };

  // TV scored: most seated NPCs react (cheer or groan), staggered a little
  function onScore() { for (const L of list) { if (L.drive || L.style === 'sleep' || L.style === 'boss' || Math.random() < 0.25) continue; const a = Math.random() < 0.62 ? 'cheer' : 'groan'; L.react = { act: a, at: 0.15 + Math.random() * 0.7 }; } }

  // where to look: local yaw/pitch to a world point, in the npc's own frame (forward = -z)
  const aim = (L, x, y, z) => {
    const g = L.P.group, dx = x - g.position.x, dz = z - g.position.z, ry = g.rotation.y;
    const lx = dx * Math.cos(ry) - dz * Math.sin(ry), lz = dx * Math.sin(ry) + dz * Math.cos(ry);
    const eye = (g.position.y || 0) + (L.P.hipY || 0.98) + 0.62, d = Math.hypot(lx, lz) || 1;
    return { y: Math.atan2(-lx, -lz), p: -Math.atan2(y - eye, d) }; // p in pre-flip convention (positive = look down)
  };
  function chooseGaze(L, env) {
    const G = L.gaze, r = Math.random(), g = L.P.group, me = env.me;
    const dMe = me ? Math.hypot(me.x - g.position.x, me.z - g.position.z) : 99;
    let tgt = null;
    if (me && dMe < (L.style === 'boss' ? 5 : 3.2) && r < (L.style === 'boss' ? 0.75 : 0.4)) tgt = { me: true };
    else if (r < 0.75) { // a TV the npc can comfortably see
      const opts = TVS.map((v) => ({ v, a: aim(L, v[0], v[1], v[2]) })).filter((o) => Math.abs(o.a.y) < 1.5).sort((a, b) => Math.abs(a.a.y) - Math.abs(b.a.y));
      if (opts.length) tgt = { pt: opts[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * opts.length)].v };
    } else if (r < 0.9 && env.npcs) { // a neighbour
      const nb = env.npcs.filter((o) => o !== L.n && Math.hypot(o.P.group.position.x - g.position.x, o.P.group.position.z - g.position.z) < 2.2);
      if (nb.length) { const o = nb[Math.floor(Math.random() * nb.length)]; tgt = { npc: o }; }
    }
    if (!tgt) tgt = { local: { y: (Math.random() - 0.5) * 0.8, p: 0.15 + Math.random() * 0.35 } }; // down at the table / drink
    G.target = tgt; G.next = 2 + Math.random() * 5;
  }
  function gazeAngles(L, env) {
    const T = L.gaze.target; if (!T) return { y: 0, p: 0.1 };
    if (T.local) return T.local;
    if (T.me) return env.cam ? aim(L, env.cam.x, env.cam.y, env.cam.z) : { y: 0, p: 0 };
    if (T.pt) return aim(L, T.pt[0], T.pt[1], T.pt[2]);
    if (T.npc) { const p = T.npc.P.group.position; return aim(L, p.x, (p.y || 0) + (T.npc.P.hipY || 0.98) + 0.62, p.z); }
    return { y: 0, p: 0 };
  }

  function tick(L, t, dt, env) {
    const { P, n, base: B, pose: Q } = L, sp = P.sp, ph = t + L.ph;
    // ---- schedule actions
    const dv = L.drive ? L.drive() : null;
    const talking = dv ? dv.talking : n.bubble && n.bubble.sprite.visible;
    if (dv && dv.sip && L.act !== 'sip') start(L, 'sip');
    if (L.react) { L.react.at -= dt; if (L.react.at <= 0) { start(L, L.react.act); L.react = null; } }
    if (L.act) { L.actT += dt; if (L.actT >= L.dur) { L.act = null; L.next = 2.5 + Math.random() * 6; } }
    else if (talking && L.style !== 'sleep' && L.style !== 'boss') start(L, 'talk');
    else if ((L.next -= dt) <= 0) { const w = STYLE[L.style]; if (Object.keys(w).length) start(L, pick(w)); else L.next = 1e9; }
    // ---- gaze
    const G = L.gaze; if (!dv && (G.next -= dt) <= 0) chooseGaze(L, env);
    let ga = dv ? { y: dv.y, p: dv.p } : gazeAngles(L, env);
    const a = L.act, k = a ? env_(L) : 0;
    if (a === 'phone') ga = { y: 0.12, p: 0.75 };
    if (a === 'sip') ga = { y: ga.y * (1 - k), p: lerp(ga.p, -0.3, k) };
    if (a === 'groan') ga = { y: 0, p: lerp(ga.p, 0.55, k) };
    if (a === 'cheer' || a === 'pump') ga = { y: ga.y, p: lerp(ga.p, -0.25, k) };
    const gy = Math.max(-1.25, Math.min(1.25, ang(ga.y))), gp = Math.max(-0.6, Math.min(0.8, ga.p));
    const gk = Math.min(1, dt * (dv ? 9 : 3.2)); G.y += (gy - G.y) * gk; G.p += (gp - G.p) * gk;

    // ---- base pose + breathing + sway
    const br = Math.sin(ph * 1.45), sway = Math.sin(ph * 0.31) * 0.025;
    let aLx = B.ax, aLf = B.af, aLy = B.ay, aLz = B.az, aRx = B.ax, aRf = B.af, aRy = B.ay, aRz = B.az;
    let tx = B.tx + br * 0.014, ty = G.y * 0.28, tz = sway, hx = G.p - br * 0.008, hy = G.y * 0.72, hz = -sway * 0.6;
    let lLx = 1.45, lRx = 1.45; const lLz = -0.06 - L.spread, lRz = 0.06 + L.spread;
    if (L.bounce) lRx += Math.max(0, Math.sin(ph * 11)) * 0.06 * L.bounce * (Math.sin(ph * 0.21) > 0.2 ? 1 : 0); // nervous knee
    if (L.style === 'sleep') { // slumped over the table
      const deep = Math.sin(ph * 0.9); tx = 0.42 + deep * 0.02; ty = 0; hx = 0.85 + deep * 0.03; hy = 0.25; hz = 0.15;
      aLx = aRx = Q.sleep.x; aLf = aRf = Q.sleep.f; aLy = aRy = Q.sleep.y;
      if (a === 'jolt') { const j = k; tx = lerp(tx, 0.05, j); hx = lerp(hx, -0.05, j); hy = lerp(hy, Math.sin(L.actT * 2.2) * 0.8, j); hz = lerp(hz, 0, j); }
    }
    // ---- actions (blend weight k)
    const R = (x, f, y, z) => { aRx = lerp(aRx, x, k); aRf = lerp(aRf, f, k); aRy = lerp(aRy, y, k); aRz = lerp(aRz, z, k); };
    const Lf = (x, f, y, z) => { aLx = lerp(aLx, x, k); aLf = lerp(aLf, f, k); aLy = lerp(aLy, y, k); aLz = lerp(aLz, z, k); };
    let tip = 0;
    if (a === 'sip') { R(Q.sip.x, Q.sip.f, Q.sip.y, 0); tip = k; tx = lerp(tx, -0.04, k); }
    else if (a === 'talk') { const w1 = Math.sin(ph * 3.3), w2 = Math.sin(ph * 2.6 + 1.3); R(Q.talk.x + w1 * 0.2, Q.talk.f + w2 * 0.3, Q.talk.y + w2 * 0.15, 0); Lf(Q.talk.x + 0.15 + w2 * 0.15, Q.talk.f - 0.2 + w1 * 0.25, Q.talk.y, 0); hx += Math.sin(ph * 4.2) * 0.05 * k; tx = lerp(tx, 0.16, k); }
    else if (a === 'laugh') { const s = Math.sin(L.actT * 19) * 0.035; tx = lerp(tx, -0.12 + s, k); hx = lerp(hx, -0.3 + s, k); Lf(-0.35, 1.5, 0.75, 0); }
    else if (a === 'phone') { Lf(Q.phone.x, Q.phone.f, Q.phone.y, 0); tx = lerp(tx, 0.12, k); }
    else if (a === 'stretch') { const u = Math.sin(Math.min(1, L.actT / L.dur) * Math.PI); R(-2.85, 0.35, 0.15, 0); Lf(-2.85, 0.35, 0.15, 0); tx = lerp(tx, -0.18 * u, k); hx = lerp(hx, -0.25, k); }
    else if (a === 'lean') { tx = lerp(tx, 0.28, k); R(Q.lean.x, Q.lean.f, Q.lean.y, 0); Lf(Q.lean.x, Q.lean.f, Q.lean.y, 0); }
    else if (a === 'chill') { tx = lerp(tx, -0.2, k); R(-2.55, 2.55, 0.05, 0); Lf(-2.55, 2.55, 0.05, 0); hx = lerp(hx, hx - 0.15, k); } // hands behind the head
    else if (a === 'point') { const tv = aim(L, 0, 2.95, -7.9); R(-1.55, 0.12, -ang(tv.y) * 0.8, 0); hy = lerp(hy, ang(tv.y) * 0.7, k); }
    else if (a === 'drum') { R(B.ax, B.af + Math.max(0, Math.sin(ph * 14)) * 0.12, B.ay, 0); }
    else if (a === 'pump' || a === 'cheer') { const pump = Math.sin(L.actT * 10) * 0.25; R(-2.65 + pump, 0.45, 0.1, 0); if (a === 'cheer' || Math.sin(ph) > 0) Lf(-2.65 - pump, 0.45, 0.1, 0); tx = lerp(tx, -0.1, k); }
    else if (a === 'groan') { R(Q.head.x, Q.head.f, Q.head.y, 0); Lf(Q.head.x, Q.head.f, Q.head.y, 0); tx = lerp(tx, 0.3, k); }
    Object.assign(sp, { aLx, aLf, aLy: -aLy, aLz: aLz, aRx, aRf, aRy, aRz: aRz, tx, ty, tz, hx, hy, hz, lLx, lRx, lLz, lRz });
    L.tip = tip;
  }
  function env_(L) { const d = L.dur, t = L.actT; const a = L.act; const ins = a === 'sip' ? 0.7 : a === 'cheer' || a === 'pump' ? 0.25 : a === 'jolt' ? 0.2 : 0.5; return env(t, d, ins, a === 'jolt' ? 0.9 : 0.6); }

  // after the skeleton is posed: put the drink in the right hand, the phone in the left
  function place(L) {
    const B = L.P.bones; if (!B) return;
    const g = L.P.group, ry = g.rotation.y;
    if (L.glass) {
      B.RightHand.getWorldPosition(_v); B.RightForeArm.getWorldPosition(_a); _a.subVectors(_v, _a).normalize();
      const sc = L.glass.scale.x; L.glass.position.copy(_v).addScaledVector(_a, 0.06 * sc); L.glass.position.x -= Math.sin(ry) * 0.045 * sc; L.glass.position.z -= Math.cos(ry) * 0.045 * sc; // in the palm
      _e.set(L.tip * 1.25, ry, 0, 'YXZ'); L.glass.quaternion.setFromEuler(_e); L.glass.visible = g.visible && (!L.glassOnSip || L.act === 'sip');
    }
    if (L.phone) {
      const on = L.act === 'phone' && L.actT > 0.3 && L.actT < L.dur - 0.3; L.phone.visible = on && g.visible;
      if (on) { B.LeftHand.getWorldPosition(_v); B.LeftForeArm.getWorldPosition(_a); _a.subVectors(_v, _a).normalize(); L.phone.position.copy(_v).addScaledVector(_a, 0.05); L.phone.position.x -= Math.sin(ry) * 0.03; L.phone.position.z -= Math.cos(ry) * 0.03; _e.set(0.9, ry, 0, 'YXZ'); L.phone.quaternion.setFromEuler(_e); }
    }
  }
  return { add, refit, remove, tick, place, onScore, list };
}
