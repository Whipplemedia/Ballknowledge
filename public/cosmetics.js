import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { jerseyTex, floralTex } from './textures.js';
import { makePreset } from './people.js';

// ~50 wearable items. Built from primitives so they work with no assets. Slots: head, face, body, hand, back.
export const RARITY = { common: { label: 'Common', color: '#9fb0d8', w: 58 }, rare: { label: 'Rare', color: '#4da3ff', w: 28 }, epic: { label: 'Epic', color: '#b060ff', w: 11 }, legendary: { label: 'Legendary', color: '#ffc83d', w: 3 } };
export const SLOTS = [['head', 'Head'], ['face', 'Face'], ['body', 'Body'], ['hand', 'Hand'], ['back', 'Back']];

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const glow = (c, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
const put = (g, m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
const bx = (g, w, h, d, c, x, y, z, o = {}, r = 0.015) => put(g, new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), o.mat || std(c, o)), x, y, z);
const cy = (g, rt, rb, h, c, x, y, z, o = {}, seg = 14) => put(g, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), o.mat || std(c, o)), x, y, z);
const sp = (g, r, c, x, y, z, o = {}, sx = 1, sy = 1, sz = 1) => { const m = put(g, new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), o.mat || std(c, o)), x, y, z); m.scale.set(sx, sy, sz); return m; };
const cn = (g, r, h, c, x, y, z, o = {}, seg = 14) => put(g, new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), o.mat || std(c, o)), x, y, z);
const tor = (g, R, t, c, x, y, z, o = {}) => put(g, new THREE.Mesh(new THREE.TorusGeometry(R, t, 8, 20), o.mat || std(c, o)), x, y, z);
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const GOLD = { metalness: 0.9, roughness: 0.25 };

// ---- helpers for jersey-style body items (they attach to torso + arms) ----
const jersey = (color, trim, num, numColor, { sleeves = 0, sleeveColor, pads = false, tex } = {}) => (P) => {
  const out = [], T = P.spec.fat ? 1.2 : 1, wide = P.spec.fat ? 1.28 : 1;
  const t = tex || jerseyTex('#' + new THREE.Color(color).getHexString(), trim, num, numColor).t;
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.48 * wide, 0.6, 0.285 * T, 2, 0.07), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 })); body.position.set(0, 1.18, 0); out.push({ obj: body, parent: P.group });
  if (sleeves > 0) P.arms.forEach((arm) => { const s = new THREE.Mesh(new RoundedBoxGeometry(0.145, sleeves, 0.145, 2, 0.04), std(sleeveColor ?? color)); s.position.set(0, -sleeves / 2 + 0.02, 0); out.push({ obj: s, parent: arm }); });
  if (pads) P.arms.forEach((arm, i) => { const pd = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), std(color)); pd.scale.set(1.1, 0.7, 1.1); pd.position.set(0, 0.02, 0); out.push({ obj: pd, parent: arm }); });
  return out;
};
const stripeTex = (a, b, vertical = false) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b; for (let i = 0; i < 64; i += 16) vertical ? g.fillRect(i, 0, 8, 64) : g.fillRect(0, i, 64, 8); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const wearBody = (P, mat, { len = 0.6, sleeves = 0, sleeveMat, extra } = {}) => { const wide = P.spec.fat ? 1.28 : 1, T = P.spec.fat ? 1.2 : 1, out = []; const b = new THREE.Mesh(new RoundedBoxGeometry(0.48 * wide, len, 0.285 * T, 2, 0.07), mat); b.position.set(0, 1.18 - (len - 0.6) / 2, 0); out.push({ obj: b, parent: P.group }); if (sleeves) P.arms.forEach((arm) => { const s = new THREE.Mesh(new RoundedBoxGeometry(0.145, sleeves, 0.145, 2, 0.04), sleeveMat || mat); s.position.set(0, -sleeves / 2 + 0.02, 0); out.push({ obj: s, parent: arm }); }); if (extra) out.push(...extra(P)); return out; };

