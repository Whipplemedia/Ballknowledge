import * as THREE from 'three';

// Cartoon "seeing stars": a ring of gold stars orbiting above a knocked-out head. Each star spins and bobs, the ring wobbles,
// it pops in with a little overshoot and shrinks away on wake-up. Lives in world space (follows the head even when the body is flat on the floor).
const STAR = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.022 : 0.055, a = (i / 10) * Math.PI * 2 + Math.PI / 2, x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) s.lineTo(x, y); else s.moveTo(x, y); }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1 }); g.center(); return g;
})();
const MATS = [0xffd23a, 0xfff1a0, 0xffb627].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: 0xffa000, emissiveIntensity: 0.85, metalness: 0.3, roughness: 0.35 }));
const _p = new THREE.Vector3();

export function headPos(P, out = _p) {
  const h = P.bones && P.bones.Head; (h || P.head).getWorldPosition(out); if (h) out.y += 0.12; return out;
}

export function makeDizzy(parent, { n = 5, radius = 0.26, scale = 1.3 } = {}) {
  const root = new THREE.Group(), ring = new THREE.Group(); root.add(ring); root.visible = false; parent.add(root);
  const stars = [];
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(STAR, MATS[i % MATS.length]); m.castShadow = false; ring.add(m); stars.push(m); }
  let w = 0, vw = 0, spin = Math.random() * 6;
  return {
    root,
    // pos: world point above the head (null keeps the current position, e.g. when parented to the camera)
    update(dt, t, pos, on) {
      // springy pop-in / shrink-out
      const target = on ? 1 : 0; for (let k = Math.ceil(dt / 0.016), h = dt / Math.max(1, k); k > 0; k--) { vw += ((target - w) * 90 - vw * 11) * h; w = Math.max(0, w + vw * h); }
      if (!on && w < 0.02) { w = vw = 0; root.visible = false; return; }
      root.visible = true; if (pos) root.position.set(pos.x, Math.max(pos.y + 0.22, 0.7), pos.z); // someone flat on the floor still gets stars where you can see them
      root.scale.setScalar(Math.max(0.001, w) * scale);
      spin += dt * 3.4; ring.rotation.set(Math.sin(t * 2.3) * 0.22, spin, Math.cos(t * 1.9) * 0.18);
      stars.forEach((m, i) => {
        const a = (i / n) * Math.PI * 2, bob = Math.sin(t * 5.5 + i * 1.7) * 0.022;
        m.position.set(Math.cos(a) * radius, bob, Math.sin(a) * radius);
        m.rotation.set(0.25, t * 7 + i, Math.sin(t * 4 + i) * 0.3); m.scale.setScalar(0.85 + Math.sin(t * 8 + i * 2.1) * 0.15);
      });
    },
    get on() { return root.visible; },
  };
}
