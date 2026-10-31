import * as THREE from 'three';
import { animate, hasClip } from './people.js';
import { place as placeProp } from './props.js';
import { STORY } from './story.js';
import { JAR, ROOM } from './bar.js';

// The closing scenes (server: room.cine kind 'nightEnd' after nights 1-2 of a campaign, 'verdict' after the last night), driven by cine.js.
//  nightEnd: lights up, the night's deposit flies into the fund jar on the counter, the developer texts Lou. Then tomorrow's number.
//  verdict, saved: the count crosses the buyout, Lou hands over the check, Chase throws a tantrum and leaves in his supercar,
//    then the crew (everyone's own character, in their gear) celebrates in front of the bar: confetti, champagne, the credits.
//    If somebody died along the way (saved_cost) the party is the same but Lou pours one for them.
//  verdict, sold: the count comes up short, Chase dances, Lou alone, the SOLD sign, the wrecking ball, the credits on black.
// Props are Meshy models (blender/meshy_world.json); dances and reactions are the clips in public/models/clips_end.json.
const D = STORY.dev, O = STORY.owner, BUM = (STORY.bum && STORY.bum.name) || 'Dusty';
const AT_BAR = { x: 8.95, z: -0.6 }, LOU = { x: 11.15, z: -0.6 }, CHECK = { x: 10.12, z: 1.55 };
const DOOR = { x: 5, z: 8.6 }, CAR = { x: 1.4, z: 13.5 }, SIGN = { x: 7.9, z: 9.5 }, PIVOT = { x: 5, y: 17.5, z: 10.9 }, ROPE = 14.2;
const PARTY = { x: 7.3, z: 2.4 };
const DANCE = ['victory', 'ymca', 'dance', 'happyJump', 'hopArms', 'fistPump'], CROWD = ['cheerUp', 'fistPump', 'hopArms', 'happyJump'];
const clip = (n, alt = 'cheer') => (hasClip(n) ? 'clip:' + n : alt), once = (n, alt = 'idle') => (hasClip(n) ? 'once:' + n : alt);
const money = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
const clamp = (k) => Math.max(0, Math.min(1, k)), lerp = (a, b, k) => a + (b - a) * clamp(k), ease = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