// ---- catalog ----
export const CATALOG = [
  // HEAD
  { id: 'bucket_hat', name: 'Bucket Hat', slot: 'head', rarity: 'common', make: (g) => { cy(g, 0.3, 0.3, 0.02, 0xc8b070, 0, 0.17, 0); cy(g, 0.2, 0.22, 0.15, 0xc8b070, 0, 0.25, 0); } },
  { id: 'sweatband', name: 'Sweatband', slot: 'head', rarity: 'common', make: (g) => { bx(g, 0.44, 0.07, 0.42, 0xd22a2a, 0, 0.17, 0); bx(g, 0.445, 0.02, 0.425, 0xffffff, 0, 0.17, 0); } },
  { id: 'party_hat', name: 'Party Hat', slot: 'head', rarity: 'common', make: (g) => { const c = cn(g, 0.13, 0.34, 0xe84aa8, 0, 0.38, 0); c.rotation.z = 0.15; sp(g, 0.04, 0xffe14a, 0.03, 0.56, 0); for (let i = 0; i < 5; i++) sp(g, 0.018, [0x4ae8ff, 0xffe14a, 0xffffff][i % 3], Math.cos(i * 1.3) * 0.07, 0.28 + i * 0.045, Math.sin(i * 1.3) * 0.07 - 0.02); } },
  { id: 'chef_hat', name: "Chef's Toque", slot: 'head', rarity: 'common', make: (g) => { cy(g, 0.17, 0.17, 0.1, 0xf4f4f4, 0, 0.22, 0); sp(g, 0.2, 0xffffff, 0, 0.38, 0, {}, 1, 0.8, 1); } },
  { id: 'bat_helmet', name: 'Batting Helmet', slot: 'head', rarity: 'common', make: (g) => { const d = sp(g, 0.255, 0x14234a, 0, 0.13, 0, {}, 1, 0.82, 1.03); bx(g, 0.28, 0.025, 0.2, 0x14234a, 0, 0.16, -0.3); bx(g, 0.1, 0.18, 0.2, 0x14234a, -0.22, 0.0, -0.02); sp(g, 0.035, 0xffffff, 0, 0.3, 0); } },
  { id: 'hockey_helmet', name: 'Hockey Helmet', slot: 'head', rarity: 'common', make: (g) => { bx(g, 0.45, 0.22, 0.44, 0xf2f2f2, 0, 0.16, 0, {}, 0.09); bx(g, 0.05, 0.2, 0.3, 0xf2f2f2, -0.23, 0.0, 0); bx(g, 0.05, 0.2, 0.3, 0xf2f2f2, 0.23, 0.0, 0); bx(g, 0.46, 0.03, 0.03, 0x1a2a6a, 0, 0.2, -0.22); } },
  { id: 'cowboy', name: 'Cowboy Hat', slot: 'head', rarity: 'rare', make: (g) => { cy(g, 0.36, 0.36, 0.02, 0x8a5a2a, 0, 0.19, 0); const l = bx(g, 0.1, 0.03, 0.34, 0x8a5a2a, -0.33, 0.24, 0); l.rotation.z = 0.5; const r = bx(g, 0.1, 0.03, 0.34, 0x8a5a2a, 0.33, 0.24, 0); r.rotation.z = -0.5; cy(g, 0.17, 0.2, 0.2, 0x8a5a2a, 0, 0.3, 0); cy(g, 0.2, 0.2, 0.04, 0x2a1a0a, 0, 0.23, 0); } },
  { id: 'tophat', name: 'Top Hat', slot: 'head', rarity: 'rare', make: (g) => { cy(g, 0.3, 0.3, 0.02, 0x111114, 0, 0.19, 0); cy(g, 0.18, 0.18, 0.32, 0x111114, 0, 0.36, 0); cy(g, 0.185, 0.185, 0.05, 0xb01818, 0, 0.26, 0); } },
  { id: 'propeller', name: 'Propeller Cap', slot: 'head', rarity: 'rare', make: (g) => { const d = sp(g, 0.235, 0xe83a3a, 0, 0.13, 0, {}, 1, 0.8, 1); for (let i = 0; i < 3; i++) { const q = sp(g, 0.235, [0x3a6ae8, 0xe8d83a, 0x3ae86a][i], 0, 0.13, 0, {}, 1.001, 0.801, 1.001); } bx(g, 0.3, 0.025, 0.2, 0xe83a3a, 0, 0.17, -0.28); const pr = new THREE.Group(); pr.position.y = 0.34; g.add(pr); bx(pr, 0.38, 0.015, 0.06, 0xe8d83a, 0, 0, 0); bx(pr, 0.06, 0.015, 0.38, 0x3ae86a, 0, 0, 0); g.userData.spin = pr; } },
  { id: 'helmet_fb', name: 'Football Helmet', slot: 'head', rarity: 'rare', make: (g) => { sp(g, 0.26, 0xb31b2a, 0, 0.06, 0.01, {}, 1.04, 1, 1.12); bx(g, 0.05, 0.02, 0.52, 0xffffff, 0, 0.31, 0); for (const y of [-0.02, -0.1, -0.18]) bx(g, 0.4, 0.025, 0.03, 0xd0d0d8, 0, y, -0.265, { metalness: 0.8 }); for (const x of [-0.17, 0, 0.17]) bx(g, 0.025, 0.2, 0.03, 0xd0d0d8, x, -0.1, -0.265, { metalness: 0.8 }); bx(g, 0.04, 0.12, 0.14, 0x111111, -0.22, 0.0, 0.0); bx(g, 0.04, 0.12, 0.14, 0x111111, 0.22, 0.0, 0.0); } },
  { id: 'viking', name: 'Viking Helm', slot: 'head', rarity: 'epic', make: (g) => { sp(g, 0.245, 0x8a8a94, 0, 0.1, 0, { metalness: 0.7, roughness: 0.35 }, 1, 0.85, 1); for (const s of [-1, 1]) { const h = cn(g, 0.06, 0.34, 0xf0e8d0, s * 0.3, 0.3, 0); h.rotation.z = -s * 0.7; } bx(g, 0.04, 0.2, 0.03, 0x8a8a94, 0, -0.04, -0.22, { metalness: 0.7 }); } },
  { id: 'wizard', name: 'Wizard Hat', slot: 'head', rarity: 'epic', make: (g) => { cy(g, 0.34, 0.34, 0.02, 0x2a2a7a, 0, 0.18, 0); const c = cn(g, 0.2, 0.62, 0x2a2a7a, 0, 0.5, 0); c.rotation.z = 0.12; for (let i = 0; i < 6; i++) sp(g, 0.025, 0xffe14a, Math.cos(i * 1.1) * 0.12, 0.3 + i * 0.07, Math.sin(i * 1.1) * 0.12 - 0.05, { mat: glow(0xffe14a, 1.6) }); } },
  { id: 'sombrero', name: 'Sombrero', slot: 'head', rarity: 'epic', make: (g) => { cy(g, 0.6, 0.6, 0.025, 0xe8c050, 0, 0.18, 0); cy(g, 0.6, 0.6, 0.03, 0xd22a2a, 0, 0.18, 0, {}, 24).scale.set(0.99, 0.6, 0.99); cn(g, 0.2, 0.3, 0xe8c050, 0, 0.35, 0); tor(g, 0.2, 0.025, 0xd22a2a, 0, 0.23, 0).rotation.x = Math.PI / 2; } },
  { id: 'crown', name: "Champion's Crown", slot: 'head', rarity: 'legendary', make: (g) => { cy(g, 0.2, 0.22, 0.12, 0xffc83d, 0, 0.27, 0, GOLD, 8); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; cn(g, 0.04, 0.12, 0xffc83d, Math.cos(a) * 0.2, 0.39, Math.sin(a) * 0.2, GOLD, 4); sp(g, 0.022, [0xff3040, 0x30a0ff, 0x30ff80][i % 3], Math.cos(a) * 0.2, 0.46, Math.sin(a) * 0.2, { mat: glow([0xff3040, 0x30a0ff, 0x30ff80][i % 3], 1.8) }); } } },
  { id: 'halo', name: 'Golden Halo', slot: 'head', rarity: 'legendary', make: (g) => { const t = tor(g, 0.2, 0.03, 0xffe070, 0, 0.5, 0, { mat: glow(0xffd860, 2.2) }); t.rotation.x = Math.PI / 2; g.userData.bob = t; } },
  // FACE
  { id: 'clown_nose', name: 'Clown Nose', slot: 'face', rarity: 'common', make: (g) => { sp(g, 0.055, 0xe82a2a, 0, -0.04, -0.285, { roughness: 0.3 }); } },
  { id: 'eye_black', name: 'Eye Black', slot: 'face', rarity: 'common', make: (g) => { for (const s of [-1, 1]) bx(g, 0.12, 0.03, 0.01, 0x050505, s * 0.105, -0.02, -0.2, {}, 0.005); } },
  { id: 'aviators', name: 'Aviator Shades', slot: 'face', rarity: 'common', make: (g) => { for (const s of [-1, 1]) { sp(g, 0.085, 0x1a1a22, s * 0.105, 0.045, -0.22, { roughness: 0.1, metalness: 0.5 }, 1, 0.9, 0.3); tor(g, 0.085, 0.008, 0xffd060, s * 0.105, 0.045, -0.225, GOLD).scale.set(1, 0.9, 1); } bx(g, 0.07, 0.012, 0.012, 0xffd060, 0, 0.07, -0.225, GOLD); } },
  { id: 'ski_goggles', name: 'Ski Goggles', slot: 'face', rarity: 'rare', make: (g) => { bx(g, 0.42, 0.04, 0.4, 0x222222, 0, 0.12, 0); bx(g, 0.34, 0.11, 0.03, 0xff7a1a, 0, 0.045, -0.225, { roughness: 0.1, metalness: 0.4 }, 0.04); } },
  { id: 'handlebar', name: 'Handlebar Stache', slot: 'face', rarity: 'rare', make: (g) => { bx(g, 0.2, 0.045, 0.045, 0x2a1a0a, 0, -0.092, -0.232); for (const s of [-1, 1]) { sp(g, 0.03, 0x2a1a0a, s * 0.12, -0.08, -0.232); bx(g, 0.07, 0.03, 0.04, 0x2a1a0a, s * 0.1, -0.082, -0.232); } } },
  { id: 'neon_shades', name: 'Neon Shades', slot: 'face', rarity: 'rare', make: (g) => { bx(g, 0.34, 0.075, 0.03, 0x111118, 0, 0.045, -0.225, { roughness: 0.1 }); bx(g, 0.14, 0.05, 0.035, 0xff40d0, -0.085, 0.045, -0.235, { mat: glow(0xff40d0, 2) }); bx(g, 0.14, 0.05, 0.035, 0x40e8ff, 0.085, 0.045, -0.235, { mat: glow(0x40e8ff, 2) }); } },
  { id: 'monocle', name: 'Fancy Monocle', slot: 'face', rarity: 'epic', make: (g) => { tor(g, 0.085, 0.01, 0xffc83d, 0.105, 0.045, -0.225, GOLD); const c = bx(g, 0.004, 0.2, 0.004, 0xffc83d, 0.2, -0.06, -0.22, GOLD); c.rotation.z = 0.2; } },
  { id: 'groucho', name: 'Disguise Kit', slot: 'face', rarity: 'epic', make: (g) => { for (const s of [-1, 1]) tor(g, 0.07, 0.012, 0x111111, s * 0.105, 0.045, -0.225); bx(g, 0.07, 0.012, 0.012, 0x111111, 0, 0.065, -0.225); sp(g, 0.07, 0xe0a070, 0, -0.04, -0.27, {}, 1, 1.3, 1); bx(g, 0.22, 0.05, 0.05, 0x111111, 0, -0.1, -0.24); } },
  // BODY
  { id: 'jersey_bb', name: 'Basketball Jersey', slot: 'body', rarity: 'common', make: jersey(0x5a2a9a, '#ffc83d', '23', '#ffc83d') },
  { id: 'jersey_fb', name: 'Football Jersey', slot: 'body', rarity: 'common', make: jersey(0x1f6a3a, '#ffffff', '7', '#ffffff', { sleeves: 0.2, pads: true }) },
  { id: 'jersey_hockey', name: 'Hockey Sweater', slot: 'body', rarity: 'common', make: jersey(0xb82030, '#ffffff', '99', '#ffffff', { sleeves: 0.5 }) },
  { id: 'jersey_base', name: 'Pinstripe Jersey', slot: 'body', rarity: 'common', make: (P) => wearBody(P, new THREE.MeshStandardMaterial({ map: stripeTex('#f4f4f4', '#14234a', true), roughness: 0.8 }), { sleeves: 0.22, sleeveMat: std(0xf4f4f4) }) },
  { id: 'ref_shirt', name: 'Referee Stripes', slot: 'body', rarity: 'rare', make: (P) => wearBody(P, new THREE.MeshStandardMaterial({ map: stripeTex('#111111', '#f4f4f4', false), roughness: 0.8 }), { sleeves: 0.22, sleeveMat: std(0x111111) }) },
  { id: 'hawaiian', name: 'Hawaiian Shirt', slot: 'body', rarity: 'rare', make: (P) => wearBody(P, new THREE.MeshStandardMaterial({ map: floralTex().t, roughness: 0.8 }), { sleeves: 0.2, sleeveMat: std(0x16231c) }) },
  { id: 'letterman', name: 'Letterman Jacket', slot: 'body', rarity: 'rare', make: (P) => wearBody(P, std(0x14234a), { sleeves: 0.52, sleeveMat: std(0xf0f0f0), extra: (Q) => [{ obj: at(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.01), std(0xe8c050)), -0.12, 1.3, -0.145), parent: Q.group }] }) },
  { id: 'lucky_vest', name: "Gambler's Vest", slot: 'body', rarity: 'rare', make: (P) => wearBody(P, std(0x0d4a2a), { extra: (Q) => [{ obj: at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.01), std(0xffc83d, GOLD)), 0, 1.18, -0.146), parent: Q.group }] }) },
  { id: 'tux', name: 'Tuxedo', slot: 'body', rarity: 'epic', make: (P) => wearBody(P, std(0x0c0c10), { sleeves: 0.5, extra: (Q) => { const o = []; const sh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.01), std(0xf8f8f8)); sh.position.set(0, 1.26, -0.147); o.push({ obj: sh, parent: Q.group }); for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), std(0xaa1a1a)); w.position.set(s * 0.04, 1.44, -0.15); w.rotation.z = s * 0.4; o.push({ obj: w, parent: Q.group }); } return o; } }) },
  { id: 'tracksuit', name: 'Gold Tracksuit', slot: 'body', rarity: 'epic', make: (P) => wearBody(P, std(0xd8a828, { metalness: 0.7, roughness: 0.3 }), { sleeves: 0.52, extra: (Q) => [{ obj: at(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.6, 0.01), std(0xffffff)), 0.12, 1.18, -0.147), parent: Q.group }] }) },
  { id: 'robe', name: "Champion's Robe", slot: 'body', rarity: 'legendary', make: (P) => wearBody(P, std(0xc01830, { roughness: 0.4 }), { len: 0.95, sleeves: 0.5, extra: (Q) => { const f = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 16), std(0xf4f0e8, { roughness: 1 })); f.rotation.x = Math.PI / 2; f.position.set(0, 1.48, 0); return [{ obj: f, parent: Q.group }]; } }) },
  // HAND (right hand)
  { id: 'golf_club', name: 'Golf Club', slot: 'hand', rarity: 'common', make: (g) => { cy(g, 0.012, 0.012, 0.95, 0xc8c8d0, 0, 0.3, 0, { metalness: 0.8 }); cy(g, 0.02, 0.02, 0.25, 0x222222, 0, 0.62, 0); bx(g, 0.04, 0.04, 0.14, 0xb8b8c0, 0, -0.18, -0.05, { metalness: 0.8 }); g.rotation.x = -0.5; } },
  { id: 'bat', name: 'Baseball Bat', slot: 'hand', rarity: 'common', make: (g) => { cy(g, 0.045, 0.02, 0.8, 0xc89a5a, 0, 0.33, 0); cy(g, 0.02, 0.025, 0.12, 0xc89a5a, 0, -0.1, 0); g.rotation.x = -0.45; } },
  { id: 'hockey_stick', name: 'Hockey Stick', slot: 'hand', rarity: 'common', make: (g) => { cy(g, 0.015, 0.015, 1.1, 0x2a2a2e, 0, 0.35, 0); bx(g, 0.03, 0.1, 0.32, 0x2a2a2e, 0, -0.2, -0.14); g.rotation.x = -0.35; } },
  { id: 'foam_finger', name: 'Foam Finger', slot: 'hand', rarity: 'common', make: (g) => { sp(g, 0.12, 0xff7a1a, 0, 0.05, -0.1, {}, 1, 1.2, 0.9); cy(g, 0.035, 0.045, 0.34, 0xff7a1a, 0, 0.34, -0.1); sp(g, 0.04, 0xff7a1a, 0, 0.52, -0.1); for (const s of [-1, 1]) cy(g, 0.03, 0.035, 0.16, 0xff7a1a, s * 0.06, 0.2, -0.1); g.rotation.x = -0.3; } },
  { id: 'racket', name: 'Tennis Racket', slot: 'hand', rarity: 'rare', make: (g) => { cy(g, 0.016, 0.016, 0.3, 0x222222, 0, 0.05, 0); const r = tor(g, 0.15, 0.015, 0xd22a2a, 0, 0.35, 0); r.scale.set(0.8, 1, 1); for (let i = -3; i <= 3; i++) { bx(g, 0.005, 0.26, 0.005, 0xeeeeee, i * 0.035, 0.35, 0); bx(g, 0.2, 0.005, 0.005, 0xeeeeee, 0, 0.35 + i * 0.035, 0); } g.rotation.x = -0.4; } },
  { id: 'megaphone', name: 'Megaphone', slot: 'hand', rarity: 'rare', make: (g) => { const c = cn(g, 0.16, 0.34, 0xe8e8e8, 0, 0.1, -0.2, {}, 16); c.rotation.x = -Math.PI / 2; bx(g, 0.05, 0.12, 0.05, 0x222222, 0, -0.04, -0.06); g.rotation.x = 0; } },
  { id: 'bowling_pin', name: 'Bowling Pin', slot: 'hand', rarity: 'rare', make: (g) => { cy(g, 0.04, 0.065, 0.28, 0xf4f4f4, 0, 0.14, 0); sp(g, 0.055, 0xf4f4f4, 0, 0.34, 0); cy(g, 0.052, 0.052, 0.025, 0xd22a2a, 0, 0.27, 0); g.rotation.x = -0.3; } },
  { id: 'trophy', name: 'Trophy', slot: 'hand', rarity: 'epic', make: (g) => { cy(g, 0.1, 0.05, 0.16, 0xffc83d, 0, 0.3, -0.05, GOLD); cy(g, 0.02, 0.02, 0.14, 0xffc83d, 0, 0.15, -0.05, GOLD); cy(g, 0.08, 0.09, 0.04, 0x3a2a1a, 0, 0.07, -0.05); for (const s of [-1, 1]) tor(g, 0.045, 0.01, 0xffc83d, s * 0.11, 0.3, -0.05, GOLD); } },
  { id: 'stein', name: 'Giant Beer Stein', slot: 'hand', rarity: 'epic', make: (g) => { cy(g, 0.1, 0.09, 0.22, 0xe8b020, 0, 0.12, -0.08, { roughness: 0.2, transparent: true, opacity: 0.85 }); sp(g, 0.105, 0xffffff, 0, 0.25, -0.08, {}, 1, 0.45, 1); tor(g, 0.07, 0.014, 0xcfcfd4, 0.13, 0.12, -0.08, { metalness: 0.6 }); } },
  { id: 'golden_club', name: 'Golden Golf Club', slot: 'hand', rarity: 'legendary', make: (g) => { cy(g, 0.012, 0.012, 0.95, 0xffd24a, 0, 0.3, 0, { metalness: 1, roughness: 0.15 }); cy(g, 0.02, 0.02, 0.25, 0xb8860b, 0, 0.62, 0, GOLD); bx(g, 0.04, 0.04, 0.14, 0xffd24a, 0, -0.18, -0.05, { mat: glow(0xffc83d, 1.5) }); g.rotation.x = -0.5; } },
  // BACK
  { id: 'cape', name: 'Hero Cape', slot: 'back', rarity: 'common', make: (g) => { const c = bx(g, 0.5, 0.95, 0.02, 0xc01830, 0, -0.35, 0.05, { side: THREE.DoubleSide }); c.rotation.x = 0.12; bx(g, 0.34, 0.06, 0.1, 0xffc83d, 0, 0.12, -0.02, GOLD); } },
  { id: 'golf_bag', name: 'Golf Bag', slot: 'back', rarity: 'common', make: (g) => { cy(g, 0.09, 0.08, 0.7, 0x2a4a8a, 0, -0.1, 0.1); for (let i = 0; i < 3; i++) { const c = cy(g, 0.01, 0.01, 0.5, 0xc8c8d0, (i - 1) * 0.04, 0.4, 0.1, { metalness: 0.8 }); c.rotation.z = (i - 1) * 0.15; sp(g, 0.025, [0xd22a2a, 0xffc83d, 0x2a8a3a][i], (i - 1) * 0.1, 0.66, 0.1); } } },
  { id: 'banner', name: 'Team Banner', slot: 'back', rarity: 'rare', make: (g) => { cy(g, 0.012, 0.012, 1.2, 0x8a6a3a, 0.2, 0.2, 0.1); bx(g, 0.5, 0.3, 0.015, 0x2a5aa8, 0.46, 0.65, 0.1); bx(g, 0.34, 0.06, 0.02, 0xffffff, 0.46, 0.65, 0.108); } },
  { id: 'jetpack', name: 'Jetpack', slot: 'back', rarity: 'rare', make: (g) => { for (const s of [-1, 1]) { cy(g, 0.07, 0.07, 0.5, 0xb8b8c0, s * 0.1, 0.0, 0.1, { metalness: 0.8 }); cn(g, 0.05, 0.22, 0xff9a2a, s * 0.1, -0.35, 0.1, { mat: glow(0xff8a20, 2.2) }).rotation.x = Math.PI; } } },
  { id: 'angel_wings', name: 'Angel Wings', slot: 'back', rarity: 'epic', make: (g) => { for (const s of [-1, 1]) { const w = new THREE.Group(); for (let i = 0; i < 5; i++) { const f = bx(w, 0.07, 0.5 - i * 0.07, 0.02, 0xffffff, s * (0.15 + i * 0.08), 0.1 - i * 0.03, 0.12, { emissive: 0xaaaaaa, emissiveIntensity: 0.15 }); f.rotation.z = -s * (0.5 + i * 0.09); } g.add(w); } } },
  { id: 'dragon_wings', name: 'Dragon Wings', slot: 'back', rarity: 'legendary', make: (g) => { for (const s of [-1, 1]) { for (let i = 0; i < 4; i++) { const b = bx(g, 0.03, 0.62 - i * 0.1, 0.03, 0x2a0a0a, s * (0.2 + i * 0.13), 0.2 - i * 0.05, 0.14); b.rotation.z = -s * (0.8 + i * 0.12); const m = bx(g, 0.12, 0.5 - i * 0.09, 0.012, 0x9a1020, s * (0.26 + i * 0.13), 0.14 - i * 0.05, 0.14, { mat: new THREE.MeshStandardMaterial({ color: 0x9a1020, emissive: 0xff2010, emissiveIntensity: 0.7, side: THREE.DoubleSide }) }); m.rotation.z = -s * (0.8 + i * 0.12); } } } },
];
export const BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

