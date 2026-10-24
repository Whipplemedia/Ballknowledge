import * as THREE from 'three';

// In-world arcade: darts, bowling, cornhole. Physical throwing in first person.
// Scores are reported to the server as {type:'mg', game, pts}; the server caps and pays out.
export function createGames({ scene, camera, BK, me, keys, helpers, stations, obstacles }) {
  const { box, cyl, label, mat } = helpers;
  const G = 9.8, STEP = 1 / 120, COOLDOWN = 6;
  scene.add(camera);
  const hand = new THREE.Group(); camera.add(hand);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const rate = { darts: 3, bowling: 25, cornhole: 35 };

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
    box(1.4, 1.4, 0.04, 0x1b1b25, BX, BY, BZ - 0.03);
    [[1, 0x1c1c22, 3], [0.75, 0x1d6b3a, 8], [0.45, 0xa81e30, 15], [0.15, 0x1d6b3a, 30], [0.06, 0xffc83d, 50]].forEach(([f, c], i) => {
      const m = cyl(R * f, R * f, 0.02, c, BX, BY, BZ + 0.004 * i, 32); m.rotation.x = Math.PI / 2;
    });
    box(1.6, 0.03, 0.4, 0x222, -10, 0.02, -5.35, scene, { color: 0xffc83d }); // throw line
    const spotL = new THREE.PointLight(0xfff4e0, 22, 7); spotL.position.set(BX, BY + 0.9, BZ + 1.6); scene.add(spotL);
    const l = label('🎯 DARTS'); l.position.set(BX, 3.1, BZ + 0.3); scene.add(l);
    const spot = { x: -10, z: -5.1, yaw: 0, pitch: 0.02 };
    stations.push({ x: spot.x, z: spot.z, r: 1.6, text: 'E - Play darts', act: () => start('darts') });

    function dartMesh() {
      const g = new THREE.Group();
      const b = cyl(0.012, 0.012, 0.1, 0xc8c8d0, 0, 0, 0, 8, g); b.rotation.x = Math.PI / 2;
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 8), mat(0xeeeeee)); t.rotation.x = Math.PI / 2; t.position.z = 0.07; g.add(t);
      box(0.06, 0.004, 0.05, 0xff3040, 0, 0, -0.06, g); box(0.004, 0.06, 0.05, 0xff3040, 0, 0, -0.06, g);
      return g;
    }
    const held = dartMesh(); held.rotation.y = Math.PI; held.position.set(0.2, -0.18, -0.45);

    let thrown, score, flying, state, fx, since;
    const sc = (r) => (r > 1 ? 0 : r <= 0.06 ? 50 : r <= 0.15 ? 30 : r <= 0.45 ? 15 : r <= 0.75 ? 8 : 3);
    return {
      name: 'darts', spot, limits: { yaw: 0.55, pitch: 0.45 }, rateName: 'darts',
      enter() { hand.add(held); this.reset(); },
      exit() { hand.remove(held); clearTracked(); flying = null; },
      reset() { clearTracked(); thrown = 0; score = 0; flying = null; state = 'ready'; fx = null; since = 0; held.visible = true; hud.power(null); this.hudUpdate(); },
      hudUpdate() { hud.title(''); hud.sub(`Dart ${Math.min(3, thrown + 1)}/3 · ${score} pts`); hud.help('Hold steady - the view shakes. Click to throw. E to leave.'); },
      camOffset(now) { const t = now / 1000; return { y: Math.sin(t * 1.7) * 0.016 + Math.sin(t * 3.3) * 0.007, p: Math.cos(t * 1.3) * 0.016 + Math.cos(t * 2.9) * 0.007 }; },
      down() {
        if (state !== 'ready' || flying) return;
        const d = V(0, 0, -1).applyQuaternion(camera.quaternion), P = camera.getWorldPosition(V());
        if (d.z > -0.05) return;
        const t = (BZ - P.z) / d.z, T = P.clone().add(d.clone().multiplyScalar(t));
        const S = P.clone().add(V(0.14, -0.16, 0).applyQuaternion(camera.quaternion));
        const time = 0.3, v = T.clone().sub(S).multiplyScalar(1 / time); v.y += 0.5 * G * time;
        const m = dartMesh(); m.position.copy(S); addTracked(m);
        flying = { m, v, p: S.clone() }; thrown++; held.visible = thrown < 3; this.hudUpdate();
      },
      up() {},
      step(dt) {
        if (flying) {
          const f = flying, prev = f.p.clone(); f.p.addScaledVector(f.v, dt); f.v.y -= G * dt;
          f.m.position.copy(f.p); f.m.lookAt(f.p.clone().add(f.v));
          if (prev.z > BZ && f.p.z <= BZ) {
            const k = (prev.z - BZ) / (prev.z - f.p.z), hit = prev.clone().lerp(f.p, k);
            const r = Math.hypot(hit.x - BX, hit.y - BY) / R, pts = sc(r);
            f.m.position.set(hit.x, hit.y, BZ + 0.03); score += pts; flying = null;
            hud.pop(pts ? '+' + pts : 'MISS', !!pts);
            if (thrown >= 3) this.finish(); else this.hudUpdate();
          } else if (f.p.y < 0.05 || f.p.z < -8) { flying = null; hud.pop('MISS', false); if (thrown >= 3) this.finish(); else this.hudUpdate(); }
        }
        if (state === 'done') { since += dt; this.cool(); }
      },
      finish() { state = 'done'; since = 0; submit('darts', score); this.hudUpdate(); },
      cool() { const left = Math.ceil(COOLDOWN - since); hud.msg(`${score} pts - about $${score * rate.darts}. Next round in ${Math.max(0, left)}s`); if (since >= COOLDOWN) { hud.msg(''); this.reset(); } },
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
    const spot = { x: X0, z: 6.4, yaw: 0, pitch: -0.22 };
    stations.push({ x: X0, z: 6.4, r: 1.5, text: 'E - Go bowling', act: () => start('bowling') });

    const layout = [[0, 0], [-0.5, 1], [0.5, 1], [-1, 2], [0, 2], [1, 2], [-1.5, 3], [-0.5, 3], [0.5, 3], [1.5, 3]];
    const pins = layout.map(([c, r]) => {
      const g = new THREE.Group(); cyl(0.04, 0.065, 0.3, 0xf4f4f4, 0, 0.15, 0, 10, g); const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0xf4f4f4)); h.position.y = 0.34; g.add(h); cyl(0.05, 0.05, 0.03, 0xd22, 0, 0.27, 0, 10, g);
      scene.add(g); return { g, hx: X0 + c * GAP, hz: HEAD - r * ROWH, x: 0, z: 0, vx: 0, vz: 0, st: 'up', fall: 0, dx: 0, dz: -1 };
    });
    const ballM = new THREE.Mesh(new THREE.SphereGeometry(BR, 16, 12), mat(0x14223a, { roughness: 0.3 })); scene.add(ballM); ballM.visible = false;
    const held = new THREE.Mesh(new THREE.SphereGeometry(BR, 16, 12), mat(0x14223a, { roughness: 0.3 })); held.position.set(0.02, -0.34, -0.5);

    let frame, ballNo, total, state, ball, charge, charging, wait, since, frameStart;
    const resetPins = () => pins.forEach((p) => { p.x = p.hx; p.z = p.hz; p.vx = p.vz = 0; p.st = 'up'; p.fall = 0; p.g.visible = true; place(p); });
    const clearDown = () => pins.forEach((p) => { if (p.st !== 'up') p.g.visible = false; });
    const place = (p) => { p.g.position.set(p.x, Y + 0.06 * p.fall, p.z); p.g.quaternion.setFromAxisAngle(V(p.dz, 0, -p.dx).normalize(), p.fall * Math.PI / 2); };
    const downCount = () => pins.filter((p) => p.st !== 'up').length;
    const standing = () => pins.filter((p) => p.st === 'up' && p.g.visible);

    return {
      name: 'bowling', spot, limits: { yaw: 0.2, pitch: 0.35 }, rateName: 'bowling',
      enter() { hand.add(held); this.reset(); },
      exit() { hand.remove(held); ballM.visible = false; resetPins(); pins.forEach((p) => (p.g.visible = true)); },
      reset() { resetPins(); frame = 0; ballNo = 0; total = 0; state = 'ready'; ball = null; charge = 0; charging = false; since = 0; frameStart = 0; held.visible = true; ballM.visible = false; hud.power(null); this.hudUpdate(); },
      hudUpdate() { hud.title(''); hud.sub(`Frame ${Math.min(frame + 1, 2)}/2 · Ball ${ballNo + 1}/2 · ${total} pins`); hud.help('A/D slide · mouse aims · HOLD click to charge, release to roll · E to leave'); },
      camOffset() { return { y: 0, p: 0 }; },
      down() { if (state === 'ready') charging = true; },
      up() {
        if (!charging || state !== 'ready') return; charging = false;
        const power = charge, speed = 5 + power * 8, dirx = -Math.sin(me.yaw), dirz = -Math.cos(me.yaw);
        ball = { x: me.x, y: Y + BR, z: 6.0, vx: dirx * speed, vz: dirz * speed, spin: 0 };
        ballM.visible = true; held.visible = false; hud.power(null); state = 'rolling'; wait = 0; frameStart = downCount();
      },
      step(dt) {
        if (state === 'ready') {
          const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); me.x = Math.max(X0 - 0.5, Math.min(X0 + 0.5, me.x + s * 1.1 * dt));
          if (charging) { charge = Math.min(1, charge + dt / 1.2); hud.power(charge, [0.5, 0.8]); } else charge = 0;
        }
        if (state === 'rolling' || state === 'settle') {
          if (ball) {
            ball.x += ball.vx * dt; ball.z += ball.vz * dt; ball.spin += dt * 20;
            const off = Math.abs(ball.x - X0); ball.y += ((off > 0.62 ? 0.14 : Y + BR) - ball.y) * Math.min(1, dt * 20);
            ballM.position.set(ball.x, ball.y, ball.z); ballM.rotation.x -= dt * 12;
            for (const p of pins) {
              if (p.st !== 'up') continue;
              const dx = p.x - ball.x, dz = p.z - ball.z, d = Math.hypot(dx, dz);
              if (d < BR + PR && ball.y > 0.2) {
                const nx = dx / (d || 1), nz = dz / (d || 1), sp = Math.hypot(ball.vx, ball.vz);
                p.st = 'move'; p.vx = nx * (sp * 0.72 + 0.8); p.vz = nz * (sp * 0.72 + 0.8); p.dx = nx; p.dz = nz;
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
              if (d < 0.155) { const nx = dx / (d || 1), nz = dz / (d || 1); o.st = 'move'; o.vx = nx * sp * 0.7; o.vz = nz * sp * 0.7; o.dx = nx; o.dz = nz; p.vx *= 0.75; p.vz *= 0.75; }
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
        if (state === 'done') { since += dt; const left = Math.ceil(COOLDOWN - since); hud.msg(`${total} pins - about $${total * rate.bowling}. Next game in ${Math.max(0, left)}s`); if (since >= COOLDOWN) { hud.msg(''); this.reset(); } }
      },
      endBall() {
        if (state !== 'settle') return;
        const knocked = downCount() - frameStart; total += knocked; ballNo++;
        hud.pop(downCount() === 10 && ballNo === 1 ? 'STRIKE!' : knocked ? `+${knocked}` : 'GUTTER', knocked > 0);
        const frameOver = ballNo >= 2 || downCount() === 10;
        if (frameOver) { frame++; ballNo = 0; if (frame >= 2) { state = 'done'; since = 0; submit('bowling', total); this.hudUpdate(); return; } setTimeout(() => { if (cur === bowling) resetPins(); }, 700); }
        else clearDown();
        state = 'ready'; held.visible = true; me.x = X0; this.hudUpdate();
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
    const l = label('🌽 CORNHOLE'); l.position.set(BX, 2.1, 5.3); scene.add(l);
    const spot = { x: BX, z: 0.3, yaw: Math.PI, pitch: -0.2 };
    stations.push({ x: BX, z: 0.3, r: 1.6, text: 'E - Play cornhole', act: () => start('cornhole') });
    obstacles.push({ x: BX, z: 4.6, r: 0.7 }, { x: BX, z: -0.9, r: 0.7 });

    const bagMesh = (c) => { const g = new THREE.Group(); const b = box(0.16, 0.05, 0.16, c, 0, 0, 0, g); b.scale.set(1, 1, 1); box(0.14, 0.055, 0.02, 0xffffff, 0, 0, 0, g); return g; };
    const heldBag = bagMesh(0xc0392b); heldBag.position.set(0.08, -0.3, -0.5);
    const LOFT = 0.45, ZONE = [0.25, 0.52];
    let thrown, score, state, charge, charging, bag, since;
    return {
      name: 'cornhole', spot, limits: { yaw: 0.4, pitch: 0.3 }, rateName: 'cornhole',
      enter() { hand.add(heldBag); this.reset(); },
      exit() { hand.remove(heldBag); clearTracked(); },
      reset() { clearTracked(); thrown = 0; score = 0; state = 'ready'; charge = 0; charging = false; bag = null; since = 0; heldBag.visible = true; hud.power(null); this.hudUpdate(); },
      hudUpdate() { hud.title(''); hud.sub(`Bag ${Math.min(4, thrown + 1)}/4 · ${score} pts`); hud.help('Aim at the board - HOLD click to charge (aim for the green zone), release to toss - E to leave'); },
      camOffset() { return { y: 0, p: 0 }; },
      down() { if (state === 'ready') charging = true; },
      up() {
        if (!charging || state !== 'ready') return; charging = false;
        const speed = 3.5 + charge * 5.0, el = LOFT + (me.pitch - spot.pitch), dirx = -Math.sin(me.yaw), dirz = -Math.cos(me.yaw);
        const m = bagMesh(thrown % 2 ? 0x2980b9 : 0xc0392b); const P = camera.getWorldPosition(V()); P.y -= 0.35; P.x += dirx * 0.3; P.z += dirz * 0.3; m.position.copy(P); addTracked(m);
        bag = { m, x: P.x, y: P.y, z: P.z, vx: dirx * Math.cos(el) * speed, vy: Math.sin(el) * speed, vz: dirz * Math.cos(el) * speed, mode: 'air', spin: 6 + Math.random() * 4, pts: 0 };
        state = 'flying'; heldBag.visible = false; thrown++; hud.power(null); charge = 0; this.hudUpdate();
      },
      step(dt) {
        if (state === 'ready') { if (charging) { charge = Math.min(1, charge + dt / 2.4); hud.power(charge, ZONE); } }
        if (bag) {
          const b = bag;
          if (b.mode === 'air') {
            b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vy -= G * dt; b.m.rotation.x += b.spin * dt;
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
        if (state === 'done') { since += dt; hud.msg(`${score} pts - about $${score * rate.cornhole}. Next round in ${Math.max(0, Math.ceil(COOLDOWN - since))}s`); if (since >= COOLDOWN) { hud.msg(''); this.reset(); } }
      },
      landed(b, text) { score += b.pts; hud.pop(text, b.pts > 0); bag = null; if (thrown >= 4) { state = 'done'; since = 0; submit('cornhole', score); } else { state = 'ready'; heldBag.visible = true; } this.hudUpdate(); },
    };
  })();

  // ---------- controller ----------
  const all = { darts, bowling, cornhole };
  let cur = null, acc = 0;
  function submit(game, pts) { BK.send({ type: 'mg', game, pts }); }
  function start(name) {
    if (cur) leave();
    cur = all[name]; me.x = cur.spot.x; me.z = cur.spot.z; me.yaw = cur.spot.yaw; me.pitch = cur.spot.pitch || 0; document.body.classList.add('playing');
    hudEl.classList.remove('hidden'); cur.enter();
  }
  function leave() { if (!cur) return; cur.exit(); cur = null; hud.msg(''); hud.power(null); hudEl.classList.add('hidden'); document.body.classList.remove('playing'); }
  return {
    start, leave, active: () => !!cur, current: () => cur && cur.name,
    down: () => cur && cur.down(), up: () => cur && cur.up(),
    camOffset: (now) => (cur ? cur.camOffset(now) : { y: 0, p: 0 }),
    update(dt) { if (!cur) return; acc += Math.min(dt, 0.1); while (acc >= STEP) { cur.step(STEP); acc -= STEP; } },
    clampLook() { if (!cur) return; const b = cur.spot.yaw, L = cur.limits; me.yaw = Math.max(b - L.yaw, Math.min(b + L.yaw, me.yaw)); const bp = cur.spot.pitch || 0; me.pitch = Math.max(bp - L.pitch, Math.min(bp + L.pitch, me.pitch)); },
    setPaused(p) { hud.msg(p ? 'Click to resume' : ''); },
    all,
  };
}