export function createFinale({ scene, camera, BK, audio, bar, castOf, tickCos, avatars, ui }) {
  const { shot, caption, cue, door, fade, flash, put } = ui;
  const dev = bar.dev, lou = bar.owner;
  const R = {}; // the props, placed hidden once they're loaded

  // ---- the big check: the Meshy board, with the face painted on a canvas (amount, payee, Lou's signature)
  const ckCv = document.createElement('canvas'); ckCv.width = 1024; ckCv.height = 470; const ckTex = new THREE.CanvasTexture(ckCv); ckTex.colorSpace = THREE.SRGBColorSpace;
  function drawCheck(amount) {
    const g = ckCv.getContext('2d'), W = ckCv.width, H = ckCv.height;
    g.fillStyle = '#eef5e6'; g.fillRect(0, 0, W, H); g.strokeStyle = '#4f7f4c'; g.lineWidth = 16; g.strokeRect(10, 10, W - 20, H - 20); g.lineWidth = 3; g.strokeRect(34, 34, W - 68, H - 68);
    g.fillStyle = '#2b4a2a'; g.textBaseline = 'alphabetic'; g.font = '800 30px system-ui'; g.fillText(`${STORY.bar.toUpperCase()} · SAVE THE BAR FUND`, 64, 96); g.textAlign = 'right'; g.fillText('No. 0001', W - 64, 96); g.textAlign = 'left';
    g.font = '700 24px system-ui'; g.fillText('PAY TO THE', 64, 180); g.fillText('ORDER OF', 64, 208);
    g.font = '400 44px Bungee, "Arial Black", system-ui'; g.fillStyle = '#16301e'; g.fillText(D.full, 210, 206, 470); g.fillRect(205, 220, 470, 4);
    g.fillStyle = '#fff'; g.fillRect(700, 146, 260, 84); g.strokeStyle = '#2b4a2a'; g.strokeRect(700, 146, 260, 84); g.fillStyle = '#16301e'; g.font = '900 54px system-ui'; g.textAlign = 'center'; g.fillText(money(amount), 830, 208); g.textAlign = 'left';
    g.font = '700 24px system-ui'; g.fillStyle = '#2b4a2a'; g.fillText('MEMO', 64, 392); g.font = 'italic 600 34px Georgia, serif'; g.fillText('Now get out of our bar.', 150, 392); g.fillRect(146, 404, 430, 3);
    g.font = 'italic 52px "Brush Script MT", "Segoe Script", cursive'; g.fillStyle = '#1b2f6a'; g.fillText(O.full || O.name, 640, 386); g.fillStyle = '#2b4a2a'; g.fillRect(630, 404, 330, 3);
    ckTex.needsUpdate = true;
  }
  // ---- the SOLD sign: the rider panel says what's coming
  const sgCv = document.createElement('canvas'); sgCv.width = 512; sgCv.height = 256; const sgTex = new THREE.CanvasTexture(sgCv); sgTex.colorSpace = THREE.SRGBColorSpace;
  { const g = sgCv.getContext('2d'); g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#c41e2a'; g.fillRect(0, 0, 512, 22); g.fillRect(0, 234, 512, 22); g.fillStyle = '#1c1c22'; g.textAlign = 'center';
    g.font = '800 34px system-ui'; g.fillText('FUTURE HOME OF', 256, 76); g.font = '400 50px Bungee, "Arial Black", system-ui'; const nm = STORY.plan.name.toUpperCase(); g.fillText(nm.length > 16 ? nm.slice(0, 16) : nm, 256, 140);
    g.font = '700 24px system-ui'; g.fillText(D.company.toUpperCase(), 256, 200); }
  const facePlane = (o, tex, fit) => { // a painted face just in front of a placed prop's front (fit: fractions of its box)
    o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    m.scale.set(fit.w * (fit.alongZ ? s.z : s.x), fit.h * s.y, 1); m.position.set(0, fit.y * s.y, 0); m.position.add(fit.off); o.add(m); return m;
  };
  let loading = false;
  function load() {
    if (loading) return; loading = true;
    const hide = (name, then) => (o) => { o.visible = false; o.traverse((m) => { m.userData.zone = 'all'; }); R[name] = o; if (then) then(o); };
    placeProp(scene, 'big_check', { d: 1.25, rotY: Math.PI / 2 }, CHECK.x, 1.14, CHECK.z, hide('check', (o) => { /* the model's face is its -z side: turned to the customers (-x) */
      o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), f = new THREE.Mesh(new THREE.PlaneGeometry(sz.z * 0.92, sz.y * 0.86), new THREE.MeshStandardMaterial({ map: ckTex, roughness: 0.8 }));
      f.rotation.y = -Math.PI / 2; f.position.set(b.min.x - o.position.x - 0.012, sz.y / 2, (b.min.z + b.max.z) / 2 - o.position.z); o.add(f); }));
    placeProp(scene, 'champagne', { h: 0.34 }, 0, -50, 0, hide('bottle'));
    placeProp(scene, 'dev_car', { w: 4.4 }, CAR.x, -0.08, CAR.z, hide('car'));
    placeProp(scene, 'sold_sign', { h: 1.75 }, SIGN.x, 0, SIGN.z, hide('sign', (o) => facePlane(o, sgTex, { w: 0.6, h: 0.27, y: 0.47, off: new THREE.Vector3(0, 0, 0.06) })));
    // the wrecking ball hangs from a long cable off a crane nobody can see
    const pend = new THREE.Group(); pend.position.set(PIVOT.x, PIVOT.y, PIVOT.z); pend.visible = false; pend.userData.zone = 'all'; scene.add(pend); R.pend = pend;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, ROPE - 1.7, 6), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.7, roughness: 0.5 })); cable.position.y = -(ROPE - 1.7) / 2; cable.userData.zone = 'all'; pend.add(cable);
    placeProp(pend, 'wrecking_ball', { h: 3.2 }, 0, -ROPE - 0.6, 0, (o) => { o.traverse((m) => { m.userData.zone = 'all'; }); R.ball = o; }); /* it swings across zones: always drawn */
  }
  setTimeout(load, 12000); // in the background, well before anyone gets to closing time

  // ---- particles: confetti, champagne spray, the bills into the jar, brick debris and dust
  const soft = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })(); // round, soft-edged points
  const COLORS = [0xffd04a, 0x3dff7e, 0xff4a6a, 0x4ac8ff, 0xffffff, 0xff9a2a].map((c) => new THREE.Color(c));
  const NC = 360, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.045, 0.026), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), NC); conf.visible = false; conf.frustumCulled = false; scene.add(conf);
  const cp = Array.from({ length: NC }, (_, i) => ({ p: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), fall: 0.45 + Math.random() * 0.5, ph: Math.random() * 6.28, c: COLORS[i % COLORS.length] }));
  cp.forEach((o, i) => conf.setColorAt(i, o.c));
  let confAt = PARTY; // where the confetti falls: the party line, or in front of the big TV when the crew calls the champion
  const respawn = (o, top) => o.p.set(confAt.x - 3.2 + Math.random() * 4.8, top ? 3.6 + Math.random() * 1.2 : Math.random() * 4.6, confAt.z - 3.4 + Math.random() * 6.8);
  const NS = 260, spray = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xfff4cc, size: 0.05, map: soft, transparent: true, opacity: 0.95, depthWrite: false })); spray.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3).fill(-99), 3)); spray.frustumCulled = false; spray.visible = false; scene.add(spray);
  const sp = Array.from({ length: NS }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), life: 0 })); let spNext = 0;
  const NB = 14, billMat = new THREE.MeshStandardMaterial({ color: 0x7fc06a, emissive: 0x1e3a18, roughness: 0.8, side: THREE.DoubleSide }), bills = Array.from({ length: NB }, (_, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.09), billMat); m.visible = false; scene.add(m); return { m, t0: 0.25 * i, from: new THREE.Vector3(9.2, 1.75 + Math.random() * 0.2, JAR.z + 0.45 - Math.random() * 0.9) }; });
  const ND = 80, deb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.13, 0.16), new THREE.MeshStandardMaterial({ color: 0xa85a3e, emissive: 0x2a120a, roughness: 0.95 }), ND); deb.visible = false; deb.frustumCulled = false; scene.add(deb);
  const dp = Array.from({ length: ND }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
  const NU = 140, dust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x9a8c7c, size: 0.9, map: soft, transparent: true, opacity: 0.4, depthWrite: false })); dust.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NU * 3), 3)); dust.frustumCulled = false; dust.visible = false; scene.add(dust);
  const du = Array.from({ length: NU }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3() }));
  for (const o of [conf, spray, deb, dust, ...bills.map((b) => b.m)]) o.userData.zone = 'all'; // zones.js: drawn wherever the camera is
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), V2 = new THREE.Vector3();

  // ---- overlays: Chase's texts on Lou's phone, and the credits
  const phone = document.createElement('div'); phone.id = 'cinephone'; document.body.append(phone);
  const credits = document.createElement('div'); credits.id = 'credits'; document.body.append(credits);
  const setPhone = (msgs, typing) => { const html = msgs.length || typing ? `<div class="ph-head"><b>${esc(D.full)}</b><i>${esc(D.company)}</i></div>${msgs.map((m) => `<p>${esc(m)}</p>`).join('')}${typing ? '<p class="typing"><i></i><i></i><i></i></p>' : ''}` : ''; if (phone.innerHTML !== html) phone.innerHTML = html; phone.classList.toggle('on', !!html); };
  function rollCredits(c) {
    const T = c.tally || {}, S = BK.S || {}, names = (S.players || []).filter((p) => (c.crew || []).includes(p.id)).map((p) => p.name), rows = [];
    const row = (k, v) => { if (v !== null && v !== undefined && v !== '' && v !== 0 && v !== '$0') rows.push(`<div class="cr-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`); };
    row('The crew', names.join(' · ')); row('Raised for the fund', `${money(c.banked)} of ${money(c.buyout)}`); row(c.nights > 1 ? 'Nights' : 'Night', c.nights);
    row('Ball Knowledge MVP', c.mvp); if (c.calledIt && c.champ) row('Called the championship', c.champ);
    if (T.bigWin) row('Biggest hit', `${T.bigWin.name}: +${money(T.bigWin.amt)} (${T.bigWin.label})`);
    row('Cigarettes smoked', T.cigs); row('Gas station beers', T.beers); row('Pouches fished out of a urinal', T.zyn);
    if (T.robbed) row(`Times ${BUM} picked a pocket`, `${T.robbed} (${money(T.robbedAmt)})`); row("Sal's men thrown out", T.fights);
    row('ATM withdrawals', T.atm ? money(T.atm) : 0); row('Scratch-off winnings', T.scratch ? money(T.scratch) : 0);
    const mem = (c.dead || []).length ? `<div class="cr-mem">In memory of ${esc(c.dead.join(' & '))}<span>taken to the back room</span></div>` : '';
    const end = c.saved ? `${O.name} is still pouring. First round's on him.` : `${STORY.plan.name[0].toUpperCase() + STORY.plan.name.slice(1)}: units from $1.2M. No TVs.`;
    credits.className = c.saved ? 'saved' : 'sold';
    credits.innerHTML = `<div class="cr-in"><div class="cr-kick">${c.saved ? 'Still open' : `${O.since} - ${new Date().getFullYear()}`}</div><h2>${esc(STORY.bar)}</h2><div class="cr-rows">${rows.join('')}</div>${mem}<div class="cr-end">${esc(end)}</div></div>`;
    [...credits.querySelectorAll('.cr-row,.cr-mem,.cr-end')].forEach((el, i) => { el.style.animationDelay = (0.5 + i * 0.32).toFixed(2) + 's'; });
  }

  // ---- the cast: everyone who made it, as their own character in their own gear; the regulars cheer; Lou is puppeted
  let run = null; // per scene: { start, cast: [{P}], took: [{n, x, y, z, ry, vis}], hid: [avatar groups] }
  function begin(c) {
    end(); load(); run = { start: c.start, cast: [], took: [], hid: [], poured: false, spray: 0, impact: 0 };
    if (c.kind === 'verdict') { drawCheck(c.buyout); if (c.saved) { const ps = ((BK.S && BK.S.players) || []).filter((p) => (c.crew || []).includes(p.id)); const mvpFirst = [...ps].sort((a, b) => (b.name === c.mvp) - (a.name === c.mvp)); run.cast = mvpFirst.map((p, i) => ({ P: castOf(p), i })); for (const m of run.cast) { m.P.group.visible = false; scene.add(m.P.group); } } }
  }
  function take(n) { if (!n || run.took.some((o) => o.n === n)) return; const g = n.P.group; run.took.push({ n, x: g.position.x, y: g.position.y, z: g.position.z, ry: g.rotation.y, vis: g.visible, rx: g.rotation.x }); n.cine = true; }
  function end() {
    if (!run) return;
    for (const o of run.took) { const g = o.n.P.group; o.n.cine = false; g.position.set(o.x, o.y, o.z); g.rotation.y = o.ry; g.rotation.x = o.rx; g.visible = o.vis; }
    for (const g of run.hid) g.visible = true; for (const m of run.cast) scene.remove(m.P.group);
    for (const k of ['check', 'bottle', 'car', 'sign', 'pend']) if (R[k]) R[k].visible = false;
    conf.visible = spray.visible = deb.visible = dust.visible = false; bills.forEach((b) => (b.m.visible = false));
    setPhone([]); credits.className = ''; credits.innerHTML = ''; run = null;
  }
  const lou_ = (mode, wt) => { take(lou); put(lou, LOU.x, LOU.z, Math.PI / 2, mode, wt); };
  const crowd = (on, wt, kinds = CROWD) => { // the standing regulars react; the seated ones keep doing what they do
    let i = 0; for (const n of bar.npcs) { if (n === lou || n === dev || n.seated || n.life || !n.P.skinned || n.name === 'Uncle Sal') continue; if (!on && !run.took.some((o) => o.n === n)) continue; take(n); const g = n.P.group; g.visible = Math.hypot(g.position.x - camera.position.x, g.position.z - camera.position.z) > 1.8; animate(n.P, on ? clip(kinds[i++ % kinds.length], 'cheer') : 'idle', wt); }
  };
  const hideCrew = () => { for (const a of avatars.values()) if (a.P.group.visible) { a.P.group.visible = false; run.hid.push(a.P.group); } };
  function party(u, wt, dt) { // the crew lined up in front of the bar, each with their own dance; the first one has the champagne
    const n = run.cast.length, gap = Math.min(1.15, 5.6 / Math.max(1, n));
    run.cast.forEach((m, i) => { const g = m.P.group, z = PARTY.z + (i - (n - 1) / 2) * gap; g.visible = true; g.position.set(PARTY.x + (i % 2) * 0.35, 0, z); g.rotation.y = Math.PI / 2 + Math.sin(i * 1.7) * 0.25;
      animate(m.P, i === 0 ? clip('cheerUp') : clip(DANCE[(i - 1) % DANCE.length]), wt); tickCos(m.P, wt); });
    // champagne in the first one's right hand (copied from the hand bone each frame), spraying toward the camera
    const m0 = run.cast[0], b = R.bottle;
    if (m0 && b) {
      const sk = m0.P.skinMesh, hand = m0._hand !== undefined ? m0._hand : (m0._hand = sk && sk.skeleton ? sk.skeleton.bones.find((x) => /right.?hand$/i.test(x.name)) || null : null);
      if (hand) hand.getWorldPosition(V); else V.copy(m0.P.group.position).add(V2.set(-0.2, 1.9, 0.25));
      b.visible = true; b.rotation.set(0, 0, 0.75); b.position.copy(V).add(V2.set(0.08, -0.12, 0)); b.updateMatrixWorld(true);
      const tip = V2.set(0, 0.34, 0).applyMatrix4(b.matrixWorld);
      if (u > 0.3) cue('cork', () => audio.sfx('cork', { v: 1.2 }));
      if (u > 0.3 && u < 6) { run.spray += dt * 70; while (run.spray >= 1) { run.spray--; const o = sp[spNext = (spNext + 1) % NS]; o.p.copy(tip); o.v.set(-1.6 - Math.random() * 1.6, 1.6 + Math.random() * 1.8, (Math.random() - 0.5) * 1.4); o.life = 1.3; } }
    }
    spray.visible = true; const pa = spray.geometry.attributes.position;
    sp.forEach((o, i) => { if (o.life > 0) { o.life -= dt; o.v.y -= 6 * dt; o.p.addScaledVector(o.v, dt); if (o.life <= 0 || o.p.y < 0) o.p.y = -99; } pa.setXYZ(i, o.p.x, o.p.y, o.p.z); }); pa.needsUpdate = true;
    confetti(dt, wt);
  }
  function confetti(dt, wt) { // from the ceiling
    if (!conf.visible) { conf.visible = true; cp.forEach((o) => respawn(o, false)); }
    cp.forEach((o, i) => { o.p.y -= o.fall * dt; o.p.x += Math.sin(wt * 2 + o.ph) * 0.25 * dt; o.r.set(o.w.x * wt, o.w.y * wt, o.w.z * wt); if (o.p.y < 0.02) respawn(o, true); M4.compose(o.p, Q.setFromEuler(o.r), ONE); conf.setMatrixAt(i, M4); });
    conf.instanceMatrix.needsUpdate = true;
  }
  function jarBills(u, dt) { // the night's cash, a bill at a time, into the jar
    for (const b of bills) { const k = (u - b.t0) / 0.7; b.m.visible = k > 0 && k < 1; if (!b.m.visible) continue;
      b.m.position.set(lerp(b.from.x, JAR.x, k), lerp(b.from.y, JAR.y + 0.36, k) + Math.sin(Math.PI * clamp(k)) * 0.35, lerp(b.from.z, JAR.z, k)); b.m.rotation.set(u * 7 + b.t0, u * 5, u * 3); if (k > 0.9) cue('bill' + b.t0, () => audio.sfx('cash', { v: 0.35 })); }
  }
  function wreck(u, dt) { // u: seconds since the swing started. A pendulum off-screen: back, then down into the storefront
    const P = R.pend; if (!P) return; P.visible = true;
    const k = clamp(u / 1.45), th = lerp(-0.46, 0.19, k * k); /* gravity: slow, then fast */ P.rotation.x = run.impact ? 0.19 : th;
    if (!run.impact && k >= 1) { run.impact = u; audio.sfx('crash', { v: 1.4 }); audio.sfx('bonk', { v: 1.2, delay: 0.05 }); flash.style.opacity = 0.5;
      deb.visible = dust.visible = true; dp.forEach((o) => { o.p.set(PIVOT.x + (Math.random() - 0.5) * 2.4, 2.4 + Math.random() * 1.8, 8.3); o.v.set((Math.random() - 0.5) * 6, 1 + Math.random() * 5, 2 + Math.random() * 6); o.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12); });
      du.forEach((o) => { o.p.set(PIVOT.x + (Math.random() - 0.5) * 2, 3.2 + (Math.random() - 0.5) * 1.5, 8.5); o.v.set((Math.random() - 0.5) * 3, Math.random() * 1.2, 0.6 + Math.random() * 2.2); }); }
    if (run.impact) {
      const s = u - run.impact; flash.style.opacity = Math.max(0, 0.5 - s * 3);
      dp.forEach((o, i) => { if (o.p.y > 0.05) { o.v.y -= 9.8 * dt; o.p.addScaledVector(o.v, dt); o.r.set(o.w.x * s, o.w.y * s, o.w.z * s); } else { o.p.y = 0.05; o.v.set(0, 0, 0); } M4.compose(o.p, Q.setFromEuler(o.r), ONE); deb.setMatrixAt(i, M4); }); deb.instanceMatrix.needsUpdate = true;
      const pa = dust.geometry.attributes.position; du.forEach((o, i) => { o.v.multiplyScalar(1 - dt * 0.8); o.p.addScaledVector(o.v, dt); pa.setXYZ(i, o.p.x, o.p.y, o.p.z); }); pa.needsUpdate = true; dust.material.size = 0.9 + s * 0.8; dust.material.opacity = Math.max(0, 0.4 - s * 0.12);
    }
    return run.impact ? u - run.impact : -1;
  }
  const count = (c, u, t0, t1) => lerp(c.banked - (c.deposit || 0), c.banked, ease((u - t0) / (t1 - t0)));
  const shakeCam = (amt) => { camera.position.x += (Math.random() - 0.5) * amt; camera.position.y += (Math.random() - 0.5) * amt; };
  const jarShot = (u, t0) => shot(9.0 + (u - t0) * 0.03, 1.5, JAR.z + 0.12, JAR.x, 1.3, JAR.z - 0.02);
  const across = () => shot(10.35, 1.68, 0.75, AT_BAR.x, 1.55, AT_BAR.z);
  const louClose = (u) => shot(9.7 - u * 0.02, 1.62, -0.25, LOU.x, 1.6, LOU.z);
  const wide = (u) => shot(-1.5 + u * 0.15, 2.6, 5.4, 8, 1.3, -0.8);

  // u: seconds into the scene, wt: the world clock (for characters the bar also animates, so their clips keep playing smoothly)
  function scene_(c, u, dt, wt) {
    if (!run || run.start !== c.start) begin(c);
    const N = c.night || 1;
    if (c.kind === 'finalOn') { // the championship goes on the air: the room turns to the big TV and goes quiet
      shot(0.6 - u * 0.08, 1.85, 3.2 - u * 0.35, 0, 2.9, -ROOM.z); crowd(false, wt); lou_('idle', wt);
      cue('hush', () => { audio.sfx('murmur', { v: 0.9 }); audio.sfx('bell', { delay: 0.4, v: 0.7 }); });
      caption('THE CHAMPIONSHIP', `${c.a} vs ${c.b}. It all comes down to this.`); return;
    }
    if (c.kind === 'finalCall') { // the last play in slow motion on the big TV (tv.js draws the replay), then the room erupts or groans
      if (u < 5.5) { shot(0, 3.05, -4.0 + u * 0.1, 0, 2.95, -ROOM.z); /* over the sportsbook terminal */ crowd(false, wt); caption('', ''); return; }
      const v = u - 5.5; shot(0.4 + v * 0.1, 2.4, -6.2, 0.6, 1.5, 3); lou_(c.called ? clip('victory') : once('headPain'), wt);
      crowd(true, wt, c.called ? CROWD : ['shrug', 'headPain', 'dumbfounded', 'shout']);
      if (c.called) { confAt = { x: 0, z: -3 }; confetti(dt, wt); cue('erupt', () => { audio.sfx('cheer', { v: 1.3 }); audio.sfx('horn', { delay: 0.2 }); audio.sfx('bigwin', { delay: 0.5 }); flash.style.opacity = 0.5; }); flash.style.opacity = Math.max(0, 0.5 - v * 1.2); }
      else cue('groan', () => { audio.sfx('groan', { v: 1.2 }); audio.sfx('boo', { delay: 0.3, v: 0.8 }); });
      if (c.voided) caption('VOIDED', 'League investigators void the championship. Nobody called it.');
      else caption(`CHAMPIONS: ${String(c.winner).toUpperCase()}`, `${c.ws}-${c.ls}${c.ot ? ' (OT)' : ''}. ${c.called ? (c.fixed ? 'The crew called it... with a little help from Sal.' : 'The crew called it!') : 'Nobody saw that coming.'}`);
      return;
    }
    if (c.kind === 'nightEnd') {
      if (u < 3.5) { wide(u); lou_('polish', wt); crowd(false, wt); cue('bell', () => audio.sfx('bell', { v: 0.8 })); caption(`NIGHT ${N} IS IN THE BOOKS`, `Last call at ${STORY.bar}.`); return; }
      if (u < 9.5) { jarShot(u, 3.5); jarBills(u - 3.8, dt); lou_(c.deposit >= c.goal && c.deposit > 0 ? clip('fistPump') : c.deposit > 0 ? 'idle' : once('headPain'), wt);
        const g = (c.gave || [])[0]; caption(c.deposit > 0 ? `+${money(c.deposit)} IN THE JAR` : 'NOTHING IN THE JAR TONIGHT', `The fund: ${money(count(c, u, 3.8, 8))} of ${money(c.buyout)}${g ? ` · ${g.name} put in ${money(g.gave)}` : ''}`); return; }
      const v = u - 9.5, onPace = c.deposit >= c.goal && c.deposit > 0, dead = (c.dead || [])[0];
      louClose(v); lou_('idle', wt); cue('buzz', () => audio.sfx('vibrate', { v: 0.8 }));
      const msgs = [...(dead ? [`Heard about ${dead}. Tragic. Anyway.`] : []), ...(onPace ? ['...ok. Lucky night.', `${money(c.need)} a night is still a lot, ${O.name}. 😐`] : c.deposit > 0 ? [`${money(c.deposit)}? Cute.`, `You need ${money(c.need)} a night now. I'm already picking out countertops. 🏙️`] : ['Rough night? 😂', `${money(c.need)} a night now. The architects say hi.`])];
      const shown = Math.min(msgs.length, Math.floor(Math.max(0, v - 0.6) / 1.4) + 1); setPhone(msgs.slice(0, shown), shown < msgs.length && v > 0.6);
      caption(`TOMORROW: NIGHT ${N + 1} OF ${c.nights}`, `Tomorrow's goal: ${money(c.need)} in winnings.`); return;
    }
    // ---- the verdict
    const saved = c.saved, dead = c.dead || [];
    if (u < 4) { wide(u); lou_('idle', wt); crowd(!!c.calledIt, wt); put(dev, AT_BAR.x, AT_BAR.z, -Math.PI / 2, 'idle', u);
      if (c.calledIt) { cue('called', () => { audio.sfx('cheer', { v: 1 }); audio.sfx('horn', { delay: 0.3 }); }); caption('CALLED IT.', `${c.champ || 'The champs'} win it all - the crew saw it coming${saved ? '.' : '. If only that were enough.'}`); }
      else caption('CLOSING TIME', `Last night. Everything rides on the jar.`);
      return;
    }
    if (u < 10) { jarShot(u, 4); jarBills(u - 4.3, dt); crowd(false, wt); const cnt = count(c, u, 4.3, 8.3), over = saved && u > 8.3;
      lou_(over ? clip('victory') : saved ? 'idle' : u > 8.3 ? once('headPain') : 'idle', wt);
      if (over) { cue('paid', () => { audio.sfx('horn'); audio.sfx('bigwin', { delay: 0.1 }); flash.style.opacity = 0.6; }); flash.style.opacity = Math.max(0, 0.6 - (u - 8.3) * 1.5); caption('PAID IN FULL.', `${money(c.banked)} in the jar${c.banked > c.buyout ? ` - ${money(c.banked - c.buyout)} to spare` : ''}.`); }
      else if (!saved && u > 8.3) { cue('short', () => audio.sfx('lose')); caption(`SHORT BY ${money(c.buyout - c.banked)}`, `${money(c.banked)} of ${money(c.buyout)}.`); }
      else caption(money(cnt), `of ${money(c.buyout)}`);
      return;
    }
    if (saved) {
      if (u < 14.5) { shot(7.0 - (u - 10) * 0.06, 1.55, 1.9, 9.2, 1.4, 0.4); if (R.check) R.check.visible = true; put(dev, AT_BAR.x - 0.3, AT_BAR.z + 0.2, Math.atan2(2.1, -2.9), clip('tantrum', 'stagger'), u); lou_('idle', wt); cue('boo', () => audio.sfx('boo', { v: 0.8 })); caption(`"THIS ISN'T OVER."`, `${D.full} takes the check. Barely.`); return; }
      if (u < 17) { louClose(u - 14.5); if (R.check) R.check.visible = false; lou_(clip('fistPump'), wt); const w = walk(u, 14.5, 17.2, AT_BAR, DOOR); put(dev, w.x, w.z, w.ry, 'walk', u, w.sp); caption(O.name.toUpperCase(), `"Get out of my bar, ${D.name}."`); return; }
      if (u < 21.5) { // outside: to the car, and gone
        door(ui.doors.front, u < 18.6, dt); const w = walk(u, 17, 18.7, DOOR, { x: CAR.x + 0.9, z: CAR.z - 1.1 }); if (u < 18.7) put(dev, w.x, w.z, w.ry, 'walk', u, w.sp); else dev.P.group.visible = false;
        const car = R.car, a = Math.max(0, u - 19.2), cx = CAR.x - 4 * a * a; if (car) { car.visible = true; car.position.x = cx; }
        if (u > 19.0) cue('rev', () => audio.sfx('rev', { v: 1.2, pos: { x: CAR.x, y: 0.6, z: CAR.z } }));
        shot(10.2, 1.55, 10.4, lerp(4.5, cx + 1, (u - 17.5) / 3.5), 1.0, lerp(9.8, CAR.z, (u - 17) / 2)); caption('SEE YOU NEVER.', `${D.full}, leaving in a hurry.`); return;
      }
      // the party
      dev.P.group.visible = false; if (R.car) R.car.visible = false; if (R.check) R.check.visible = true; hideCrew();
      const v = u - 21.5; party(v, wt, dt); lou_(dead.length ? clip('drink', 'drink') : clip('ymca'), wt);
      cue('party', () => { audio.sfx('cheer', { v: 1.2 }); audio.sfx('horn', { delay: 0.4 }); audio.sfx('bigwin', { delay: 0.7 }); });
      if (v < 6.5) { const k = ease(v / 6.5); shot(4.4, 1.55 + k * 0.2, lerp(-0.4, 5.0, k), PARTY.x, 1.25, PARTY.z + (k - 0.5) * 2); }
      else { const a = (v - 6.5) * 0.08; shot(PARTY.x - 4.2 * Math.cos(a), 2.4, PARTY.z + 4.2 * Math.sin(a) - 0.6, PARTY.x + 1, 1.3, PARTY.z); }
      crowd(true, wt);
      if (v > 5.5) { cue('credits', () => rollCredits(c)); credits.classList.add('on'); caption('', ''); }
      else caption(dead.length ? 'SAVED.' : 'SAVED!', dead.length ? `${STORY.bar} stays open. ${dead.join(' and ')} didn't make it out of the back room - ${O.name} pours one for them.` : `${STORY.bar} stays open. ${O.name} pours a round for the house.`);
      return;
    }
    // sold
    if (u < 13) { across(); put(dev, AT_BAR.x, AT_BAR.z, -Math.PI / 2, clip('dance', 'cheer'), u); lou_(once('headPain'), wt); cue('laugh', () => audio.sfx('laugh', { v: 1 })); caption(`"PLEASURE DOING BUSINESS."`, `${STORY.bar} is going to be ${STORY.plan.name}.`); return; }
    if (u < 16) { louClose(u - 13); dev.P.group.visible = false; lou_(once('dumbfounded', 'idle'), wt); fade.style.opacity = Math.min(0.35, (u - 13) * 0.2); caption(O.name.toUpperCase(), `"Since ${O.since}. ...Last call, everybody."`); return; }
    // outside: the sign, his car at the curb, and the ball
    if (R.sign) R.sign.visible = true; if (R.car) { R.car.visible = true; R.car.position.x = CAR.x; }
    const after = wreck(u - 17.3, dt);
    if (u < 17.4) shot(9.0 - (u - 16) * 0.2, 1.35, 12.4, SIGN.x - 0.4, 1.15, SIGN.z); else shot(12.6, 2.4, 15.2 - (u - 17.4) * 0.15, 4.8, 4.0, 11.2); /* the sign, then wide from down the street for the swing */ if (after >= 0 && after < 1.4) shakeCam(0.25 * (1 - after / 1.4));
    fade.style.opacity = after > 1.1 ? Math.min(1, (after - 1.1) / 1.4) : 0;
    if (after > 2.6) { cue('credits', () => rollCredits(c)); credits.classList.add('on'); caption('', ''); }
    else caption('SOLD.', `Coming soon: ${STORY.plan.name} - ${STORY.plan.pitch}.`);
  }
  const walk = (u, t0, t1, a, b) => { const k = clamp((u - t0) / (t1 - t0)); return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), ry: Math.atan2(-(b.x - a.x), -(b.z - a.z)), sp: Math.hypot(b.x - a.x, b.z - a.z) / (t1 - t0) }; };
  return { scene: scene_, end, load };
}
