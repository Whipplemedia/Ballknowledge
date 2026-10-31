import * as THREE from 'three';
import { place } from './props.js';
import { makePreset, animate, loadModels, loadN3Clips, N3_NAMES, hasClip } from './people.js';
import { label } from './textures.js';

// The End Zone (night 3): a gentlemen's club on the bar's block, left of The Dugout. Its front (the user's reference art,
// public/art/club_facade.webp) sits in the street wall next to the bar's; its doorway only opens on night 3 (server n3.js).
// Inside: the main stage and its pole (runway toward the door), chairs, the VIP section behind a velvet rope, the DJ booth,
// and the staff (Meshy models, loaded only when the club opens). The games: Make It Rain at the stage, bottle service and
// the athlete in the VIP, shot roulette with the shot girl, Amateur Night on the pole (public/polegame.js); the bachelor-party
// groom waits at the end of the bar for whoever takes the job. Everything here is on the 'club' zone (zones.js).
export const CLUB = { x0: -27, x1: -13, z0: -4, z1: 8, h: 4.2, front: 8.3, door: { x: -20, w: 2.0, h: 2.5 } };
const STAGE = { x: -20, z: 0.4, h: 3.83 }, POLE = { x: -20, z: -0.56 }, DECK = 0.76; // main_stage.glb: pole at -0.3 of its 1.9 length, deck at 0.2 of its height
export const CLUB_SPOTS = { rain: { x: -20, z: 4.5 }, dance: { x: -17.4, z: -1.7 }, rope: { x: -24.6, z: -0.3 }, athlete: { x: -23.4, z: -1.9 }, groom: { x: 7.2, z: -2.6 } };
const SHOT_PATH = [[-24.5, 5.2], [-15.5, 5.2], [-15.5, 2.2], [-24.2, 2.2]];

