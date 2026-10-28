import * as THREE from 'three';
import { canvasTex, neon } from './textures.js';
import { audio } from './audio.js';
import { place } from './props.js';

// Golden Tee-Off: the bar's trackball golf cabinet (a parody of the classic). Three holes drawn live on the cabinet's screen:
// a behind-the-ball 3D view (ground shapes projected with a simple pinhole camera) plus a top-down minimap. The mouse is the
// trackball: hold the button, pull back (the backswing), then roll forward fast. Forward speed is power; sideways drift on the
// way through is hook / slice. A/D aim, W/S club. Scored Stableford-style (higher is better) so it plugs into the challenge
// board like darts / bowling / cornhole: {type:'mg', game:'golf', pts}.
const W = 640, H = 480, HORIZON = 176, FOC = 330, CAM_BACK = 13, CAM_H = 4.5, CUP = 0.15;
const CLUBS = [['Driver', 255, 0.09], ['3 Wood', 225, 0.1], ['5 Iron', 185, 0.13], ['7 Iron', 160, 0.15], ['9 Iron', 135, 0.18], ['Wedge', 105, 0.22], ['Sand Wedge', 75, 0.26]];
const FULL_SPEED = 2400; // trackball px/s for a 100% swing
const STABLE = (d, hio) => (hio ? 8 : d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 3 : d === 1 ? 1 : 0);

// ---- the course (yards; +y down the hole, +x right). Fairway = centreline [x, y, width]
function course() {
  const H1 = { name: 'The Dugout Dogleg', par: 4, tee: [0, 0], pin: [78, 393], green: [75, 390, 14],
    fairway: [[0, 0, 26], [0, 120, 32], [2, 220, 34], [36, 300, 30], [66, 372, 26]], bunkers: [[30, 246, 10, 7], [96, 376, 8, 6], [56, 404, 9, 5]], water: [], slope: [0.6, -0.2] };
  const H2 = { name: 'Over the Pond', par: 3, tee: [0, 0], pin: [5, 168], green: [0, 166, 13],
    fairway: [[0, 0, 18], [0, 30, 20], [0, 138, 26], [0, 182, 26]], bunkers: [[-18, 160, 8, 5], [17, 178, 8, 5]], water: [[0, 92, 46, 30]], slope: [-0.5, 0.3] };
  const H3 = { name: 'Last Call', par: 4, tee: [0, 0], pin: [-27, 424], green: [-30, 421, 15],
    fairway: [[0, 0, 26], [0, 140, 34], [-6, 260, 32], [-22, 360, 28], [-30, 410, 26]], bunkers: [[-48, 300, 9, 6], [-8, 415, 7, 5]], water: [[42, 245, 20, 75]], slope: [0.3, 0.5] };
  let seed = 7; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const h of [H1, H2, H3]) { // tree lines along both sides of the fairway, and a few strays
    h.trees = [];
    for (let i = 0; i < h.fairway.length - 1; i++) {
      const [x0, y0, w0] = h.fairway[i], [x1, y1, w1] = h.fairway[i + 1], L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      for (let d = 0; d < L; d += 17) { const k = d / L, cx = x0 + (x1 - x0) * k, cy = y0 + (y1 - y0) * k, w = w0 + (w1 - w0) * k;
        for (const s of [-1, 1]) { if (h === H2 && cy > 50 && cy < 135) continue; const off = w / 2 + 16 + R() * 18; h.trees.push([cx + nx * off * s, cy + ny * off * s, 5 + R() * 3, 9 + R() * 6]); } }
    }
    const [gx, gy] = h.green; for (let k = 0; k < 6; k++) { const a = Math.PI * (0.15 + k * 0.14); h.trees.push([gx + Math.cos(a) * 46 * (k % 2 ? 1 : -1), gy + 30 + Math.sin(a) * 20, 6, 12]); }
  }
  return [H1, H2, H3];
}

