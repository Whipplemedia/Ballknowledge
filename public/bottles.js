// Throwable bottles. Grab at the bar; click (or F / right-click) throws. Glass shatters on anything; a bottle that hits a player or NPC knocks
// them out for 5s. Flight is simulated on every client from the thrower's {pos, vel}; only the thrower reports hits (server validates).
import * as THREE from 'three';
import { audio } from './audio.js';

export function createBottles({ scene, camera, BK, me, obstacles, getAvatars, getNpcs, getGoons = () => [], getBrawlers = () => [], ROOM, busy }) {
  const G = 9.8, SPEED = 12.5;
  const glass = new THREE.MeshStandardMaterial({ color: 0x2f8a46, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82 });
  const label = new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.8 }), cap = new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.8, roughness: 0.3 });
  const make = (gm = glass) => { const g = new THREE.Group(); const glass = gm;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.2, 10), glass); body.position.y = 0.0; g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.036, 0.1, 10), glass); neck.position.y = 0.15; g.add(neck);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.03, 8), cap); lip.position.y = 0.215; g.add(lip);
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0415, 0.0415, 0.07, 10, 1, true), label); lab.position.y = -0.01; g.add(lab); return g; };
  const st = { held: 0, flying: [], shards: [] };

  // first-person bottle
  const hand = make(); hand.position.set(0.26, -0.27, -0.62); hand.rotation.set(0.35, 0, -0.25); hand.scale.setScalar(0.8); hand.visible = false; camera.add(hand);
  const hud = document.createElement('div'); hud.id = 'bottlehud'; hud.className = 'hidden'; document.body.appendChild(hud);
  const ko = document.createElement('div'); ko.id = 'kooverlay'; ko.className = 'hidden'; document.body.appendChild(ko);
  const paint = () => { hand.visible = st.held > 0; hud.classList.toggle('hidden', st.held <= 0); hud.innerHTML = `🍾 ×${st.held} <kbd>CLICK</kbd> throw`; };

  const shatter = (p) => {
    audio.sfx('glassBreak', { pos: { x: p.x, y: p.y, z: p.z }, ref: 3 });
    for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.016 + Math.random() * 0.014), glass); m.position.copy(p); scene.add(m);
      st.shards.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 3), life: 1.2 + Math.random() * 0.6 }); }
  };
  const spawn = (pos, vel, owner, id) => { const m = make(); m.position.copy(pos); scene.add(m); st.flying.push({ m, p: pos.clone(), v: vel.clone(), owner, id, spin: new THREE.Vector3(8 + Math.random() * 6, 0, 3 * (Math.random() - 0.5)) }); };

  const api = {
    get held() { return st.held; }, get flying() { return st.flying; },
    grab() { st.held = Math.max(st.held, 3); audio.sfx('bottle'); BK.toast && BK.toast('Grabbed bottles - click to throw', 'info'); paint(); },
    throw() {
      if (st.held <= 0 || busy() || (BK.S && !['play', 'hunt'].includes(BK.S.phase))) return false; st.held--; paint();
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), pos = camera.getWorldPosition(new THREE.Vector3()).add(d.clone().multiplyScalar(0.45)); pos.y -= 0.12;
      const vel = d.multiplyScalar(SPEED).add(new THREE.Vector3(0, 1.4, 0)); audio.sfx('whoosh');
      BK.send({ type: 'bottle', x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z }); spawn(pos, vel, true); return true;
    },
    // a bottle lobbed by the crowd at a target point (visual only; the server decides the knockout). Solves the arc to land on it.
    lob(from, to, atMe) {
      const T = Math.max(0.35, Math.min(0.85, from.distanceTo(to) / 11)), vel = to.clone().sub(from).multiplyScalar(1 / T); vel.y += 0.5 * G * T;
      spawn(from, vel, false); st.flying[st.flying.length - 1].pelt = atMe; audio.sfx('whoosh', { pos: { x: from.x, y: from.y, z: from.z }, v: 0.6 });
    },
    remote(m) { spawn(new THREE.Vector3(m.x, m.y, m.z), new THREE.Vector3(m.vx, m.vy, m.vz), false, m.from); audio.sfx('whoosh', { pos: { x: m.x, y: m.y, z: m.z } }); },
    update(dt0) {
      dt0 = Math.min(dt0, 0.25); const n = Math.max(1, Math.ceil(dt0 / (1 / 90))), dt = dt0 / n; for (let s = 0; s < n; s++) this.step(dt); this.fx(dt0);
    },
    step(dt) {
      for (let i = st.flying.length - 1; i >= 0; i--) {
        const b = st.flying[i]; b.v.y -= G * dt; b.p.addScaledVector(b.v, dt); b.m.position.copy(b.p); b.m.rotation.x += b.spin.x * dt; b.m.rotation.z += b.spin.z * dt;
        let hit = null;
        for (const [id, a] of getAvatars()) { if (id === b.id) continue; const g = a.P.group.position, lying = a.ko && a.ko > BK.now(); const lo = g.y + (lying ? -0.1 : 0.1), hi = g.y + (lying ? 0.5 : 1.95);
          if (b.p.y > lo && b.p.y < hi && Math.hypot(b.p.x - g.x, b.p.z - g.z) < (lying ? 0.7 : 0.42)) { hit = { kind: 'player', id }; break; } }
        if (!hit) for (const o of getBrawlers()) { const g = o.P.group.position; if (b.p.y > 0.1 && b.p.y < 2.0 && Math.hypot(b.p.x - g.x, b.p.z - g.z) < 0.5) { hit = { kind: 'brawler', side: o.side }; break; } }
        if (!hit) for (const o of getGoons()) { const g = o.P.group.position; if (o.state !== 'down' && b.p.y > 0.1 && b.p.y < 2.1 && Math.hypot(b.p.x - g.x, b.p.z - g.z) < 0.62) { hit = { kind: 'goon', id: o.id }; break; } } // Sal's muscle: stun + damage
        if (!hit) getNpcs().forEach((n, k) => { if (hit || !n.P.group.visible) return; const g = n.P.group.position, lying = n.ko && n.ko > BK.now(); if (b.p.y > g.y + 0.1 && b.p.y < g.y + 1.95 && Math.hypot(b.p.x - g.x, b.p.z - g.z) < (lying ? 0.5 : 0.42)) hit = { kind: 'npc', k, name: n.who || n.name }; });
        if (!hit && !b.owner && !(me.sit) && Math.hypot(b.p.x - me.x, b.p.z - me.z) < 0.34 && b.p.y < 1.9) hit = { kind: 'me' };
        const sp = BK.spaceAt ? BK.spaceAt(b.p.x, b.p.z, false) : null; // the bar, the restroom, the street...: off the edge of every space is a wall
        const wall = b.p.y < 0.04 || (sp ? b.p.y > sp.h - 0.1 : (b.p.y > ROOM.h - 0.1 || Math.abs(b.p.x) > ROOM.x - 0.12 || Math.abs(b.p.z) > ROOM.z - 0.12)) || obstacles.some((o) => b.p.y < 1.25 && Math.hypot(b.p.x - o.x, b.p.z - o.z) < o.r * 0.75);
        if (hit || wall) {
          if (hit && b.owner) { if (hit.kind === 'player') BK.send({ type: 'bottleHit', kind: 'player', target: hit.id }); else if (hit.kind === 'npc') BK.send({ type: 'bottleHit', kind: 'npc', npc: hit.k, name: hit.name }); else if (hit.kind === 'goon') BK.send({ type: 'bottleHit', kind: 'goon', target: hit.id }); else if (hit.kind === 'brawler') BK.send({ type: 'bottleHit', kind: 'brawler', side: hit.side }); }
          if (hit && hit.kind === 'me' && b.pelt) { audio.sfx('bonk', { v: 0.7 }); BK.onPeltHit && BK.onPeltHit(); }
          shatter(b.p); scene.remove(b.m); st.flying.splice(i, 1);
        }
      }
    },
    fx(dt) {
      for (let i = st.shards.length - 1; i >= 0; i--) { const s = st.shards[i]; s.life -= dt; s.v.y -= G * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += 9 * dt; if (s.m.position.y < 0.02) { s.m.position.y = 0.02; s.v.set(0, 0, 0); } if (s.life <= 0) { scene.remove(s.m); st.shards.splice(i, 1); } }
    },
    setKo(secsLeft) { ko.classList.toggle('hidden', !(secsLeft > 0)); if (secsLeft > 0) ko.innerHTML = `<b>SEEING STARS</b><span>${Math.ceil(secsLeft)}</span>`; },
    paint,
  };
  // ---- bottles standing on tables around the bar: E (or aim + E) takes one; the server hides it for everyone and respawns it later
  const MAX = 5, spots = [], pending = {};
  const mats = [glass, new THREE.MeshStandardMaterial({ color: 0x5a3010, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 }), new THREE.MeshStandardMaterial({ color: 0xcfe6e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 })];
  const free = (i) => ((BK.S && BK.S.btaken && BK.S.btaken[i]) || 0) <= BK.now() && !(pending[i] > performance.now());
  const take = (i) => {
    if (st.held >= MAX) { BK.toast && BK.toast(`Your hands are full (${MAX} bottles)`, 'info'); return; }
    if (!free(i)) return; pending[i] = performance.now() + 1500; spots[i].m.visible = false; BK.send({ type: 'takeBottle', i });
  };
  BK.onBottleGot = () => { st.held = Math.min(MAX, st.held + 1); audio.sfx('bottle'); paint(); };
  api.addSpots = (list, stations) => list.forEach(([x, y, z, r], i) => {
    const m = make(mats[(i * 7) % 3]); m.scale.setScalar(0.92); m.position.set(x, y + 0.092, z); m.rotation.y = i * 1.7; m.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(m);
    const S = { x, z, r, text: 'E - Grab bottle (click to throw)', on: () => free(i), act: () => take(i), bottle: i };
    spots.push({ i, x, y: y + 0.12, z, r, m, S, pop: 1 }); stations.push(S);
  });
  // the spot whose bottle the crosshair points at (within reach): beats plain proximity, so a bottle on a booth table wins over the seat beside it
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
  api.aimedStation = () => {
    camera.getWorldPosition(_o); _d.set(0, 0, -1).applyQuaternion(camera.quaternion); let best = null, bs = 1e9;
    for (const sp of spots) {
      if (!sp.m.visible || Math.hypot(sp.x - me.x, sp.z - me.z) > sp.r + 0.35) continue;
      _p.set(sp.x, sp.y, sp.z).sub(_o); const along = _p.dot(_d); if (along <= 0) continue;
      const off = Math.sqrt(Math.max(0, _p.lengthSq() - along * along)); if (off > 0.22 + along * 0.08) continue;
      if (off < bs) { bs = off; best = sp.S; }
    }
    return best;
  };
  api.updateSpots = (dt) => { for (const sp of spots) { const v = free(sp.i); if (v && !sp.m.visible) { sp.m.visible = true; sp.pop = 0; } else if (!v) sp.m.visible = false; if (sp.pop < 1) { sp.pop = Math.min(1, sp.pop + dt * 3); sp.m.scale.setScalar(0.92 * (0.3 + 0.7 * sp.pop)); } } };
  return api;
}
