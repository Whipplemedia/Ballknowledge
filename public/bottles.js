// Throwable bottles. Grab at the bar, F / right-click throws. Glass shatters on anything; a bottle that hits a player or NPC knocks
// them out for 5s. Flight is simulated on every client from the thrower's {pos, vel}; only the thrower reports hits (server validates).
import * as THREE from 'three';
import { audio } from './audio.js';

export function createBottles({ scene, camera, BK, me, obstacles, getAvatars, getNpcs, ROOM, busy }) {
  const G = 9.8, SPEED = 12.5;
  const glass = new THREE.MeshStandardMaterial({ color: 0x2f8a46, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82 });
  const label = new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.8 }), cap = new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.8, roughness: 0.3 });
  const make = () => { const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.2, 10), glass); body.position.y = 0.0; g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.036, 0.1, 10), glass); neck.position.y = 0.15; g.add(neck);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.03, 8), cap); lip.position.y = 0.215; g.add(lip);
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0415, 0.0415, 0.07, 10, 1, true), label); lab.position.y = -0.01; g.add(lab); return g; };
  const st = { held: 0, flying: [], shards: [] };

  // first-person bottle
  const hand = make(); hand.position.set(0.26, -0.27, -0.62); hand.rotation.set(0.35, 0, -0.25); hand.scale.setScalar(0.8); hand.visible = false; camera.add(hand);
  const hud = document.createElement('div'); hud.id = 'bottlehud'; hud.className = 'hidden'; document.body.appendChild(hud);
  const ko = document.createElement('div'); ko.id = 'kooverlay'; ko.className = 'hidden'; document.body.appendChild(ko);
  const paint = () => { hand.visible = st.held > 0; hud.classList.toggle('hidden', st.held <= 0); hud.textContent = `🍾 ×${st.held}  ·  F or right-click to throw`; };

  const shatter = (p) => {
    audio.sfx('glassBreak', { pos: { x: p.x, y: p.y, z: p.z }, ref: 3 });
    for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.016 + Math.random() * 0.014), glass); m.position.copy(p); scene.add(m);
      st.shards.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 3), life: 1.2 + Math.random() * 0.6 }); }
  };
  const spawn = (pos, vel, owner, id) => { const m = make(); m.position.copy(pos); scene.add(m); st.flying.push({ m, p: pos.clone(), v: vel.clone(), owner, id, spin: new THREE.Vector3(8 + Math.random() * 6, 0, 3 * (Math.random() - 0.5)) }); };

  const api = {
    get held() { return st.held; }, get flying() { return st.flying; },
    grab() { st.held = 3; audio.sfx('bottle'); BK.toast && BK.toast('Grabbed 3 bottles - F or right-click to throw', 'info'); paint(); },
    throw() {
      if (st.held <= 0 || busy() || (BK.S && !['play', 'hunt'].includes(BK.S.phase))) return false; st.held--; paint();
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), pos = camera.getWorldPosition(new THREE.Vector3()).add(d.clone().multiplyScalar(0.45)); pos.y -= 0.12;
      const vel = d.multiplyScalar(SPEED).add(new THREE.Vector3(0, 1.4, 0)); audio.sfx('whoosh');
      BK.send({ type: 'bottle', x: pos.x, y: pos.y, z: pos.z, vx: vel.x, vy: vel.y, vz: vel.z }); spawn(pos, vel, true); return true;
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
        if (!hit) getNpcs().forEach((n, k) => { if (hit) return; const g = n.P.group.position, lying = n.ko && n.ko > BK.now(); if (b.p.y > g.y + 0.1 && b.p.y < g.y + 1.95 && Math.hypot(b.p.x - g.x, b.p.z - g.z) < (lying ? 0.5 : 0.42)) hit = { kind: 'npc', k }; });
        if (!hit && !b.owner && !(me.sit) && Math.hypot(b.p.x - me.x, b.p.z - me.z) < 0.34 && b.p.y < 1.9) hit = { kind: 'me' };
        const wall = b.p.y < 0.04 || b.p.y > ROOM.h - 0.1 || Math.abs(b.p.x) > ROOM.x - 0.12 || Math.abs(b.p.z) > ROOM.z - 0.12 || obstacles.some((o) => b.p.y < 1.25 && Math.hypot(b.p.x - o.x, b.p.z - o.z) < o.r * 0.75);
        if (hit || wall) {
          if (hit && b.owner) { if (hit.kind === 'player') BK.send({ type: 'bottleHit', kind: 'player', target: hit.id }); else if (hit.kind === 'npc') BK.send({ type: 'bottleHit', kind: 'npc', npc: hit.k }); }
          shatter(b.p); scene.remove(b.m); st.flying.splice(i, 1);
        }
      }
    },
    fx(dt) {
      for (let i = st.shards.length - 1; i >= 0; i--) { const s = st.shards[i]; s.life -= dt; s.v.y -= G * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += 9 * dt; if (s.m.position.y < 0.02) { s.m.position.y = 0.02; s.v.set(0, 0, 0); } if (s.life <= 0) { scene.remove(s.m); st.shards.splice(i, 1); } }
    },
    setKo(secsLeft) { ko.classList.toggle('hidden', !(secsLeft > 0)); if (secsLeft > 0) ko.innerHTML = `<b>💫 KNOCKED OUT 💫</b><span>${Math.ceil(secsLeft)}</span>`; },
    paint,
  };
  return api;
}
