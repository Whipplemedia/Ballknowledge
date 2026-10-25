import * as THREE from 'three';
import { makeHand } from './people.js';
import { canvasTex, neon } from './textures.js';
import { createPool } from './pool.js';
import { hasProp, prop } from './props.js';

// In-world arcade: darts, bowling, cornhole. Physical throwing in first person.
// Scores are reported to the server as {type:'mg', game, pts}; the server caps and pays out.
export function createGames({ scene, camera, BK, me, keys, helpers, stations, obstacles }) {
  const { box, cyl, label, mat } = helpers;
  const G = 9.8, STEP = 1 / 120, COOLDOWN = 6;
  scene.add(camera);
  const hand = new THREE.Group(); camera.add(hand);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
  const dr = () => 1 + (BK.drunk || 0) / 55; // drunk makes everything shakier
  const rate = { darts: 3, bowling: 25, cornhole: 35 };
  let challenge = null, resultMsg = '';
  const OPP_NAME = { rookie: 'the Rookie', regular: 'the Regular', shark: 'The Shark' };
  const tgt = () => (challenge ? ` · BEAT ${challenge.target} (${OPP_NAME[challenge.opp]})` : ' · practice');
  const verdict = (ch, score, unit = 'pts') => !ch ? `${score} ${unit} - practice round, no payout` : score > ch.target ? `🏆 ${score} beats ${ch.target}! You took ${OPP_NAME[ch.opp]} down` : score === ch.target ? `Tie at ${score} - stake returned` : `${OPP_NAME[ch.opp]} wins ${ch.target} to ${score}`;
  const kick = { v: 0 }; // throw animation for the first-person hands
  const sleeve = 0x6a6a72;
  const scoreTex = (w, h, draw) => { const o = canvasTex(w, h, draw); o.redraw = (fn) => { fn(o.g, w, h); o.t.needsUpdate = true; }; return o; };

  // ---------- HUD ----------
  const hudEl = document.createElement('div'); hudEl.id = 'playhud'; hudEl.className = 'hidden';
  hudEl.innerHTML = '<div class="ph-title"></div><div class="ph-sub"></div><div class="ph-power hidden"><div class="ph-zone"></div><div class="ph-fill"></div></div><div class="ph-msg"></div><div class="ph-help"></div>';
  document.body.appendChild(hudEl);
  const q = (s) => hudEl.querySelector(s);
  const hud = {
    title: (t) => (q('.ph-title').textContent = t), sub: (t) => (q('.ph-sub').textContent = t),
    msg: (t) => (q('.ph-msg').textContent = t), help: (t) => (q('.ph-help').textContent = t),
    power(p, zone) { const el = q('.ph-power'); el.classList.toggle('hidden', p === null); if (p !== null) q('.ph-fill').style.width = p * 100 + '%'; const z = q('.ph-zone'); z.style.display = zone ? 'block' : 'none'; if (zone) { z.style.left = zone[0] * 100 + '%'; z.style.width = (zone[1] - zone[0]) * 100 + '%'; } },
    pop(t, good = true) { const d = document.createElement('div'); d.className = 'ph-pop ' + (good ? 'good' : 'bad'); d.textContent = t; hudEl.appendChild(d); setTimeout(() => d.remove(), 1400); },
  };

  // ---------- shared pieces ----------
  const track = []; // meshes to clear between rounds
  const addTracked = (o) => { track.push(o); scene.add(o); return o; };
  const clearTracked = () => { while (track.length) scene.remove(track.pop()); };

  // ====================================================== DARTS
  const darts = (() => {
    const BX = -10, BY = 1.7, BZ = -7.8, R = 0.45;
    const NUMS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    box(1.9, 1.7, 0.1, 0x3a2412, BX, BY, BZ - 0.06); box(1.7, 1.5, 0.04, 0x2a190c, BX, BY, BZ - 0.04); // wooden cabinet
    const boardTex = canvasTex(1024, 1024, (c) => {
      const C = 512, RP = 512 / 1.16, A = -Math.PI / 2;
      c.fillStyle = '#101012'; c.beginPath(); c.arc(C, C, 512, 0, 7); c.fill();
      const ring = (f0, f1, i, col) => { const a0 = A + i * Math.PI / 10 - Math.PI / 20, a1 = a0 + Math.PI / 10; c.fillStyle = col; c.beginPath(); c.arc(C, C, f1 * RP, a0, a1); c.arc(C, C, f0 * RP, a1, a0, true); c.closePath(); c.fill(); };
      for (let i = 0; i < 20; i++) { const single = i % 2 ? '#e8d8a8' : '#16161a', mult = i % 2 ? '#1d7a3a' : '#c0182a'; ring(0.095, 0.58, i, single); ring(0.58, 0.66, i, mult); ring(0.66, 0.93, i, single); ring(0.93, 1.0, i, mult); }
      c.fillStyle = '#1d7a3a'; c.beginPath(); c.arc(C, C, 0.095 * RP, 0, 7); c.fill(); c.fillStyle = '#c0182a'; c.beginPath(); c.arc(C, C, 0.04 * RP, 0, 7); c.fill();
      c.strokeStyle = '#b8b8c0'; c.lineWidth = 2; for (let i = 0; i < 20; i++) { const a = A + i * Math.PI / 10 - Math.PI / 20; c.beginPath(); c.moveTo(C + Math.cos(a) * 0.095 * RP, C + Math.sin(a) * 0.095 * RP); c.lineTo(C + Math.cos(a) * RP, C + Math.sin(a) * RP); c.stroke(); }
      for (const f of [0.04, 0.095, 0.58, 0.66, 0.93, 1.0]) { c.beginPath(); c.arc(C, C, f * RP, 0, 7); c.stroke(); }
      c.fillStyle = '#f0e8d0'; c.font = '800 54px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; NUMS.forEach((n, i) => { const a = A + i * Math.PI / 10; c.fillText(String(n), C + Math.cos(a) * RP * 1.075, C + Math.sin(a) * RP * 1.075); });
    }).t;
    const boardM = new THREE.Mesh(new THREE.CircleGeometry(R * 1.16, 64), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.8 })); boardM.position.set(BX, BY, BZ + 0.012); scene.add(boardM);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.25, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x1b3a2a, side: THREE.DoubleSide })); shade.position.set(BX, BY + 0.95, BZ + 0.45); scene.add(shade);
    const sbd = scoreTex(256, 180, () => {});
    const sbPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshStandardMaterial({ map: sbd.t, roughness: 1 })); sbPlane.position.set(BX + 1.45, BY + 0.2, BZ + 0.03); scene.add(sbPlane);
    box(1.12, 0.82, 0.05, 0x3a2412, BX + 1.45, BY + 0.2, BZ - 0.01);
    const drawSb = (left) => sbd.redraw((c, w, h) => { c.fillStyle = '#1b2423'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8ece4'; c.font = '700 26px "Segoe Print","Comic Sans MS",cursive'; c.textAlign = 'left';
      [['PLAYER 1', left], ['PLAYER 2', 301], ['PLAYER 3', 278]].forEach(([n, v], i) => { c.fillStyle = i === 0 ? '#ffe98a' : '#e8ece4'; c.textAlign = 'left'; c.fillText(n, 12, 52 + i * 52); c.textAlign = 'right'; c.fillText(String(v), w - 12, 52 + i * 52); }); });
    drawSb(301);
    const spotL = new THREE.PointLight(0xfff4e0, 9, 7); spotL.position.set(BX, BY + 0.9, BZ + 1.6); scene.add(spotL);
    const l = label('🎯 DARTS'); l.position.set(BX, 3.1, BZ + 0.3); scene.add(l);
    const spot = { x: -10, z: -5.1, yaw: 0, pitch: 0.02 };
    stations.push({ x: spot.x, z: spot.z, r: 1.6, text: 'E - Darts (challenge board)', act: () => BK.openChallenge('darts') });

    function dartMesh() {
      const g = new THREE.Group();
      const b = cyl(0.012, 0.012, 0.1, 0xc8c8d0, 0, 0, 0, 8, g); b.rotation.x = Math.PI / 2;
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 8), mat(0xeeeeee)); t.rotation.x = Math.PI / 2; t.position.z = 0.07; g.add(t);
      box(0.06, 0.004, 0.05, 0xff3040, 0, 0, -0.06, g); box(0.004, 0.06, 0.05, 0xff3040, 0, 0, -0.06, g);
      return g;
    }
    const held = dartMesh(); held.rotation.y = Math.PI; held.position.set(0.0, 0.035, -0.2);
    const hR = makeHand({ sleeve }); hR.add(held); hR.rotation.set(0.25, -0.18, 0); const hBaseZ = -0.34; hR.position.set(0.2, -0.24, hBaseZ);
    const NUM_TXT = (n, r) => n;

    let thrown, score, flying, state, fx, since;
    function scoreAt(dx, dy, r) { if (r > 1) return { pts: 0, txt: 'MISS' }; if (r <= 0.04) return { pts: 50, txt: 'BULLSEYE! +50' }; if (r <= 0.095) return { pts: 25, txt: 'OUTER BULL +25' }; const th = Math.atan2(dx, dy), idx = Math.floor((((th + Math.PI / 20) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 10)), n = NUMS[idx % 20]; if (r >= 0.93) return { pts: n * 2, txt: `DOUBLE ${n}  +${n * 2}` }; if (r >= 0.58 && r <= 0.66) return { pts: n * 3, txt: `TRIPLE ${n}  +${n * 3}` }; return { pts: n, txt: `${n}` }; }
    return {
      name: 'darts', spot, limits: { yaw: 0.55, pitch: 0.45 }, rateName: 'darts',
      enter() { hand.add(hR); this.reset(); },
      exit() { hand.remove(hR); clearTracked(); flying = null; },
      handAnim(k) { hR.position.z = hBaseZ - k * 0.2; hR.rotation.x = 0.25 - k * 0.5; },
      reset() { clearTracked(); thrown = 0; score = 0; flying = null; state = 'ready'; fx = null; since = 0; held.visible = true; hud.power(null); drawSb(301); this.hudUpdate(); },
      hudUpdate() { hud.title(''); hud.sub(`Dart ${Math.min(3, thrown + 1)}/3 · ${score} pts${tgt()}`); hud.help('Your hand shakes more with every dart (and every drink). Click to throw. E to leave.'); },
      camOffset(now) { const t = now / 1000, A = 0.032 * dr() * (1 + thrown * 0.2); return { y: Math.sin(t * 2.9) * A + Math.sin(t * 6.1 + 1) * A * 0.45 + Math.sin(t * 0.8) * A * 0.7, p: Math.cos(t * 2.3) * A + Math.cos(t * 5.3) * A * 0.45 + Math.cos(t * 0.9 + 2) * A * 0.7 }; },
      down() {
        if (state !== 'ready' || flying) return;
        const d = V(0, 0, -1).applyQuaternion(camera.quaternion), P = camera.getWorldPosition(V());
        if (d.z > -0.05) return;
        const t = (BZ - P.z) / d.z, T = P.clone().add(d.clone().multiplyScalar(t)); const jit = 0.03 * dr(); T.x += gauss() * jit; T.y += gauss() * jit;
        const S = P.clone().add(V(0.14, -0.16, 0).applyQuaternion(camera.quaternion));
        const time = 0.3, v = T.clone().sub(S).multiplyScalar(1 / time); v.y += 0.5 * G * time;
        const m = dartMesh(); m.position.copy(S); addTracked(m);
        flying = { m, v, p: S.clone() }; thrown++; held.visible = thrown < 3; kick.v = 1; this.hudUpdate();
      },
      up() {},
      step(dt) {
        if (flying) {
          const f = flying, prev = f.p.clone(); f.p.addScaledVector(f.v, dt); f.v.y -= G * dt;
          f.m.position.copy(f.p); f.m.lookAt(f.p.clone().add(f.v));
          if (prev.z > BZ && f.p.z <= BZ) {
            const k = (prev.z - BZ) / (prev.z - f.p.z), hit = prev.clone().lerp(f.p, k);
            const dx = hit.x - BX, dy = hit.y - BY; let r = Math.hypot(dx, dy) / R; if ([0.04, 0.095, 0.58, 0.66, 0.93, 1].some((e) => Math.abs(r - e) < 0.012) && Math.random() < 0.4) r += 0.025; const res = scoreAt(dx, dy, r), pts = res.pts;
            f.m.position.set(hit.x, hit.y, BZ + 0.03); score += pts; flying = null; drawSb(Math.max(0, 301 - score));
            hud.pop(pts ? res.txt : 'MISS', !!pts);
            if (thrown >= 3) this.finish(); else this.hudUpdate();
          } else if (f.p.y < 0.05 || f.p.z < -8) { flying = null; hud.pop('MISS', false); if (thrown >= 3) this.finish(); else this.hudUpdate(); }
        }
        if (state === 'done') { since += dt; this.cool(); }
      },
      finish() { state = 'done'; since = 0; const ch = submit('darts', score); resultMsg = verdict(ch, score); this.hudUpdate(); },
      cool() { const left = Math.ceil(COOLDOWN - since); hud.msg(`${resultMsg}. Practice resets in ${Math.max(0, left)}s`); if (since >= COOLDOWN) { hud.msg(''); this.reset(); } },
    };
  })();

  // ====================================================== BOWLING
  const bowling = (() => {
    const X0 = -10.6, LANE_Z0 = 6.6, PIT = -1.35, Y = 0.2, HEAD = -0.2, ROWH = 0.26, GAP = 0.3, BR = 0.11, PR = 0.07;
    box(1.2, 0.2, LANE_Z0 - PIT, 0xc99a5a, X0, 0.1, (LANE_Z0 + PIT) / 2);
    box(0.22, 0.12, LANE_Z0 - PIT, 0x1a1a22, X0 - 0.71, 0.06, (LANE_Z0 + PIT) / 2); box(0.22, 0.12, LANE_Z0 - PIT, 0x1a1a22, X0 + 0.71, 0.06, (LANE_Z0 + PIT) / 2);
    box(2.4, 1.2, 0.2, 0x111118, X0, 0.6, PIT - 0.1); box(0.04, 0.01, 1.2, 0x000, X0, Y + 0.001, 6.0).rotation.y = Math.PI / 2;
    for (let i = 0; i < 7; i++) box(0.05, 0.005, 0.05, 0x553311, X0 + (i - 3) * 0.15, Y + 0.002, 5.2);
    const l = label('🎳 BOWLING'); l.position.set(X0, 2.4, 2.5); scene.add(l);
    const mon = scoreTex(512, 200, () => {}); const frames = [[], []];
    const drawMon = () => mon.redraw((c, w, h) => { c.fillStyle = '#070d1c'; c.fillRect(0, 0, w, h); c.fillStyle = '#4da3ff'; c.font = '900 30px system-ui'; c.textAlign = 'left'; c.fillText('YOU', 18, 40);
      [0, 1].forEach((i) => { const x = 130 + i * 190; c.strokeStyle = '#2a3a66'; c.lineWidth = 3; c.strokeRect(x, 14, 170, 170); c.fillStyle = '#e8ecff'; c.font = '900 34px system-ui'; c.textAlign = 'center'; c.fillText(String(i + 1), x + 85, 52); c.font = '900 52px system-ui'; c.fillStyle = '#ffc83d'; const fr = frames[i]; c.fillText(fr.length ? fr.join(' ') : '', x + 85, 130); }); });
    drawMon(); const monMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.78), new THREE.MeshBasicMaterial({ map: mon.t, toneMapped: false })); monMesh.position.set(X0, 2.35, PIT + 0.18); scene.add(monMesh); box(2.15, 0.93, 0.1, 0x0a0a0c, X0, 2.35, PIT + 0.1);
    { const t = neon('BOWL', '#ff3a4a', { w: 512, h: 192, size: 120 }).t; const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false })); m.position.set(X0 + 0.15, 3.05, PIT + 0.2); scene.add(m); }
    { const lt = new THREE.PointLight(0xfff0d0, 14, 7); lt.position.set(X0, 2.7, 2.2); scene.add(lt); }
    if (hasProp('return')) { const r = prop('return', { w: 0.9, rotY: Math.PI / 2 }); r.position.set(X0 + 1.45, 0, 5.4); scene.add(r); obstacles.push({ x: X0 + 1.45, z: 5.4, r: 0.55 }); }
    const spot = { x: X0, z: 6.4, yaw: 0, pitch: -0.22 };
    stations.push({ x: X0, z: 6.4, r: 1.5, text: 'E - Bowling (challenge board)', act: () => BK.openChallenge('bowling') });

    const layout = [[0, 0], [-0.5, 1], [0.5, 1], [-1, 2], [0, 2], [1, 2], [-1.5, 3], [-0.5, 3], [0.5, 3], [1.5, 3]];
    const pins = layout.map(([c, r]) => {
      const g = new THREE.Group(); if (hasProp('pin')) g.add(prop('pin', { h: 0.385 })); else { cyl(0.04, 0.065, 0.3, 0xf4f4f4, 0, 0.15, 0, 10, g); const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0xf4f4f4)); h.position.y = 0.34; g.add(h); cyl(0.05, 0.05, 0.03, 0xd22, 0, 0.27, 0, 10, g); }
      scene.add(g); return { g, hx: X0 + c * GAP, hz: HEAD - r * ROWH, x: 0, z: 0, vx: 0, vz: 0, st: 'up', fall: 0, dx: 0, dz: -1 };
    });
    const ballM = hasProp('ball') ? prop('ball', { h: BR * 2, anchor: 'center' }) : new THREE.Mesh(new THREE.SphereGeometry(BR, 16, 12), mat(0x14223a, { roughness: 0.3 })); scene.add(ballM); ballM.visible = false;
    const held = hasProp('ball') ? prop('ball', { h: BR * 2, anchor: 'center', shadow: false }) : new THREE.Mesh(new THREE.SphereGeometry(BR, 20, 14), mat(0x1a2a6a, { roughness: 0.25, metalness: 0.3 })); const bowlG = new THREE.Group(); held.position.set(0, 0, 0); bowlG.add(held); bowlG.position.set(0.0, -0.3, -0.5);
    const hL = makeHand({ sleeve }), hRb = makeHand({ sleeve }); hL.position.set(-0.15, -0.32, -0.34); hL.rotation.set(0.1, 0.6, 0.5); hRb.position.set(0.15, -0.32, -0.34); hRb.rotation.set(0.1, -0.6, -0.5); const bowlHands = new THREE.Group(); bowlHands.add(bowlG, hL, hRb);

    let frame, ballNo, total, state, ball, charge, charging, wait, since, frameStart, cdir = 1;
    const resetPins = () => pins.forEach((p) => { p.x = p.hx; p.z = p.hz; p.vx = p.vz = 0; p.st = 'up'; p.fall = 0; p.g.visible = true; place(p); });
    const clearDown = () => pins.forEach((p) => { if (p.st !== 'up') p.g.visible = false; });
    const place = (p) => { p.g.position.set(p.x, Y + 0.06 * p.fall, p.z); p.g.quaternion.setFromAxisAngle(V(p.dz, 0, -p.dx).normalize(), p.fall * Math.PI / 2); };
    const downCount = () => pins.filter((p) => p.st !== 'up').length;
    const standing = () => pins.filter((p) => p.st === 'up' && p.g.visible);

    return {
      name: 'bowling', spot, limits: { yaw: 0.2, pitch: 0.35 }, rateName: 'bowling',
      enter() { hand.add(bowlHands); this.reset(); },
      handAnim(k) { bowlHands.position.z = -k * 0.25; bowlHands.position.y = -k * 0.1; },
      exit() { hand.remove(bowlHands); ballM.visible = false; resetPins(); pins.forEach((p) => (p.g.visible = true)); },
      reset() { resetPins(); frames[0] = []; frames[1] = []; drawMon(); frame = 0; ballNo = 0; total = 0; state = 'ready'; ball = null; charge = 0; charging = false; since = 0; frameStart = 0; bowlG.visible = true; ballM.visible = false; hud.power(null); this.hudUpdate(); },
      hudUpdate() { hud.title(''); hud.sub(`Frame ${Math.min(frame + 1, 2)}/2 · Ball ${ballNo + 1}/2 · ${total} pins${tgt()}`); hud.help('A/D slide · mouse aims · HOLD click - the meter swings, release in the zone · the lane hooks! · E to leave'); },
      camOffset(now) { const t = now / 1000, A = 0.007 * dr(); return { y: Math.sin(t * 1.9) * A, p: Math.cos(t * 1.5) * A }; },
      down() { if (state === 'ready') { charging = true; charge = 0; cdir = 1; } },
      up() {
        if (!charging || state !== 'ready') return; charging = false;
        const power = charge, inZone = power >= 0.5 && power <= 0.82, speed = 5 + power * 8, yawErr = gauss() * (inZone ? 0.012 : 0.03) * dr();
        const dirx = -Math.sin(me.yaw + yawErr), dirz = -Math.cos(me.yaw + yawErr);
        ball = { x: me.x, y: Y + BR, z: 6.0, vx: dirx * speed, vz: dirz * speed, spin: 0, hook: gauss() * (inZone ? 1.05 : 1.9) * dr() };
        ballM.visible = true; bowlG.visible = false; kick.v = 1; hud.power(null); state = 'rolling'; wait = 0; frameStart = downCount();
      },
      step(dt) {
        if (state === 'ready') {
          const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); me.x = Math.max(X0 - 0.5, Math.min(X0 + 0.5, me.x + s * 1.1 * dt));
          if (charging) { charge += cdir * dt / 0.85; if (charge >= 1) { charge = 1; cdir = -1; } if (charge <= 0) { charge = 0; cdir = 1; } hud.power(charge, [0.5, 0.82]); } else charge = 0;
        }
        if (state === 'rolling' || state === 'settle') {
          if (ball) {
            ball.vx += ball.hook * dt; ball.x += ball.vx * dt; ball.z += ball.vz * dt; ball.spin += dt * 20;
            const off = Math.abs(ball.x - X0); ball.y += ((off > 0.62 ? 0.14 : Y + BR) - ball.y) * Math.min(1, dt * 20);
            ballM.position.set(ball.x, ball.y, ball.z); ballM.rotation.x -= dt * 12;
            for (const p of pins) {
              if (p.st !== 'up') continue;
              const dx = p.x - ball.x, dz = p.z - ball.z, d = Math.hypot(dx, dz);
              if (d < BR + PR && ball.y > 0.2) {
                const nx = dx / (d || 1), nz = dz / (d || 1), sp = Math.hypot(ball.vx, ball.vz);
                const lk = 0.4 + Math.random() * 0.45; p.st = 'move'; p.vx = nx * (sp * 0.72 + 0.8) * lk; p.vz = nz * (sp * 0.72 + 0.8) * lk; p.dx = nx; p.dz = nz;
                ball.vx = ball.vx * 0.94 - nx * 0.25; ball.vz *= 0.94;
              }
            }
            if (ball.z < PIT + BR) { ball = null; ballM.visible = false; state = 'settle'; wait = 0; }
          }
          for (const p of pins) {
            if (p.st !== 'move') continue;
            p.x += p.vx * dt; p.z += p.vz * dt; const sp = Math.hypot(p.vx, p.vz);
            p.vx *= 1 - 1.8 * dt; p.vz *= 1 - 1.8 * dt; p.fall = Math.min(1, p.fall + dt * 4);
            if (p.z < PIT + 0.08) { p.z = PIT + 0.08; p.vz = Math.abs(p.vz) * 0.2; }
            if (sp > 0.2) { p.dx = p.vx / sp; p.dz = p.vz / sp; }
            if (sp > 0.35) for (const o of pins) {
              if (o.st !== 'up') continue; const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
              if (d < 0.145) { const nx = dx / (d || 1), nz = dz / (d || 1); o.st = 'move'; const lk2 = 0.3 + Math.random() * 0.4; o.vx = nx * sp * 0.7 * lk2; o.vz = nz * sp * 0.7 * lk2; o.dx = nx; o.dz = nz; p.vx *= 0.75; p.vz *= 0.75; }
            }
            if (sp < 0.06 && p.fall >= 1) { p.st = 'down'; p.vx = p.vz = 0; }
            place(p);
          }
          if (state === 'rolling' && ball && (Math.abs(ball.vx) + Math.abs(ball.vz) < 0.3)) { ball = null; ballM.visible = false; state = 'settle'; wait = 0; }
          if (state === 'settle') {
            wait += dt;
            const moving = pins.some((p) => p.st === 'move');
            if (!moving && wait > 0.9) this.endBall();
            if (wait > 4) { pins.forEach((p) => { if (p.st === 'move') p.st = 'down'; }); this.endBall(); }
          }
        }
        if (state === 'done') { since += dt; const left = Math.ceil(COOLDOWN - since); hud.msg(`${resultMsg}. Practice resets in ${Math.max(0, left)}s`); if (since >= COOLDOWN) { hud.msg(''); this.reset(); } }
      },
      endBall() {
        if (state !== 'settle') return;
        const knocked = downCount() - frameStart; total += knocked; ballNo++;
        { const fr = frames[Math.min(frame, 1)]; fr.push(downCount() === 10 && ballNo === 1 ? 'X' : downCount() === 10 ? '/' : knocked === 0 ? '-' : knocked); drawMon(); }
        hud.pop(downCount() === 10 && ballNo === 1 ? 'STRIKE!' : knocked ? `+${knocked}` : 'GUTTER', knocked > 0);
        const frameOver = ballNo >= 2 || downCount() === 10;
        if (frameOver) { frame++; ballNo = 0; if (frame >= 2) { state = 'done'; since = 0; const ch = submit('bowling', total); resultMsg = verdict(ch, total, 'pins'); this.hudUpdate(); return; } setTimeout(() => { if (cur === bowling) resetPins(); }, 700); }
        else clearDown();
        state = 'ready'; bowlG.visible = true; me.x = X0; this.hudUpdate();
      },
    };
  })();

  // ====================================================== CORNHOLE
  const cornhole = (() => {
    const BX = -6.0, FRONT = 4.0, BACK = 5.2, SLOPE = 0.25, HOLE = { x: BX, z: 4.95 }, HR = 0.12, HW = 0.3;
    const surf = (z) => 0.09 + (z - FRONT) * SLOPE;
    const mkBoard = (cz, flip) => {
      const g = new THREE.Group(); g.position.set(BX, 0, cz);
      const top = box(0.62, 0.04, 1.24, 0xd9b574, 0, 0.23 - 0.0, 0, g); top.rotation.x = -Math.atan(SLOPE) * (flip ? -1 : 1);
      const stripe = box(0.08, 0.045, 1.24, 0xc0392b, 0.2, 0.23, 0, g); stripe.rotation.x = top.rotation.x;
      box(0.05, 0.37, 0.05, 0x6b4a2b, -0.27, 0.18, flip ? -0.5 : 0.5, g); box(0.05, 0.37, 0.05, 0x6b4a2b, 0.27, 0.18, flip ? -0.5 : 0.5, g);
      box(0.05, 0.1, 0.05, 0x6b4a2b, -0.27, 0.05, flip ? 0.55 : -0.55, g); box(0.05, 0.1, 0.05, 0x6b4a2b, 0.27, 0.05, flip ? 0.55 : -0.55, g);
      scene.add(g); return g;
    };
    mkBoard(4.6, false); mkBoard(-0.9, true);
    const hole = cyl(HR, HR, 0.01, 0x050505, HOLE.x, surf(HOLE.z) + 0.03, HOLE.z, 20); hole.rotation.x = -Math.atan(SLOPE);
    const l = label('🌽 CORNHOLE'); l.position.set(BX + 1.5, 1.0, 5.0); scene.add(l);
    const csb = scoreTex(256, 180, () => {}); let lastScore = 0;
    const drawCsb = (blue, red) => csb.redraw((c, w, h) => { c.fillStyle = '#0c1226'; c.fillRect(0, 0, w, h); c.strokeStyle = '#5a6aa8'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4); c.font = '900 52px system-ui'; c.textAlign = 'left'; c.fillStyle = '#5aa0ff'; c.fillText('BLUE', 16, 72); c.fillStyle = '#ff5a5a'; c.fillText('RED', 16, 148); c.textAlign = 'right'; c.fillStyle = '#fff'; c.fillText(String(blue), w - 18, 72); c.fillText(String(red), w - 18, 148); });
    drawCsb(0, 0);
    { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.77), new THREE.MeshBasicMaterial({ map: csb.t, toneMapped: false })); m.position.set(BX, 2.3, 6.1); m.rotation.y = Math.PI; scene.add(m); box(1.24, 0.9, 0.06, 0x2a1a0c, BX, 2.3, 6.15); box(0.08, 1.6, 0.08, 0x2a1a0c, BX - 0.5, 1.5, 6.15); box(0.08, 1.6, 0.08, 0x2a1a0c, BX + 0.5, 1.5, 6.15); }
    const spot = { x: BX, z: 0.3, yaw: Math.PI, pitch: -0.2 };
    stations.push({ x: BX, z: 0.3, r: 1.6, text: 'E - Cornhole (challenge board)', act: () => BK.openChallenge('cornhole') });
    obstacles.push({ x: BX, z: 4.6, r: 0.7 }, { x: BX, z: -0.9, r: 0.7 });

    const bagMesh = (c) => { if (hasProp('bag')) return prop('bag', { w: 0.19, anchor: 'center', shadow: false }); const g = new THREE.Group(); const b = box(0.16, 0.05, 0.16, c, 0, 0, 0, g); b.scale.set(1, 1, 1); box(0.14, 0.055, 0.02, 0xffffff, 0, 0, 0, g); return g; };
    const heldBag = bagMesh(0x2f6fd0); const cHand = makeHand({ sleeve }); heldBag.position.set(0, 0.06, -0.16); cHand.add(heldBag); cHand.position.set(0.14, -0.32, -0.34); cHand.rotation.set(0.15, -0.2, 0);
    const LOFT = 0.45, ZONE = [0.25, 0.52];
    let thrown, score, state, charge, charging, bag, since, wind = 0, cdir = 1;
    return {
      name: 'cornhole', spot, limits: { yaw: 0.4, pitch: 0.3 }, rateName: 'cornhole',
      enter() { hand.add(cHand); this.reset(); },
      handAnim(k) { cHand.position.z = -0.34 - k * 0.22; cHand.rotation.x = 0.15 - k * 0.7; },
      exit() { hand.remove(cHand); clearTracked(); },
      reset() { clearTracked(); thrown = 0; score = 0; state = 'ready'; charge = 0; charging = false; bag = null; since = 0; heldBag.visible = true; hud.power(null); wind = (Math.random() - 0.5) * 2.2; drawCsb(0, lastScore); this.hudUpdate(); },
      hudUpdate() { hud.title(''); hud.sub(`Bag ${Math.min(4, thrown + 1)}/4 · ${score} pts · Wind ${wind < 0 ? '←' : '→'} ${Math.abs(wind).toFixed(1)}${tgt()}`); hud.help('HOLD click - the meter swings; release in the green zone. Watch the wind! - E to leave'); },
      camOffset() { return { y: 0, p: 0 }; },
      down() { if (state === 'ready') { charging = true; charge = 0; cdir = 1; } },
      up() {
        if (!charging || state !== 'ready') return; charging = false;
        const speed = (3.5 + charge * 5.0) * (1 + gauss() * 0.03 * dr()), el = LOFT + (me.pitch - spot.pitch), yw = me.yaw + gauss() * 0.009 * dr(), dirx = -Math.sin(yw), dirz = -Math.cos(yw);
        const m = bagMesh(0x2f6fd0); const P = camera.getWorldPosition(V()); P.y -= 0.35; P.x += dirx * 0.3; P.z += dirz * 0.3; m.position.copy(P); addTracked(m);
        bag = { m, x: P.x, y: P.y, z: P.z, vx: dirx * Math.cos(el) * speed, vy: Math.sin(el) * speed, vz: dirz * Math.cos(el) * speed, mode: 'air', spin: 6 + Math.random() * 4, pts: 0, wind };
        state = 'flying'; heldBag.visible = false; kick.v = 1; thrown++; hud.power(null); charge = 0; wind = (Math.random() - 0.5) * 2.2; this.hudUpdate();
      },
      step(dt) {
        if (state === 'ready') { if (charging) { charge += cdir * dt / 0.95; if (charge >= 1) { charge = 1; cdir = -1; } if (charge <= 0) { charge = 0; cdir = 1; } hud.power(charge, ZONE); } }
        if (bag) {
          const b = bag;
          if (b.mode === 'air') {
            b.vx += b.wind * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vy -= G * dt; b.m.rotation.x += b.spin * dt;
            const onBoard = Math.abs(b.x - BX) < HW + 0.04 && b.z > FRONT - 0.04 && b.z < BACK + 0.04;
            if (onBoard && b.y <= surf(b.z) + 0.06 && b.vy < 0) { b.mode = 'slide'; b.y = surf(b.z) + 0.06; b.vy = 0; b.vx *= 0.35; b.vz *= 0.35; b.m.rotation.set(-Math.atan(SLOPE), Math.random() * 3, 0); }
            else if (b.y <= 0.03) { b.mode = 'floor'; b.y = 0.03; b.pts = 0; this.landed(b, 'MISS'); }
          } else if (b.mode === 'slide') {
            const sp = Math.hypot(b.vx, b.vz), ns = Math.max(0, sp - 4.5 * dt);
            if (sp > 0) { b.vx *= ns / sp; b.vz *= ns / sp; }
            b.x += b.vx * dt; b.z += b.vz * dt; b.y = surf(b.z) + 0.06;
            if (Math.hypot(b.x - HOLE.x, b.z - HOLE.z) < 0.15) { b.mode = 'drop'; b.vx = b.vz = 0; b.pts = 3; }
            else if (Math.abs(b.x - BX) > HW + 0.06 || b.z > BACK + 0.06) { b.mode = 'fall'; b.vy = 0; }
            else if (ns < 0.05) { b.mode = 'rest'; b.pts = 1; this.landed(b, 'ON BOARD +1'); }
          } else if (b.mode === 'drop') { b.y -= dt * 1.2; if (b.y < -0.2) { b.m.visible = false; b.mode = 'in'; this.landed(b, 'IN THE HOLE! +3'); } }
          else if (b.mode === 'fall') { b.vy -= G * dt; b.y += b.vy * dt; if (b.y <= 0.03) { b.y = 0.03; b.mode = 'floor'; b.pts = 0; this.landed(b, 'OFF THE BOARD'); } }
          b.m.position.set(b.x, b.y, b.z);
        }
        if (state === 'done') { since += dt; hud.msg(`${resultMsg}. Practice resets in ${Math.max(0, Math.ceil(COOLDOWN - since))}s`); if (since >= COOLDOWN) { hud.msg(''); this.reset(); } }
      },
      landed(b, text) { score += b.pts; drawCsb(score, lastScore); hud.pop(text, b.pts > 0); bag = null; if (thrown >= 4) { state = 'done'; since = 0; lastScore = score; const ch = submit('cornhole', score); resultMsg = verdict(ch, score); } else { state = 'ready'; heldBag.visible = true; } this.hudUpdate(); },
    };
  })();

  const pool = createPool({ scene, camera, BK, me, stations, obstacles, hud, V });

  // ---------- controller ----------
  const all = { darts, bowling, cornhole, pool };
  let cur = null, acc = 0;
  function submit(game, pts) { const ch = challenge; BK.send({ type: 'mg', game, pts }); challenge = null; return ch; }
  function start(name, ch = null) {
    if (cur) leave();
    challenge = ch;
    cur = all[name]; me.x = cur.spot.x; me.z = cur.spot.z; me.yaw = cur.spot.yaw; me.pitch = cur.spot.pitch || 0; document.body.classList.add('playing');
    hudEl.classList.remove('hidden'); cur.enter(ch);
  }
  function leave() { if (!cur) return; cur.exit(); cur = null; hud.msg(''); hud.power(null); hudEl.classList.add('hidden'); document.body.classList.remove('playing'); }
  return {
    start, leave, active: () => !!cur, current: () => cur && cur.name,
    down: () => cur && cur.down(), up: () => cur && cur.up(),
    camOffset: (now) => (cur ? cur.camOffset(now) : { y: 0, p: 0 }),
    update(dt) { if (!cur) return; acc += Math.min(dt, 0.1); while (acc >= STEP) { cur.step(STEP); acc -= STEP; } kick.v = Math.max(0, kick.v - dt * 3.5); if (cur.handAnim) cur.handAnim(kick.v); },
    rig(cam) { if (cur && cur.rig) cur.rig(cam); },
    clampLook() { if (!cur) return; if (cur.look) { cur.look(); return; } const b = cur.spot.yaw, L = cur.limits; me.yaw = Math.max(b - L.yaw, Math.min(b + L.yaw, me.yaw)); const bp = cur.spot.pitch || 0; me.pitch = Math.max(bp - L.pitch, Math.min(bp + L.pitch, me.pitch)); },
    setPaused(p) { hud.msg(p ? 'Click to resume' : ''); },
    all,
  };
}
