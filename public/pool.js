import * as THREE from 'three';
import { canvasTex } from './textures.js';

// Simplified 8-ball vs an NPC. You: solids (4 balls). NPC: stripes (4 balls). Clear yours, then sink the 8.
// Top-down 2D physics on the felt of the table in bar.js (PX,PZ) = (3.4, 3.4).
const PX = 3.4, PZ = 3.4, Y = 0.92, BR = 0.04, HX = 1.3, HZ = 0.65, PR = 0.082;
const POCKETS = [[-HX, -HZ], [HX, -HZ], [-HX, HZ], [HX, HZ], [0, -HZ - 0.03], [0, HZ + 0.03]];
const COLORS = { 1: '#f2c230', 2: '#2a5ad8', 3: '#d82a2a', 4: '#7a2ab8', 8: '#101010', 9: '#f2c230', 10: '#2a5ad8', 11: '#d82a2a', 12: '#7a2ab8' };
const SKILL = { rookie: { aim: 0.06, pow: 0.2, name: 'the Rookie', think: 1.1 }, shark: { aim: 0.011, pow: 0.05, name: 'The Shark', think: 1.5 } };
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
  for (const n of [0, 1, 2, 3, 4, 8, 9, 10, 11, 12]) balls.push({ n, x: 0, z: 0, vx: 0, vz: 0, in: false, mesh: mk(n), owner: n === 0 ? null : n === 8 ? 'eight' : n <= 4 ? 'you' : 'npc', dropT: 0 });
  const cue = new THREE.Group(); { const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.5, 10), new THREE.MeshStandardMaterial({ color: 0xd8b27a, roughness: 0.5 })); stick.rotation.x = Math.PI / 2; stick.position.z = 0.75; cue.add(stick); const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.015, 8), new THREE.MeshStandardMaterial({ color: 0x3a7ad8 })); tip.rotation.x = Math.PI / 2; cue.add(tip); const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a22 })); grip.rotation.x = Math.PI / 2; grip.position.z = 1.4; cue.add(grip); }
  cue.visible = false; scene.add(cue);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([V(), V(), V(), V()]);
  const aimLine = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })); aimLine.frustumCulled = false; aimLine.visible = false; scene.add(aimLine);
  const ghost = new THREE.Mesh(new THREE.SphereGeometry(BR, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.8 })); ghost.visible = false; scene.add(ghost);
  stations.push({ x: PX - 1.9, z: PZ, r: 1.6, text: 'E - Play pool (bet vs NPC)', act: () => BK.openPool && BK.openPool() });

  // ----- game state -----
  let st = null; // {opp, stake, turn, phase, power, cdir, charging, aim, msg, msgT, shots, firstHit, pocketed[], scratched, t, npcPlan, winner, practice}
  const cueBall = balls[0];
  const byN = (n) => balls.find((q) => q.n === n);
  const rack = () => {
    const hx = 0.5, cols = [1, 2, 3, 2, 1], order = [1, 2, 3, 4, 9, 10, 11, 12].sort(() => Math.random() - 0.5); order.splice(4, 0, 8); // 8-ball dead center
    let k = 0;
    cols.forEach((cnt, c) => { for (let r = 0; r < cnt; r++) { const b = byN(order[k++]); b.x = hx + c * (BR * 2 * 0.87); b.z = (r - (cnt - 1) / 2) * (BR * 2 + 0.001); } });
    for (const b of balls) { b.vx = b.vz = 0; b.in = false; b.dropT = 0; }
    cueBall.x = -0.65; cueBall.z = 0;
  };
  const sync = () => { for (const b of balls) { b.mesh.visible = !(b.in && b.dropT > 0.6); const y = Y + BR - (b.in ? Math.min(b.dropT, 0.6) * 0.3 : 0); b.mesh.position.set(PX + b.x, y, PZ + b.z); } };
  const moving = () => balls.some((b) => !b.in && (Math.abs(b.vx) + Math.abs(b.vz) > 0.015));
  const remaining = (owner) => balls.filter((b) => b.owner === owner && !b.in).length;
  const dirOf = (a) => ({ x: -Math.sin(a), z: -Math.cos(a) });

  const physics = (dt) => {
    for (const b of balls) {
      if (b.in) { b.dropT += dt; continue; }
      b.x += b.vx * dt; b.z += b.vz * dt;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) { const ns = Math.max(0, sp - (0.75 + 0.32 * sp) * dt); b.vx *= ns / sp; b.vz *= ns / sp; if (ns < 0.012) { b.vx = b.vz = 0; } }
      // pockets
      for (const [px, pz] of POCKETS) if (Math.hypot(b.x - px, b.z - pz) < PR) { b.in = true; b.dropT = 0; b.vx = b.vz = 0; st.pocketed.push(b.n); break; }
      if (b.in) continue;
      // cushions
      if (b.x < -HX + BR) { b.x = -HX + BR; b.vx = Math.abs(b.vx) * 0.78; } if (b.x > HX - BR) { b.x = HX - BR; b.vx = -Math.abs(b.vx) * 0.78; }
      if (b.z < -HZ + BR) { b.z = -HZ + BR; b.vz = Math.abs(b.vz) * 0.78; } if (b.z > HZ - BR) { b.z = HZ - BR; b.vz = -Math.abs(b.vz) * 0.78; }
    }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j]; if (a.in || b.in) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, md = BR * 2;
      if (d2 < md * md && d2 > 1e-9) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        const ov = (md - d) / 2; a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
        if (rel > 0) { const j2 = rel * 0.98; a.vx -= j2 * nx; a.vz -= j2 * nz; b.vx += j2 * nx; b.vz += j2 * nz; if (st.firstHit === null && (a.n === 0 || b.n === 0)) st.firstHit = a.n === 0 ? b.n : a.n; }
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
  const npcPlan = () => {
    const sk = SKILL[st.opp], own = remaining('npc') > 0 ? balls.filter((b) => b.owner === 'npc' && !b.in) : balls.filter((b) => b.owner === 'eight' && !b.in);
    let best = null;
    const segDist = (px, pz, ax, az, bx, bz) => { const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz || 1e-9; let t = ((px - ax) * abx + (pz - az) * abz) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + abx * t), pz - (az + abz * t)); };
    for (const t of own) for (const [px, pz] of POCKETS) {
      const tpx = px - t.x, tpz = pz - t.z, d2 = Math.hypot(tpx, tpz), ux = tpx / d2, uz = tpz / d2;
      const gx = t.x - ux * BR * 2, gz = t.z - uz * BR * 2, cgx = gx - cueBall.x, cgz = gz - cueBall.z, d1 = Math.hypot(cgx, cgz);
      if (d1 < 0.05) continue; const dx = cgx / d1, dz = cgz / d1, cosCut = dx * ux + dz * uz; if (cosCut < 0.22) continue;
      let blocked = 0; for (const o of balls) { if (o.in || o === cueBall || o === t) continue; if (segDist(o.x, o.z, cueBall.x, cueBall.z, gx, gz) < BR * 1.9) blocked += 1; if (segDist(o.x, o.z, t.x, t.z, px, pz) < BR * 1.9) blocked += 0.6; }
      const score = cosCut * 1.2 - 0.45 * (d1 + d2) - blocked * 1.1;
      if (!best || score > best.score) best = { score, ang: Math.atan2(-dx, -dz), speed: clamp(Math.sqrt(2 * 1.15 * (d1 + d2 * 1.5)) + 0.6, 1.6, 6.3) };
    }
    if (!best) { const t = own[Math.floor(Math.random() * own.length)] || balls.find((b) => b.n && !b.in); const dx = t.x - cueBall.x, dz = t.z - cueBall.z; best = { ang: Math.atan2(-dx, -dz), speed: 2.4 }; }
    best.ang += gauss() * sk.aim; best.speed *= 1 + gauss() * sk.pow; best.speed = clamp(best.speed, 1.2, 6.8);
    return best;
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ----- turn handling -----
  const shoot = (ang, speed) => {
    const d = dirOf(ang); cueBall.vx = d.x * speed; cueBall.vz = d.z * speed; st.phase = 'rolling'; st.firstHit = null; st.pocketed = []; st.shots++; st.stroke = 0.25; st.strokeAng = ang; st.strokePull = 0.0;
    aimLine.visible = false; ghost.visible = false;
  };
  const say = (t, ms = 2200) => { st.msg = t; st.msgT = ms / 1000; };
  const finishShot = () => {
    const who = st.turn, mine = who === 'you' ? 'you' : 'npc', other = who === 'you' ? 'npc' : 'you', P = st.pocketed;
    const scratch = P.includes(0), pocketed8 = P.includes(8), ownBefore = balls.filter((b) => b.owner === mine && (!b.in || P.includes(b.n))).length;
    const ownLeft = remaining(mine);
    if (scratch) { cueBall.in = false; cueBall.x = -0.65; cueBall.z = 0; cueBall.vx = cueBall.vz = 0; cueBall.dropT = 0; for (const b of balls) if (b !== cueBall && !b.in && Math.hypot(b.x - cueBall.x, b.z - cueBall.z) < BR * 2.2) b.x += BR * 2.5; }
    if (pocketed8) { const win = ownLeft === 0 && !scratch; return end(win ? who : (who === 'you' ? 'npc' : 'you'), win ? `${who === 'you' ? 'You' : SKILL[st.opp].name} sank the 8-ball!` : `${who === 'you' ? 'You' : SKILL[st.opp].name} sank the 8 too early!`); }
    const ownPocketed = P.filter((n) => byN(n).owner === mine).length, oppPocketed = P.filter((n) => byN(n).owner === other).length;
    if (!scratch && ownPocketed > 0 && st.firstHit !== null) { say(who === 'you' ? `Nice! ${ownPocketed} down - shoot again.` : `${SKILL[st.opp].name} sinks one and keeps shooting.`); st.turn = who; }
    else { st.turn = who === 'you' ? 'npc' : 'you'; say(scratch ? 'Scratch! Turn passes.' : st.firstHit === null ? 'Missed everything. Turn passes.' : oppPocketed ? 'You helped them. Turn passes.' : 'No luck. Turn passes.'); }
    if (st.shots >= 45) { const y = remaining('you'), n = remaining('npc'); return end(y <= n ? 'you' : 'npc', 'Time is up - judged on balls left.'); }
    beginTurn();
  };
  const autoAim = () => { const pool = balls.filter((b) => b.n && !b.in && (remaining('you') ? b.owner === 'you' : b.owner === 'eight')); const t = pool.sort((a, b) => Math.hypot(a.x - cueBall.x, a.z - cueBall.z) - Math.hypot(b.x - cueBall.x, b.z - cueBall.z))[0]; if (t) st.aim = Math.atan2(-(t.x - cueBall.x), -(t.z - cueBall.z)); me.yaw = st.aim; st.lastLy = me.yaw; };
  const beginTurn = () => { st.phase = st.turn === 'you' ? 'aim' : 'npcThink'; st.t = 0; st.power = 0; st.cdir = 1; st.charging = false; hud.power(null); if (st.turn === 'you') autoAim(); };
  const end = (winner, why) => {
    st.phase = 'over'; st.winner = winner; st.t = 0; cue.visible = false; aimLine.visible = false; ghost.visible = false;
    const won = winner === 'you'; st.endMsg = won ? `🏆 YOU WIN! ${why}` : `💀 You lose. ${why}`;
    if (st.stake && BK.send) BK.send({ type: 'poolEnd', won });
    st.stake = 0;
  };

  // ----- game interface (matches games.js) -----
  const spot = { x: PX - 1.0, z: PZ + 1.35, yaw: Math.PI, pitch: -0.4 };
  const game = {
    name: 'pool', spot, limits: { yaw: 99, pitch: 0.1 }, rateName: 'pool',
    enter(ch) {
      st = { opp: ch && ch.opp ? ch.opp : 'rookie', stake: ch && ch.stake ? ch.stake : 0, turn: 'you', phase: 'aim', power: 0, cdir: 1, charging: false, aim: -Math.PI / 2, msg: '', msgT: 0, shots: 0, firstHit: null, pocketed: [], t: 0, lastLy: undefined, endMsg: '' };
      rack(); sync(); cue.visible = true; me.yaw = st.aim; st.lastLy = me.yaw; group.visible = true; this.hudUpdate();
      say(`You vs ${SKILL[st.opp].name}. ${st.stake ? '$' + st.stake + ' on the line. ' : 'Practice - no wager. '}You break!`, 3600);
    },
    exit() { if (st && st.stake && st.phase !== 'over') { BK.send({ type: 'poolEnd', won: false }); } cue.visible = false; aimLine.visible = false; ghost.visible = false; st = null; hud.msg(''); hud.power(null); },
    reset() {}, hudUpdate() { if (!st) return; hud.title(''); hud.sub(`🎱 You (solids) ${4 - remaining('you')}/4  ·  ${SKILL[st.opp].name} (stripes) ${4 - remaining('npc')}/4${st.stake ? ' · $' + st.stake : ' · practice'}`); hud.help(st.phase === 'over' ? 'Press E to leave' : 'Mouse = aim · HOLD click, release to shoot (the meter swings) · E to leave (forfeits a wager)'); },
    camOffset() { return { y: 0, p: 0 }; },
    look() { if (!st) return; if (st.lastLy !== undefined && st.phase === 'aim') { const d = me.yaw - st.lastLy; st.aim += d * 0.28; } me.yaw = st.aim; st.lastLy = me.yaw; me.pitch = spot.pitch; },
    down() { if (st && st.phase === 'aim' && st.turn === 'you') { st.charging = true; st.power = 0; st.cdir = 1; } },
    up() { if (st && st.charging && st.phase === 'aim') { st.charging = false; hud.power(null); const sp = 0.9 + st.power * 6.2; shoot(st.aim, sp); } },
    step(dt) {
      if (!st) return; st.t += dt; if (st.msgT > 0) { st.msgT -= dt; if (st.msgT <= 0) { st.msg = ''; hud.msg(''); } else hud.msg(st.msg); }
      if (st.phase === 'aim' && st.charging) { st.power += st.cdir * dt / 0.9; if (st.power >= 1) { st.power = 1; st.cdir = -1; } if (st.power <= 0) { st.power = 0; st.cdir = 1; } hud.power(st.power, null); }
      if (st.phase === 'npcThink' && st.t > SKILL[st.opp].think) { st.plan = npcPlan(); st.phase = 'npcAim'; st.t = 0; }
      if (st.phase === 'npcAim') { st.aim = st.plan.ang; if (st.t > 0.7) { shoot(st.plan.ang, st.plan.speed); } }
      if (st.phase === 'rolling') { for (let k = 0; k < 2; k++) physics(dt / 2); if (st.stroke > 0) st.stroke -= dt; if (!moving()) { st.settle = (st.settle || 0) + dt; if (st.settle > 0.4) { st.settle = 0; finishShot(); this.hudUpdate(); } } else st.settle = 0; }
      if (st.phase === 'over') { st.t += 0; hud.msg(st.endMsg); }
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
      } else { cam.position.set(PX, Y + 1.55, PZ + 1.35); cam.lookAt(PX, Y, PZ + 0.05); }
    },
  };
  game.poolReady = () => st;
  group.visible = true;
  // initial display rack so the table isn't empty
  rack(); sync();
  return game;
}
