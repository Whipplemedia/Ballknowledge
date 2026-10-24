import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { jerseyTex, floralTex, buttonShirtTex } from './textures.js';

// Chunky faceted cartoon people: beveled box heads, big white eyes, heavy brows, caps, jerseys.
// Facing direction is -Z (matches the camera's forward at yaw 0).
const matCache = new Map();
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.78, ...o })); return matCache.get(k); };
const texMat = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, ...o });
const geoCache = new Map();
const rbGeo = (w, h, d, r = 0.04) => { const k = [w, h, d, r].join(); if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 2, r)); return geoCache.get(k); };
const rb = (w, h, d, m, x = 0, y = 0, z = 0, r = 0.04, parent, shadow = false) => { const o = new THREE.Mesh(rbGeo(w, h, d, r), m); o.position.set(x, y, z); o.castShadow = shadow; if (parent) parent.add(o); return o; };
const sph = (r, m, x, y, z, parent, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); parent.add(o); return o; };
const tintSkin = (c, k) => { const col = new THREE.Color(c); col.multiplyScalar(k); return col.getHex(); };

export function makePerson(o = {}) {
  const S = { skin: 0xf0c8a0, shirt: 0x3498db, pants: 0x2c3e50, shoe: 0x222222, hair: 0x3a2a1a, hairStyle: 'short', outfit: 'tee', brow: null, mouth: 'smile', scale: 1, ...o };
  const g = new THREE.Group(); const P = { group: g };
  const skin = mat(S.skin), shirt = mat(S.shirt), pants = mat(S.pants), shoe = mat(S.shoe), hairM = mat(S.hair, { roughness: 0.6 });
  const longSleeve = ['hoodie', 'suit'].includes(S.outfit), sleeveless = S.outfit === 'tank';
  const wide = S.fat ? 1.28 : S.female ? 0.9 : 1;

  // legs (pivot at hip)
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group(); p.position.set(s * 0.11 * wide, 0.9, 0);
    if (S.shorts) { rb(0.17, 0.32, 0.19, pants, 0, -0.16, 0, 0.04, p, true); rb(0.12, 0.3, 0.13, skin, 0, -0.46, 0, 0.03, p); rb(0.135, 0.09, 0.145, mat(0xeeeeee), 0, -0.66, 0, 0.03, p); }
    else rb(0.17, 0.7, 0.19, pants, 0, -0.35, 0, 0.04, p, true);
    rb(0.17, 0.1, 0.3, shoe, 0, -0.8, -0.05, 0.04, p, true); rb(0.17, 0.03, 0.31, mat(0xdadada), 0, -0.845, -0.05, 0.01, p);
    g.add(p); return p;
  });

  // torso
  let torsoM = shirt;
  if (S.outfit === 'jersey') torsoM = texMat(jerseyTex('#' + new THREE.Color(S.shirt).getHexString(), S.trim || '#ffffff', S.number || '12', S.numColor || '#ffffff').t);
  else if (S.outfit === 'floral') torsoM = texMat(floralTex().t);
  else if (S.outfit === 'button') torsoM = texMat(buttonShirtTex('#' + new THREE.Color(S.shirt).getHexString()).t);
  else if (sleeveless) torsoM = mat(S.shirt);
  const torso = rb(0.46 * wide, 0.58, 0.27 * (S.fat ? 1.2 : 1), torsoM, 0, 1.18, 0, 0.07, g, true);
  if (S.outfit === 'jersey') { // back number plate
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), texMat(jerseyTex('#' + new THREE.Color(S.shirt).getHexString(), S.trim || '#ffffff', S.number || '12', S.numColor || '#ffffff').t)); back.position.set(0, 1.2, 0.138 * (S.fat ? 1.2 : 1)); back.rotation.y = Math.PI; g.add(back);
  }
  rb(0.13, 0.12, 0.13, skin, 0, 1.5, 0, 0.03, g); // neck
  if (S.outfit === 'suit') {
    rb(0.14 * wide, 0.32, 0.012, mat(0xf2f2f2), 0, 1.3, -0.14 * (S.fat ? 1.2 : 1), 0.004, g);
    rb(0.05, 0.3, 0.014, mat(S.tie || 0xaa1a1a), 0, 1.24, -0.148 * (S.fat ? 1.2 : 1), 0.004, g);
    for (const s of [-1, 1]) { const l = rb(0.1, 0.34, 0.02, shirt, s * 0.12 * wide, 1.3, -0.145 * (S.fat ? 1.2 : 1), 0.006, g); l.rotation.z = -s * 0.28; }
  }
  if (S.outfit === 'hoodie') { rb(0.38, 0.16, 0.16, shirt, 0, 1.52, 0.1, 0.06, g, true); rb(0.32, 0.12, 0.03, mat(tintSkin(S.shirt, 0.85)), 0, 0.98, -0.14, 0.02, g); }
  if (S.outfit === 'tank') { for (const s of [-1, 1]) rb(0.14, 0.12, 0.28, skin, s * 0.2, 1.46, 0, 0.03, g); }
  if (S.outfit === 'apron') rb(0.4, 0.55, 0.02, mat(0xf0f0f0), 0, 1.0, -0.15, 0.01, g);
  if (S.apron) rb(0.4, 0.5, 0.02, mat(0xf0f0f0), 0, 0.98, -0.145 * (S.fat ? 1.2 : 1), 0.01, g);
  if (S.backpack) { rb(0.34, 0.42, 0.14, mat(0x2a2f2a), 0, 1.2, 0.21, 0.05, g, true); for (const s of [-1, 1]) rb(0.05, 0.5, 0.03, mat(0x2a2f2a), s * 0.14, 1.3, -0.14, 0.01, g); }

  // arms (pivot at shoulder)
  const sleeveLen = longSleeve ? 0.5 : sleeveless ? 0.0 : 0.2;
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group(); p.position.set(s * (0.3 * wide), 1.42, 0);
    if (sleeveLen > 0) rb(0.13, sleeveLen, 0.13, S.outfit === 'jersey' ? mat(S.shirt) : shirt, 0, -sleeveLen / 2, 0, 0.04, p, true);
    const skinLen = 0.52 - sleeveLen; if (skinLen > 0.02) rb(0.105, skinLen, 0.105, skin, 0, -sleeveLen - skinLen / 2, 0, 0.035, p);
    rb(0.1, 0.11, 0.115, skin, 0, -0.58, 0, 0.04, p);
    g.add(p); return p;
  });

  // head
  const head = new THREE.Group(); head.position.y = 1.7; g.add(head);
  const hw = S.female ? 0.38 : 0.41;
  rb(hw, 0.43, 0.39, skin, 0, 0, 0, 0.1, head, true);
  rb(0.18, 0.08, 0.1, mat(tintSkin(S.skin, 0.96)), 0, -0.2, -0.17, 0.03, head); // chin
  for (const s of [-1, 1]) rb(0.05, 0.11, 0.07, skin, s * (hw / 2 + 0.01), -0.01, 0.01, 0.02, head);
  const white = mat(0xffffff, { roughness: 0.25 }), black = mat(0x0a0a0a, { roughness: 0.2 }), browM = mat(S.brow ?? S.hair, { roughness: 0.7 });
  const lookX = S.look ?? 0.012;
  for (const s of [-1, 1]) {
    sph(0.067, white, s * 0.105, 0.045, -0.188, head, 1, 1.18, 0.55);
    sph(0.03, black, s * 0.105 + lookX * (S.female ? 0 : 1), 0.04, -0.222, head, 1, 1.1, 0.5);
    const b = rb(0.145, 0.04, 0.035, browM, s * 0.105, 0.14, -0.205, 0.012, head); b.rotation.z = s * (S.angry ? -0.25 : 0.12);
  }
  rb(0.08, 0.11, 0.1, mat(tintSkin(S.skin, 0.94)), 0, -0.04, -0.215, 0.03, head); // nose
  const mouthC = mat(0x5a1a1a);
  if (S.mouth === 'grin') { rb(0.15, 0.06, 0.02, mouthC, 0, -0.135, -0.197, 0.01, head); rb(0.13, 0.025, 0.022, white, 0, -0.115, -0.2, 0.005, head); }
  else if (S.mouth === 'open') { rb(0.11, 0.09, 0.02, mouthC, 0, -0.14, -0.197, 0.02, head); rb(0.09, 0.02, 0.022, white, 0, -0.105, -0.2, 0.005, head); }
  else if (S.mouth === 'flat') rb(0.1, 0.022, 0.02, mouthC, 0, -0.14, -0.197, 0.008, head);
  else { rb(0.1, 0.026, 0.02, mouthC, 0, -0.14, -0.197, 0.008, head); for (const s of [-1, 1]) { const c = rb(0.04, 0.022, 0.02, mouthC, s * 0.06, -0.125, -0.197, 0.008, head); c.rotation.z = s * -0.5; } }
  if (S.beard === 'full') { rb(0.4, 0.17, 0.3, hairM, 0, -0.14, -0.05, 0.07, head); rb(0.1, 0.03, 0.02, mat(0x5a1a1a), 0, -0.135, -0.205, 0.008, head); }
  if (S.beard === 'stubble') rb(0.39, 0.15, 0.3, mat(tintSkin(S.skin, 0.78), { roughness: 1 }), 0, -0.14, -0.04, 0.06, head);
  if (S.stache) rb(0.18, 0.045, 0.045, hairM, 0, -0.092, -0.222, 0.015, head);
  if (S.goatee) rb(0.09, 0.09, 0.05, hairM, 0, -0.2, -0.19, 0.02, head);
  if (S.cigar) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), mat(0x5a3a1a)); c.rotation.x = Math.PI / 2; c.position.set(0.075, -0.135, -0.27); head.add(c); sph(0.022, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a20).multiplyScalar(2.5) }), 0.075, -0.135, -0.35, head); }
  if (S.glasses) { for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 14), mat(0x15151a)); r.position.set(s * 0.105, 0.045, -0.222); head.add(r); } rb(0.06, 0.012, 0.012, mat(0x15151a), 0, 0.06, -0.225, 0.004, head); }
  if (S.sunglasses) { rb(0.34, 0.085, 0.03, mat(0x050505, { roughness: 0.1 }), 0, 0.045, -0.225, 0.02, head); }

  // hair
  const hs = S.hairStyle;
  if (hs !== 'bald' && !(S.hat && S.hat.style === 'beanie')) {
    rb(hw + 0.02, 0.12, 0.41, hairM, 0, 0.2, 0.0, 0.05, head); rb(hw + 0.02, 0.3, 0.1, hairM, 0, 0.03, 0.18, 0.05, head);
    if (hs === 'messy') for (let i = 0; i < 6; i++) rb(0.08, 0.1, 0.08, hairM, (i - 2.5) * 0.065, 0.28, -0.05 + (i % 2) * 0.1, 0.02, head).rotation.z = (i - 2.5) * 0.12;
    if (hs === 'slick') rb(hw + 0.02, 0.05, 0.43, mat(S.hair, { roughness: 0.2 }), 0, 0.235, -0.02, 0.02, head);
    if (hs === 'bun') { sph(0.14, hairM, 0, 0.3, 0.12, head); for (const s of [-1, 1]) rb(0.07, 0.32, 0.12, hairM, s * (hw / 2 + 0.015), -0.05, -0.08, 0.03, head); rb(hw + 0.02, 0.1, 0.06, hairM, 0, 0.15, -0.19, 0.03, head); }
    if (hs === 'long') for (const s of [-1, 1]) rb(0.07, 0.4, 0.18, hairM, s * (hw / 2 + 0.015), -0.12, 0.05, 0.03, head);
    if (hs === 'sides') { /* receding */ }
  }
  if (S.hat) {
    const hc = mat(S.hat.color, { roughness: 0.65 });
    if (S.hat.style === 'beanie') { rb(hw + 0.04, 0.22, 0.43, hc, 0, 0.19, 0, 0.07, head); rb(hw + 0.05, 0.06, 0.44, mat(tintSkin(S.hat.color, 0.8)), 0, 0.1, 0, 0.02, head); sph(0.065, hc, 0, 0.34, 0, head); }
    else if (S.hat.style === 'fedora') { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.025, 20), hc); br.position.y = 0.2; head.add(br); rb(0.3, 0.16, 0.3, hc, 0, 0.29, 0, 0.05, head); rb(0.305, 0.04, 0.305, mat(0x333333), 0, 0.23, 0, 0.01, head); }
    else { // baseball cap
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.245, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.5), hc); dome.position.set(0, 0.14, 0); dome.scale.set(1, 0.85, 1.02); head.add(dome);
      const dir = S.hat.backwards ? 1 : -1; const brim = rb(0.3, 0.025, 0.21, mat(tintSkin(S.hat.color, 0.88)), 0, 0.15, dir * 0.3, 0.012, head); brim.rotation.x = dir * -0.12;
      rb(0.16, 0.05, 0.02, mat(0x111111), 0, 0.2, -dir * 0.235, 0.01, head);
    }
  }
  g.scale.setScalar(S.scale);
  if (S.fat) g.scale.x *= 1.0;
  Object.assign(P, { legs, arms, head, torso, phase: Math.random() * 6, spec: S });
  return P;
}

