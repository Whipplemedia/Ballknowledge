import * as THREE from 'three';

// Simple cartoon people (capsules + spheres) with limb pivots for animation.
// Facing direction is -Z (matches the camera's forward at yaw 0).
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: false, ...o });

export function makePerson({ skin = 0xf0c8a0, shirt = 0x3498db, pants = 0x2c3e50, hair = 0x3a2a1a, hairStyle = 'short', apron = false, beard = false, cap = null, scale = 1, shoe = 0x222222 } = {}) {
  const g = new THREE.Group(); const P = { group: g };
  const shadow = (m) => { m.castShadow = true; return m; };
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.1, 0.9, 0);
    const leg = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.6, 4, 8), mat(pants))); leg.position.y = -0.4; pivot.add(leg);
    const foot = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.28), mat(shoe))); foot.position.set(0, -0.82, -0.04); pivot.add(foot);
    g.add(pivot); return pivot;
  });
  const torso = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.32, 4, 10), mat(shirt))); torso.position.y = 1.18; torso.scale.set(1.05, 1, 0.68); g.add(torso);
  if (apron) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.02), mat(0xeeeeee)); a.position.set(0, 1.05, -0.17); g.add(a); }
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.29, 1.4, 0);
    const arm = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), mat(shirt))); arm.position.y = -0.27; pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(skin)); hand.position.y = -0.56; pivot.add(hand);
    g.add(pivot); return pivot;
  });
  const head = new THREE.Group(); head.position.y = 1.6; g.add(head);
  const skull = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), mat(skin))); head.add(skull);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), mat(0x111111)); e.position.set(s * 0.07, 0.03, -0.172); head.add(e); }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.05), mat(skin)); nose.position.set(0, -0.01, -0.19); head.add(nose);
  if (hairStyle !== 'bald') {
    const cap2 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, hairStyle === 'long' ? Math.PI * 0.62 : Math.PI * 0.5), mat(hair)); cap2.position.y = 0.01; cap2.rotation.x = -0.15; head.add(cap2);
    if (hairStyle === 'long') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.1), mat(hair)); b.position.set(0, -0.08, 0.14); head.add(b); }
  }
  if (beard) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), mat(hair)); b.position.set(0, -0.04, -0.03); b.scale.set(1, 0.9, 1); head.add(b); }
  if (cap !== null) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(cap)); c.position.y = 0.04; head.add(c); const br = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.2), mat(cap)); br.position.set(0, 0.04, -0.24); head.add(br); }
  g.scale.setScalar(scale);
  Object.assign(P, { legs, arms, head, torso, phase: Math.random() * 6 });
  return P;
}

// mode: idle | walk | drink | polish | pool | sleep | cheer | stagger
export function animate(P, mode, t, speed = 1) {
  const [lL, lR] = P.legs, [aL, aR] = P.arms, ph = P.phase + t;
  const base = P.baseY || 0;
  const reset = () => { P.group.position.y = base; P.group.rotation.z = 0; lL.rotation.x = lR.rotation.x = aL.rotation.x = aR.rotation.x = 0; aL.rotation.z = aR.rotation.z = 0; P.head.rotation.set(0, 0, 0); P.torso.rotation.set(0, 0, 0); };
  reset();
  P.torso.scale.y = 1 + Math.sin(ph * 1.6) * 0.012;
  if (mode === 'walk') { const s = Math.sin(ph * 9 * speed) * 0.7 * Math.min(1, speed); lL.rotation.x = s; lR.rotation.x = -s; aL.rotation.x = -s * 0.8; aR.rotation.x = s * 0.8; P.group.position.y = base + Math.abs(Math.sin(ph * 9 * speed)) * 0.03; }
  else if (mode === 'drink') { const c = (Math.sin(ph * 0.7) + 1) / 2, up = c > 0.72 ? (c - 0.72) / 0.28 : 0; aR.rotation.x = -2.2 * up; aR.rotation.z = 0.2 * up; P.head.rotation.x = -0.15 * up; P.head.rotation.y = Math.sin(ph * 0.3) * 0.4; }
  else if (mode === 'polish') { aR.rotation.x = -1.2 + Math.sin(ph * 6) * 0.25; aL.rotation.x = -1.0; P.head.rotation.y = Math.sin(ph * 0.4) * 0.5; }
  else if (mode === 'pool') { const k = Math.sin(ph * 1.4); aR.rotation.x = -1.0 + k * 0.5; aL.rotation.x = -1.2; P.torso.rotation.x = 0.5; P.head.rotation.x = 0.3; }
  else if (mode === 'sleep') { P.head.rotation.x = 0.9; P.torso.rotation.x = 0.4; aL.rotation.x = aR.rotation.x = -1.3; P.torso.scale.y = 1 + Math.sin(ph * 1.1) * 0.03; }
  else if (mode === 'cheer') { aL.rotation.x = -2.6 + Math.sin(ph * 5) * 0.3; aR.rotation.x = -2.4 + Math.cos(ph * 5) * 0.3; P.group.position.y = base + Math.abs(Math.sin(ph * 5)) * 0.06; }
  else if (mode === 'stagger') { P.group.rotation.z = Math.sin(ph * 1.7) * 0.12; P.head.rotation.z = Math.sin(ph * 1.1) * 0.25; }
  else { P.head.rotation.y = Math.sin(ph * 0.35) * 0.35; aR.rotation.x = Math.sin(ph * 0.5) * 0.05; }
}