// ---- applying to a person ----
const SLOT_MOUNT = { head: (P) => ({ parent: P.head }), face: (P) => ({ parent: P.head }), hand: (P) => ({ parent: P.arms[1], pos: [0, -0.6, -0.04] }), back: (P) => ({ parent: P.group, pos: [0, 1.25, 0.2] }) };
export function applyCosmetics(P, cos = {}) {
  if (P._cos) for (const { obj, parent } of P._cos) parent.remove(obj);
  P._cos = []; P._anim = [];
  if (cos.tag === 'toe_tag') { // worn for a season after dying: a morgue tag dangling at the right foot
    const g = new THREE.Group(), card = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 76; const g = c.getContext('2d'); g.fillStyle = '#f2ecd8'; g.fillRect(0, 0, 128, 76); g.strokeStyle = '#8a6a3a'; g.lineWidth = 4; g.strokeRect(3, 3, 122, 70); g.fillStyle = '#b01818'; g.font = '900 34px system-ui'; g.textAlign = 'center'; g.fillText('D.O.A.', 64, 50); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })() }));
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 4), new THREE.MeshBasicMaterial({ color: 0x9a7a4a })); str.position.y = 0.045; card.position.set(0.03, -0.05, 0); card.rotation.z = 0.35; g.add(str, card);
    const foot = P.bones && P.bones.RightFoot, parent = foot ? P.group : P.legs[1];
    if (foot) { const v = new THREE.Vector3(); P._anim.push(() => { foot.getWorldPosition(v); P.group.worldToLocal(v); g.position.set(v.x + 0.06, v.y + 0.05, v.z); g.rotation.z = Math.sin(performance.now() / 300) * 0.25; }); }
    else g.position.set(0.05, -0.85, 0.05);
    parent.add(g); P._cos.push({ obj: g, parent });
  }
  for (const slot of ['body', 'head', 'face', 'hand', 'back']) {
    const it = BY_ID[cos[slot]]; if (!it || it.slot !== slot) continue;
    if (slot === 'body') { for (const a of it.make(P)) { a.parent.add(a.obj); P._cos.push(a); } continue; }
    const mt = SLOT_MOUNT[slot](P), g = new THREE.Group(); if (mt.pos) g.position.set(...mt.pos);
    it.make(g); mt.parent.add(g); P._cos.push({ obj: g, parent: mt.parent });
    if (g.userData.spin) P._anim.push((t) => { g.userData.spin.rotation.y = t * 14; });
    if (g.userData.bob) P._anim.push((t) => { g.position.y = Math.sin(t * 2) * 0.02; });
  }
}
export const tickCosmetics = (P, t) => { if (P._anim) for (const f of P._anim) f(t); };

