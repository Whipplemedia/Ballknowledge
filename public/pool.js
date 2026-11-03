import { audio } from './audio.js';
import * as THREE from 'three';
import { canvasTex } from './textures.js';
import { hasProp } from './props.js';

// 8-ball vs an NPC, bar rules: a full rack of 15, open table after the break - your group (solids 1-7 or stripes 9-15) is whatever you
// legally pocket first. Hit your own group first (anything but the 8 on an open table) or it's a foul; a foul (scratch, wrong ball first,
// hitting nothing) gives the other player ball in hand anywhere. Clear your group, then sink the 8; the 8 early, or a scratch on it, loses.
// The 8 on the break is re-spotted. Top-down 2D physics on the felt of the table in bar.js (PX,PZ) = (3.4, 3.4).
// The table model (models/props/pool.glb at w 2.86): felt at y 0.92, cushion noses at |x| 1.21 / |z| 0.565, the holes centred about
// (±1.27, ±0.615) in the corners and (0, ±0.62) at the sides. The cushions here have real openings (mouths) at those holes, with jaws,
// so a ball only drops where you can see a pocket - it can rattle the jaws, and it can't vanish half a ball short of one.
const PX = 3.4, PZ = 3.4, Y = 0.92, BR = 0.04, HX = hasProp('pool') ? 1.21 : 1.3, HZ = hasProp('pool') ? 0.565 : 0.65;
const CM = 0.085, SM = 0.068, JR = 0.01; // corner mouth (along each rail from the corner), side mouth half-width, jaw radius
const POCKETS = [[-HX - 0.055, -HZ - 0.05, 0.064], [HX + 0.055, -HZ - 0.05, 0.064], [-HX - 0.055, HZ + 0.05, 0.064], [HX + 0.055, HZ + 0.05, 0.064], [0, -HZ - 0.055, 0.06], [0, HZ + 0.055, 0.06]]; // x, z, capture radius
const AIMS = [[-HX + 0.012, -HZ + 0.012], [HX - 0.012, -HZ + 0.012], [-HX + 0.012, HZ - 0.012], [HX - 0.012, HZ - 0.012], [0, -HZ + 0.005], [0, HZ - 0.005]]; // where to send a ball into each pocket (just inside its mouth)
const JAWS = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) JAWS.push([sx * (HX - CM), sz * HZ], [sx * HX, sz * (HZ - CM)], [sx * SM, sz * HZ]);
const COLORS = { 1: '#f2c230', 2: '#2a5ad8', 3: '#d82a2a', 4: '#7a2ab8', 5: '#f07a1a', 6: '#1f8a4a', 7: '#7a1f24', 8: '#101010', 9: '#f2c230', 10: '#2a5ad8', 11: '#d82a2a', 12: '#7a2ab8', 13: '#f07a1a', 14: '#1f8a4a', 15: '#7a1f24' };
const KIND = (n) => (n >= 1 && n <= 7 ? 'solids' : n >= 9 && n <= 15 ? 'stripes' : n === 8 ? 'eight' : 'cue');
const FOOT = HX / 2, HEAD = -HX / 2; // the rack's apex spot and the break spot
const SKILL = { rookie: { aim: 0.06, pow: 0.2, name: 'the Rookie', think: 1.1 }, shark: { aim: 0.011, pow: 0.05, name: 'The Shark', think: 1.5 }, chase: { aim: 0.024, pow: 0.09, name: 'Chase', think: 1.3 } }; // chase: the developer's dare at a check-in, between the two
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;