// ---------------- cast (matches the reference sheet) ----------------
const SK = { light: 0xf2c9a5, tan: 0xdcaa80, brown: 0x9a6a46, dark: 0x6e4a32, pale: 0xf6d8c0 };
export const PRESETS = {
  bub: { skin: SK.light, hair: 0x2a1810, hairStyle: 'short', hat: { color: 0x9c9ca2, backwards: true }, outfit: 'tee', shirt: 0xb0b0b4, shorts: true, pants: 0x2a2a30, shoe: 0x16161a, backpack: true, mouth: 'smile' },
  bartender: { skin: SK.tan, hair: 0x6a3a22, hairStyle: 'bun', female: true, outfit: 'tank', shirt: 0x17171d, pants: 0x17171d, mouth: 'smile', look: 0 },
  jock: { skin: SK.light, hair: 0x2a1810, hairStyle: 'short', hat: { color: 0x9a9aa0, backwards: true }, outfit: 'jersey', shirt: 0x1b2a5a, number: '12', pants: 0x3a3a42, mouth: 'grin' },
  knowItAll: { skin: SK.light, hair: 0x3a2518, hairStyle: 'messy', glasses: true, outfit: 'button', shirt: 0xa9afb7, pants: 0x4a4a52, mouth: 'smile' },
  gambler: { skin: SK.tan, hair: 0x2a1a10, hairStyle: 'short', hat: { color: 0xb02a2a, backwards: true }, outfit: 'floral', shirt: 0x16231c, stache: true, pants: 0x5a5a62, mouth: 'smile' },
  chill: { skin: SK.light, hair: 0x666666, hairStyle: 'short', hat: { color: 0x1c2436 }, outfit: 'hoodie', shirt: 0x2a2a30, beard: 'stubble', pants: 0x2a2f3a, mouth: 'flat', beer: true },
  dieHard: { skin: SK.tan, hair: 0x1a1210, hairStyle: 'short', hat: { color: 0x141414, style: 'beanie' }, outfit: 'jersey', shirt: 0xd2691e, number: 'T', beard: 'full', pants: 0x3a3a40, mouth: 'open' },
  rookie: { skin: SK.pale, hair: 0x2a2220, hairStyle: 'short', hat: { color: 0x7a7a80, backwards: true }, outfit: 'hoodie', shirt: 0x73737a, pants: 0x3a3a42, mouth: 'flat' },
  sal: { skin: SK.tan, hair: 0x1a1a1a, hairStyle: 'slick', outfit: 'suit', shirt: 0x15151a, pants: 0x15151a, tie: 0xb01818, cigar: true, fat: true, angry: true, mouth: 'flat', goatee: false },
  hitman: { skin: SK.light, hair: 0x0a0a0a, hairStyle: 'short', hat: { color: 0x0c0c0e, style: 'fedora' }, outfit: 'suit', shirt: 0x0e0e12, pants: 0x0e0e12, sunglasses: true, mouth: 'flat', scale: 1.06 },
};
const PATRON_BASES = ['jock', 'knowItAll', 'gambler', 'chill', 'dieHard', 'rookie'];
const SHIRTS = [0x2e5aa8, 0xa83232, 0x2f8f5a, 0xc8a02a, 0x7a3fa0, 0xd0702a, 0x2a8a9a, 0x5a5a62];
export function makePreset(name, over = {}) { return makePerson({ ...PRESETS[name], ...over }); }
export function randomPatron(i = 0) {
  const base = PRESETS[PATRON_BASES[i % PATRON_BASES.length]], c = SHIRTS[(i * 3 + 1) % SHIRTS.length], sk = Object.values(SK)[(i * 2) % 5];
  return makePerson({ ...base, skin: sk, shirt: base.outfit === 'jersey' || base.outfit === 'floral' || base.outfit === 'button' ? (base.outfit === 'jersey' ? c : base.shirt) : c, number: String(((i * 7) % 90) + 3), hat: i % 3 === 0 ? { color: SHIRTS[(i + 2) % SHIRTS.length], backwards: i % 2 === 0 } : base.hat });
}