// ---- crates ----
export function rollCrate(rng = Math.random) {
  const tot = Object.values(RARITY).reduce((a, r) => a + r.w, 0); let x = rng() * tot, rar = 'common';
  for (const [k, r] of Object.entries(RARITY)) { if ((x -= r.w) <= 0) { rar = k; break; } }
  const pool = CATALOG.filter((c) => c.rarity === rar); return pool[Math.floor(rng() * pool.length)];
}

// ---- live 3D preview that floats over a placeholder element ----
export function createPreview() {
  const canvas = document.createElement('canvas'); canvas.id = 'shopPreview'; canvas.className = 'hidden'; document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(32, 0.8, 0.1, 20); cam.position.set(0, 1.25, 4.3); cam.lookAt(0, 1.0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 1.4)); const k = new THREE.DirectionalLight(0xfff0d0, 2.2); k.position.set(2, 3, 3); scene.add(k); const rim = new THREE.DirectionalLight(0x6a8aff, 1.2); rim.position.set(-3, 2, -2); scene.add(rim);
  const P = makePreset('bub', { hat: null, backpack: false, shorts: false, pants: 0x2c3e50, shirt: 0x6a6a72, hairStyle: 'short' }); P.group.rotation.y = Math.PI; scene.add(P.group);
  let cos = {}, host = null, raf = 0, ang = 0.5;
  const loop = (ts) => { raf = requestAnimationFrame(loop);
    const el = host && document.querySelector(host); if (!el) { canvas.classList.add('hidden'); return; }
    const r = el.getBoundingClientRect(); if (r.width < 10) { canvas.classList.add('hidden'); return; }
    canvas.classList.remove('hidden'); Object.assign(canvas.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    if (canvas.width !== Math.round(r.width * 1.5)) { renderer.setSize(r.width, r.height, false); canvas.width = Math.round(r.width * 1.5); canvas.height = Math.round(r.height * 1.5); renderer.setPixelRatio(1.5); renderer.setSize(r.width, r.height, false); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); }
    ang += 0.012; P.group.rotation.y = Math.PI + Math.sin(ang) * 0.9; tickCosmetics(P, ts / 1000); renderer.render(scene, cam); };
  raf = requestAnimationFrame(loop);
  return { setHost(sel) { host = sel; }, set(c) { cos = c || {}; applyCosmetics(P, cos); }, person: P };
}
