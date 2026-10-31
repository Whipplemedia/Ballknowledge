import * as THREE from 'three';
import { place } from './props.js';
import { makePreset, animate, loadModels, loadN3Clips, hasClip } from './people.js';
import { label } from './textures.js';

// Night 3's police (server n3.js streams them as {type:'cops'}): the squad car at the bar-side curb with its light bar going,
// two officers walking the beat with flashlights (a beam cone + a pool of light on the ground), their intro scene when the
// night starts (cine 'copsIntro'), the 60 s sobriety test when one of them stops you (five drills, harder the drunker you
// are), and the 50 s view from the back seat if you fail.
export const CAR = { x: -3.5, z: 13.6 };
const OFFICERS = { cop1: { model: 'cop_1', name: 'Officer Kowalski' }, cop2: { model: 'cop_2', name: 'Officer Reyes' } };

export function createCops({ scene, BK, audio, camera }) {
  // ---------- the car ----------
  const car = new THREE.Group(); car.position.set(CAR.x, 0, CAR.z); car.visible = false; car.userData.zone = 'all'; scene.add(car);
  place(car, 'squad_car', { w: 4.6, rotY: Math.PI }, 0, -0.08, 0, (o) => o.traverse((m) => { m.userData.zone = 'all'; }));
  const flash = (c) => new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const red = flash(0xff2030), blue = flash(0x2a6bff); red.position.set(-0.35, 1.62, 0.18); blue.position.set(-0.35, 1.62, -0.18); car.add(red, blue);
  const glow = (c) => { const m = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; return m; };
  const gR = glow(0xff2030), gB = glow(0x2a6bff); gR.position.z = 1.6; gB.position.z = -1.6; car.add(gR, gB);

  // ---------- the officers ----------
  const cops = new Map(); let loading = false;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3c8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xfff3c8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  function make(id) {
    const o = OFFICERS[id], P = makePreset(o.model); P.group.userData.zone = 'all'; scene.add(P.group);
    const tag = label(o.name, '#9cc4ff', 0.6); tag.position.y = 2.2; P.group.add(tag);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 18, 1, true), beamMat); beam.userData.zone = 'all'; scene.add(beam);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.0, 20), poolMat); pool.rotation.x = -Math.PI / 2; pool.userData.zone = 'all'; scene.add(pool);
    const c = { id, P, beam, pool, tx: 0, tz: 0, ry: 0, state: 'car', target: '', moving: 0, light: null };
    place(P.group, 'flashlight', { w: 0.32 }, 0, 0, 0, (f) => { c.light = f; f.traverse((m) => { m.userData.zone = 'all'; }); });
    cops.set(id, c); return c;
  }
  BK.onCops = (m) => {
    if (!m.c) { for (const c of cops.values()) { scene.remove(c.P.group, c.beam, c.pool); } cops.clear(); return; }
    if (!loading) { loading = true; Promise.all([loadModels(['cop_1', 'cop_2']), loadN3Clips()]).then(() => { loading = 'done'; }); }
    if (loading !== 'done') return;
    for (const [id, x, z, ry, state, target, moving] of m.c) { const c = cops.get(id) || make(id); if (!c.seen) { c.P.group.position.set(x, 0, z); c.seen = true; } Object.assign(c, { tx: x, tz: z, ry, state, target, moving }); }
  };
  const bone = (P) => { const s = P.skinMesh; return s && s.skeleton ? s.skeleton.bones.find((b) => /right.?hand$/i.test(b.name)) : null; };
  const V = new THREE.Vector3(), F = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion();
  const clip = (n, alt = 'idle') => (hasClip(n) ? 'clip:' + n : alt);

  // ---------- the sobriety test ----------
  const el = document.createElement('div'); el.id = 'sobriety'; el.innerHTML = '<div class="sb-card"><div class="sb-head"><b>SOBRIETY TEST</b><span class="sb-cop"></span><span class="sb-time"></span></div><div class="sb-title"></div><div class="sb-help"></div><canvas width="560" height="300"></canvas><div class="sb-tally"></div></div>';
  document.body.append(el);
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), titleEl = el.querySelector('.sb-title'), helpEl = el.querySelector('.sb-help'), tallyEl = el.querySelector('.sb-tally'), timeEl = el.querySelector('.sb-time');
  const DRILLS = [
    { id: 'line', title: 'Walk the line', help: 'Keep yourself on the line: A and D' },
    { id: 'pen', title: 'Follow my pen', help: 'Keep your eyes on the pen: move the mouse' },
    { id: 'abc', title: 'Alphabet, backwards, from Z', help: 'Type Z Y X W V U T S R Q' },
    { id: 'nose', title: 'Touch your nose', help: 'SPACE when your finger is on your nose. 2 of 3' },
    { id: 'leg', title: 'Stand on one leg', help: 'Keep your balance: A and D' },
  ];
  const DRILL_S = 11;
  let test = null; // { drill, t, drunk, passed, results[], st (drill state), keys{} }
  BK.onSobriety = (m) => { test = { i: -1, t: 0, drunk: Math.min(1, Math.max(0, (m.t.drunk - 15) / 75)), passed: 0, results: [], keys: {}, until: m.t.until }; el.querySelector('.sb-cop').textContent = m.cop; next(); el.classList.add('on'); audio.sfx('siren', { v: 0.5 }); document.exitPointerLock && null; };
  function next() {
    if (test.st) { const ok = test.st.done ? test.st.ok : grade(); test.results.push(ok); if (ok) test.passed++; }
    test.i++; test.t = 0;
    if (test.i >= DRILLS.length) { BK.send({ type: 'soberResult', passed: test.passed }); titleEl.textContent = test.passed >= 3 ? 'You passed.' : 'You failed.'; helpEl.textContent = `${test.passed} of 5`; setTimeout(() => { el.classList.remove('on'); test = null; }, 2200); test.over = true; return; }
    const d = DRILLS[test.i]; titleEl.textContent = `${test.i + 1}. ${d.title}`; helpEl.textContent = d.help;
    test.st = { id: d.id, x: 0, v: 0, inT: 0, tot: 0, px: 280, py: 150, typed: '', strikes: 0, tries: 0, hits: 0, phase: 0, ok: false, done: false };
  }
  function grade() { const s = test.st; if (s.id === 'line') return s.inT / Math.max(0.1, s.tot) >= 0.7; if (s.id === 'pen') return s.inT / Math.max(0.1, s.tot) >= 0.6; if (s.id === 'abc') return s.typed.length >= 10 && s.strikes <= 2; if (s.id === 'nose') return s.hits >= 2; if (s.id === 'leg') return !s.fell; return false; }
  const ABC = 'ZYXWVUTSRQ';
  function key(e) {
    if (!test || test.over) return false; const s = test.st; e.preventDefault();
    if (e.type === 'keydown') test.keys[e.code] = true; else { test.keys[e.code] = false; return true; }
    if (s.id === 'abc' && /^Key[A-Z]$/.test(e.code) && !s.done) { const ch = e.code[3]; if (ch === ABC[s.typed.length]) { s.typed += ch; if (s.typed.length >= 10) { s.done = true; s.ok = s.strikes <= 2; } } else { s.strikes++; audio.sfx('buzz', { v: 0.4 }); } }
    if (s.id === 'nose' && e.code === 'Space' && !e.repeat && s.tries < 3 && !s.done) { const fx = Math.sin(s.phase); s.tries++; if (Math.abs(fx) < 0.16) { s.hits++; audio.sfx('tick'); } else audio.sfx('buzz', { v: 0.4 }); if (s.tries >= 3 || s.hits >= 2) { s.done = true; s.ok = s.hits >= 2; } }
    return true;
  }
  function mouse(dx, dy) { if (!test || test.over) return false; const s = test.st; if (s.id === 'pen') { s.px = Math.max(0, Math.min(560, s.px + dx * 0.9)); s.py = Math.max(0, Math.min(300, s.py + dy * 0.9)); } return true; }
  function drawTest(dt) {
    if (!test || test.over) return; const s = test.st, k = test.keys, d = test.drunk, W = 560, H = 300; test.t += dt; s.tot += dt;
    timeEl.textContent = `${Math.max(0, Math.ceil(DRILL_S - test.t))}s`;
    g.fillStyle = '#0d1428'; g.fillRect(0, 0, W, H); g.strokeStyle = '#ffffff22'; g.strokeRect(0.5, 0.5, W - 1, H - 1);
    if (s.id === 'line' || s.id === 'leg') {
      const push = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), sway = (0.35 + d * 1.6) * (Math.sin(test.t * 1.7) + Math.sin(test.t * 0.63 + 2) * 0.8);
      s.v += (sway + (Math.random() - 0.5) * (1 + d * 4) + push * 2.6) * dt * (s.id === 'leg' ? 1.3 : 1); s.v *= 1 - dt * 1.6; s.x = Math.max(-1.2, Math.min(1.2, s.x + s.v * dt));
      if (s.id === 'line') { g.fillStyle = '#ffffff'; g.fillRect(W / 2 - 3, 20, 6, H - 40); g.fillStyle = '#ffffff22'; g.fillRect(W / 2 - 40, 20, 80, H - 40); const x = W / 2 + s.x * 160; g.fillStyle = Math.abs(s.x) < 0.25 ? '#27e08a' : '#ff4d5e'; g.beginPath(); g.arc(x, H * 0.62, 16, 0, Math.PI * 2); g.fill(); if (Math.abs(s.x) < 0.25) s.inT += dt; }
      else { if (Math.abs(s.x) > 1) s.fell = true; const a = s.x * 0.9; g.save(); g.translate(W / 2, H - 30); g.strokeStyle = '#ffffff55'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 200, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); g.rotate(a); g.strokeStyle = s.fell ? '#ff4d5e' : '#ffc83d'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -190); g.stroke(); g.restore(); if (s.fell) { g.fillStyle = '#ff4d5e'; g.font = '800 30px system-ui'; g.textAlign = 'center'; g.fillText('YOU FELL OVER', W / 2, 70); } }
    } else if (s.id === 'pen') {
      const tx = W / 2 + Math.sin(test.t * 1.3) * 200, ty = H / 2 + Math.sin(test.t * 2.1) * 90; s.px += Math.sin(test.t * 2.7) * d * 60 * dt; s.py += Math.cos(test.t * 2.3) * d * 50 * dt;
      g.fillStyle = '#ffc83d'; g.fillRect(tx - 3, ty - 26, 6, 40); g.beginPath(); g.arc(tx, ty - 28, 6, 0, Math.PI * 2); g.fill();
      const inn = Math.hypot(s.px - tx, s.py - ty) < 46; if (inn) s.inT += dt; g.strokeStyle = inn ? '#27e08a' : '#ff4d5e'; g.lineWidth = 3; g.beginPath(); g.arc(s.px, s.py, 18, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(s.px - 26, s.py); g.lineTo(s.px + 26, s.py); g.moveTo(s.px, s.py - 26); g.lineTo(s.px, s.py + 26); g.stroke();
    } else if (s.id === 'abc') {
      g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.font = '800 54px system-ui'; const shown = d > 0.5 ? s.typed.split('').map((c, i) => (i % 3 === 1 ? '?' : c)).join(' ') : s.typed.split('').join(' ');
      g.fillText(shown || '...', W / 2, H / 2); g.font = '700 20px system-ui'; g.fillStyle = s.strikes > 2 ? '#ff4d5e' : '#8f9bc7'; g.fillText(`Mistakes: ${s.strikes} (3 and you fail)`, W / 2, H - 40);
    } else if (s.id === 'nose') {
      s.phase += dt * (2.2 + d * 3.2); const fx = Math.sin(s.phase); g.fillStyle = '#ffffff22'; g.fillRect(W / 2 - 34, 40, 68, H - 80); g.fillStyle = '#f0c8a0'; g.beginPath(); g.arc(W / 2, H / 2, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffc83d'; g.fillRect(W / 2 + fx * 230 - 6, H / 2 - 50, 12, 70); g.font = '700 20px system-ui'; g.fillStyle = '#8f9bc7'; g.textAlign = 'center'; g.fillText(`Hits ${s.hits} / tries ${s.tries}`, W / 2, H - 20);
    }
    tallyEl.innerHTML = DRILLS.map((x, i) => `<span class="${i < test.results.length ? (test.results[i] ? 'ok' : 'bad') : i === test.i ? 'cur' : ''}">${i < test.results.length ? (test.results[i] ? '✔' : '✘') : i + 1}</span>`).join('');
    if (test.t >= DRILL_S || (s.done && test.t > 1.2 && s.id !== 'line' && s.id !== 'pen' && s.id !== 'leg')) next();
  }

  // ---------- per frame ----------
  let introT = null;
  function update(dt, t) {
    const S = BK.S, on = !!(S && S.n3 && S.n3.on), cine = S && S.cine && BK.now() < S.cine.until ? S.cine : null;
    car.visible = on && !(cine && cine.kind === 'opening');
    const blink = Math.floor(t * 4) % 2; red.material.opacity = blink ? 1 : 0.15; blue.material.opacity = blink ? 0.15 : 1; gR.material.opacity = blink ? 0.12 : 0.02; gB.material.opacity = blink ? 0.02 : 0.12;
    if (!(cine && cine.kind === 'copsIntro')) car.position.set(CAR.x, 0, CAR.z);
    for (const c of cops.values()) {
      const P = c.P, gp = P.group.position, k = Math.min(1, dt * 8), px = gp.x, pz = gp.z; gp.x += (c.tx - gp.x) * k; gp.z += (c.tz - gp.z) * k;
      let d = c.ry - P.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); P.group.rotation.y += d * Math.min(1, dt * 6);
      const sp = Math.hypot(gp.x - px, gp.z - pz) / Math.max(dt, 0.001); P.moveSpeed = sp; const hide = c.state === 'car' || !on;
      P.group.visible = !hide; c.beam.visible = c.pool.visible = !hide;
      if (hide) continue;
      animate(P, sp > 0.3 ? 'walk' : c.state === 'test' ? clip('explain', 'point') : clip('flashlightLook'), t, Math.min(1.2, sp / 2.2));
      const h = c.hand !== undefined ? c.hand : (c.hand = bone(P)); if (h) h.getWorldPosition(V); else V.copy(gp).add(F.set(0.3, 1.2, 0));
      if (c.light) { P.group.worldToLocal(F.copy(V)); c.light.position.copy(F); c.light.rotation.set(0, Math.PI / 2, -0.35); }
      const ry = P.group.rotation.y, dir = F.set(-Math.sin(ry), -0.42, -Math.cos(ry)).normalize(); // forward and down
      c.beam.position.copy(V).addScaledVector(dir, 3); Q.setFromUnitVectors(UP, dir.clone().negate()); c.beam.quaternion.copy(Q);
      c.pool.position.set(V.x + dir.x * 5.2, 0.04, V.z + dir.z * 5.2);
    }
    drawTest(dt);
  }
  // the intro: the car rolls up with its lights going, the officers get out, and one of them points the flashlight at you
  function scene_(c, u, dt, wt, ui) {
    const { shot, caption, cue } = ui, k = Math.min(1, u / 3.4), e = 1 - Math.pow(1 - k, 3); car.visible = true; car.position.set(CAR.x - 30 * (1 - e), 0, CAR.z);
    if (u < 0.2) cue('siren', () => { audio.sfx('siren', { v: 1 }); audio.sfx('siren', { v: 0.9, delay: 2.7 }); });
    if (u < 3.6) { shot(CAR.x + 7, 1.1, 10.2, car.position.x, 0.9, CAR.z); caption('', ''); return; }
    const cop = cops.get('cop1');
    if (u < 6.2) { shot(CAR.x + 4.2, 1.6, 9.6, CAR.x, 1.3, CAR.z - 1); caption('CITY POLICE', '"Somebody called in a noise complaint... and an illegal sportsbook."'); return; }
    if (cop) { const p = cop.P.group.position, ry = cop.P.group.rotation.y; shot(p.x - Math.sin(ry) * 2.1, 1.65, p.z - Math.cos(ry) * 2.1, p.x, 1.6, p.z); } else shot(CAR.x + 3, 1.6, 10.4, CAR.x, 1.3, CAR.z - 1.2);
    caption('"NOBODY WALKS AROUND OUT HERE DRUNK TONIGHT."', 'Stay sober on the street - or take a sobriety test. Fail it and you sit in the car.');
  }
  // failing: the back seat, behind the cage
  const cage = document.createElement('div'); cage.id = 'cagefx'; cage.innerHTML = '<div class="cg-bars"></div><div class="cg-time"></div>'; document.body.append(cage);
  function carCam(t) {
    const S = BK.S, until = S && S.n3 && S.n3.me && S.n3.me.carUntil, left = until ? (until - BK.now()) / 1000 : 0;
    cage.classList.toggle('on', left > 0); if (left <= 0) return false;
    cage.querySelector('.cg-time').textContent = `IN THE BACK OF THE SQUAD CAR · ${Math.ceil(left)}s`;
    camera.position.set(CAR.x - 0.6, 1.2, CAR.z - 1.05); camera.rotation.set(-0.04 + Math.sin(t * 0.4) * 0.02, Math.sin(t * 0.23) * 0.3, 0, 'YXZ'); return true; // the rear window on the curb side, looking out at the bar through the cage
  }
  const testing = () => !!(test && !test.over);
  const lookAtCop = () => { const S = BK.S; if (!S || !testing()) return null; const c = [...cops.values()].find((o) => o.target === S.you); return c ? c.P.group.position : null; };
  return { update, scene: scene_, key, mouse, carCam, testing, lookAtCop, inCar: () => { const S = BK.S, u = S && S.n3 && S.n3.me && S.n3.me.carUntil; return !!(u && u > BK.now()); } };
}