export function createGolf({ scene, camera, BK, me, stations, obstacles, hud, keys, submit, verdict, tgt }) {
  const HOLES = course(), PAR = HOLES.reduce((a, h) => a + h.par, 0);
  // ---------- the cabinet: boxes first, swapped for the Meshy model below when it loads (the live screen plane stays on top) ----------
  const CX = -5.5, CZ = -7.5, cab = new THREE.Group(); cab.position.set(CX, 0, CZ); scene.add(cab);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const bx = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = o.receiveShadow = true; cab.add(o); return o; };
  const side = canvasTex(256, 512, (g, w, h) => { g.fillStyle = '#145a32'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e8b923'; g.lineWidth = 14; g.beginPath(); g.arc(40, 120, 150, -0.9, 0.5); g.stroke();
    g.fillStyle = '#eee'; g.beginPath(); g.arc(80, 150, 34, 0, 7); g.fill(); const sky = g.createLinearGradient(0, 260, 0, 420); sky.addColorStop(0, '#6ab0e8'); sky.addColorStop(1, '#bfe3ff'); g.fillStyle = sky; g.beginPath(); g.ellipse(120, 400, 120, 150, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#4caf50'; g.fillRect(0, 400, w, 112); g.fillStyle = '#e8d28a'; g.beginPath(); g.ellipse(150, 450, 60, 18, 0, 0, 7); g.fill(); g.fillStyle = '#c00'; g.fillRect(118, 330, 26, 16); g.fillStyle = '#fff'; g.fillRect(116, 330, 3, 80);
    g.fillStyle = '#e8b923'; g.fillRect(0, 480, w, 10); }).t;
  const sideM = M(0xffffff, { map: side }), dark = M(0x1c1c1e), green = M(0x145a32);
  bx(0.06, 1.9, 0.8, sideM, -0.37, 0.95, 0); bx(0.06, 1.9, 0.8, sideM, 0.37, 0.95, 0); // side panels with the course art
  bx(0.68, 0.95, 0.66, dark, 0, 0.475, -0.04); bx(0.68, 0.06, 0.1, M(0x2a2a2c), 0, 0.03, 0.33); // base + kick plate
  bx(0.26, 0.3, 0.02, M(0x26262a), 0, 0.5, 0.3); bx(0.05, 0.05, 0.01, M(0xd02020, { emissive: 0x801010 }), -0.05, 0.56, 0.315); bx(0.05, 0.05, 0.01, M(0xd02020, { emissive: 0x801010 }), 0.05, 0.56, 0.315); // coin door
  bx(0.7, 0.08, 0.36, green, 0, 1.0, 0.24, 0.18); // control deck
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), M(0xf4f0e6, { roughness: 0.25 })); ball.position.set(0, 1.05, 0.25); cab.add(ball);
  for (const [x, c] of [[-0.24, 0xd02020], [-0.17, 0xe8c020], [0.17, 0xf0f0f0], [0.24, 0x2050d0]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 14), M(c, { emissive: c, emissiveIntensity: 0.25 })); b.position.set(x, 1.05, 0.24); b.rotation.x = 0.18; cab.add(b); }
  bx(0.68, 0.7, 0.5, dark, 0, 1.4, -0.1); // screen housing
  const scr = canvasTex(W, H, () => {}), screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshBasicMaterial({ map: scr.t, toneMapped: false }));
  screen.position.set(0, 1.43, 0.215); screen.rotation.x = -0.2; /* tilted back, standing proud of the housing so its top edge isn't buried */ cab.add(screen);
  bx(0.68, 0.24, 0.4, dark, 0, 1.87, -0.12); // marquee box
  const mq = neon('GOLDEN TEE-OFF', '#ffcf3a', { w: 640, h: 128, size: 76 }).t; const mqm = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.17), new THREE.MeshBasicMaterial({ map: mq, transparent: true, toneMapped: false })); mqm.position.set(0, 1.88, 0.085); cab.add(mqm);
  // the Meshy cabinet (models/props/golf_cabinet.glb, blender/meshy_world.json): once it arrives the boxes hide and the live screen moves onto its painted CRT
  const placeholder = cab.children.filter((o) => o !== screen);
  place(cab, 'golf_cabinet', { h: 1.9 }, 0, 0, 0, () => { for (const o of placeholder) o.visible = false;
    screen.rotation.x = -0.33; screen.scale.set(0.46 / 0.56, 0.345 / 0.42, 1); screen.position.set(-0.033, 1.28, 0.035).addScaledVector(new THREE.Vector3(0, Math.sin(0.33), Math.cos(0.33)), 0.012); });
  obstacles.push({ x: CX, z: CZ, r: 0.55 });
  const spot = { x: CX, z: CZ + 0.95, yaw: 0, pitch: -0.1 };
  stations.push({ x: spot.x, z: spot.z, r: 1.3, text: 'E - Golden Tee-Off (challenge board)', act: () => BK.openChallenge('golf') });

  // ---------- game state ----------
  let st = null; // { hole, h, ball:[x,y], strokes, card:[], aim, club, wind:[x,y], phase, swing, flight, msg, msgT, done }
  const g = scr.g;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const inEll = (p, [x, y, rx, ry]) => ((p[0] - x) / rx) ** 2 + ((p[1] - y) / ry) ** 2 <= 1;
  function fwDist(p, h) { let best = 1e9, w = 0; for (let i = 0; i < h.fairway.length - 1; i++) { const [x0, y0, w0] = h.fairway[i], [x1, y1, w1] = h.fairway[i + 1], dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy, k = Math.max(0, Math.min(1, ((p[0] - x0) * dx + (p[1] - y0) * dy) / L2)), d = Math.hypot(p[0] - x0 - dx * k, p[1] - y0 - dy * k); if (d < best) { best = d; w = w0 + (w1 - w0) * k; } } return { d: best, w }; }
  function surface(p, h) {
    if (dist(p, h.green) <= h.green[2]) return 'green';
    if (h.water.some((e) => inEll(p, e))) return 'water';
    if (h.bunkers.some((e) => inEll(p, e))) return 'sand';
    const f = fwDist(p, h); if (f.d <= f.w / 2) return 'fairway'; if (f.d > f.w / 2 + 62) return 'ob'; return 'rough';
  }
  const pickClub = (p, h) => { const d = dist(p, h.pin); let c = CLUBS.length - 1; for (let i = CLUBS.length - 1; i >= 0; i--) if (CLUBS[i][1] >= d * 0.97) { c = i; break; } if (d > CLUBS[0][1]) c = 0; return c; };
  const say = (t, secs = 2.2) => { st.msg = t; st.msgT = secs; };
  function startHole(i) {
    const h = HOLES[i]; st.hole = i; st.h = h; st.ball = [...h.tee]; st.strokes = 0; st.prev = [...h.tee];
    st.aim = Math.atan2(h.pin[0] - h.tee[0], h.pin[1] - h.tee[1]) * 0.6 + Math.atan2(h.fairway[1][0] - h.tee[0], h.fairway[1][1] - h.tee[1]) * 0.4;
    st.club = pickClub(st.ball, h); st.wind = [(Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10]; st.phase = 'aim'; st.camAt = null;
    say(`HOLE ${i + 1} · ${h.name.toUpperCase()} · PAR ${h.par}`, 2.6);
  }
  const onGreen = () => surface(st.ball, st.h) === 'green';
  // a perfect-pace putt (half a swing) along the current aim: how far it rolls and how much it breaks (yards, + = right)
  const puttRead = () => { const h = st.h, d = Math.max(0.3, dist(st.ball, h.pin)), dir = [Math.sin(st.aim), Math.cos(st.aim)], perp = [dir[1], -dir[0]];
    return { d, dir, perp, brk: (h.slope[0] * perp[0] + h.slope[1] * perp[1]) * d * 0.05 }; };
  const ft = (yd) => { const f = yd * 3; return f < 1 ? `${Math.max(1, Math.round(f * 12))} in` : `${f < 10 ? f.toFixed(1).replace(/\.0$/, '') : Math.round(f)} ft`; };

  // ---------- the swing (trackball = pointer-locked mouse) ----------
  function down() { if (!st || st.phase !== 'aim') return; st.phase = 'back'; st.swing = { back: 0, fwd: 0, lat: 0, t0: 0 }; }
  function up() { if (st && (st.phase === 'back' || st.phase === 'fwd')) { st.phase = 'aim'; say('Swing cancelled'); } }
  function move(dx, dy) {
    if (!st || (st.phase !== 'back' && st.phase !== 'fwd')) return false;
    const s = st.swing;
    if (st.phase === 'back') { if (dy > 0) s.back = Math.min(400, s.back + dy); else if (dy < 0 && s.back > 40) { st.phase = 'fwd'; s.t0 = performance.now(); s.fwd = -dy; s.lat = dx; } }
    else { s.fwd += Math.max(0, -dy); s.lat += dx; const el = (performance.now() - s.t0) / 1000;
      if (s.fwd >= s.back * 0.9 || el > 0.45) strike(s.fwd / Math.max(0.03, el), s.lat / Math.max(30, s.fwd), s.back); }
    return true; // the cabinet owns the mouse while you swing
  }
  function strike(speed, latRatio, back) {
    const h = st.h, putt = onGreen(), drunk = 1 + (BK.drunk || 0) / 50, gs = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
    let power = Math.min(1.25, speed / (putt ? FULL_SPEED * 0.6 : FULL_SPEED)) * Math.min(1, back / 120);
    const over = Math.max(0, power - 1); let hook = latRatio * (putt ? 0.15 : 1) + gs() * 0.03 * drunk + (over ? gs() * over * 0.6 : 0);
    st.strokes++; st.prev = [...st.ball]; audio.sfx(putt ? 'cue' : 'ballHit', { v: 0.8 });
    const dir = [Math.sin(st.aim), Math.cos(st.aim)], perp = [dir[1], -dir[0]];
    if (putt) { // putts: distance from power (100% = twice the distance to the cup), break from the green's slope
      const d = power * Math.max(8, dist(st.ball, h.pin) * 2) * (1 + gs() * 0.04 * drunk), brk = (h.slope[0] * perp[0] + h.slope[1] * perp[1]) * d * 0.05 + hook * d * 0.15;
      const end = [st.ball[0] + dir[0] * d + perp[0] * brk, st.ball[1] + dir[1] * d + perp[1] * brk];
      st.flight = { kind: 'putt', from: [...st.ball], to: end, t: 0, T: 0.6 + d / 12, apex: 0 }; st.phase = 'fly'; return;
    }
    const [, carryMax, loft] = CLUBS[st.club], carry = carryMax * Math.pow(power, 0.85) * (1 + gs() * 0.025 * drunk), windAlong = st.wind[0] * dir[0] + st.wind[1] * dir[1], windAcross = st.wind[0] * perp[0] + st.wind[1] * perp[1];
    const C = carry * (1 + windAlong * 0.008), side = hook * C * 0.18 + windAcross * C * 0.006;
    const to = [st.ball[0] + dir[0] * C + perp[0] * side, st.ball[1] + dir[1] * C + perp[1] * side];
    const lie = surface(st.ball, h), lieK = lie === 'sand' ? 0.6 : lie === 'rough' ? 0.88 : 1; to[0] = st.ball[0] + (to[0] - st.ball[0]) * lieK; to[1] = st.ball[1] + (to[1] - st.ball[1]) * lieK;
    st.flight = { kind: 'air', from: [...st.ball], to, ctl: [st.ball[0] + dir[0] * C * 0.5 + perp[0] * side * 0.05, st.ball[1] + dir[1] * C * 0.5 + perp[1] * side * 0.05], t: 0, T: 1.1 + C / 140, apex: C * loft, dir, power };
    st.phase = 'fly'; if (power > 0.97) say(power > 1.05 ? 'OVERSWING!' : 'PERFECT STRIKE', 1.2);
  }
  const bez = (f, k) => { const a = f.from, b = f.ctl || [(f.from[0] + f.to[0]) / 2, (f.from[1] + f.to[1]) / 2], c = f.to, u = 1 - k; return [u * u * a[0] + 2 * u * k * b[0] + k * k * c[0], u * u * a[1] + 2 * u * k * b[1] + k * k * c[1]]; };
  function land(p) { // after the carry: hazards, trees, roll
    const h = st.h, f = st.flight;
    if (f.kind === 'air') {
      for (let k = 0.05; k < 1; k += 0.02) { const q = bez(f, k), ht = 4 * f.apex * k * (1 - k); for (const t of h.trees) if (ht < t[3] && Math.hypot(q[0] - t[0], q[1] - t[1]) < t[2] * 0.7) { st.ball = q; say('TREE! 🌲'); audio.sfx('bonk', { v: 0.6 }); return settle(); } }
      const s = surface(p, h);
      if (s === 'water') { st.strokes++; let k = 1; while (k > 0 && surface(bez(f, k), h) === 'water') k -= 0.02; st.ball = bez(f, Math.max(0, k - 0.04)); say('SPLASH! +1 penalty'); audio.sfx('pour', { v: 1 }); return settle(); }
      if (s === 'ob') { st.strokes++; st.ball = [...st.prev]; say('OUT OF BOUNDS · +1, replay'); return settle(); }
      const roll = { fairway: 0.1, rough: 0.03, sand: 0, green: 0.05 }[s] * Math.hypot(p[0] - f.from[0], p[1] - f.from[1]);
      st.ball = [p[0] + f.dir[0] * roll, p[1] + f.dir[1] * roll];
      if (s === 'sand') say('In the bunker'); else if (s === 'green') say('On the green!'); audio.sfx('bagThud', { v: 0.5 });
      if (dist(st.ball, h.pin) < CUP * 3 && s === 'green') return holed();
      if (surface(st.ball, h) === 'water') { st.strokes++; st.ball = p; say('Rolled in the water · +1'); }
      return settle();
    }
    // putt: did it catch the cup on the way?
    const a = f.from, b = f.to, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((h.pin[0] - a[0]) * dx + (h.pin[1] - a[1]) * dy) / L2)), cx = a[0] + dx * k, cy = a[1] + dy * k;
    const miss = Math.hypot(h.pin[0] - cx, h.pin[1] - cy), past = Math.sqrt(L2) - Math.hypot(h.pin[0] - a[0], h.pin[1] - a[1]);
    if (miss < CUP && past > -0.1 && past < 3) return holed();
    st.ball = b; const left = Math.hypot(h.pin[0] - b[0], h.pin[1] - b[1]); say(past < 0 ? `Short · ${ft(left)} left` : miss < CUP * 3 ? `Lipped out! ${ft(left)} past` : `Missed · ${ft(left)} away`, 1.8); return settle();
  }
  function settle() { st.phase = 'aim'; st.camAt = null; const h = st.h; if (st.strokes >= h.par + 4) { say('Picked up'); return finishHole(); } st.aim = Math.atan2(h.pin[0] - st.ball[0], h.pin[1] - st.ball[1]); st.club = pickClub(st.ball, h); }
  function holed() { st.ball = [...st.h.pin]; audio.sfx('pocket', { v: 1 }); const d = st.strokes - st.h.par; say(st.strokes === 1 ? 'HOLE IN ONE!!!' : { '-3': 'ALBATROSS!', '-2': 'EAGLE!', '-1': 'BIRDIE!', 0: 'PAR', 1: 'Bogey', 2: 'Double bogey' }[d] || `+${d}`, 2.4); if (d < 0 || st.strokes === 1) audio.sfx('cheer', { v: 0.6 }); finishHole(); }
  function finishHole() {
    const h = st.h, pts = STABLE(st.strokes - h.par, st.strokes === 1); st.card.push({ strokes: st.strokes, pts }); st.phase = 'between'; st.wait = 2.6;
    hud.pop(`Hole ${st.hole + 1}: ${st.strokes} (${pts} pt${pts === 1 ? '' : 's'})`, pts >= 3);
  }

  // ---------- drawing the screen ----------
  function view() { // camera behind the ball looking along the aim (chasing the ball in flight)
    let at = st.ball, dirA = st.aim;
    const putt = onGreen() && st.phase !== 'fly' || (st.flight && st.flight.kind === 'putt' && st.phase === 'fly'), pd = putt ? dist(st.flight && st.phase === 'fly' ? st.flight.from : st.ball, st.h.pin) : 0;
    const back = putt ? Math.min(CAM_BACK, 2.4 + pd * 0.4) : CAM_BACK;
    if (st.phase === 'fly' && st.flight.kind === 'air') { const k = Math.min(1, st.flight.t / st.flight.T); at = bez(st.flight, Math.max(0, k - 0.25)); }
    const want = { x: at[0] - Math.sin(dirA) * back, y: at[1] - Math.cos(dirA) * back, a: dirA };
    if (!st.camAt) st.camAt = { ...want }; else { const k = 0.12; st.camAt.x += (want.x - st.camAt.x) * k; st.camAt.y += (want.y - st.camAt.y) * k; st.camAt.a += (want.a - st.camAt.a) * k; }
    return { x: st.camAt.x, y: st.camAt.y, a: st.camAt.a, h: putt ? Math.min(2.8, 1.8 + pd * 0.1) : CAM_H, near: putt ? 0.4 : 1.2, putt };
  }
  function draw() {
    const h = st.h, V = view(), ca = Math.cos(V.a), sa = Math.sin(V.a);
    const rel = (p) => { const dx = p[0] - V.x, dy = p[1] - V.y; return [dx * ca - dy * sa, dx * sa + dy * ca]; }; // [right, forward]
    const proj = (r, ht = 0) => [W / 2 + (r[0] / r[1]) * FOC, HORIZON + ((V.h - ht) / r[1]) * FOC];
    const poly = (pts, fill) => { // clip against the near plane, then project
      const R = pts.map(rel), out = []; for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length], ia = a[1] >= V.near, ib = b[1] >= V.near;
        if (ia) out.push(a); if (ia !== ib) { const k = (V.near - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * k, V.near]); } }
      if (out.length < 3) return; g.beginPath(); out.forEach((r, i) => { const [x, y] = proj(r); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fillStyle = fill; g.fill(); };
    const ell = ([x, y, rx, ry]) => Array.from({ length: 20 }, (_, i) => [x + Math.cos(i / 20 * 6.283) * rx, y + Math.sin(i / 20 * 6.283) * ry]);
    // sky, distant trees, rough
    const sky = g.createLinearGradient(0, 0, 0, HORIZON); sky.addColorStop(0, '#3d86d8'); sky.addColorStop(1, '#a9d4f5'); g.fillStyle = sky; g.fillRect(0, 0, W, HORIZON);
    g.fillStyle = '#fff'; for (const [cx, cy, s] of [[90, 50, 1], [300, 32, 0.8], [520, 60, 1.1]]) { const ox = ((cx - V.a * 200) % (W + 200) + W + 200) % (W + 200) - 100; g.beginPath(); g.ellipse(ox, cy, 40 * s, 12 * s, 0, 0, 7); g.ellipse(ox + 22 * s, cy - 8 * s, 26 * s, 12 * s, 0, 0, 7); g.fill(); }
    g.fillStyle = '#2f6b2a'; for (let x = -20; x < W + 20; x += 18) { const hh = 14 + Math.abs(Math.sin(x * 0.07 + V.a * 3)) * 12; g.beginPath(); g.ellipse(x, HORIZON - 4, 14, hh, 0, Math.PI, 0); g.fill(); }
    const gr = g.createLinearGradient(0, HORIZON, 0, H); gr.addColorStop(0, '#4f8f3a'); gr.addColorStop(1, '#3c7a2c'); g.fillStyle = gr; g.fillRect(0, HORIZON, W, H - HORIZON);
    // fairway (a strip around the centreline), hazards, green
    const fw = h.fairway, L = [], Rt = []; for (let i = 0; i < fw.length; i++) { const a = fw[Math.max(0, i - 1)], b = fw[Math.min(fw.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = dy / l, ny = -dx / l; L.push([fw[i][0] - nx * fw[i][2] / 2, fw[i][1] - ny * fw[i][2] / 2]); Rt.push([fw[i][0] + nx * fw[i][2] / 2, fw[i][1] + ny * fw[i][2] / 2]); }
    for (let i = 0; i < fw.length - 1; i++) poly([L[i], L[i + 1], Rt[i + 1], Rt[i]], i % 2 ? '#6cbf4a' : '#66b845');
    poly([[h.tee[0] - 5, h.tee[1] - 4], [h.tee[0] + 5, h.tee[1] - 4], [h.tee[0] + 5, h.tee[1] + 4], [h.tee[0] - 5, h.tee[1] + 4]], '#77c955');
    for (const b of h.bunkers) poly(ell(b), '#e6d29a'); for (const w of h.water) poly(ell(w), '#3a8fd8');
    poly(ell([h.green[0], h.green[1], h.green[2] + 4, h.green[2] + 4]), '#5aae3f'); poly(ell([h.green[0], h.green[1], h.green[2], h.green[2]]), '#86d860');
    if (V.putt) { // which way the green runs: faint chevrons pointing downhill
      const sl = Math.hypot(h.slope[0], h.slope[1]), ux = h.slope[0] / sl, uy = h.slope[1] / sl; g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const c = [h.green[0] + i * 5, h.green[1] + j * 5]; if (dist(c, h.green) > h.green[2] - 1.5) continue;
        const a = rel([c[0] - ux * 0.6 - uy * 0.5, c[1] - uy * 0.6 + ux * 0.5]), m = rel([c[0] + ux * 0.6, c[1] + uy * 0.6]), b = rel([c[0] - ux * 0.6 + uy * 0.5, c[1] - uy * 0.6 - ux * 0.5]);
        if (a[1] <= V.near || m[1] <= V.near || b[1] <= V.near) continue; const [x1, y1] = proj(a), [x2, y2] = proj(m), [x3, y3] = proj(b); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.stroke(); } }
    const cupR = rel(h.pin); if (cupR[1] > V.near) { // the cup: a dark hole with a white lip, never smaller than a few pixels so you can see it from the fairway
      const [x, y] = proj(cupR), rx = Math.max(5, (CUP * 1.2 / cupR[1]) * FOC), ry = Math.max(2, rx * Math.max(0.4, Math.min(1, V.h / cupR[1])));
      g.fillStyle = '#0d1a0d'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = Math.max(1, rx * 0.12); g.stroke();
    } // drawn at the size that catches a putt (CUP): roll through it at a fair pace and it drops
    // pin, trees (far to near), ball
    const items = h.trees.map((t) => ({ r: rel(t), t })).filter((o) => o.r[1] > 7) /* not the ones right behind the camera */.sort((a, b) => b.r[1] - a.r[1]);
    const pinR = rel(h.pin); let pinDrawn = false;
    const drawPin = () => { pinDrawn = true; if (pinR[1] <= V.near) return; const [x, y] = proj(pinR), [, y2] = proj(pinR, 3.2); g.strokeStyle = '#eee'; g.lineWidth = Math.max(1, 30 / pinR[1]); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y2); g.stroke(); g.fillStyle = '#e22'; g.beginPath(); g.moveTo(x, y2); g.lineTo(x + Math.max(6, 140 / pinR[1]), y2 + Math.max(3, 40 / pinR[1])); g.lineTo(x, y2 + Math.max(6, 80 / pinR[1])); g.fill(); };
    for (const o of items) { if (!pinDrawn && o.r[1] < pinR[1]) drawPin(); const [x, y] = proj(o.r), [, yt] = proj(o.r, o.t[3]), s = (o.t[2] / o.r[1]) * FOC; if (s < 0.6) continue;
      g.fillStyle = '#5a3a20'; g.fillRect(x - s * 0.12, yt + (y - yt) * 0.55, s * 0.24, (y - yt) * 0.45); g.fillStyle = o.t[3] > 12 ? '#2c6e2a' : '#3a8a30'; g.beginPath(); g.ellipse(x, yt + (y - yt) * 0.32, s, (y - yt) * 0.4, 0, 0, 7); g.fill(); }
    if (!pinDrawn) drawPin();
    let bp = st.ball, bh = 0; if (st.phase === 'fly') { const f = st.flight, k = Math.min(1, f.t / f.T); bp = f.kind === 'air' ? bez(f, k) : [f.from[0] + (f.to[0] - f.from[0]) * (1 - (1 - k) ** 2), f.from[1] + (f.to[1] - f.from[1]) * (1 - (1 - k) ** 2)]; bh = 4 * f.apex * k * (1 - k); }
    const br = rel(bp); if (br[1] > V.near) { const [x, y] = proj(br), [, yh] = proj(br, bh), s = Math.max(2, (V.putt ? 0.05 : 0.24) / br[1] * FOC); /* on the green, true to scale next to the cup */ g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y, s, s * 0.4, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, yh - s, s, 0, 7); g.fill(); }
    // aim line while aiming
    if ((st.phase === 'aim' || st.phase === 'back' || st.phase === 'fwd') && V.putt) { const R = puttRead(); g.strokeStyle = 'rgba(255,240,120,0.9)'; g.setLineDash([4, 5]); g.lineWidth = 2; g.beginPath(); let started = false, ex = 0, ey = 0;
      for (let k = 0; k <= 24; k++) { const u = k / 24, q = [st.ball[0] + R.dir[0] * R.d * u + R.perp[0] * R.brk * u * u, st.ball[1] + R.dir[1] * R.d * u + R.perp[1] * R.brk * u * u], r = rel(q); if (r[1] <= V.near) continue; [ex, ey] = proj(r); started ? g.lineTo(ex, ey) : g.moveTo(ex, ey); started = true; }
      g.stroke(); g.setLineDash([]); if (started) { g.strokeStyle = '#ffcf3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(ex - 4, ey); g.lineTo(ex + 4, ey); g.moveTo(ex, ey - 3); g.lineTo(ex, ey + 3); g.stroke(); } }
    else if (st.phase === 'aim' || st.phase === 'back' || st.phase === 'fwd') { const d = onGreen() ? Math.min(dist(st.ball, h.pin) * 1.4, 30) : CLUBS[st.club][1]; g.strokeStyle = 'rgba(255,240,120,0.85)'; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath();
      for (let k = 0; k <= 12; k++) { const q = [st.ball[0] + Math.sin(st.aim) * d * k / 12, st.ball[1] + Math.cos(st.aim) * d * k / 12], r = rel(q); if (r[1] <= V.near) continue; const [x, y] = proj(r); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.setLineDash([]); }
    minimap(); hudBox();
  }
  function minimap() {
    const h = st.h, X0 = W - 112, Y0 = 18, MW = 96, MH = 300, ys = MH / (h.pin[1] + 60), xs = ys, cx = X0 + MW / 2, mp = (p) => [cx + (p[0] - h.pin[0] * 0.5) * xs, Y0 + MH - (p[1] + 20) * ys];
    g.fillStyle = 'rgba(10,30,15,0.82)'; g.fillRect(X0 - 4, Y0 - 4, MW + 8, MH + 8); g.strokeStyle = '#e8b923'; g.lineWidth = 2; g.strokeRect(X0 - 4, Y0 - 4, MW + 8, MH + 8);
    g.save(); g.beginPath(); g.rect(X0, Y0, MW, MH); g.clip();
    g.strokeStyle = '#6cbf4a'; g.lineCap = 'round'; for (let i = 0; i < h.fairway.length - 1; i++) { const a = mp(h.fairway[i]), b = mp(h.fairway[i + 1]); g.lineWidth = h.fairway[i][2] * xs; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    const dot = (p, r, c) => { const [x, y] = mp(p); g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    for (const w of h.water) { const [x, y] = mp(w); g.fillStyle = '#3a8fd8'; g.beginPath(); g.ellipse(x, y, w[2] * xs, w[3] * ys, 0, 0, 7); g.fill(); }
    for (const b of h.bunkers) { const [x, y] = mp(b); g.fillStyle = '#e6d29a'; g.beginPath(); g.ellipse(x, y, b[2] * xs, b[3] * ys, 0, 0, 7); g.fill(); }
    for (const t of h.trees) dot(t, 1.8, '#1f5a1f'); dot(h.green, h.green[2] * xs, '#86d860'); dot(h.pin, 2.5, '#e22');
    const [bx0, by0] = mp(st.ball); g.strokeStyle = 'rgba(255,240,120,0.9)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx0, by0); const d = onGreen() ? 20 : CLUBS[st.club][1]; const [ex, ey] = mp([st.ball[0] + Math.sin(st.aim) * d, st.ball[1] + Math.cos(st.aim) * d]); g.lineTo(ex, ey); g.stroke(); dot(st.ball, 3, '#fff');
    g.restore();
  }
  function hudBox() {
    const h = st.h, yd = Math.round(dist(st.ball, h.pin)), putt = onGreen();
    const T0 = 46; // clear of the bar HUD that overlaps the top of the cabinet screen
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(10, T0, 170, 74); g.fillStyle = '#ffcf3a'; g.font = '400 18px Bungee, system-ui'; g.textAlign = 'left'; g.fillText(`HOLE ${st.hole + 1}`, 18, T0 + 22);
    g.fillStyle = '#fff'; g.font = '700 16px "Barlow Condensed", system-ui'; g.fillText(`PAR ${h.par} · ${putt ? Math.round(yd * 3) + ' FT' : yd + ' YDS'} TO PIN`, 18, T0 + 42); g.fillText(`STROKE ${st.strokes + 1} · ${st.card.reduce((a, c) => a + c.pts, 0)} PTS`, 18, T0 + 62);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(10, H - 64, 250, 54); g.fillStyle = '#fff'; g.font = '700 18px "Barlow Condensed", system-ui'; g.fillText(putt ? 'PUTTER · HALF A SWING = THE CUP' : `${CLUBS[st.club][0].toUpperCase()} · ${CLUBS[st.club][1]} YDS`, 18, H - 40);
    if (putt) { const R = puttRead(), b = R.brk; g.fillText(Math.abs(b) * 3 < 0.25 ? 'DEAD STRAIGHT · AIM AT THE CUP' : `BREAKS ${ft(Math.abs(b))} ${b > 0 ? 'RIGHT' : 'LEFT'} · AIM ${b > 0 ? 'LEFT' : 'RIGHT'}`, 18, H - 18); }
    else { const wm = Math.round(Math.hypot(st.wind[0], st.wind[1])), wa = Math.atan2(st.wind[0], st.wind[1]) - st.aim; g.fillText(`WIND ${wm} MPH`, 18, H - 18);
    g.save(); g.translate(150, H - 24); g.rotate(wa); g.fillStyle = '#ffcf3a'; g.beginPath(); g.moveTo(0, -12); g.lineTo(7, 6); g.lineTo(-7, 6); g.fill(); g.restore(); }
    // swing meter
    if (st.phase === 'back' || st.phase === 'fwd') { const s = st.swing; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W - 150, H - 64, 24, 54); g.fillStyle = st.phase === 'back' ? '#7ab0ff' : '#ffcf3a'; const k = st.phase === 'back' ? Math.min(1, s.back / 200) : Math.min(1, s.fwd / Math.max(1, s.back)); g.fillRect(W - 147, H - 13 - 48 * k, 18, 48 * k); }
    if (st.msgT > 0) { let fs = 30; g.font = `400 ${fs}px Bungee, system-ui`; while (g.measureText(st.msg).width > W - 150 && fs > 14) { fs -= 2; g.font = `400 ${fs}px Bungee, system-ui`; } g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(st.msg, W / 2 - 60, 150); g.fillStyle = '#ffcf3a'; g.fillText(st.msg, W / 2 - 60, 150); g.textAlign = 'left'; }
  }
  function attract(t) { // idle: the logo over a slow flyover of hole 1
    if (!st || st.attract) { st = st || { attract: true, card: [] }; st.attract = true; if (!st.h) startHole(0); st.aim = Math.sin(t * 0.2) * 0.3; st.camAt = null; st.phase = 'aim'; st.msgT = 0; draw();
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, H / 2 - 70, W, 120); g.textAlign = 'center'; g.font = '400 52px Bungee, system-ui'; g.lineWidth = 8; g.strokeStyle = '#3a2000'; g.strokeText('GOLDEN TEE-OFF', W / 2, H / 2); g.fillStyle = '#ffcf3a'; g.fillText('GOLDEN TEE-OFF', W / 2, H / 2);
      g.font = '700 22px "Barlow Condensed", system-ui'; g.fillStyle = '#fff'; if (Math.sin(t * 3) > 0) g.fillText('INSERT COIN · PRESS E', W / 2, H / 2 + 36); g.textAlign = 'left'; scr.t.needsUpdate = true; }
  }
  let lastAttract = 0;

  const api = {
    name: 'golf', spot, limits: { yaw: 0.25, pitch: 0.2 },
    enter() { st = { card: [] }; startHole(0); hud.title(''); this.hudUpdate(); },
    exit() { st = null; },
    _st: () => st, // tests: read / poke the round
    hudUpdate() { hud.sub(''); hud.help(`3 holes, par ${PAR}: birdie 4 / par 3 / bogey 1 pts${tgt()}. Hold click, pull the mouse back, roll it forward fast (speed = power, drift = hook/slice). A/D aim · W/S club · E to leave.`); },
    down, up, move,
    camOffset: () => ({ y: 0, p: 0 }),
    rig(cam) { // square on to the (tilted) screen, a narrow lens so the game fills the view (world.js puts the normal FOV back every frame)
      cam.fov = 40; cam.updateProjectionMatrix(); const c = screen.position.clone(), n = new THREE.Vector3(0, Math.sin(-screen.rotation.x), Math.cos(screen.rotation.x));
      cam.position.copy(cab.localToWorld(c.clone().addScaledVector(n, 0.84 * screen.scale.y))); cam.lookAt(cab.localToWorld(c)); },
    canvas: scr.c,
    step(dt) {
      if (!st || st.attract) return;
      st.msgT = Math.max(0, (st.msgT || 0) - dt);
      if (st.phase === 'aim') { const turn = ((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0)) * dt * (onGreen() ? 0.16 : 0.45); st.aim += turn;
        if (!st.clubKey && (keys.KeyW || keys.KeyS || keys.ArrowUp || keys.ArrowDown) && !onGreen()) { st.club = Math.max(0, Math.min(CLUBS.length - 1, st.club + (keys.KeyS || keys.ArrowDown ? 1 : -1))); st.clubKey = true; audio.sfx('click'); }
        if (!(keys.KeyW || keys.KeyS || keys.ArrowUp || keys.ArrowDown)) st.clubKey = false; }
      if (st.phase === 'fly') { const f = st.flight; f.t += dt; if (f.t >= f.T) { const p = f.to; st.phase = 'landing'; land(p); } }
      if (st.phase === 'between') { st.wait -= dt; if (st.wait <= 0) { if (st.hole < HOLES.length - 1) startHole(st.hole + 1); else { st.phase = 'done'; const pts = st.card.reduce((a, c) => a + c.pts, 0), strokes = st.card.reduce((a, c) => a + c.strokes, 0); const ch = submit('golf', pts); hud.msg(`${strokes} strokes (${strokes - PAR >= 0 ? '+' : ''}${strokes - PAR}) · ${verdict(ch, pts)}`); say(`${pts} POINTS`, 99); } } }
    },
    handAnim() { if (st && !st.attract) { draw(); scr.t.needsUpdate = true; } }, // once per rendered frame (step runs at 120 Hz)
    // idle cabinet screen, a few frames a second while anyone can see it
    idle(t, visible) { if (st && !st.attract) return; if (!visible || t - lastAttract < 0.2) return; lastAttract = t; attract(t); },
  };
  return api;
}