export function createClub({ scene, BK, audio, camera, stations, obstacles, avatars, castOf, tickCos, me, loader = new THREE.TextureLoader() }) {
  const C = CLUB, D = C.door, d0 = D.x - D.w / 2, d1 = D.x + D.w / 2;
  const tex = (name, rep, cb) => loader.load(`art/${name}.webp`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } cb && cb(t); });
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  const plane = (w, h, mat, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); scene.add(m); return m; };
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); scene.add(m); return m; };

  // ---------- the street front: the reference art around a real doorway, dark brick around it ----------
  const AW = 13, AH = AW * 516 / 1200, AX0 = D.x - AW / 2, AX1 = D.x + AW / 2; // the art's painted door is 9% of its width, so 13 m puts it on our 1.2 m doorway
  const artMat = std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.9 }); tex('club_facade', null, (t) => { artMat.map = t; artMat.emissiveMap = t; artMat.needsUpdate = true; });
  const brick = std({ color: 0x1a1418, roughness: 0.95 });
  const piece = (mat, x0, x1, y0, y1, uv) => { const m = plane(x1 - x0, y1 - y0, mat, (x0 + x1) / 2, (y0 + y1) / 2, C.front, 0); if (uv) { const a = m.geometry.attributes.uv; [[x0, y1], [x1, y1], [x0, y0], [x1, y0]].forEach(([x, y], k) => a.setXY(k, (x - AX0) / AW, y / AH)); a.needsUpdate = true; } return m; };
  piece(artMat, AX0, d0, 0, AH, true); piece(artMat, d1, AX1, 0, AH, true); piece(artMat, d0, d1, D.h, AH, true);
  { const gold = std({ color: 0xd4af37, metalness: 0.6, roughness: 0.35, emissive: 0x3a2a08 }); // a gold frame round the (widened) doorway on the street side
    box(0.16, D.h + 0.16, 0.14, gold, d0 - 0.08, (D.h + 0.16) / 2, C.front + 0.05); box(0.16, D.h + 0.16, 0.14, gold, d1 + 0.08, (D.h + 0.16) / 2, C.front + 0.05); box(D.w + 0.32, 0.16, 0.14, gold, D.x, D.h + 0.08, C.front + 0.05); }
  piece(brick, -28, AX0, 0, 9); piece(brick, AX1, -12, 0, 9); piece(brick, AX0, AX1, AH, 9);
  { const l = new THREE.PointLight(0xff4fb0, 14, 9, 1.6); l.position.set(D.x, 4.4, C.front + 1.2); l.userData.noDim = true; scene.add(l); } // the neon's glow on the sidewalk
  const closed = plane(D.w, D.h, std({ color: 0x0c0a10 }), D.x, D.h / 2, C.front + 0.01); // nights 1-2: the door's shut
  const closedSign = label('OPENS ON THE LAST NIGHT', '#ff79c6', 0.7, 384); closedSign.position.set(D.x, 2.8, C.front + 0.4); scene.add(closedSign);

  // ---------- inside ----------
  const wallMat = std({ color: 0xffffff }), floorMat = std({ color: 0xffffff, roughness: 0.35, metalness: 0.15 });
  tex('club_wall', [4, 1.4], (t) => { wallMat.map = t; wallMat.needsUpdate = true; }); tex('club_floor', [7, 6], (t) => { floorMat.map = t; floorMat.needsUpdate = true; });
  const W = C.x1 - C.x0, L = C.z1 - C.z0, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2;
  plane(W, L, floorMat, cx, 0.003, cz, 0, -Math.PI / 2); plane(W, L, std({ color: 0x07060a }), cx, C.h, cz, 0, Math.PI / 2);
  plane(W, C.h, wallMat, cx, C.h / 2, C.z0, 0); plane(L, C.h, wallMat, C.x0, C.h / 2, cz, Math.PI / 2); plane(L, C.h, wallMat, C.x1, C.h / 2, cz, -Math.PI / 2);
  plane(d0 - C.x0, C.h, wallMat, (C.x0 + d0) / 2, C.h / 2, C.z1, Math.PI); plane(C.x1 - d1, C.h, wallMat, (d1 + C.x1) / 2, C.h / 2, C.z1, Math.PI); plane(D.w, C.h - D.h, wallMat, D.x, (C.h + D.h) / 2, C.z1, Math.PI);
  box(0.12, D.h, 0.5, std({ color: 0xd4af37, metalness: 0.6, roughness: 0.35 }), d0 - 0.06, D.h / 2, C.z1 + 0.15); box(0.12, D.h, 0.5, std({ color: 0xd4af37, metalness: 0.6, roughness: 0.35 }), d1 + 0.06, D.h / 2, C.z1 + 0.15);
  // the light: hot pink on the stage, purple and blue round the room, red in the VIP (the zone's light pool picks the near ones)
  for (const [c, I, x, y, z, dd] of [[0xff3fa4, 30, POLE.x, 3.4, POLE.z + 0.6, 9], [0x9a4dff, 22, -25, 3.2, 4.5, 9], [0x3d8bff, 22, -15, 3.2, 4.5, 9], [0xff2a3a, 16, -24.6, 2.8, -2.4, 6], [0xffd0e8, 10, D.x, 3, 6.6, 6]]) {
    const l = new THREE.PointLight(c, I, dd, 1.5); l.position.set(x, y, z); l.userData.club = true; scene.add(l);
  }
  // fake light beams from the stage cans (additive cones: no real spotlights, so no shader recompiles)
  const beams = [], beamMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const [c, x, z] of [[0xff4fb0, -23.5, 3.5], [0x6fd0ff, -16.5, 3.5], [0xffd060, -23.5, -3.2], [0xb06bff, -16.5, -3.2]]) {
    const g = new THREE.Group(); g.position.set(x, C.h - 0.25, z); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 20, 1, true), beamMat(c)); cone.position.y = -2.1; g.add(cone); scene.add(g); beams.push({ g, x, z, ph: beams.length * 1.7 });
    place(scene, 'stage_light', { h: 0.45 }, x, C.h - 0.62, z, (o) => { o.rotation.x = Math.PI; o.position.y = C.h - 0.05; });
  }
  let ball = null; place(scene, 'mirror_ball', { h: 0.9 }, STAGE.x, C.h - 0.95, STAGE.z + 1.2, (o) => { ball = o; });
  // furniture
  let stage = null; place(scene, 'main_stage', { h: STAGE.h }, STAGE.x, 0, STAGE.z, (o) => { stage = o; });
  obstacles.push({ x: POLE.x, z: POLE.z, r: 2.0 }, { x: STAGE.x, z: STAGE.z + 1.6, r: 0.9 }, { x: STAGE.x, z: STAGE.z + 2.6, r: 0.8 });
  for (const [x, z, ry] of [[-22.6, 3.0, -2.6], [-17.4, 3.0, 2.6], [-23.4, 0.6, -2.0], [-16.6, 0.6, 2.0], [-21.4, 5.6, -2.9], [-18.6, 5.6, 2.9]]) { place(scene, 'club_chair', { h: 0.92, rotY: ry }, x, 0, z); obstacles.push({ x, z, r: 0.45 }); }
  place(scene, 'vip_booth', { w: 3.2, rotY: 0 }, -24.6, 0, -2.6); obstacles.push({ x: -24.6, z: -2.6, r: 1.5 }, { x: -25.8, z: -2.7, r: 1.0 }, { x: -23.4, z: -2.7, r: 1.0 });
  place(scene, 'vip_rope', { w: 2.6 }, -24.6, 0, -0.5); obstacles.push({ x: -25.5, z: -0.5, r: 0.35 }, { x: -23.7, z: -0.5, r: 0.35 });
  let bucket = null; place(scene, 'champagne_bucket', { h: 0.55 }, -24.6, 0.52, -2.4, (o) => { bucket = o; o.visible = false; });
  place(scene, 'dj_booth', { w: 2.3 }, -15.4, 0, -2.9); obstacles.push({ x: -15.4, z: -2.9, r: 1.2 });

  // ---------- staff (loaded when the club opens) ----------
  const cast = {}; let loading = false, ready = false;
  const STAFF = { dancer_1: [POLE.x, POLE.z + 0.38, Math.PI, DECK], dancer_2: [-22.2, 4.2, Math.PI * 0.85, 0], bouncer: [-18.5, 7.0, Math.PI / 2, 0], dj: [-15.4, -3.75, 0, 0], vip_athlete: [-23.4, -1.9, Math.PI * 0.8, 0], shot_girl: [-24.5, 5.2, 0, 0], groom: [CLUB_SPOTS.groom.x, CLUB_SPOTS.groom.z, -Math.PI / 2, 0] };
  const NAMES = { dancer_1: 'Destiny', dancer_2: 'Diamond', bouncer: 'Bouncer', dj: 'DJ Fumble', vip_athlete: 'Tre "Primetime" Banks', shot_girl: 'Candy', groom: 'The Groom' };
  function load() {
    if (loading) return; loading = true;
    Promise.all([loadModels(N3_NAMES), loadN3Clips()]).then(() => {
      for (const [n, [x, z, ry, y]] of Object.entries(STAFF)) {
        const P = makePreset(n); P.group.position.set(x, y, z); P.baseY = y; P.group.rotation.y = ry; P.group.userData.zone = 'all'; scene.add(P.group);
        const tag = label(NAMES[n], n === 'groom' ? '#ffd0e8' : '#ff9ad5', 0.62); tag.position.y = 2.25; P.group.add(tag); cast[n] = { P, x, z, ry, y, t: Math.random() * 10 };
      }
      place(cast.shot_girl.P.group, 'shot_tray', { h: 0.14 }, 0, 0, 0, (o) => { cast.shot_girl.tray = o; o.traverse((m) => { m.userData.zone = 'all'; }); });
      ready = true;
    });
  }
  const bone = (P, re) => { const s = P.skinMesh; return s && s.skeleton ? s.skeleton.bones.find((b) => re.test(b.name)) : null; };
  const DANCES = ['clubDance1', 'clubDance2', 'clubDance3', 'clubDance4', 'clubDance5', 'clubDance6', 'clubDance7', 'clubJazz', 'hipHop'], POLE_MOVES = ['poleSpin', 'bodyRoll', 'hairFlip', 'poleKick', 'poleClimb'];
  const clip = (n, alt = 'idle') => (hasClip(n) ? 'clip:' + n : alt);

  // ---------- the stage performer (Amateur Night): whoever's dancing gets a stand-in at the pole, in their gear ----------
  let perf = null; // { pid, P, move, combo }
  function syncPerformer(S) {
    const st = S && S.n3 && S.n3.stage, pid = st ? st.pid : null;
    if (perf && perf.pid !== pid) { scene.remove(perf.P.group); const a = avatars.get(perf.pid); if (a) a.P.group.visible = true; perf = null; }
    if (pid && !perf) { const p = S.players.find((q) => q.id === pid); if (!p) return; const P = castOf(p); P.group.userData.zone = 'all'; P.group.position.set(POLE.x, DECK, POLE.z + 0.42); P.group.rotation.y = Math.PI; P.baseY = DECK; scene.add(P.group); perf = { pid, P, move: st.move || 'idle', combo: 0 }; }
    if (perf) { const a = avatars.get(pid); if (a) a.P.group.visible = false; }
  }
  BK.onStage = (m) => { if (perf && perf.pid === m.pid) { perf.move = m.move; perf.combo = m.combo || 0; } };
  const setMove = (move) => { if (perf) perf.move = move; }; // our own moves (polegame.js) show immediately

  // ---------- Make It Rain: E at the stage toggles the money gun; click fires $20 of singles at the stage ----------
  const gun = new THREE.Group(); gun.visible = false; camera.add(gun); gun.position.set(0.24, -0.2, -0.45); gun.rotation.set(0.1, Math.PI + 0.25, 0);
  place(gun, 'money_gun', { h: 0.2 }, 0, 0, 0, (o) => o.traverse((m) => { m.userData.zone = 'all'; }));
  const NB = 60, billGeo = new THREE.PlaneGeometry(0.15, 0.065), billMat = new THREE.MeshStandardMaterial({ color: 0x86c06e, emissive: 0x1e3a18, side: THREE.DoubleSide });
  const bills = Array.from({ length: NB }, () => { const m = new THREE.Mesh(billGeo, billMat); m.visible = false; m.userData.zone = 'all'; scene.add(m); return { m, v: new THREE.Vector3(), life: 0, w: new THREE.Vector3() }; });
  let bi = 0, rain = false, lastShot = 0;
  function fire(from, to, n = 3) { // a burst of bills from a point toward the stage
    for (let k = 0; k < n; k++) { const b = bills[bi = (bi + 1) % NB]; b.m.visible = true; b.m.position.copy(from); b.v.subVectors(to, from).multiplyScalar(0.7 + Math.random() * 0.4); b.v.y += 2.2 + Math.random(); b.v.x += (Math.random() - 0.5) * 1.2; b.life = 2.5; b.w.set(Math.random() * 9, Math.random() * 9, Math.random() * 9); }
  }
  const V = new THREE.Vector3(), V2 = new THREE.Vector3();
  function shoot() {
    if (!rain || performance.now() - lastShot < 160) return; lastShot = performance.now();
    if (!BK.S || BK.S.me.money < 20) { audio.sfx('buzz'); return; }
    BK.send({ type: 'rain', n: 1 }); audio.sfx('cash', { v: 0.5 }); camera.getWorldPosition(V); V2.set(POLE.x, DECK + 1, POLE.z + 0.6); fire(V.add(V2.clone().sub(V).setLength(0.6)), V2, 4);
  }
  BK.clubRain = () => rain;

  // ---------- stations ----------
  const S_ = () => BK.S, on = () => !!(S_() && S_().n3 && S_().n3.club), me_ = () => S_() && S_().n3 && S_().n3.me;
  const npcAt = (n) => () => (cast[n] ? cast[n].P.group.position : { x: 1e9, z: 1e9 });
  stations.push(
    { x: CLUB_SPOTS.rain.x, z: CLUB_SPOTS.rain.z, r: 1.8, on: () => on() && !BK.clubDancing(), get text() { const left = 200 - ((me_() && me_().rain) || 0); return rain ? `E - Put the money gun away (click fires $20 · $${left} more and a dancer talks)` : 'E - Make it rain ($20 a shot - every $200 on stage, a dancer answers a question about the game)'; }, act: () => { rain = !rain; gun.visible = rain; audio.sfx(rain ? 'chip' : 'click'); } },
    { x: CLUB_SPOTS.dance.x, z: CLUB_SPOTS.dance.z, r: 1.6, on: () => on() && !(S_().n3.stage), text: 'E - Amateur Night: dance on the pole for tips', act: () => BK.send({ type: 'danceStart' }) },
    { x: CLUB_SPOTS.rope.x, z: CLUB_SPOTS.rope.z, r: 1.8, on: () => on() && !(me_() && me_().vip), text: 'E - Bottle service in the VIP ($300)', act: () => BK.send({ type: 'vip' }) },
    { get x() { return npcAt('vip_athlete')().x; }, get z() { return npcAt('vip_athlete')().z + 0.9; }, r: 1.7, on: () => on() && !!(me_() && me_().vip), text: 'E - Talk to Primetime (a $50 drink buys one question about the game)', act: () => BK.send({ type: 'athleteTalk' }) },
    { get x() { return npcAt('shot_girl')().x; }, get z() { return npcAt('shot_girl')().z; }, r: 1.6, on: () => on(), text: 'E - Shot roulette with Candy', act: () => BK.openPanel && BK.openPanel('shots') },
    { get x() { return npcAt('groom')().x; }, get z() { return npcAt('groom')().z; }, r: 1.8, on: () => { const j = S_() && S_().me && S_().me.job; return on() && j && j.kind === 'groom' && j.stage === 'go'; }, text: 'E - "Come on, buddy. Your party\'s next door."', act: () => BK.send({ type: 'jobAct' }) },
  );

  // ---------- per frame ----------
  let groomT = 0, sentDeliver = 0;
  function update(dt, t) {
    const S = S_(), open = on();
    closed.visible = closedSign.visible = !open;
    if (open && !loading) load();
    if (rain && (!open || Math.hypot(me.x - CLUB_SPOTS.rain.x, me.z - CLUB_SPOTS.rain.z) > 3.5)) { rain = false; gun.visible = false; }
    if (ball) ball.rotation.y += dt * 0.6;
    for (const b of beams) { const a = t * 0.5 + b.ph; b.g.rotation.set(Math.sin(a) * 0.45, 0, Math.cos(a * 0.8) * 0.45); }
    for (const b of bills) { if (b.life <= 0) continue; b.life -= dt; b.v.y -= 4.5 * dt; b.v.multiplyScalar(1 - dt * 0.6); b.m.position.addScaledVector(b.v, dt); if (b.m.position.y < 0.02) { b.m.position.y = 0.02; b.v.set(0, 0, 0); } b.m.rotation.set(b.w.x * t, b.w.y * t, b.w.z * t); if (b.life <= 0) b.m.visible = false; }
    if (S && S.n3 && S.n3.rainAt !== undefined) {}
    if (open) syncPerformer(S);
    if (!ready) return;
    const inView = (BK.zonesMask ? BK.zonesMask() : 0xffff) & (1 << 5);
    for (const [n, c] of Object.entries(cast)) {
      const g = c.P.group; c.t += dt;
      if (n === 'groom') continue;
      g.visible = !!inView && open && !(perf && n === 'dancer_1');
      if (!g.visible) continue;
      if (n === 'dancer_1') { const k = Math.floor(c.t / 7) % 4; animate(c.P, clip(k % 2 ? POLE_MOVES[Math.floor(c.t / 14) % POLE_MOVES.length] : DANCES[Math.floor(c.t / 7) % DANCES.length]), t); }
      else if (n === 'dancer_2') animate(c.P, clip(DANCES[(Math.floor(c.t / 9) + 3) % DANCES.length]), t);
      else if (n === 'dj') animate(c.P, clip('djBounce', 'cheer'), t);
      else if (n === 'bouncer') animate(c.P, clip('alert'), t);
      else if (n === 'vip_athlete') animate(c.P, clip(c.t % 12 < 8 ? 'standDrink' : 'cheerBoth'), t);
      else if (n === 'shot_girl') { // walks her loop with the tray
        const seg = SHOT_PATH.length, sp = 1.0, per = SHOT_PATH.map((a, i) => Math.hypot(SHOT_PATH[(i + 1) % seg][0] - a[0], SHOT_PATH[(i + 1) % seg][1] - a[1])), tot = per.reduce((a, b) => a + b, 0);
        let d = (c.t * sp) % (tot + 8), i = 0; const pause = d > tot; if (pause) d = tot; while (i < seg - 1 && d > per[i]) { d -= per[i]; i++; }
        const a = SHOT_PATH[i], b = SHOT_PATH[(i + 1) % seg], k = Math.min(1, d / per[i]); g.position.set(a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k);
        if (!pause) g.rotation.y = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])); c.P.moveSpeed = pause ? 0 : sp; animate(c.P, pause ? 'idle' : 'walk', t, 0.6);
        const h = c.hand !== undefined ? c.hand : (c.hand = bone(c.P, /right.?hand$/i)); if (c.tray && h) { h.getWorldPosition(V); c.P.group.worldToLocal(V); c.tray.position.set(V.x, V.y + 0.05, V.z - 0.12); }
      }
    }
    // the groom: at the end of the bar until someone takes the job, then he follows them (stops and sits if they leave him behind)
    { const c = cast.groom; if (c) { const g = c.P.group, by = S && S.n3 && S.n3.groomBy; g.visible = open && !(S.n3.groomDone);
      if (by) { const tgt = by === S.you ? { x: me.x, z: me.z } : (avatars.get(by) ? avatars.get(by).P.group.position : null);
        if (tgt) { const dx = tgt.x - g.position.x, dz = tgt.z - g.position.z, d = Math.hypot(dx, dz); groomT = d > 7 ? groomT + dt : 0;
          if (d > 1.4 && groomT < 2) { const s = Math.min(d - 1.2, 2.6 * dt); g.position.x += dx / d * s; g.position.z += dz / d * s; g.rotation.y = Math.atan2(-dx, -dz); c.P.moveSpeed = 2.4; animate(c.P, 'walk', t, 0.8); }
          else animate(c.P, groomT >= 2 ? 'sit' : 'stagger', t); } }
      else { g.position.set(c.x, 0, c.z); animate(c.P, 'stagger', t); }
      const j = S && S.me && S.me.job; if (by === S.you && j && j.kind === 'groom' && j.stage === 'escort' && me.x > C.x0 && me.x < C.x1 && me.z > C.z0 && me.z < C.z1 && performance.now() - sentDeliver > 2000) { sentDeliver = performance.now(); BK.send({ type: 'jobAct' }); } } }
    // Amateur Night stand-in at the pole
    if (perf) { const P = perf.P; P.group.position.set(POLE.x, DECK, POLE.z + 0.42); animate(P, clip(perf.move, 'cheer'), t); tickCos && tickCos(P, t); if (perf.combo >= 8 && Math.random() < dt * 3) fire(V.set(POLE.x + (Math.random() - 0.5) * 5, 1.4, POLE.z + 3.5), V2.set(POLE.x, DECK + 0.5, POLE.z + 0.3), 1); }
    if (S && S.n3) { if (bucket) bucket.visible = !!(S.n3.me && S.n3.me.vip); }
  }
  const performerCam = (dt, t) => { // our own dance: a slow orbit of the stage from the crowd
    const a = Math.sin(t * 0.3) * 0.5; camera.position.set(POLE.x + Math.sin(a) * 4.6, 2.3, POLE.z + Math.cos(a) * 4.6); camera.lookAt(POLE.x, DECK + 1.1, POLE.z);
  };
  BK.clubDancing = () => !!(perf && BK.S && perf.pid === BK.S.you);
  return { update, shoot, setMove, performerCam, fire, POLE, DECK, CLUB, inClub: (x, z) => x > C.x0 && x < C.x1 && z > C.z0 && z < C.z1 };
}
