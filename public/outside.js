import * as THREE from 'three';
import * as TX from './textures.js';
import { makePreset, randomPatron } from './people.js';
import { audio } from './audio.js';

// ---------- outside: the bar's block (a Chicago street at night), the gas station across the street, and its casino ----------
// Walk out the bar's front door onto the sidewalk; the L runs over the street; the gas station lot is across and to the right,
// and the store at the back of the lot is a little gas-station casino: the roulette table (moved here from the bar) and slot machines.
// Everything here is a stand-in built from boxes and canvas textures; reference art drops in through `art()` when it exists.
export const OUT = {
  door: { x: 5, w: 1.24, h: 2.34 },                 // the bar's front door, in the z = 8 wall
  street: { z0: 12, z1: 22 },                        // curb to curb (sidewalks either side)
  lot: { x0: 12, x1: 36, z0: 22, z1: 46 },
  casino: { x0: 18, x1: 30, z0: 36, z1: 44, h: 4.2, door: { x: 24, w: 1.4, h: 2.4 } },
  roulette: { x: 21.6, z: 39.4 },                   // table centre (roulette.js lays itself out around it)
  dealer: { x: 21.5, z: 37.95 },
};
OUT.roulette.signZ = OUT.casino.z0 + 0.12; OUT.roulette.signY = 3.4;
OUT.slots = [19.7, 21.2, 22.7, 24.2, 25.7, 27.2].map((x, i) => ({ i, x, z: OUT.casino.z1 - 0.5 }));