// ---------------- first-person hands ----------------
export function makeHand({ skin = SK.light, sleeve = 0x7a7a80, sleeveLen = 0.34 } = {}) {
  const g = new THREE.Group(), sm = mat(skin);
  rb(0.095, 0.09, 0.42, mat(sleeve), 0, 0, 0.3, 0.035, g);                       // forearm (sleeve) running back toward the camera
  rb(0.09, 0.085, 0.14, sm, 0, 0, -0.02, 0.035, g);                              // wrist/forearm skin
  rb(0.105, 0.05, 0.11, sm, 0, 0, -0.14, 0.03, g);                               // palm
  for (let i = 0; i < 4; i++) { const f = rb(0.022, 0.025, 0.085 - (i === 3 ? 0.01 : 0), sm, -0.036 + i * 0.024, 0.0, -0.225, 0.01, g); f.rotation.x = -0.15; }
  const t = rb(0.03, 0.03, 0.075, sm, 0.058, 0.0, -0.16, 0.012, g); t.rotation.y = 0.5;
  return g;
}

// mode: idle | walk | drink | polish | pool | sleep | cheer | stagger
export function animate(P, mode, t, speed = 1) {
  const [lL, lR] = P.legs, [aL, aR] = P.arms, ph = P.phase + t, base = P.baseY || 0;
  const reset = () => { P.group.position.y = base; P.group.rotation.z = 0; lL.rotation.x = lR.rotation.x = aL.rotation.x = aR.rotation.x = 0; aL.rotation.z = aR.rotation.z = 0; P.head.rotation.set(0, 0, 0); P.torso.rotation.set(0, 0, 0); };
  reset();
  if (mode === 'walk') { const s = Math.sin(ph * 9 * speed) * 0.7 * Math.min(1, speed); lL.rotation.x = s; lR.rotation.x = -s; aL.rotation.x = -s * 0.8; aR.rotation.x = s * 0.8; P.group.position.y = base + Math.abs(Math.sin(ph * 9 * speed)) * 0.03; }
  else if (mode === 'drink') { const c = (Math.sin(ph * 0.7) + 1) / 2, up = c > 0.72 ? (c - 0.72) / 0.28 : 0; aR.rotation.x = -2.2 * up; aR.rotation.z = 0.2 * up; P.head.rotation.x = -0.15 * up; P.head.rotation.y = Math.sin(ph * 0.3) * 0.4; }
  else if (mode === 'polish') { aR.rotation.x = -1.2 + Math.sin(ph * 6) * 0.25; aL.rotation.x = -1.0; P.head.rotation.y = Math.sin(ph * 0.4) * 0.5; }
  else if (mode === 'pool') { const k = Math.sin(ph * 1.4); aR.rotation.x = -1.0 + k * 0.5; aL.rotation.x = -1.2; P.torso.rotation.x = 0.5; P.head.rotation.x = 0.3; }
  else if (mode === 'sleep') { P.head.rotation.x = 0.9; P.torso.rotation.x = 0.4; aL.rotation.x = aR.rotation.x = -1.3; }
  else if (mode === 'cheer') { aL.rotation.x = -2.6 + Math.sin(ph * 5) * 0.3; aR.rotation.x = -2.4 + Math.cos(ph * 5) * 0.3; P.group.position.y = base + Math.abs(Math.sin(ph * 5)) * 0.06; }
  else if (mode === 'stagger') { P.group.rotation.z = Math.sin(ph * 1.7) * 0.12; P.head.rotation.z = Math.sin(ph * 1.1) * 0.25; }
  else if (mode === 'point') { aR.rotation.x = -1.5 + Math.sin(ph * 2) * 0.1; P.head.rotation.y = Math.sin(ph * 0.35) * 0.3; }
  else { P.head.rotation.y = Math.sin(ph * 0.35) * 0.35; aR.rotation.x = Math.sin(ph * 0.5) * 0.05; }
}