function ballTex(n) {
  return canvasTex(128, 64, (g, w, h) => {
    const col = COLORS[n], stripe = n >= 9;
    g.fillStyle = n === 0 || stripe ? '#f4f4f0' : col; g.fillRect(0, 0, w, h);
    if (stripe) { g.fillStyle = col; g.fillRect(0, 16, w, 32); }
    if (n > 0) { g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 13, 0, 7); g.arc(96, 32, 13, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = '800 18px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 33); g.fillText(String(n), 96, 33); }
    else { g.fillStyle = '#d33'; g.beginPath(); g.arc(32, 32, 4, 0, 7); g.fill(); }
  }).t;
}

export function createPool({ scene, camera, BK, me, stations, obstacles, hud, V }) {
  const label3 = (txt) => null;
  // ----- meshes -----
  const group = new THREE.Group(); scene.add(group);
  const balls = []; // {n, x, z, vx, vz, in, mesh, owner}
  const mk = (n) => { const m = new THREE.Mesh(new THREE.SphereGeometry(BR, 20, 14), new THREE.MeshStandardMaterial({ map: ballTex(n), roughness: 0.18, metalness: 0.05 })); m.castShadow = true; group.add(m); return m; };
  for (let n = 0; n <= 15; n++) balls.push({ n, x: 0, z: 0, vx: 0, vz: 0, in: false, mesh: mk(n), kind: KIND(n), dropT: 0, px: 0, pz: 0 });
  const cue = new THREE.Group(); { const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.5, 10), new THREE.MeshStandardMaterial({ color: 0xd8b27a, roughness: 0.5 })); stick.rotation.x = Math.PI / 2; stick.position.z = 0.75; cue.add(stick); const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.015, 8), new THREE.MeshStandardMaterial({ color: 0x3a7ad8 })); tip.rotation.x = Math.PI / 2; cue.add(tip); const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a22 })); grip.rotation.x = Math.PI / 2; grip.position.z = 1.4; cue.add(grip); }
  cue.visible = false; scene.add(cue);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([V(), V(), V(), V()]);
  const aimLine = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })); aimLine.frustumCulled = false; aimLine.visible = false; scene.add(aimLine);
  const ghost = new THREE.Mesh(new THREE.SphereGeometry(BR, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.8 })); ghost.visible = false; scene.add(ghost);
  const dare = () => { const d = BK.S && BK.S.chaseDare; return d && !d.by && BK.now() < d.until ? d : null; }; // Chase's pool dare, open to take
  stations.push({ x: PX - 1.9, z: PZ, r: 1.6, get text() { const d = dare(); return d ? `E - Play Chase at pool ($${d.fee} permit fee rides on it)` : 'E - Play pool (bet vs NPC)'; }, act: () => (dare() ? BK.playChase && BK.playChase() : BK.openPool && BK.openPool()) });

  // ----- game state -----
  let st = null; // {opp, stake, turn, phase, power, cdir, charging, aim, msg, msgT, shots, firstHit, pocketed[], group{you,npc}, t, plan, winner, dare}
  const cueBall = balls[0];
  const byN = (n) => balls.find((q) => q.n === n);
  const rack = () => { // the triangle: apex on the foot spot, the 8 in the middle of the third row, a solid and a stripe in the back corners
    const sol = [1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5), str = [9, 10, 11, 12, 13, 14, 15].sort(() => Math.random() - 0.5);
    const slots = []; for (let r = 0; r < 5; r++) for (let k = 0; k <= r; k++) slots.push([r, k]);
    const at = {}; at['2,1'] = 8; const flip = Math.random() < 0.5; at['4,0'] = flip ? sol.pop() : str.pop(); at['4,4'] = flip ? str.pop() : sol.pop();
    const rest = [...sol, ...str].sort(() => Math.random() - 0.5);
    for (const [r, k] of slots) { const n = at[r + ',' + k] || rest.pop(), b = byN(n); b.x = FOOT + r * BR * 2 * 0.868 + (Math.random() - 0.5) * 0.0006; b.z = (k - r / 2) * (BR * 2 + 0.0008); }
    for (const b of balls) { b.vx = b.vz = 0; b.in = false; b.dropT = 0; }
    cueBall.x = HEAD; cueBall.z = (Math.random() - 0.5) * 0.3;
  };
  const sync = () => { for (const b of balls) { const k = b.in ? Math.min(1, b.dropT / 0.25) : 0; b.mesh.visible = !(b.in && b.dropT > 0.6); const y = Y + BR - (b.in ? Math.min(b.dropT, 0.6) * 0.3 : 0); b.mesh.position.set(PX + b.x + (b.px - b.x) * k, y, PZ + b.z + (b.pz - b.z) * k); } };
  const moving = () => balls.some((b) => !b.in && (Math.abs(b.vx) + Math.abs(b.vz) > 0.015));
  const left = (kind) => balls.filter((b) => b.kind === kind && !b.in).length;
  const groupOf = (who) => st.group[who];
  const targets = (who) => { const g = groupOf(who); if (!g) return balls.filter((b) => !b.in && (b.kind === 'solids' || b.kind === 'stripes')); return left(g) ? balls.filter((b) => !b.in && b.kind === g) : [byN(8)]; };
  const legalFirst = (who, n) => { const g = groupOf(who); if (n === null) return false; const k = KIND(n); if (!g) return k !== 'eight'; return left(g) || st.preLeft[who] ? k === g : k === 'eight'; };
  const dirOf = (a) => ({ x: -Math.sin(a), z: -Math.cos(a) });
  const free = (x, z) => Math.abs(x) <= HX - BR && Math.abs(z) <= HZ - BR && balls.every((b) => b === cueBall || b.in || Math.hypot(b.x - x, b.z - z) > BR * 2.05);

  const lastS = {}; const snd = (n, x, z, v) => { const k = n, now = performance.now(); if (now - (lastS[k] || 0) < (n === 'ballHit' ? 18 : 35)) return; lastS[k] = now; audio.sfx(n, { v, pos: { x: PX + x, y: 0.95, z: PZ + z }, ref: 3 }); };
  const physics = (dt) => {
    for (const b of balls) {
      if (b.in) { b.dropT += dt; continue; }
      b.x += b.vx * dt; b.z += b.vz * dt;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) { const ns = Math.max(0, sp - (0.75 + 0.32 * sp) * dt); b.vx *= ns / sp; b.vz *= ns / sp; if (ns < 0.012) { b.vx = b.vz = 0; } }
      // pockets: the ball's centre over a hole - or out past the cushion line in a mouth (it's in the throat) - and it drops
      let pk = null; for (const P of POCKETS) if (Math.hypot(b.x - P[0], b.z - P[1]) < P[2]) { pk = P; break; }
      if (!pk && (Math.abs(b.x) > HX + 0.03 || Math.abs(b.z) > HZ + 0.03)) pk = POCKETS.reduce((a, P) => (Math.hypot(b.x - P[0], b.z - P[1]) < Math.hypot(b.x - a[0], b.z - a[1]) ? P : a));
      if (pk) { b.in = true; b.dropT = 0; b.vx = b.vz = 0; b.px = pk[0]; b.pz = pk[1]; st.pocketed.push(b.n); snd('pocket', pk[0], pk[1], 1); continue; }
      // cushions (each rail stops at the pocket mouths)
      const ax = Math.abs(b.x), az = Math.abs(b.z), longOn = ax <= HX - CM && ax >= SM, shortOn = az <= HZ - CM;
      if (shortOn && ax > HX - BR) { snd('cushion', b.x, b.z, Math.abs(b.vx) / 3); b.x = Math.sign(b.x) * (HX - BR); b.vx = -Math.sign(b.x) * Math.abs(b.vx) * 0.78; }
      if (longOn && az > HZ - BR) { snd('cushion', b.x, b.z, Math.abs(b.vz) / 3); b.z = Math.sign(b.z) * (HZ - BR); b.vz = -Math.sign(b.z) * Math.abs(b.vz) * 0.78; }
      // the jaws: the rounded cushion ends at every mouth
      for (const [jx, jz] of JAWS) { const dx = b.x - jx, dz = b.z - jz, d = Math.hypot(dx, dz), md = BR + JR; if (d < md && d > 1e-6) { const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz; b.x = jx + nx * md; b.z = jz + nz * md; if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vz -= 1.7 * vn * nz; snd('cushion', b.x, b.z, -vn / 3); } } }
    }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j]; if (a.in || b.in) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, md = BR * 2;
      if (d2 < md * md && d2 > 1e-9) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        const ov = (md - d) / 2; a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
        if (rel > 0) { if (st.breakNext && (a.n === 0 || b.n === 0)) { st.breakNext = false; snd('poolBreak', a.x, a.z, 1); } else snd('ballHit', (a.x + b.x) / 2, (a.z + b.z) / 2, rel / 4); const j2 = rel * 0.98; a.vx -= j2 * nx; a.vz -= j2 * nz; b.vx += j2 * nx; b.vz += j2 * nz; if (st.firstHit === null && (a.n === 0 || b.n === 0)) st.firstHit = a.n === 0 ? b.n : a.n; }
      }
    }
  };
  // aim ray: distance to first ball (center distance 2r) or cushion
  const trace = (ox, oz, dx, dz) => {
    let best = 9, hit = null;
    for (const b of balls) { if (b.n === 0 || b.in) continue; const rx = b.x - ox, rz = b.z - oz, t = rx * dx + rz * dz; if (t <= 0) continue; const px = ox + dx * t - b.x, pz = oz + dz * t - b.z, d2 = px * px + pz * pz, md = BR * 2; if (d2 < md * md) { const tt = t - Math.sqrt(md * md - d2); if (tt < best) { best = tt; hit = b; } } }
    const tx = dx > 0 ? (HX - BR - ox) / dx : dx < 0 ? (-HX + BR - ox) / dx : 9, tz = dz > 0 ? (HZ - BR - oz) / dz : dz < 0 ? (-HZ + BR - oz) / dz : 9;
    const wall = Math.min(tx, tz); if (!hit || wall < best) return { t: Math.max(0, wall), hit: null }; return { t: Math.max(0, best), hit };
  };

  // ----- NPC -----
  const segDist = (px, pz, ax, az, bx, bz) => { const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz || 1e-9; let t = ((px - ax) * abx + (pz - az) * abz) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + abx * t), pz - (az + abz * t)); };
  const bestShot = (who) => { // ghost-ball aim at every (own ball, pocket); score by cut angle, distance and anything in the way
    let best = null;
    for (const t of targets(who)) for (const [px, pz] of AIMS) {
      const tpx = px - t.x, tpz = pz - t.z, d2 = Math.hypot(tpx, tpz), ux = tpx / d2, uz = tpz / d2;
      const gx = t.x - ux * BR * 2, gz = t.z - uz * BR * 2, cgx = gx - cueBall.x, cgz = gz - cueBall.z, d1 = Math.hypot(cgx, cgz);
      if (d1 < 0.05) continue; const dx = cgx / d1, dz = cgz / d1, cosCut = dx * ux + dz * uz; if (cosCut < 0.25) continue;
      let blocked = 0; for (const o of balls) { if (o.in || o === cueBall || o === t) continue; if (segDist(o.x, o.z, cueBall.x, cueBall.z, gx, gz) < BR * 1.95) blocked += 1; if (segDist(o.x, o.z, t.x, t.z, px, pz) < BR * 1.95) blocked += 0.7; }
      const score = cosCut * 1.3 - 0.42 * (d1 + d2) - blocked * 1.2;
      if (!best || score > best.score) best = { score, ang: Math.atan2(-dx, -dz), speed: clamp(Math.sqrt(2 * 1.15 * (d1 + d2 * 1.5)) + 0.6, 1.6, 6.3) };
    }
    return best;
  };
  const npcPlan = (who = 'npc') => {
    const sk = SKILL[st.opp]; let best = bestShot(who);
    if (!best) { const ts = targets(who), t = ts[Math.floor(Math.random() * ts.length)] || balls.find((b) => b.n && !b.in); const dx = t.x - cueBall.x, dz = t.z - cueBall.z; best = { ang: Math.atan2(-dx, -dz), speed: 2.4 }; } // nothing makes it: at least hit one of his
    best.ang += gauss() * sk.aim; best.speed *= 1 + gauss() * sk.pow; best.speed = clamp(best.speed, 1.2, 6.8);
    return best;
  };
  const npcPlace = (who = 'npc') => { // ball in hand: try spots around the table, keep the one with the best shot
    let bestP = null; for (let k = 0; k < 40; k++) { const x = (Math.random() * 2 - 1) * (HX - BR * 2), z = (Math.random() * 2 - 1) * (HZ - BR * 2); if (!free(x, z)) continue; cueBall.x = x; cueBall.z = z; const sh = bestShot(who); const sc = sh ? sh.score : -9; if (!bestP || sc > bestP.sc) bestP = { x, z, sc }; }
    if (bestP) { cueBall.x = bestP.x; cueBall.z = bestP.z; } else { cueBall.x = HEAD; cueBall.z = 0; }
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ----- turn handling -----
  const shoot = (ang, speed) => {
    const d = dirOf(ang); audio.sfx('cue', { v: Math.min(1, speed / 6), pos: { x: PX + cueBall.x, y: 0.95, z: PZ + cueBall.z }, ref: 3 }); if (st.shots === 0) st.breakNext = true; cueBall.vx = d.x * speed; cueBall.vz = d.z * speed; st.phase = 'rolling'; st.firstHit = null; st.pocketed = []; st.shots++; st.preLeft = { you: groupOf('you') ? left(groupOf('you')) : 7, npc: groupOf('npc') ? left(groupOf('npc')) : 7 }; st.stroke = 0.25; st.strokeAng = ang; st.strokePull = 0.0;
    aimLine.visible = false; ghost.visible = false;
  };
  const say = (t, ms = 2200) => { st.msg = t.charAt(0).toUpperCase() + t.slice(1); st.msgT = ms / 1000; };
  const name = (who) => (who === 'you' ? 'You' : SKILL[st.opp].name), other = (who) => (who === 'you' ? 'npc' : 'you');
  const GN = { solids: 'solids', stripes: 'stripes' };
  const finishShot = () => {
    const who = st.turn, opp = other(who), P = st.pocketed, brk = st.shots === 1, g0 = groupOf(who);
    const scratch = P.includes(0), sunk8 = P.includes(8), legal = legalFirst(who, st.firstHit);
    const foul = scratch || !legal, why = scratch ? 'Scratch' : st.firstHit === null ? 'No ball hit' : !legal ? `Wrong ball first (${st.firstHit === 8 ? 'the 8' : st.firstHit <= 7 ? 'a solid' : 'a stripe'})` : '';
    if (scratch) { cueBall.in = false; cueBall.dropT = 0; cueBall.vx = cueBall.vz = 0; cueBall.x = HEAD; cueBall.z = 0; }
    if (sunk8) {
      if (brk) { const e = byN(8); e.in = false; e.dropT = 0; e.x = FOOT; e.z = 0; while (!free(e.x, e.z) && e.x < HX - BR) e.x += BR * 2.1; say('The 8 dropped on the break - it goes back on the spot.'); } // re-spotted
      else { const cleared = g0 && st.preLeft[who] === 0; const win = cleared && !foul; return end(win ? who : opp, win ? `${name(who)} sank the 8-ball!` : !cleared ? `${name(who)} sank the 8 too early!` : `${name(who)} sank the 8 on a foul (${why.toLowerCase()})!`); }
    }
    // the table opens: the first legal ball pocketed (not on the break) decides the groups
    if (!g0 && !foul && !brk) { const first = P.find((n) => n !== 0 && n !== 8); if (first) { const k = KIND(first); st.group[who] = k; st.group[opp] = k === 'solids' ? 'stripes' : 'solids'; } }
    const g = groupOf(who), mine = P.filter((n) => n !== 0 && n !== 8 && (!g || KIND(n) === g)).length;
    if (foul) { st.turn = opp; st.inHand = true; say(`${why}! ${opp === 'you' ? 'Ball in hand - move the cue ball, click to place it.' : SKILL[st.opp].name + ' has ball in hand.'}`, 3200); }
    else if (mine > 0) { st.turn = who; say(!g0 && g ? `${name(who)} ${who === 'you' ? 'are' : 'is'} ${GN[g]}. Shoot again.` : who === 'you' ? `Nice! ${mine} down - shoot again.` : `${SKILL[st.opp].name} sinks one and keeps shooting.`); }
    else { st.turn = opp; say(brk ? 'Nothing down on the break. Turn passes - the table is open.' : 'No luck. Turn passes.'); }
    if (st.shots >= 120) { const y = groupOf('you') ? left(groupOf('you')) : 7, n = groupOf('npc') ? left(groupOf('npc')) : 7; return end(y <= n ? 'you' : 'npc', 'Time is up - judged on balls left.'); }
    beginTurn();
  };
  const autoAim = () => { const pool = targets('you'); const t = pool.sort((a, b) => Math.hypot(a.x - cueBall.x, a.z - cueBall.z) - Math.hypot(b.x - cueBall.x, b.z - cueBall.z))[0]; if (t) st.aim = Math.atan2(-(t.x - cueBall.x), -(t.z - cueBall.z)); me.yaw = st.aim; st.lastLy = me.yaw; };
  const beginTurn = () => { st.t = 0; st.power = 0; st.cdir = 1; st.charging = false; hud.power(null);
    if (st.turn === 'you') { st.phase = st.inHand ? 'place' : 'aim'; if (!st.inHand) autoAim(); } else { st.phase = 'npcThink'; if (st.inHand) npcPlace(); }
    st.inHand = false; game.hudUpdate(); };
  const end = (winner, why) => {
    st.phase = 'over'; st.winner = winner; st.t = 0; cue.visible = false; aimLine.visible = false; ghost.visible = false;
    const won = winner === 'you'; st.endMsg = won ? `🏆 YOU WIN! ${why}` : `💀 You lose. ${why}`;
    if ((st.stake || st.dare) && BK.send) BK.send({ type: 'poolEnd', won });
    st.stake = 0; st.dare = false;
  };

  // ----- game interface (matches games.js) -----
  const spot = { x: PX - 1.0, z: PZ + 1.35, yaw: Math.PI, pitch: -0.4 };
  const game = {
    name: 'pool', spot, limits: { yaw: 99, pitch: 0.1 }, rateName: 'pool',
    enter(ch) {
      st = { opp: ch && ch.opp ? ch.opp : 'rookie', stake: ch && ch.stake ? ch.stake : 0, turn: 'you', phase: 'aim', power: 0, cdir: 1, charging: false, aim: -Math.PI / 2, msg: '', msgT: 0, shots: 0, firstHit: null, pocketed: [], t: 0, lastLy: undefined, endMsg: '', group: { you: null, npc: null }, preLeft: { you: 7, npc: 7 }, inHand: false };
      rack(); sync(); cue.visible = true; st.aim = Math.atan2(-(FOOT - cueBall.x), -(0 - cueBall.z)); me.yaw = st.aim; st.lastLy = me.yaw; // the break: lined up on the head ball group.visible = true; this.hudUpdate();
      st.dare = !!(ch && ch.dare); say(`You vs ${SKILL[st.opp].name}. ${st.dare ? 'The permit fee rides on this one. ' : st.stake ? '$' + st.stake + ' on the line. ' : 'Practice - no wager. '}You break!`, 3600);
    },
    exit() { if (st && (st.stake || st.dare) && st.phase !== 'over') { BK.send({ type: 'poolEnd', won: false }); } cue.visible = false; aimLine.visible = false; ghost.visible = false; st = null; hud.msg(''); hud.power(null); },
    reset() {}, hudUpdate() { if (!st) return; hud.title(''); const gy = groupOf('you'), gn = groupOf('npc'), side = (g) => (g ? `${GN[g]} · ${left(g) ? left(g) + ' left' : 'on the 8'}` : 'open table');
      hud.sub(`🎱 You: ${side(gy)}  ·  ${SKILL[st.opp].name}: ${side(gn)}${st.turn === 'you' ? '  ·  YOUR SHOT' : ''}${st.dare ? ' · the permit fee' : st.stake ? ' · $' + st.stake : ' · practice'}`);
      hud.help(st.phase === 'over' ? 'Press E to leave' : st.phase === 'place' ? 'Ball in hand: move the mouse to put the cue ball anywhere, click to place it · E to leave' : 'Mouse = aim · HOLD click, release to shoot (the meter swings) · E to leave (forfeits a wager)'); },
    move(dx, dy) { if (!st || st.phase !== 'place') return false; const x = clamp(cueBall.x + dx * 0.0022, -HX + BR, HX - BR), z = clamp(cueBall.z + dy * 0.0022, -HZ + BR, HZ - BR); cueBall.x = x; cueBall.z = z; return true; },
    camOffset() { return { y: 0, p: 0 }; },
    look() { if (!st) return; if (st.lastLy !== undefined && st.phase === 'aim') { const d = me.yaw - st.lastLy; st.aim += d * 0.28; } me.yaw = st.aim; st.lastLy = me.yaw; me.pitch = spot.pitch; },
    down() { if (st && st.phase === 'place') { if (free(cueBall.x, cueBall.z)) { st.phase = 'aim'; autoAim(); this.hudUpdate(); audio.sfx('chip'); } else say('Something\'s in the way - move it a little.', 1200); return; } if (st && st.phase === 'aim' && st.turn === 'you') { st.charging = true; st.power = 0; st.cdir = 1; } },
    up() { if (st && st.charging && st.phase === 'aim') { st.charging = false; hud.power(null); const sp = 0.9 + st.power * 6.2; shoot(st.aim, sp); } },
    step(dt) {
      if (!st) return; st.t += dt; if (st.msgT > 0) { st.msgT -= dt; if (st.msgT <= 0) { st.msg = ''; hud.msg(''); } else hud.msg(st.msg); }
      if (st.phase === 'aim' && st.charging) { st.power += st.cdir * dt / 0.9; if (st.power >= 1) { st.power = 1; st.cdir = -1; } if (st.power <= 0) { st.power = 0; st.cdir = 1; } hud.power(st.power, null); }
      if (st.phase === 'npcThink' && st.t > SKILL[st.opp].think) { st.plan = npcPlan(); st.phase = 'npcAim'; st.t = 0; }
      if (st.phase === 'npcAim') { st.aim = st.plan.ang; if (st.t > 0.7) { shoot(st.plan.ang, st.plan.speed); } }
      if (st.phase === 'rolling') { for (let k = 0; k < 2; k++) physics(dt / 2); if (st.stroke > 0) st.stroke -= dt; if (!moving()) { st.settle = (st.settle || 0) + dt; if (st.settle > 0.4) { st.settle = 0; finishShot(); this.hudUpdate(); } } else st.settle = 0; }
      if (st.phase === 'over') { st.t += 0; hud.msg(st.endMsg); }
      if (st.phase === 'place') { ghost.visible = true; ghost.position.set(PX + cueBall.x, Y + BR, PZ + cueBall.z); ghost.material.color.set(free(cueBall.x, cueBall.z) ? 0x7dff6a : 0xff4d5e); cue.visible = false; aimLine.visible = false; } else ghost.material.color.set(0xffffff);
      for (const b of balls) if (b.in) b.dropT += 0; // handled in physics
      sync();
      // cue + aim line
      const showAim = st.phase === 'aim' || st.phase === 'npcAim';
      if (showAim && !cueBall.in) {
        const d = dirOf(st.aim), pull = st.phase === 'aim' ? 0.06 + st.power * 0.22 : 0.08 + Math.sin(st.t * 10) * 0.05;
        cue.visible = true; cue.position.set(PX + cueBall.x - d.x * (BR + 0.01 + pull), Y + BR + 0.012, PZ + cueBall.z - d.z * (BR + 0.01 + pull)); cue.rotation.set(0.07, st.aim, 0);
        // cue's long axis is +z local; rotate so it points away from the shot direction
        cue.rotation.y = st.aim;
        if (st.phase === 'aim') { const tr = trace(cueBall.x, cueBall.z, d.x, d.z), ex = cueBall.x + d.x * tr.t, ez = cueBall.z + d.z * tr.t; const pos = aimLine.geometry.attributes.position; pos.setXYZ(0, PX + cueBall.x, Y + BR, PZ + cueBall.z); pos.setXYZ(1, PX + ex, Y + BR, PZ + ez); let ex2 = ex, ez2 = ez;
          if (tr.hit) { const hx = tr.hit.x - ex, hz = tr.hit.z - ez, hl = Math.hypot(hx, hz) || 1; ex2 = tr.hit.x + (hx / hl) * 0.25; ez2 = tr.hit.z + (hz / hl) * 0.25; pos.setXYZ(2, PX + tr.hit.x, Y + BR, PZ + tr.hit.z); pos.setXYZ(3, PX + ex2, Y + BR, PZ + ez2); ghost.visible = true; ghost.position.set(PX + ex, Y + BR, PZ + ez); }
          else { pos.setXYZ(2, 0, -5, 0); pos.setXYZ(3, 0, -5, 0); ghost.visible = false; }
          pos.needsUpdate = true; aimLine.visible = true; }
      } else if (st.phase === 'rolling' && st.stroke > 0) { const d = dirOf(st.strokeAng), k = 1 - st.stroke / 0.25; cue.visible = true; cue.position.set(PX + cueBall.x - d.x * (BR + 0.01 - k * 0.05), Y + BR + 0.012, PZ + cueBall.z - d.z * (BR + 0.01 - k * 0.05)); }
      else if (st.phase === 'rolling') cue.visible = false;
    },
    rig(cam) {
      if (!st) return;
      if (st.phase === 'aim' || st.phase === 'npcAim' && false) {
        const d = dirOf(st.aim), cx = PX + cueBall.x, cz = PZ + cueBall.z;
        cam.position.set(cx - d.x * 0.85, Y + 0.5, cz - d.z * 0.85); cam.lookAt(cx + d.x * 0.7, Y + 0.02, cz + d.z * 0.7);
      } else { cam.position.set(PX - 1.0, Y + 1.25, PZ + 1.2); cam.lookAt(PX + 0.1, Y, PZ); }
    },
  };
  game.poolReady = () => st;
  game._ai = { plan: npcPlan, place: npcPlace, shoot: (a, sp) => shoot(a, sp) }; // (the headless rules test drives 'you' with these)
  group.visible = true;
  // initial display rack so the table isn't empty
  rack(); sync();
  return game;
}