// ---------- slot symbols (shared with the slot panel in client.js through BK.slotDraw) ----------
export const SLOT_SYMS = ['7', 'ball', 'bar', 'bell', 'lemon', 'cherry'];
export function drawSym(g, sym, cx, cy, s) {
  g.save(); g.translate(cx, cy); g.lineJoin = 'round';
  if (sym === '7') { g.font = `400 ${s * 0.95}px Bungee, "Arial Black", system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = s * 0.08; g.strokeStyle = '#5a0010'; g.strokeText('7', 0, s * 0.04); g.fillStyle = '#e81830'; g.fillText('7', 0, s * 0.04); }
  else if (sym === 'bar') { g.fillStyle = '#111'; g.fillRect(-s * 0.42, -s * 0.2, s * 0.84, s * 0.4); g.strokeStyle = '#ffd24a'; g.lineWidth = s * 0.05; g.strokeRect(-s * 0.42, -s * 0.2, s * 0.84, s * 0.4); g.fillStyle = '#fff'; g.font = `400 ${s * 0.26}px Bungee, "Arial Black", system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BAR', 0, s * 0.02); }
  else if (sym === 'cherry') { g.strokeStyle = '#2a7a2a'; g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(-s * 0.16, s * 0.05); g.quadraticCurveTo(-s * 0.05, -s * 0.35, s * 0.15, -s * 0.38); g.moveTo(s * 0.17, s * 0.1); g.quadraticCurveTo(s * 0.12, -s * 0.2, s * 0.15, -s * 0.38); g.stroke();
    for (const [x, y] of [[-s * 0.17, s * 0.17], [s * 0.18, s * 0.22]]) { g.fillStyle = '#d0102a'; g.beginPath(); g.arc(x, y, s * 0.17, 0, 7); g.fill(); g.fillStyle = '#ff8a9a'; g.beginPath(); g.arc(x - s * 0.06, y - s * 0.06, s * 0.04, 0, 7); g.fill(); } }
  else if (sym === 'lemon') { g.fillStyle = '#f2d42a'; g.beginPath(); g.ellipse(0, 0, s * 0.36, s * 0.26, -0.3, 0, 7); g.fill(); g.strokeStyle = '#b89a10'; g.lineWidth = s * 0.03; g.stroke(); g.fillStyle = '#fff6'; g.beginPath(); g.ellipse(-s * 0.1, -s * 0.08, s * 0.1, s * 0.05, -0.3, 0, 7); g.fill(); }
  else if (sym === 'bell') { g.fillStyle = '#f0b020'; g.beginPath(); g.moveTo(-s * 0.32, s * 0.22); g.quadraticCurveTo(-s * 0.3, -s * 0.36, 0, -s * 0.36); g.quadraticCurveTo(s * 0.3, -s * 0.36, s * 0.32, s * 0.22); g.closePath(); g.fill(); g.fillRect(-s * 0.38, s * 0.18, s * 0.76, s * 0.08); g.beginPath(); g.arc(0, s * 0.3, s * 0.07, 0, 7); g.fill(); g.strokeStyle = '#8a5a00'; g.lineWidth = s * 0.03; g.stroke(); }
  else { g.fillStyle = '#e8701a'; g.beginPath(); g.arc(0, 0, s * 0.34, 0, 7); g.fill(); g.strokeStyle = '#1a1a1a'; g.lineWidth = s * 0.035; g.stroke(); g.beginPath(); g.moveTo(-s * 0.34, 0); g.lineTo(s * 0.34, 0); g.moveTo(0, -s * 0.34); g.lineTo(0, s * 0.34); g.stroke(); g.beginPath(); g.arc(-s * 0.5, 0, s * 0.3, -0.75, 0.75); g.stroke(); g.beginPath(); g.arc(s * 0.5, 0, s * 0.3, Math.PI - 0.75, Math.PI + 0.75); g.stroke(); }
  g.restore();
}

export function createOutside({ scene, BK, stations, obstacles, bar, ROOM }) {
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const MT = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, ...o });
  const glow = (c, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m; };
  const plane = (w, h, mat, x, y, z, ry = 0, parent = scene) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; parent.add(m); return m; };
  const flat = (w, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m; };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 12) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); scene.add(m); return m; };
  const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // reference art (public/art/<name>.webp) replaces a stand-in texture when it's there
  // (art/manifest.json lists what's there, so the game never asks for a file that doesn't exist)
  const artList = fetch('art/manifest.json').then((r) => (r.ok ? r.json() : { files: [] })).then((m) => new Set(m.files || [])).catch(() => new Set());
  const art = (mat, name, repeat) => artList.then((have) => { if (!have.has(name)) return; new THREE.TextureLoader().load(`art/${name}.webp`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); } mat.map = t; if (mat.emissiveMap) mat.emissiveMap = t; mat.needsUpdate = true; }); });
  // night city light: outside surfaces glow faintly with their own texture, so the street reads without a sky full of lamps
  const lit = (mat, k) => { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = mat.map; mat.emissiveIntensity = k; return mat; };
  const { door: DOOR, street: ST, lot: LOT, casino: CA } = OUT;
  const Z0 = ROOM.z + 0.3; // the bar's outside face

  // ---------- ground: sidewalks, curbs, street with lines, the gas-station lot ----------
  const concrete = TX.canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#5a5a58'; g.fillRect(0, 0, w, h); const R = rnd(7); for (let i = 0; i < 2600; i++) { const v = 70 + R() * 40 | 0; g.fillStyle = `rgba(${v},${v},${v - 4},0.35)`; g.fillRect(R() * w, R() * h, 2, 2); } g.strokeStyle = '#3c3c3a'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(20,20,18,0.25)'; g.beginPath(); g.ellipse(R() * w, R() * h, 6 + R() * 10, 4 + R() * 6, R() * 3, 0, 7); g.fill(); } }, { repeat: [40, 2] }).t;
  const asphalt = TX.canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#26262a'; g.fillRect(0, 0, w, h); const R = rnd(3); for (let i = 0; i < 3000; i++) { const v = 30 + R() * 30 | 0; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(R() * w, R() * h, 2, 2); } for (let i = 0; i < 4; i++) { g.strokeStyle = 'rgba(12,12,14,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(R() * w, R() * h); for (let k = 0; k < 5; k++) g.lineTo(R() * w, R() * h); g.stroke(); } }, { repeat: [30, 3] }).t;
  const sideM = lit(MT(concrete, { roughness: 0.95 }), 0.22), streetM = lit(MT(asphalt, { roughness: 0.75 }), 0.18); art(sideM, 'sidewalk', [40, 2]);
  flat(160, ST.z0 - ROOM.z, sideM, 0, 0.0, (ROOM.z + ST.z0) / 2);       // bar-side sidewalk
  flat(160, ST.z1 - ST.z0, streetM, 0, -0.08, (ST.z0 + ST.z1) / 2);    // street (a curb step down)
  flat(160, 4, sideM, 0, 0.0, ST.z1 + 2);                              // far sidewalk
  box(160, 0.12, 0.2, M(0x8a8a86), 0, -0.02, ST.z0 - 0.1); box(160, 0.12, 0.2, M(0x8a8a86), 0, -0.02, ST.z1 + 0.1); // curbs
  { const yl = glow(0xd8b030, 0.9); for (const dz of [-0.09, 0.09]) flat(160, 0.1, yl, 0, -0.07, (ST.z0 + ST.z1) / 2 + dz);
    const wl = glow(0xd8d8d0, 0.8); for (let x = -78; x < 80; x += 6) for (const z of [ST.z0 + 2.5, ST.z1 - 2.5]) flat(3, 0.12, wl, x, -0.07, z);
    for (let k = 0; k < 8; k++) flat(0.5, 3.2, wl, 1.5 + k * 1.0, -0.07, ST.z0 - 1.9 + 0.001); } // crosswalk stripes (on the sidewalk side of the bar door... the street gets them at the corner)
  const lotM = lit(MT(concrete, { color: 0x9a9a96, roughness: 0.9 }), 0.2); flat(LOT.x1 - LOT.x0, LOT.z1 - ST.z1 - 4, lotM, (LOT.x0 + LOT.x1) / 2, 0.01, (ST.z1 + 4 + LOT.z1) / 2);
  // far ground under everything else, so nothing looks into the void
  { const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M(0x141418)); g.rotation.x = -Math.PI / 2; g.position.set(0, -0.12, 150); scene.add(g); }

  // ---------- facades (canvas stand-ins; T2-T5 art replaces them) ----------
  const facadeTex = (kind, seed, w = 512, h = 640) => TX.canvasTex(w, h, (g) => {
    const R = rnd(seed), brick = { red: ['#6a2a1e', '#7a3424'], tan: ['#8a6a48', '#9a7a56'], grey: ['#8a8a84', '#9a9a92'] }[kind] || ['#5a2a20', '#6a3024'];
    g.fillStyle = brick[0]; g.fillRect(0, 0, w, h);
    if (kind !== 'grey') for (let y = 0; y < h; y += 8) for (let x = -(y / 8 % 2) * 12; x < w; x += 24) { g.fillStyle = R() < 0.5 ? brick[1] : brick[0]; g.fillRect(x + 1, y + 1, 22, 6); }
    else for (let y = 0; y < h; y += 26) { g.fillStyle = '#7a7a74'; g.fillRect(0, y, w, 2); }
    g.fillStyle = '#2a2622'; g.fillRect(0, 0, w, 26); g.fillStyle = '#4a4440'; g.fillRect(0, 26, w, 8); // cornice
    const cols = 3, rows = 2, ww = w / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = c * ww + ww * 0.22, y = 70 + r * 170, lit = R() < 0.45;
      g.fillStyle = '#222'; g.fillRect(x - 6, y - 6, ww * 0.56 + 12, 128); g.fillStyle = lit ? (R() < 0.5 ? '#f2c46a' : '#e8a84a') : '#1a2030'; g.fillRect(x, y, ww * 0.56, 116);
      if (lit) { g.fillStyle = 'rgba(80,40,10,0.35)'; g.fillRect(x, y, ww * 0.56, 30); } g.fillStyle = '#222'; g.fillRect(x + ww * 0.27, y, 4, 116); g.fillStyle = '#7a7470'; g.fillRect(x - 10, y + 116, ww * 0.56 + 20, 8); }
    // ground floor: a closed storefront or a door
    g.fillStyle = '#1c1c20'; g.fillRect(0, h - 190, w, 190); g.fillStyle = '#3a3a3e'; for (let y = h - 180; y < h - 10; y += 10) g.fillRect(30, y, w - 60, 6); // roll-down gate
    g.fillStyle = '#2a2a2a'; g.fillRect(0, h - 200, w, 14);
    g.fillStyle = R() < 0.5 ? '#c84a2a' : '#2a6a9a'; g.fillRect(w * 0.2, h - 236, w * 0.6, 30); g.fillStyle = '#fff'; g.font = '400 20px Bungee, "Arial Black", system-ui'; g.textAlign = 'center'; g.fillText(['PAWN', 'LIQUORS', 'TAQUERIA', 'BARBER', 'CELL REPAIR', 'LAUNDROMAT'][seed % 6], w / 2, h - 214);
  }).t;
  const facade = (w, h, x, z, ry, kind, seed, artName) => { const mat = lit(MT(facadeTex(kind, seed), { roughness: 0.95 }), 0.42); if (artName) art(mat, artName); return plane(w, h, mat, x, h / 2, z, ry); };
  // the bar's own outside: dark brick with THE DUGOUT neon over the door, glowing windows, a doorway cut through
  { const tex = TX.canvasTex(1024, 256, (g, w, h) => { g.fillStyle = '#2a1a16'; g.fillRect(0, 0, w, h); const R = rnd(11); for (let y = 0; y < h; y += 6) for (let x = -(y / 6 % 2) * 9; x < w; x += 18) { g.fillStyle = R() < 0.5 ? '#3a2420' : '#2e1c18'; g.fillRect(x + 1, y + 1, 16, 4); }
      for (const cx of [380, 520]) { g.fillStyle = '#111'; g.fillRect(cx - 52, 110, 104, 84); g.fillStyle = '#7a4a1a'; g.fillRect(cx - 46, 116, 92, 72); g.fillStyle = 'rgba(80,140,255,0.35)'; g.fillRect(cx - 30, 126, 40, 30); } }).t;
    const mat = lit(MT(tex, { roughness: 0.95 }), 0.45); art(mat, 'bar_exterior');
    const W = ROOM.x * 2, H = 6.2, a = -ROOM.x, b = ROOM.x, d0 = DOOR.x - DOOR.w / 2, d1 = DOOR.x + DOOR.w / 2;
    const piece = (x0, x1, y0, y1) => { const m = plane(x1 - x0, y1 - y0, mat, (x0 + x1) / 2, (y0 + y1) / 2, Z0, 0); const u0 = (x0 - a) / W, u1 = (x1 - a) / W, v0 = y0 / H, v1 = y1 / H, uv = m.geometry.attributes.uv; uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); uv.needsUpdate = true; };
    piece(a, d0, 0, H); piece(d1, b, 0, H); piece(d0, d1, DOOR.h, H);
    const jam = M(0x2a170b); box(0.1, DOOR.h, 0.32, jam, d0 - 0.05, DOOR.h / 2, ROOM.z + 0.15); box(0.1, DOOR.h, 0.32, jam, d1 + 0.05, DOOR.h / 2, ROOM.z + 0.15); box(DOOR.w + 0.2, 0.1, 0.32, jam, DOOR.x, DOOR.h + 0.05, ROOM.z + 0.15);
    const n = TX.neon('THE DUGOUT', '#27e08a', { w: 512, h: 128, size: 76 }).t; plane(4.4, 1.1, new THREE.MeshBasicMaterial({ map: n, transparent: true, depthWrite: false, toneMapped: false }), DOOR.x - 3.2, 3.6, Z0 + 0.05, 0);
    const b2 = TX.neon('COLD BEER', '#ff4a8a', { w: 512, h: 128, size: 70 }).t; plane(1.8, 0.45, new THREE.MeshBasicMaterial({ map: b2, transparent: true, depthWrite: false, toneMapped: false }), -6, 2.2, Z0 + 0.05, 0);
    box(1.6, 0.08, 0.6, M(0x1a1a1a), DOOR.x, DOOR.h + 0.25, Z0 + 0.3); // little awning over the door
    // block neighbours either side of the bar
    facade(12, 10, 18, Z0, 0, 'red', 1); facade(12, 11, 30, Z0, 0, 'grey', 2); facade(12, 9, -18, Z0, 0, 'tan', 3); facade(12, 10.5, -30, Z0, 0, 'red', 4);
  }
  // across the street (left of the lot), the lot's side walls, and the block past it
  [[-30, 'grey', 5, 11], [-18, 'red', 6, 10], [-6, 'tan', 7, 9.5], [6, 'red', 8, 10.5], [42, 'tan', 9, 10], [54, 'grey', 10, 11]].forEach(([x, k, s, h]) => facade(12, h, x, ST.z1 + 4, Math.PI, k, s, k === 'grey' ? 'facade_greystone' : 'facade_brick'));
  { const side = lit(MT(facadeTex('red', 12), { roughness: 0.95 }), 0.35); plane(LOT.z1 - ST.z1 - 4, 10.5, side, LOT.x0, 5.25, (ST.z1 + 4 + LOT.z1) / 2, Math.PI / 2); const s2 = lit(MT(facadeTex('tan', 13), { roughness: 0.95 }), 0.35); plane(LOT.z1 - ST.z1 - 4, 10, s2, LOT.x1, 5, (ST.z1 + 4 + LOT.z1) / 2, -Math.PI / 2);
    plane(LOT.x1 - LOT.x0, 3, M(0x3a3632), (LOT.x0 + LOT.x1) / 2, 1.5, LOT.z1, Math.PI); } // back fence of the lot

  // ---------- sky + skyline (T1 art replaces the painted one) ----------
  { const sky = TX.canvasTex(32, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#05060f'); gr.addColorStop(0.55, '#121433'); gr.addColorStop(0.8, '#3a2a48'); gr.addColorStop(1, '#8a4a3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }).t;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2 + 0.05), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, depthWrite: false })); dome.position.y = -10; dome.renderOrder = -2; scene.add(dome);
    const city = TX.canvasTex(2048, 512, (g, w, h) => { g.clearRect(0, 0, w, h); const R = rnd(21);
      const tower = (x, bw, bh, col = '#0b0d18') => { g.fillStyle = col; g.fillRect(x, h - bh, bw, bh); for (let y = h - bh + 8; y < h - 4; y += 9) for (let xx = x + 4; xx < x + bw - 4; xx += 7) if (R() < 0.32) { g.fillStyle = R() < 0.8 ? 'rgba(255,214,140,0.85)' : 'rgba(170,200,255,0.8)'; g.fillRect(xx, y, 3, 4); } };
      for (let x = 0; x < w; x += 30 + R() * 40) tower(x, 30 + R() * 50, 60 + R() * 140, '#10121e');
      tower(880, 70, 420); g.fillStyle = '#0b0d18'; g.fillRect(890, h - 470, 14, 50); g.fillRect(930, h - 470, 14, 50); // the tall black one, with its two antennas
      tower(1300, 60, 360); g.fillStyle = '#0b0d18'; g.beginPath(); g.moveTo(1300, h - 360); g.lineTo(1330, h - 400); g.lineTo(1360, h - 360); g.fill(); // the tapered one
      for (let i = 0; i < 9; i++) tower(500 + i * 120 + R() * 40, 40 + R() * 50, 180 + R() * 180);
      const hz = g.createLinearGradient(0, h - 60, 0, h); hz.addColorStop(0, 'rgba(255,140,60,0)'); hz.addColorStop(1, 'rgba(255,140,60,0.35)'); g.fillStyle = hz; g.fillRect(0, h - 60, w, 60); }).t;
    const cm = new THREE.MeshBasicMaterial({ map: city, transparent: true, fog: false, depthWrite: false, toneMapped: false }); art(cm, 'skyline');
    for (const [z, ry] of [[160, Math.PI], [-160, 0]]) { const m = plane(520, 130, cm, 40, 50, z, ry); m.renderOrder = -1; }
  }

  // ---------- the L: green steel trestle over the street, and a train every minute and a half ----------
  const L = { z: (ST.z0 + ST.z1) / 2, y: 6.6 }, green = M(0x2c4636, { roughness: 0.7, metalness: 0.2 });
  for (let x = -76; x <= 80; x += 10) for (const z of [ST.z0 + 0.5, ST.z1 - 0.5]) { box(0.45, L.y, 0.45, green, x, L.y / 2, z); obstacles.push({ x, z, r: 0.35 }); }
  for (const z of [ST.z0 + 0.5, ST.z1 - 0.5, L.z - 2, L.z + 2]) box(160, 0.7, 0.35, green, 0, L.y + 0.2, z);
  for (let x = -76; x <= 80; x += 5) box(0.3, 0.4, ST.z1 - ST.z0 - 1, green, x, L.y - 0.1, L.z);
  box(160, 0.15, ST.z1 - ST.z0 - 0.6, M(0x1e1e1e), 0, L.y + 0.6, L.z); for (const dz of [-2.8, -1.6, 1.6, 2.8]) box(160, 0.12, 0.12, M(0x8a8a8a, { metalness: 0.8, roughness: 0.3 }), 0, L.y + 0.74, L.z + dz);
  const train = new THREE.Group(); scene.add(train); { const body = M(0xb8bcc4, { metalness: 0.6, roughness: 0.35 }), win = glow(0xffe0a0, 1.4), stripe = glow(0x2a6ad8, 0.9);
    for (let k = 0; k < 4; k++) { const x = k * 15; box(14.4, 3.2, 3, body, x, 0, 0, train); for (const s of [-1, 1]) { box(12.6, 0.8, 0.02, win, x, 0.5, s * 1.51, train); box(14.4, 0.2, 0.02, stripe, x, -0.6, s * 1.51, train); } } }
  train.position.set(-200, L.y + 2.4, L.z - 2.2); let rumble = null;

  // ---------- street furniture (A7-A13 art replaces these) ----------
  const pole = M(0x2f3a34, { metalness: 0.4, roughness: 0.5 });
  const lamp = (x, z, face) => { cyl(0.09, 0.12, 7, pole, x, 3.5, z); box(0.1, 0.1, 1.6, pole, x, 7, z + face * 0.8); box(0.5, 0.18, 0.8, M(0x3a3a3a), x, 6.95, z + face * 1.5); box(0.4, 0.04, 0.6, glow(0xffd9a0, 2.4), x, 6.85, z + face * 1.5); obstacles.push({ x, z, r: 0.25 }); };
  [-28, -12, 12, 28].forEach((x) => lamp(x, ST.z0 - 0.6, 1)); [-20, -4, 44].forEach((x) => lamp(x, ST.z1 + 0.6, -1));
  for (const [x, z] of [[-12, ST.z0 - 0.5], [12, ST.z0 - 0.5], [-4, ST.z1 + 0.5]]) { const l = new THREE.PointLight(0xffc888, 40, 22, 1.4); l.position.set(x, 6.3, z + 1.5); l.userData.noDim = true; scene.add(l); }
  const hyd = (x, z) => { cyl(0.16, 0.18, 0.7, M(0xe8e0c8), x, 0.35, z); cyl(0.19, 0.19, 0.14, M(0xc0202a), x, 0.74, z); obstacles.push({ x, z, r: 0.3 }); }; hyd(-2.5, ST.z0 - 0.5); hyd(16, ST.z1 + 0.6);
  const mail = (x, z) => { box(0.55, 1.0, 0.5, M(0x1d4aa0), x, 0.5, z); const t = cyl(0.275, 0.275, 0.5, M(0x1d4aa0), x, 1.0, z, 16); t.rotation.z = Math.PI / 2; obstacles.push({ x, z, r: 0.4 }); }; mail(9.5, ST.z0 - 0.7);
  const news = (x, z) => { box(0.5, 0.9, 0.45, M(0xa02a22), x, 0.75, z); box(0.36, 0.25, 0.02, glow(0xe8e0c8, 0.6), x, 1.0, z - 0.24); obstacles.push({ x, z, r: 0.35 }); }; news(1.5, ST.z0 - 0.6);
  { box(2.0, 1.3, 1.4, M(0x1f4a2a, { roughness: 0.6 }), 14.5, 0.65, ROOM.z + 1.0); box(2.0, 0.06, 1.45, M(0x111111), 14.5, 1.33, ROOM.z + 1.0); obstacles.push({ x: 14.0, z: ROOM.z + 1, r: 0.8 }, { x: 15.0, z: ROOM.z + 1, r: 0.8 }); } // dumpster by the neighbour
  const car = (x, z, col, ry) => { const g = new THREE.Group(); g.position.set(x, -0.08, z); g.rotation.y = ry; scene.add(g); const c = M(col, { roughness: 0.35, metalness: 0.4 }); box(4.6, 0.75, 1.8, c, 0, 0.6, 0, g); box(2.4, 0.6, 1.6, c, -0.2, 1.25, 0, g); box(2.3, 0.5, 1.62, M(0x1a2230, { roughness: 0.1, metalness: 0.6 }), -0.2, 1.25, 0, g);
    for (const [wx, wz] of [[1.4, 0.85], [1.4, -0.85], [-1.4, 0.85], [-1.4, -0.85]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), M(0x111111)); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.34, wz); g.add(w); }
    obstacles.push({ x: x - 1.4 * Math.cos(ry), z, r: 1.1 }, { x: x + 1.4 * Math.cos(ry), z, r: 1.1 }); };
  car(-8, ST.z0 + 1.2, 0x5a1a22, 0); car(24, ST.z1 - 1.2, 0x2a3a4a, Math.PI);

  // ---------- the gas station: canopy over two pump islands, the store at the back of the lot ----------
  const cz = 30.2, canopy = { x0: 16, x1: 32, z0: 27, z1: 33.4, y: 4.8 };
  box(canopy.x1 - canopy.x0, 0.6, canopy.z1 - canopy.z0, M(0xe8e8e8, { roughness: 0.5 }), (canopy.x0 + canopy.x1) / 2, canopy.y, cz);
  { const fas = TX.canvasTex(1024, 64, (g, w, h) => { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8102e'; g.fillRect(0, h - 18, w, 18); g.fillStyle = '#c8102e'; g.font = '400 34px Bungee, "Arial Black", system-ui'; g.textAlign = 'center'; g.fillText('FUEL · FOOD · GAMING', w / 2, 38); }).t;
    plane(canopy.x1 - canopy.x0, 0.62, MT(fas, { roughness: 0.5, emissive: 0x333333 }), (canopy.x0 + canopy.x1) / 2, canopy.y, canopy.z0 - 0.01, Math.PI); }
  for (let x = canopy.x0 + 1.5; x < canopy.x1; x += 3) box(1.6, 0.03, 0.9, glow(0xf4f8ff, 2), x, canopy.y - 0.31, cz);
  { const l = new THREE.PointLight(0xeef4ff, 40, 16, 1.4); l.position.set((canopy.x0 + canopy.x1) / 2, canopy.y - 0.6, cz); l.userData.noDim = true; scene.add(l); }
  for (const x of [19.5, 28.5]) { box(0.35, canopy.y, 0.35, M(0xd8d8d8), x, canopy.y / 2, cz); obstacles.push({ x, z: cz, r: 0.3 }); }
  const pumps = [];
  for (const x of [22, 26]) {
    box(3.4, 0.22, 1.1, M(0x9a9a96), x, 0.11, cz, scene); for (const dx of [-1.6, 1.6]) { cyl(0.09, 0.09, 1.0, M(0xe8c020), x + dx, 0.5, cz, 10); }
    const p = new THREE.Group(); p.position.set(x, 0.22, cz); scene.add(p); pumps.push(p);
    box(0.9, 1.8, 0.55, M(0xd8202a, { roughness: 0.5 }), 0, 0.9, 0, p); box(0.92, 0.5, 0.57, M(0xf0f0f0), 0, 1.55, 0, p); for (const s of [-1, 1]) box(0.5, 0.25, 0.01, glow(0x40ff80, 0.9), 0, 1.55, s * 0.29, p);
    obstacles.push({ x: x - 1.0, z: cz, r: 0.75 }, { x, z: cz, r: 0.75 }, { x: x + 1.0, z: cz, r: 0.75 });
  }
  stations.push({ x: 22, z: cz - 1.4, r: 1.3, text: 'Pump 1 · cash inside', act: () => BK.toast && BK.toast('Pay inside. The slots are in there too.', 'info') });

  // ---------- the store / casino ----------
  const ext = MT(TX.canvasTex(1024, 360, (g, w, h) => { g.fillStyle = '#c8c0b0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, 64); g.fillStyle = '#fff'; g.font = '400 42px Bungee, "Arial Black", system-ui'; g.textAlign = 'center'; g.fillText('GAS · FOOD · GAMING', w / 2, 46);
    for (const [x0, x1] of [[60, 430], [600, 970]]) { g.fillStyle = '#1a2a3a'; g.fillRect(x0, 120, x1 - x0, 190); g.fillStyle = 'rgba(255,240,200,0.55)'; g.fillRect(x0 + 6, 126, x1 - x0 - 12, 178); g.fillStyle = '#ffd24a'; g.fillRect(x0 + 30, 150, 90, 120); g.fillStyle = '#2a8ae8'; g.fillRect(x0 + 140, 160, 80, 100); }
    g.font = '400 54px Bungee, "Arial Black", system-ui'; g.fillStyle = '#ff3050'; g.shadowColor = '#ff3050'; g.shadowBlur = 24; g.fillText('SLOTS', 790, 230); }).t, { roughness: 0.9 });
  lit(ext, 0.55); art(ext, 'gas_station_store');
  { const W = CA.x1 - CA.x0, a = CA.x0, d0 = CA.door.x - CA.door.w / 2, d1 = CA.door.x + CA.door.w / 2, Zf = CA.z0 - 0.06, H = CA.h;
    const piece = (x0, x1, y0, y1) => { const m = plane(x1 - x0, y1 - y0, ext, (x0 + x1) / 2, (y0 + y1) / 2, Zf, Math.PI); const u0 = 1 - (x1 - a) / W, u1 = 1 - (x0 - a) / W, uv = m.geometry.attributes.uv; /* turned PI: the plane's left edge is the piece's world-right edge */ uv.setXY(0, u0, y1 / H); uv.setXY(1, u1, y1 / H); uv.setXY(2, u0, y0 / H); uv.setXY(3, u1, y0 / H); uv.needsUpdate = true; };
    piece(a, d0, 0, H); piece(d1, CA.x1, 0, H); piece(d0, d1, CA.door.h, H);
    const brick = lit(MT(facadeTex('tan', 14), { roughness: 0.95 }), 0.35); plane(CA.z1 - CA.z0, H, brick, CA.x0 - 0.06, H / 2, (CA.z0 + CA.z1) / 2, -Math.PI / 2); plane(CA.z1 - CA.z0, H, brick, CA.x1 + 0.06, H / 2, (CA.z0 + CA.z1) / 2, Math.PI / 2); plane(W, H, brick, (CA.x0 + CA.x1) / 2, H / 2, CA.z1 + 0.06, 0);
    box(W + 0.4, 0.3, CA.z1 - CA.z0 + 0.4, M(0x6a6a66), (CA.x0 + CA.x1) / 2, H + 0.15, (CA.z0 + CA.z1) / 2); // roof slab
    const fr = M(0x9a9aa0, { metalness: 0.7, roughness: 0.3 }); box(0.08, CA.door.h, 0.2, fr, d0, CA.door.h / 2, CA.z0); box(0.08, CA.door.h, 0.2, fr, d1, CA.door.h / 2, CA.z0); box(CA.door.w, 0.08, 0.2, fr, CA.door.x, CA.door.h, CA.z0);
    const n = TX.neon('OPEN 24 HRS', '#ff3050', { w: 512, h: 128, size: 62 }).t; plane(1.6, 0.4, new THREE.MeshBasicMaterial({ map: n, transparent: true, depthWrite: false, toneMapped: false }), d1 + 1.4, 2.0, Zf - 0.03, Math.PI);
    // inside: linoleum, drop ceiling with light panels, painted walls
    const lino = TX.canvasTex(256, 256, (g, w, h) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#c8c2b0' : '#8a9aa8'; g.fillRect(x * 32, y * 32, 32, 32); } const R = rnd(31); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(40,30,20,${R() * 0.1})`; g.fillRect(R() * w, R() * h, 3, 2); } }, { repeat: [W / 1.6, (CA.z1 - CA.z0) / 1.6] }).t;
    flat(W, CA.z1 - CA.z0, MT(lino, { roughness: 0.4 }), (CA.x0 + CA.x1) / 2, 0.012, (CA.z0 + CA.z1) / 2);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, CA.z1 - CA.z0), M(0xd8d4c8)); ce.rotation.x = Math.PI / 2; ce.position.set((CA.x0 + CA.x1) / 2, H - 0.02, (CA.z0 + CA.z1) / 2); scene.add(ce);
    for (let x = CA.x0 + 2; x < CA.x1 - 1; x += 3) for (const z of [CA.z0 + 2.2, CA.z1 - 2.2]) box(1.2, 0.03, 0.6, glow(0xf4f8ff, 1.8), x, H - 0.04, z);
    const wallM = M(0x6a2a3a, { roughness: 0.9 }); // dark red casino walls
    plane(W, H, wallM, (CA.x0 + CA.x1) / 2, H / 2, CA.z1 - 0.02, Math.PI); plane(CA.z1 - CA.z0, H, wallM, CA.x0 + 0.02, H / 2, (CA.z0 + CA.z1) / 2, Math.PI / 2); plane(CA.z1 - CA.z0, H, wallM, CA.x1 - 0.02, H / 2, (CA.z0 + CA.z1) / 2, -Math.PI / 2);
    plane(d0 - a, H, wallM, (a + d0) / 2, H / 2, CA.z0 + 0.02, 0); plane(CA.x1 - d1, H, wallM, (d1 + CA.x1) / 2, H / 2, CA.z0 + 0.02, 0); plane(CA.door.w, H - CA.door.h, wallM, CA.door.x, (CA.door.h + H) / 2, CA.z0 + 0.02, 0);
    const l = new THREE.PointLight(0xfff0d8, 22, 14, 1.4); l.position.set((CA.x0 + CA.x1) / 2, H - 0.5, (CA.z0 + CA.z1) / 2 + 1); l.userData.noDim = true; scene.add(l);
    const sl = TX.neon('SLOTS', '#ffd24a', { w: 512, h: 128, size: 80 }).t; plane(2.2, 0.55, new THREE.MeshBasicMaterial({ map: sl, transparent: true, depthWrite: false, toneMapped: false }), 23.5, 3.5, CA.z1 - 0.05, Math.PI);
  }
  // checkout counter along the right wall, and the clerk behind it
  { const cx = CA.x1 - 1.6, cz0 = CA.z0 + 1.0; box(0.7, 1.0, 2.8, M(0x8a6a4a, { roughness: 0.5 }), cx, 0.5, cz0 + 1.4); box(0.8, 0.06, 2.9, M(0xd8d0c0, { roughness: 0.3 }), cx, 1.03, cz0 + 1.4); box(0.35, 0.3, 0.4, M(0x2a2a2e), cx, 1.21, cz0 + 0.6); // register
    box(0.5, 1.6, 2.6, M(0x5a4a3a), CA.x1 - 0.3, 0.8, cz0 + 1.4); for (let k = 0; k < 4; k++) box(0.42, 0.04, 2.5, M(0x8a7a6a), CA.x1 - 0.3, 0.6 + k * 0.35, cz0 + 1.4);
    obstacles.push({ x: cx, z: cz0 + 0.6, r: 0.55 }, { x: cx, z: cz0 + 1.6, r: 0.55 }, { x: cx, z: cz0 + 2.4, r: 0.55 });
    const clerk = bar.spawn(makePreset('rookie', { beard: 'stubble', outfit: 'tee', shirt: 0xc8102e, hat: { color: 0xc8102e, backwards: false } }), CA.x1 - 0.95, cz0 + 1.4, Math.PI / 2, 'idle', ['Pump number?', 'Slots are in the back.', 'No, the lotto machine is broken.', 'You buying something?'], 'Gas clerk');
    clerk.who = 'Gas clerk'; }
  // slot machines along the back wall (A15 art replaces the cabinet); each screen is a canvas the spin animates for everyone
  const machines = OUT.slots.map(({ i, x, z }) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g); // front (screen, buttons) faces -z: the room
    const cab = M(0x15151a, { roughness: 0.35, metalness: 0.3 }), chrome = M(0xc8ccd4, { metalness: 0.9, roughness: 0.2 });
    box(0.78, 1.0, 0.62, cab, 0, 0.5, 0, g); box(0.8, 0.04, 0.64, chrome, 0, 1.0, 0, g); box(0.78, 0.9, 0.4, cab, 0, 1.45, 0.1, g);
    const deck = box(0.74, 0.08, 0.32, M(0x2a2a30), 0, 1.02, -0.22, g); deck.rotation.x = -0.25;
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), glow(0xff3040, 1.4)); btn.position.set(0.22, 1.06, -0.24); g.add(btn);
    const scr = TX.canvasTex(384, 192, () => {}); const sm = new THREE.MeshBasicMaterial({ map: scr.t, toneMapped: false }); const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.32), sm); screen.position.set(0, 1.45, -0.105); screen.rotation.y = Math.PI; g.add(screen);
    const top = TX.canvasTex(256, 96, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#5a10a0'); gr.addColorStop(1, '#c81050'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.font = '400 44px Bungee, "Arial Black", system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffd24a'; c.shadowColor = '#ffd24a'; c.shadowBlur = 12; c.fillText('LUCKY 7', w / 2, h / 2 + 2); }).t;
    const tp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.42), [cab, cab, cab, cab, new THREE.MeshBasicMaterial({ map: top, toneMapped: false }), new THREE.MeshBasicMaterial({ map: top, toneMapped: false })]); tp.position.set(0, 2.06, 0.1); g.add(tp);
    const stool = new THREE.Group(); stool.position.set(x, 0, z - 0.85); scene.add(stool); { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), M(0x8a1a24, { roughness: 0.5 })); s.position.y = 0.66; stool.add(s); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.64, 8), chrome); p.position.y = 0.32; stool.add(p); }
    obstacles.push({ x, z: z + 0.05, r: 0.5 });
    const m = { i, x, z, g, scr, reels: SLOT_SYMS.slice(0, 3).map((_, k) => SLOT_SYMS[(i + k * 2) % SLOT_SYMS.length]), spin: null, lastDraw: 0 };
    drawScreen(m, 0); return m;
  });
  function drawScreen(m, t) {
    const { g, c, t: tex } = m.scr, W = c.width, H = c.height; g.fillStyle = '#0a0a14'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 3; k++) { const x0 = 12 + k * 122; g.fillStyle = '#f4f0e6'; g.fillRect(x0, 14, 114, H - 28); g.save(); g.beginPath(); g.rect(x0, 14, 114, H - 28); g.clip();
      const sp = m.spin; if (sp && t < sp.stops[k]) { const off = (t * 9 + k * 0.37) % 1, base = Math.floor(t * 9 + k * 2); for (let r = -1; r <= 1; r++) drawSym(g, SLOT_SYMS[(base + r + 60) % SLOT_SYMS.length], x0 + 57, H / 2 + (r + off) * 96 - 48, 84); }
      else drawSym(g, m.reels[k], x0 + 57, H / 2, 96);
      g.restore(); }
    g.fillStyle = 'rgba(255,40,60,0.8)'; g.fillRect(0, H / 2 - 1, W, 2);
    if (m.spin && t > m.spin.stops[2] && m.spin.win > 0) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, H - 50, W, 50); g.fillStyle = '#ffd24a'; g.font = '400 30px Bungee, "Arial Black", system-ui'; g.textAlign = 'center'; g.fillText(`WIN $${m.spin.win}`, W / 2, H - 15); }
    tex.needsUpdate = true;
  }
  machines.forEach((m) => stations.push({ x: m.x, z: m.z - 1.15, r: 0.9, text: `E - Play slots (machine ${m.i + 1})`, act: () => { BK.ui.slotM = m.i; BK.openPanel('slot'); } }));
  // two regulars feeding machines 1 and 4
  for (const k of [0, 3]) { const m = machines[k]; const n = bar.spawn(randomPatron(20 + k), m.x, m.z - 0.85, Math.PI, 'point', ['Come on, come on...', 'This one\'s due.', 'Don\'t touch my machine.', 'One more.'], 'Slot regular', 0.7); n.slotM = k; }
  const busyMachines = new Set([0, 3]);

  // a spin anywhere: that machine's screen rolls for everyone (the server already decided the reels)
  const onSlot = (msg) => { const m = machines[msg.m]; if (!m) return; const t = performance.now() / 1000; m.spin = { start: t, stops: [t + 0.9, t + 1.25, t + 1.6], win: msg.win }; m.reels = msg.reels; m.tick = 0;
    audio.sfx('click', { pos: { x: m.x, y: 1.2, z: m.z } }); };
  // the regulars' machines spin on their own now and then (cosmetic, same reels on every client from the shared clock)
  let lastAuto = 0;
  function update(dt, now) {
    const t = performance.now() / 1000;
    for (const m of machines) {
      if (m.spin) { if (t - m.lastDraw > 0.05) { m.lastDraw = t; drawScreen(m, t); }
        if (t < m.spin.stops[2] && (m.tick = (m.tick || 0) + dt) > 0.09) { m.tick = 0; audio.sfx('rTick', { pos: { x: m.x, y: 1.3, z: m.z }, pitch: 1.6, ref: 2 }); }
        if (t > m.spin.stops[2] && !m.spin.done) { m.spin.done = true; drawScreen(m, t); if (m.spin.win > 0) audio.sfx('coin', { pos: { x: m.x, y: 1.3, z: m.z } }); }
        if (t > m.spin.stops[2] + 4) { m.spin = null; drawScreen(m, t); } }
    }
    const slot = Math.floor(now / 7000); if (slot !== lastAuto) { lastAuto = slot; const R = rnd(slot), k = [...busyMachines][slot % 2]; const reels = [0, 1, 2].map(() => SLOT_SYMS[Math.floor(R() * 6)]); onSlot({ m: k, reels, win: reels[0] === reels[1] && reels[1] === reels[2] ? 50 : 0 }); }
    // the L train: every 90 s by the shared clock, alternating direction
    const cyc = now / 1000 % 90, dir = Math.floor(now / 90000) % 2 ? -1 : 1, run = cyc < 14;
    train.visible = run; if (run) { const x = dir > 0 ? -150 + cyc * 22 : 150 - cyc * 22; train.position.x = x - (dir > 0 ? 45 : 0); train.position.z = L.z + (dir > 0 ? -2.2 : 2.2);
      if (!rumble && audio.loop) rumble = audio.loop('bowlRoll', { pos: { x, y: L.y, z: L.z }, g: 0.9, ref: 8, roll: 0.6 }); if (rumble && rumble.setPos) rumble.setPos({ x: train.position.x + 22, y: L.y, z: L.z }); }
    else if (rumble) { rumble.stop(); rumble = null; }
  }
  return { machines, onSlot, update, OUT };
}
