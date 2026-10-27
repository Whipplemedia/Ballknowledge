import * as THREE from 'three';
import * as TX from './textures.js';
import { hasProp, prop, place } from './props.js';
import { makePreset, makePerson, randomPatron, animate } from './people.js';
import { buildItem, applyCosmetics } from './cosmetics.js';
import { createSeatedLife } from './seated.js';
import { makeDizzy, headPos } from './dizzy.js';
import { OUT } from './outside.js';
import { STORY } from './story.js';

export const ROOM = { x: 12, z: 8, h: 5 };

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const MT = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, ...o });

export function buildBar({ scene, BK, tv }) {
  const stations = [], obstacles = [], npcs = [], animated = [];
  const add = (m, parent = scene) => { parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent = scene, shadow = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; return add(m, parent); };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 14, parent = scene, shadow = true) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; return add(m, parent); };
  const plane = (w, h, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; return add(m); };
  const lamp = (x, y, z, color, intensity, dist = 14) => { const l = new THREE.PointLight(color, intensity, dist, 2); l.position.set(x, y, z); scene.add(l); return l; };

  scene.background = new THREE.Color(0x0d0a12);
  scene.fog = new THREE.FogExp2(0x14101a, 0.016);
  scene.add(new THREE.HemisphereLight(0xa08aa8, 0x3a2414, 0.85));

  // ---------- shell ----------
  const fl = TX.woodFloor([6, 4]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), MT(fl.t, { roughness: 0.55 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), MT(TX.ceilingTiles([12, 8]).t, { color: 0x6d5e4e })); ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM.h; scene.add(ceil);
  const wallPaint = TX.paintedWall('#56684a', [6, 1.5]).t, panel = TX.paneling([6, 1]).t;
  // the right wall has a doorway (the restroom, past Sal's booth): gap = {c: centre along the wall, w, h}. Local x runs along the wall (+z for the right wall).
  const DOOR = { c: -6.6, w: 1.24, h: 2.34 };
  const walls = [[ROOM.x * 2, 0, -ROOM.z, 0], [ROOM.x * 2, 0, ROOM.z, Math.PI, { c: -OUT.door.x, w: OUT.door.w, h: OUT.door.h }], [ROOM.z * 2, -ROOM.x, 0, Math.PI / 2], [ROOM.z * 2, ROOM.x, 0, -Math.PI / 2, DOOR]]; // front wall: the street door (the wall group is turned PI, so its local x is -world x)
  const rep = (t, k) => { const c = t.clone(); c.repeat.set(t.repeat.x * k, t.repeat.y); c.needsUpdate = true; return c; };
  for (const [len, x, z, ry, gap] of walls) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const segs = gap ? [[-len / 2, gap.c - gap.w / 2], [gap.c + gap.w / 2, len / 2]] : [[-len / 2, len / 2]];
    for (const [a, b] of segs) {
      const L = b - a, cx = (a + b) / 2, k = L / len;
      const up = new THREE.Mesh(new THREE.PlaneGeometry(L, ROOM.h - 1.4), MT(k < 1 ? rep(wallPaint, k) : wallPaint)); up.position.set(cx, 1.4 + (ROOM.h - 1.4) / 2, 0.01); g.add(up);
      const lo = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.4), MT(k < 1 ? rep(panel, k) : panel)); lo.position.set(cx, 0.7, 0.01); g.add(lo);
      box(L, 0.08, 0.1, M(0x2a170b), cx, 1.4, 0.05, g, false); box(L, 0.18, 0.08, M(0x1d1008), cx, 0.09, 0.05, g, false);
    }
    if (gap) { // the wall above the doorway, and a wooden frame around it
      const k = gap.w / len, lin = new THREE.Mesh(new THREE.PlaneGeometry(gap.w, ROOM.h - gap.h), MT(rep(wallPaint, k))); lin.position.set(gap.c, gap.h + (ROOM.h - gap.h) / 2, 0.01); g.add(lin);
      const fm = M(0x2a170b); box(gap.w + 0.16, 0.1, 0.16, fm, gap.c, gap.h + 0.05, 0.02, g, false); for (const sx of [-1, 1]) box(0.08, gap.h, 0.16, fm, gap.c + sx * (gap.w / 2 + 0.04), gap.h / 2, 0.02, g, false);
    }
  }

  // ---------- lighting ----------
  const pend = [[-6, -2], [0, 1], [6, -2], [3.5, 3.4]];
  pend.forEach(([x, z], i) => {
    if (hasProp('lamp')) { const lm = prop('lamp', { h: 1.4 }); lm.position.set(x, 3.5, z); scene.add(lm); }
    else {
    cyl(0.03, 0.03, 1.2, M(0x111111), x, 4.4, z, 6, scene, false);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 16, 1, true), M(0x1b3a2a, { side: THREE.DoubleSide })); shade.position.set(x, 3.75, z); scene.add(shade); }
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(3) })); bulb.position.set(x, 3.68, z); scene.add(bulb);
    if (i !== 1) lamp(x, 3.5, z, 0xffd2a0, 20, 14);
    else { // the one shadow light: a wide downward spot (1 shadow render) instead of a point light (6 cube-face renders every frame), plus a weak fill for the ceiling/walls
      const sp = new THREE.SpotLight(0xffd2a0, 30, 16, 1.32, 0.55, 2); sp.position.set(x, 3.5, z); sp.target.position.set(x, 0, z); scene.add(sp, sp.target);
      sp.castShadow = true; sp.shadow.mapSize.set(2048, 2048); sp.shadow.bias = -0.0015; sp.shadow.normalBias = 0.02; sp.shadow.camera.near = 0.5; sp.shadow.camera.far = 16;
      lamp(x, 3.5, z, 0xffd2a0, 8, 14);
    }
  });
  lamp(9, 2.5, -5, 0xff3040, 34, 5.5); /* short reach: Sal's red glow stays out of the restroom */ lamp(-9, 3, -5, 0x27e08a, 26, 12); lamp(0, 3.8, -6.5, 0x4da3ff, 38, 14); lamp(10.5, 3.2, 3, 0xffa030, 28, 12);

  // string lights
  const bulbGeo = new THREE.SphereGeometry(0.055, 8, 6), cols = [0xff4040, 0xffd040, 0x40ff80, 0x40a0ff, 0xff60e0];
  [-4.5, 0.5, 5.5].forEach((z, si) => {
    const pts = [], N = 22; for (let i = 0; i <= N; i++) { const u = i / N; pts.push(new THREE.Vector3(-ROOM.x + 0.2 + u * (ROOM.x * 2 - 0.4), 4.75 - Math.sin(u * Math.PI) * 0.45 - 0.02 * Math.sin(u * 40), z + Math.sin(u * 6 + si) * 0.25)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x111111 })));
    const inst = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), N); const c = new THREE.Color();
    pts.forEach((p, i) => { if (i < N) { inst.setMatrixAt(i, new THREE.Matrix4().setPosition(p.x, p.y - 0.06, p.z)); inst.setColorAt(i, c.setHex(cols[(i + si) % cols.length]).multiplyScalar(2.4)); } });
    scene.add(inst);
  });

  // ---------- signage ----------
  const neonPlane = (text, color, w, h, x, y, z, ry = 0, size = 72, lightColor) => {
    const { t } = TX.neon(text, color, { w: 512, h: Math.round(512 * h / w), size });
    plane(w, h, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }), x, y, z, ry);
  };
  neonPlane('THE DUGOUT', '#27e08a', 6, 0.85, 0, 4.68, -ROOM.z + 0.12, 0, 60);
  neonPlane('OPEN', '#ff3040', 1.6, 0.6, 9.5, 3.4, -ROOM.z + 0.12, 0, 80);
  neonPlane('BAR', '#ffb030', 1.8, 0.8, ROOM.x - 0.12, 4.0, 5.5, -Math.PI / 2, 90);
  neonPlane('LIVE SPORTS', '#ff60e0', 3, 0.7, -ROOM.x + 0.12, 3.9, 2.5, Math.PI / 2, 52);
  const posters = [[-ROOM.x + 0.1, 2.4, -3.2, Math.PI / 2, [['WILD CARD', 30, '#b3262e'], ['WEDNESDAYS', 30], ['$2 DRAFTS', 40, '#b3262e']]],
    [-ROOM.x + 0.1, 2.5, 5.5, Math.PI / 2, [['NO CREDIT', 40], ['NO REFUNDS', 36, '#b3262e'], ['NO EXCUSES', 36]]],
    [ROOM.x - 0.1, 2.4, -2.6, -Math.PI / 2, [['HOUSE RULES', 34], ['1. TIP', 30, '#b3262e'], ['2. PAY UP', 30], ['3. DON\'T ASK', 30]]],
    [3.2, 2.3, ROOM.z - 0.1, Math.PI, [['EMPLOYEE', 34], ['OF THE', 34], ['MONTH', 40, '#b3262e']]],
    [-7.5, 2.3, ROOM.z - 0.1, Math.PI, [['LOST DOG', 40, '#b3262e'], ['ANSWERS TO', 24], ['"HEY"', 40]]]];
  posters.forEach(([x, y, z, ry, lines], i) => { const w = 0.9, h = 1.2; plane(w, h, MT(TX.poster(lines, { bg: ['#e9d9a8', '#d8e4c8', '#e6c9b0'][i % 3] }).t), x, y, z, ry); });
  // pennants
  const penG = new THREE.Shape(); penG.moveTo(0, 0); penG.lineTo(0.5, 0); penG.lineTo(0.25, -0.5); penG.closePath();
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(new THREE.ShapeGeometry(penG), new THREE.MeshBasicMaterial({ color: [0xb3262e, 0x2a5aa8, 0xe8c030, 0x2a8a4a][i % 4], side: THREE.DoubleSide })); m.position.set(-11 + i * 1.45, 4.35, ROOM.z - 0.2); scene.add(m); }

  // ---------- TVs ----------
  const tvMat = (tex) => new THREE.MeshBasicMaterial({ map: tex });
  const tvFrame = (w, h, x, y, z, ry = 0) => {
    if (hasProp('tv')) { const g = new THREE.Group(), t = prop('tv', { w: w + 0.25, h: h + 0.25, d: 0.2, rotY: Math.PI, anchor: 'center' }); t.position.z = -0.04; g.add(t); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g); return g; }
    const m = box(w + 0.25, h + 0.25, 0.12, M(0x0a0a0c, { roughness: 0.4 }), x, y, z); m.rotation.y = ry; return m; };
  tvFrame(5, 2.8, 0, 2.95, -ROOM.z + 0.1); plane(5, 2.8, tvMat(tv.center), 0, 2.95, -ROOM.z + 0.18);
  tvFrame(3.4, 1.9, -4.8, 2.95, -ROOM.z + 0.1); plane(3.4, 1.9, tvMat(tv.left), -4.8, 2.95, -ROOM.z + 0.18);
  tvFrame(3.4, 1.9, 4.8, 2.95, -ROOM.z + 0.1); plane(3.4, 1.9, tvMat(tv.right), 4.8, 2.95, -ROOM.z + 0.18);
  { const f = tvFrame(2.6, 1.46, ROOM.x - 0.12, 3.5, 1.2, -Math.PI / 2); plane(2.6, 1.46, tvMat(tv.center), ROOM.x - 0.2, 3.5, 1.2, -Math.PI / 2); }
  { tvFrame(2.6, 1.46, -ROOM.x + 0.12, 3.5, 0.2, Math.PI / 2); plane(2.6, 1.46, tvMat(tv.center), -ROOM.x + 0.2, 3.5, 0.2, Math.PI / 2); }

  // ---------- bar counter (right wall) ----------
  const wood = M(0x5a3520, { roughness: 0.6 }), lacquer = M(0x7a4a28, { roughness: 0.25, metalness: 0.1 });
  if (hasProp('counter')) { [-0.575, 1.475, 3.525, 5.575].forEach((z) => { const c = prop('counter', { w: 2.06, h: 1.14, d: 1.0 }); c.rotation.y = -Math.PI / 2; c.position.set(10.1, 0, z); scene.add(c); }); }
  else {
  box(1.0, 1.1, 8.2, MT(TX.paneling([4, 1]).t), 10.1, 0.55, 2.5); box(1.3, 0.09, 8.5, lacquer, 10.05, 1.14, 2.5);
  cyl(0.04, 0.04, 8.2, M(0xc9a24a, { metalness: 0.9, roughness: 0.25 }), 9.35, 0.22, 2.5, 8).rotation.x = Math.PI / 2;
  }
  obstacles.push(...[-1, 0.5, 2, 3.5, 5, 6.4].map((z) => ({ x: 10.1, z, r: 1.15 })));
  // back bar
  plane(8.4, 3.6, MT(TX.brick([4, 2]).t), ROOM.x - 0.02, 2.2, 2.5, -Math.PI / 2);
  if (hasProp('backbar')) { [-0.3, 2.5, 5.3].forEach((z) => { const u = prop('backbar', { w: 2.8, h: 2.05, d: 0.6 }); u.rotation.y = -Math.PI / 2; u.position.set(ROOM.x - 0.31, 0, z); scene.add(u); }); }
  else {
  plane(7.6, 1.4, new THREE.MeshStandardMaterial({ color: 0x8aa4b0, roughness: 0.08, metalness: 0.9, emissive: 0x0a1218 }), ROOM.x - 0.05, 2.4, 2.5, -Math.PI / 2);
  [1.25, 1.85, 2.45].forEach((y) => { box(0.4, 0.05, 7.8, wood, ROOM.x - 0.25, y, 2.5); });
  const bottleCols = [0x2e7d32, 0x6d4c1f, 0xb0bec5, 0x8d1b2a, 0xe0a030, 0x1b5e8a];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 20; i++) {
    const c = bottleCols[(i * 7 + r * 3) % bottleCols.length], z = -1.2 + i * 0.4 + (r % 2) * 0.1, y = 1.25 + r * 0.6, h = 0.26 + ((i + r) % 3) * 0.05;
    cyl(0.05, 0.06, h, M(c, { roughness: 0.2, metalness: 0.2, emissive: c, emissiveIntensity: 0.12 }), ROOM.x - 0.25, y + h / 2 + 0.03, z, 8, scene, false); cyl(0.02, 0.025, 0.1, M(c), ROOM.x - 0.25, y + h + 0.08, z, 6, scene, false);
  }
  }
  [1, 2, 3, 4].forEach((z, i) => { cyl(0.025, 0.03, 0.3, M(0xc9c9d0, { metalness: 0.9, roughness: 0.2 }), 10.35, 1.34, z, 8); box(0.05, 0.16, 0.05, M([0xd22, 0x2a6, 0xe9a, 0x36c][i]), 10.35, 1.55, z, scene, false); });
  box(0.45, 0.28, 0.4, M(0xc8b080), 10.0, 1.32, 5.7); // register
  if (hasProp('stool')) { for (let i = 0; i < 6; i++) { const t = prop('stool', { h: 0.86 }); t.position.set(9.0, 0, -0.2 + i * 1.2); t.rotation.y = i * 1.1; scene.add(t); } }
  else  for (let i = 0; i < 6; i++) { const z = -0.2 + i * 1.2; cyl(0.22, 0.2, 0.08, TX.vinyl ? MT(TX.vinyl('#8b1d24').t) : M(0x8b1d24), 9.0, 0.78, z, 14); cyl(0.04, 0.04, 0.74, M(0x888888, { metalness: 0.8 }), 9.0, 0.38, z, 6); cyl(0.2, 0.2, 0.03, M(0x888888, { metalness: 0.8 }), 9.0, 0.02, z, 12, scene, false); obstacles.push({ x: 9.0, z, r: 0.28 }); }
  stations.push({ x: 8.1, z: 2.5, r: 2.4, text: 'E - Bartender (drinks, side jobs)', act: () => BK.openPanel('bar') });
  // crates + trash
  box(0.7, 0.4, 0.5, M(0x8a6a3a), 11.3, 0.2, 7.2); box(0.7, 0.4, 0.5, M(0x8a6a3a), 11.3, 0.62, 7.2); cyl(0.3, 0.26, 0.7, M(0x333c3c, { metalness: 0.5 }), 11.2, 0.35, -2.2, 12); obstacles.push({ x: 11.2, z: 7.2, r: 0.6 }, { x: 11.2, z: -2.2, r: 0.5 });

  // ---------- pool table ----------
  const feltM = MT(TX.felt('#0d6b35').t, { roughness: 1 }), PX = 3.4, PZ = 3.4;
  if (hasProp('pool')) { const pt = prop('pool', { w: 2.86, d: 1.51, h: 0.996 }); pt.position.set(PX, 0, PZ); scene.add(pt); }
  else {
  box(2.9, 0.12, 1.6, M(0x4a2a14), PX, 0.82, PZ); box(2.6, 0.04, 1.3, feltM, PX, 0.9, PZ);
  [[-1.4, -0.75], [1.4, -0.75], [-1.4, 0.75], [1.4, 0.75]].forEach(([x, z]) => box(0.18, 0.8, 0.18, M(0x2a170b), PX + x, 0.4, PZ + z));
  [[-1.3, -0.65], [0, -0.67], [1.3, -0.65], [-1.3, 0.65], [0, 0.67], [1.3, 0.65]].forEach(([x, z]) => cyl(0.08, 0.08, 0.02, M(0x050505), PX + x, 0.925, PZ + z, 10, scene, false));
  }
  const plb = box(2.4, 0.08, 0.3, M(0x1b3a2a), PX, 3.0, PZ); box(2.3, 0.02, 0.2, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(2) }), PX, 2.95, PZ, scene, false);
  cyl(0.02, 0.02, 2, M(0x111), PX - 1, 4, PZ, 6, scene, false); cyl(0.02, 0.02, 2, M(0x111), PX + 1, 4, PZ, 6, scene, false);
  obstacles.push({ x: PX - 1.1, z: PZ, r: 0.95 }, { x: PX, z: PZ, r: 0.95 }, { x: PX + 1.1, z: PZ, r: 0.95 });

  // ---------- booths ----------
  const BOOTH = { zA: 6.9, zB: 6.1, seat: 0.51, table: 0.78, hipA: 7.29, hipB: 5.71 }; // bench seat-front edges, seat top, table top, pelvis z of a seated person on each side
  [-3.5, -0.5, 2.5].forEach((x, i) => {
    const vm = MT(TX.vinyl(i === 1 ? '#1d4e7a' : '#8b1d24').t, { roughness: 0.5 });
    if (hasProp('booth')) { // the generated booth is one bench + an oversized table: keep just the bench (crop), use it on both sides and build a proper table between them
      const bench = (rotY, z) => { const b = prop('booth', { w: 2.2, h: 1.2, d: 1.1, rotY, crop: (cx, cy, cz) => cz < -0.07 && !(cy > -0.027 && cz > -0.4435) }); b.position.set(x, 0, z); scene.add(b); };
      bench(Math.PI, BOOTH.zA + 0.55); bench(0, BOOTH.zB - 0.55);
      const wm = M(0x8a5628, { roughness: 0.4 }); box(1.25, 0.045, 0.85, wm, x, BOOTH.table, ROOM.z - 1.5); cyl(0.07, 0.09, BOOTH.table - 0.04, M(0x16161a, { roughness: 0.5 }), x, (BOOTH.table - 0.04) / 2, ROOM.z - 1.5, 12); cyl(0.3, 0.3, 0.03, M(0x16161a, { roughness: 0.5 }), x, 0.015, ROOM.z - 1.5, 16);
      obstacles.push({ x: x - 0.6, z: ROOM.z - 0.5, r: 0.9 }, { x: x + 0.6, z: ROOM.z - 0.5, r: 0.9 }, { x, z: ROOM.z - 1.5, r: 0.7 }, { x: x - 0.6, z: BOOTH.zB - 0.4, r: 0.8 }, { x: x + 0.6, z: BOOTH.zB - 0.4, r: 0.8 }); return; }
    box(2.2, 0.45, 0.7, vm, x, 0.23, ROOM.z - 0.4); box(2.2, 0.8, 0.18, vm, x, 0.85, ROOM.z - 0.1); box(1.1, 0.06, 0.8, M(0x6b4a2b, { roughness: 0.3 }), x, 0.78, ROOM.z - 1.5); box(0.12, 0.76, 0.12, M(0x333), x, 0.38, ROOM.z - 1.5);
    box(2.2, 0.45, 0.7, vm, x, 0.23, ROOM.z - 2.6); box(2.2, 0.8, 0.18, vm, x, 0.85, ROOM.z - 2.9, scene);
    obstacles.push({ x: x - 0.6, z: ROOM.z - 0.5, r: 0.9 }, { x: x + 0.6, z: ROOM.z - 0.5, r: 0.9 }, { x, z: ROOM.z - 1.5, r: 0.7 });
  });
  // couch + jukebox
  if (hasProp('couch')) { const cc = prop('couch', { w: 2.2, h: 0.88, d: 0.98 }); cc.rotation.y = Math.PI; cc.position.set(8.0, 0, 7.0); scene.add(cc); obstacles.push({ x: 7.5, z: 7.0, r: 0.9 }, { x: 8.5, z: 7.0, r: 0.9 }); }
  if (hasProp('jukebox')) { const jb = prop('jukebox', { h: 1.6, w: 1.05, d: 0.82 }); jb.rotation.y = Math.PI; jb.position.set(-11, 0, 7.25); scene.add(jb); obstacles.push({ x: -11, z: 7.2, r: 0.8 }); }
  if (!hasProp('couch') || !hasProp('jukebox')) {
  const couchM = M(0x6b5a3a, { roughness: 1 }); box(2.2, 0.45, 0.9, couchM, 8.0, 0.23, 7.0); box(2.2, 0.7, 0.2, couchM, 8.0, 0.65, 7.5); box(0.25, 0.6, 0.9, couchM, 6.9, 0.3, 7.0); box(0.25, 0.6, 0.9, couchM, 9.1, 0.3, 7.0); obstacles.push({ x: 7.5, z: 7.0, r: 0.8 }, { x: 8.5, z: 7.0, r: 0.8 });
  box(0.9, 1.5, 0.6, M(0x7a1a2a, { roughness: 0.4 }), -11, 0.75, 7.2); plane(0.7, 0.5, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc040).multiplyScalar(1.8) }), -11, 1.2, 6.89, 0); obstacles.push({ x: -11, z: 7.2, r: 0.8 });
  }

  // ---------- terminal (sportsbook) ----------
  const termAI = hasProp('terminal') ? prop('terminal', { h: 1.95 }) : null;
  if (termAI) { termAI.position.set(0, 0, -6.6); scene.add(termAI); } else box(1.8, 1.1, 0.9, M(0x1a2a4a, { roughness: 0.4 }), 0, 0.55, -6.6);
  const scr = termAI ? new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.98), new THREE.MeshBasicMaterial({ map: tv.kiosk, toneMapped: false })) : new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshBasicMaterial({ map: tv.kiosk, toneMapped: false })); if (termAI) { scr.position.set(0, 1.363, -6.487); scr.rotation.x = -0.377; } else { scr.position.set(0, 1.5, -6.42); scr.rotation.x = -0.25; } scene.add(scr);
  if (!termAI) box(1.5, 0.9, 0.08, M(0x0a0a0c), 0, 1.5, -6.5);
  obstacles.push({ x: 0, z: -6.6, r: 1.1 });
  stations.push({ x: 0, z: -5.5, r: 2.2, text: 'E - Place bets (Sportsbook)', act: () => BK.openPanel('book') });


  // ---------- Uncle Sal's corner ----------
  box(5, 0.05, 4, M(0x5a0f1c, { roughness: 1 }), 9.5, 0.03, -5.5, scene, false);
  const leather = MT(TX.vinyl('#3a0d14').t, { roughness: 0.45 });
  box(2.8, 0.5, 0.8, leather, 9.5, 0.27, -7.4); box(2.8, 0.9, 0.16, leather, 9.5, 0.9, -7.8); box(1.6, 0.06, 0.9, M(0x2a1208, { roughness: 0.3 }), 9.5, 0.75, -6.4); box(0.12, 0.7, 0.12, M(0x222), 9.5, 0.38, -6.4);
  box(0.16, 0.14, 0.16, M(0xc8c8d0, { metalness: 0.8, roughness: 0.2 }), 9.2, 0.82, -6.4); // glass of something
  const sl = TX.label('🕴️ UNCLE SAL', '#ff7a88'); sl.position.set(9.5, 2.8, -6.6); scene.add(sl);
  obstacles.push({ x: 9.5, z: -6.5, r: 1.2 });
  stations.push({ x: 9.5, z: -4.2, r: 2.5, text: 'E - Talk to Uncle Sal', act: () => BK.openPanel('mob') });

  // ---------- NPCs ----------
  const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const spawn = (P, x, z, ry, mode, lines, name, seat = null) => {
    P.group.position.set(x, 0, z); P.group.rotation.y = ry; scene.add(P.group);
    if (seat !== null) { P.baseY = seat + 0.09 - (P.hipY || 0.98); P.group.position.y = P.baseY; }
    const n = { P, mode, lines, name, base: { x, z, ry }, seated: seat !== null, bubble: null, next: 4 + Math.random() * 14, until: 0 };
    const bb = TX.bubble(); bb.sprite.position.set(0, 2.55, 0); P.group.add(bb.sprite); n.bubble = bb; npcs.push(n); return n;
  };
  const tag = (txt, x, y, z, col = '#ffd9a0') => { const l = TX.label(txt, col, 0.8); l.position.set(x, y, z); scene.add(l); };
  // Uncle Sal in his booth
  spawn(makePreset('sal'), 9.5, -7.0, Math.PI, 'idle', ['Short on cash? I\'m the bank of last resort.', 'Need a little... help?', 'I lend. I always collect.', 'Pay me back and we stay friends.'], 'Uncle Sal', 0.52);
  // the owner, at the far end of the bar, and the developer (only ever on screen in the story's cutscenes: cine.js walks him around)
  const owner = spawn(makePreset('owner'), 11.15, -0.6, Math.PI / 2, 'idle', [`${STORY.owner.since} I opened this place. I\'m not handing it to a guy in loafers.`, 'Every dollar helps, kid.', `${STORY.dev.name} has never watched a full game in his life.`, 'Bet smart. Or bet big. Just win.', 'First round of the comeback is on me.'], STORY.owner.name);
  tag(STORY.owner.name + ' · owner', 11.1, 2.55, -0.6);
  const dev = spawn(makePreset('exec'), OUT.door.x, ROOM.z + 2.5, Math.PI, 'idle', ['Love what you\'ve done with the place. Shame about the wrecking ball.', 'Tick tock.'], STORY.dev.name);
  dev.P.group.visible = false; dev.P.group.userData.zone = 'all'; dev.cine = true; // walks between the street and the bar: always on zones.js layer 0
  // bartender behind the counter, polishing
  spawn(makePreset('bartender'), 11.15, 2.5, Math.PI / 2, 'polish', ['What\'ll it be?', 'No credit. Don\'t ask.', 'You look thirsty.', 'Tip your bartender.'], 'Bartender');
  tag('Bartender', 11.1, 2.55, 2.5);
  // regulars on stools facing the bar (stools at x=9, z=-0.2 + i*1.2)
  const stool = (z, name, over, mode, lines) => spawn(makePreset(name, over), 9.05, z, -Math.PI / 2, mode, lines, 'Regular', 0.8);
  stool(1.0, 'jock', {}, 'cheer', ['LET\'S GOOO!', 'I called it. I CALLED it.', 'Ball knowledge, baby!']);
  stool(2.2, 'knowItAll', {}, 'point', ['Actually, the odds don\'t work like that.', 'Statistically speaking...', 'I read the box scores.']);
  // named regulars (n.who): Old Vinnie sells tips; Ray, Gina and Steve are the bartender's job targets (server SPOTS match these)
  stool(3.4, 'vinnie', {}, 'drink', ['Forty years on this stool, kid.', 'Buy me a drink, I\'ll tell you something.', 'I seen this before. I seen everything before.']).who = 'Old Vinnie';
  tag('Old Vinnie', 9.05, 2.45, 3.4, '#9fe0d0');
  stool(4.6, 'ray', {}, 'cheer', ['That ref is BLIND!', 'Never bet against the green.', 'Banner season, baby!']).who = 'Celtics Ray';
  // pool table
  spawn(makePreset('gambler', { hat: { color: 0x2a5aa8, backwards: false }, outfit: 'tee', shirt: 0xd8d0b0, stache: false }), 3.4, 4.5, face(3.4, 4.5, 3.4, 3.4), 'pool', ['Eight ball, corner pocket.', 'You\'re hustling me.', 'Watch the cue chalk.'], 'Shark');
  spawn(makePreset('gina'), 5.4, 3.4, face(5.4, 3.4, 4.4, 3.4), 'idle', ['Double or nothing?', 'Nice shot. Lucky.', 'You\'re holding the cue wrong.'], 'Shark').who = 'Gina';
  spawn(randomPatron(2), 5.9, 4.9, face(5.9, 4.9, 4.4, 3.6), 'cheer', ['Sink it!', 'Ohhh!', 'Scratch!'], 'Watcher');
  // booths (front wall). benches at z=7.6 (face -z) and z=5.4 (face +z); seat top ~0.45
  const benchA = (x, p, i) => spawn(p, x, hasProp('booth') ? BOOTH.hipA : 7.5, 0, 'drink', ['This booth is cursed.', 'Ssh, the game is on.', 'Order me a beer?'], 'Patron', hasProp('booth') ? BOOTH.seat : 0.45);
  const benchB = (x, p) => spawn(p, x, hasProp('booth') ? BOOTH.hipB : 5.5, Math.PI, 'idle', ['Told you. Told you.', 'Lock in the under.', '*laughs*'], 'Patron', hasProp('booth') ? BOOTH.seat : 0.45);
  benchA(-3.95, randomPatron(5)); benchA(-3.05, randomPatron(8)); benchB(-3.5, randomPatron(1));
  benchB(-0.95, randomPatron(4)); benchB(-0.05, randomPatron(7));
  const sleeper = spawn(makePreset('rookie', { beard: 'stubble', hat: null, hairStyle: 'messy', hair: 0x5a4a3a, shirt: 0x6a6a2a, outfit: 'tee' }), 2.5, hasProp('booth') ? BOOTH.hipA : 7.3, 0, 'sleep', ['zzz... not the under...', '...five more minutes...'], 'Sleeper', hasProp('booth') ? BOOTH.seat : 0.45);
  spawn(makePreset('steve'), 7.6, hasProp('couch') ? 6.92 : 6.7, 0, 'drink', ['This couch has seen things.', 'I\'m not drunk. YOU\'RE drunk.', 'Who wants to fight? Nobody? Cool.'], 'Couch guy', 0.45).who = 'Sloppy Steve';
  // roulette dealer, bowling & cornhole spectators
  // the roulette dealer works the gas-station casino across the street now (outside.js)
  spawn(makePreset('knowItAll', { glasses: false, outfit: 'suit', shirt: 0x1d2a22, tie: 0x2a8a4a, hairStyle: 'slick', hair: 0x1a1210, mouth: 'smile' }), OUT.dealer.x, OUT.dealer.z, Math.PI, 'idle', ['Place your bets.', 'No more bets.', 'Red or black?'], 'Dealer');
  tag('Dealer', OUT.dealer.x, 2.7, OUT.dealer.z);
  spawn(randomPatron(3), -8.8, 3.6, face(-8.8, 3.6, -10.6, 3.0), 'cheer', ['Strike! Strike!', 'Come on, pocket!', 'Gutter. Classic.'], 'Spectator');
  spawn(randomPatron(6), -8.0, 1.6, face(-8.0, 1.6, -6.0, 4.4), 'drink', ['Bags up!', 'Watch the wind.', 'Nice toss.'], 'Spectator');
  spawn(randomPatron(9), -8.5, -4.6, face(-8.5, -4.6, -10, -7.6), 'point', ['Triple twenty!', 'Don\'t choke.', 'He\'s shaking.'], 'Spectator');
  spawn(randomPatron(10), -1.8, -2.4, face(-1.8, -2.4, 0, -7), 'idle', ['Which season is this?', 'I feel like I know this one.', 'Rewind the highlights.'], 'Patron');
  spawn(randomPatron(11), 5.8, -0.6, face(5.8, -0.6, 4.8, -7.6), 'point', ['Look at that line.', 'Easy money.', 'I\'ve seen this game.'], 'Patron');

  // ---------- Old Vinnie (tipster) and the bartender's job targets ----------
  stations.push({ x: 8.3, z: 3.4, r: 1.15, text: 'E - Buy Old Vinnie a drink (tips)', act: () => BK.openPanel('vinnie') });
  const jobOf = () => BK.S && BK.S.me && BK.S.me.job;
  for (const [who, x, z] of [['Gina', 5.4, 3.4], ['Celtics Ray', 8.3, 4.6], ['Sloppy Steve', 7.6, 6.2], ['Dealer', OUT.dealer.x, OUT.dealer.z + 1.0], ['Clerk', -8.6, 6.4]]) {
    stations.push({ x, z, r: 1.8, prio: 2, on: () => { const j = jobOf(); return !!(j && j.target === who && (j.kind === 'deliver' || (j.kind === 'collect' && j.stage === 'go'))); },
      get text() { const j = jobOf(); return j && j.kind === 'deliver' ? `E - Hand ${who} the round` : `E - Collect Sal's envelope from ${who}`; }, act: () => BK.send({ type: 'jobAct' }) });
  }
  // Gina at the end of the pool table: you can buy her a drink. She has a boyfriend.
  stations.push({ x: 5.4, z: 3.4, r: 1.5, text: 'E - Buy Gina a drink ($20)', act: () => BK.send({ type: 'ginaDrink' }) });
  // ---------- the newspaper on the counter: masthead + tonight's headline (redrawn each night) ----------
  const paperTex = TX.canvasTex(512, 384, () => {}), paperG = new THREE.Group();
  const drawPaper = (head) => {
    const { g, c, t } = paperTex, W = c.width, H = c.height;
    g.fillStyle = '#ece4cf'; g.fillRect(0, 0, W, H); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    g.fillStyle = '#111'; g.textAlign = 'center'; g.font = 'bold 50px "Old English Text MT", "UnifrakturMaguntia", Georgia, serif'; g.fillText('The Daily Ledger', W / 2, 62);
    g.fillRect(18, 76, W - 36, 3); g.fillRect(18, 84, W - 36, 1);
    g.font = '900 44px Georgia, "Times New Roman", serif'; const words = String(head || 'LATE EDITION').split(' '); let line = '', y = 136;
    for (const w of words) { const tr = line ? line + ' ' + w : w; if (g.measureText(tr).width > W - 40 && line) { g.fillText(line, W / 2, y); y += 46; line = w; } else line = tr; } g.fillText(line, W / 2, y);
    g.fillStyle = 'rgba(30,30,30,0.55)'; for (let col = 0; col < 3; col++) for (let r = 0; r < 9; r++) g.fillRect(24 + col * 160, y + 26 + r * 16, 140 - ((r * 37 + col * 13) % 40), 6);
    t.needsUpdate = true;
  };
  drawPaper(''); {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.012, 0.33), [M(0xd8d0bb), M(0xd8d0bb), new THREE.MeshStandardMaterial({ map: paperTex.t, roughness: 0.95 }), M(0xd8d0bb), M(0xd8d0bb), M(0xd8d0bb)]);
    const under = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.01, 0.31), M(0xcfc6ae)); under.position.set(0.02, -0.008, 0.015); under.rotation.y = 0.06;
    paperG.add(sheet, under); paperG.position.set(9.78, 1.2, 0.4); paperG.rotation.y = -Math.PI / 2 + 0.12; /* reads right-side up from the customer's side */ scene.add(paperG);
  }
  let paperHead = null;
  stations.push({ x: 8.6, z: 0.4, r: 1.3, text: 'E - Read the paper', act: () => BK.openPanel('paper') });

  // ---------- Pro Shop corner ----------
  box(2.4, 1.0, 0.8, M(0x4a2a14), -8.6, 0.5, 6.7); box(2.55, 0.07, 0.95, M(0x8a5a30, { roughness: 0.3 }), -8.6, 1.03, 6.7);
  const stand = (id, x, y = 1.07) => { const g = new THREE.Group(); g.position.set(x, y, 6.65); buildItem(id, g); g.scale.setScalar(0.8); scene.add(g); box(0.12, 0.1, 0.12, M(0x222), x, 1.1, 6.65); return g; };
  [['helmet_fb', -9.5], ['tophat', -8.9], ['crown', -8.3], ['viking', -7.7]].forEach(([id, x]) => { const s = stand(id, x, 1.35); s.position.y = 1.2; });
  for (const [id, x] of [['golf_club', -9.9], ['bat', -9.5], ['hockey_stick', -9.1]]) { const g = new THREE.Group(); g.position.set(x, 1.9, ROOM.z - 0.2); buildItem(id, g); scene.add(g); } // on the wall rack, hanging by the grip
  neonPlane('PRO SHOP', '#ffc83d', 2.4, 0.7, -8.6, 3.3, ROOM.z - 0.12, Math.PI, 70);
  const clerk = spawn(makePreset('jock', { glasses: false, hairStyle: 'slick', hair: 0x2a1a10 }), -8.6, 7.55, 0, 'idle', ['Cosmetics! Crates! Dignity not included.', 'Every crate is a surprise.', 'Dress for the occasion.'], 'Clerk');
  applyCosmetics(clerk.P, { body: 'ref_shirt', head: 'sweatband' }); tag('Pro Shop', -8.6, 2.7, 7.55, '#ffc83d');
  lamp(-8.6, 3.2, 6.0, 0xffd8a0, 22, 8);
  obstacles.push({ x: -8.6, z: 6.7, r: 1.4 });
  stations.push({ x: -8.6, z: 5.5, r: 2.2, text: 'E - Pro Shop (cosmetics)', act: () => BK.openShop && BK.openShop() });

  // ---------- dressing (beams, windows, signs, chalkboard, extra TVs, door) ----------
  const darkWood = M(0x2a1608, { roughness: 0.8 });
  [-6, -2, 2, 6].forEach((z) => box(24, 0.3, 0.36, darkWood, 0, 4.82, z, scene, false)); [-9, -3, 3, 9].forEach((x) => box(0.3, 0.26, 16, darkWood, x, 4.86, 0, scene, false));
  // night windows over the booths
  const city = TX.canvasTex(256, 160, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a1050'); gr.addColorStop(0.6, '#5a2a6a'); gr.addColorStop(1, '#c0602a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 22) { const bh = 30 + Math.random() * 70; g.fillStyle = '#0c0a1c'; g.fillRect(x, h - bh, 20, bh); for (let y = h - bh + 6; y < h - 4; y += 9) for (let xx = x + 3; xx < x + 18; xx += 6) if (Math.random() < 0.5) { g.fillStyle = Math.random() < 0.7 ? '#ffd27a' : '#7ad2ff'; g.fillRect(xx, y, 3, 4); } } g.fillStyle = '#fff8d0'; g.beginPath(); g.arc(210, 28, 12, 0, 7); g.fill(); }).t;
  [-4.5, -1.5].forEach((x) => { plane(2.1, 1.4, new THREE.MeshBasicMaterial({ map: city, toneMapped: false }), x, 2.35, ROOM.z - 0.05, Math.PI); box(2.3, 0.1, 0.12, darkWood, x, 3.07, ROOM.z - 0.07, scene, false); box(2.3, 0.1, 0.12, darkWood, x, 1.63, ROOM.z - 0.07, scene, false); box(0.1, 1.5, 0.12, darkWood, x - 1.1, 2.35, ROOM.z - 0.07, scene, false); box(0.1, 1.5, 0.12, darkWood, x + 1.1, 2.35, ROOM.z - 0.07, scene, false); box(0.06, 1.4, 0.1, darkWood, x, 2.35, ROOM.z - 0.07, scene, false); box(2.1, 0.06, 0.1, darkWood, x, 2.35, ROOM.z - 0.07, scene, false); });
  // door + EXIT
  // doors swing on a hinge group so cutscenes can open them (doors.front / doors.back .rotation.y)
  const doorM = M(0x3a2010), glassM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a8ab0).multiplyScalar(0.8) });
  const hinge = (x, z, ry) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); return g; };
  const doors = { front: hinge(5.0 - 0.6, ROOM.z - 0.08, 0), back: hinge(ROOM.x - 0.08, -6.6 - 0.6, -Math.PI / 2) };
  box(1.2, 2.3, 0.1, doorM, 0.6, 1.15, 0, doors.front); box(0.7, 1.0, 0.04, glassM, 0.6, 1.55, -0.06, doors.front, false);
  box(1.2, 2.3, 0.1, M(0x2a1a10), 0.6, 1.15, 0, doors.back); box(0.18, 0.18, 0.04, M(0xc8a24a, { metalness: 0.8, roughness: 0.3 }), 1.05, 1.1, 0.07, doors.back, false);
  neonPlane('RESTROOMS', '#4da3ff', 1.4, 0.36, ROOM.x - 0.1, 2.62, -6.6, -Math.PI / 2, 52);
  // ---------- the restroom (through the door past Sal's booth, x > ROOM.x): anyone can walk in while the bar is open.
  // It's also where Sal settles accounts: the kill cutscene drags a broke player in here, where a second Sal waits with a bat.
  const backroom = (() => {
    const g = new THREE.Group(); scene.add(g);
    const W = 5.6, D = 5.4, H = 3.0, X0 = ROOM.x + 0.06, X1 = ROOM.x + W, BX = (X0 + X1) / 2, BZ = -6.6, Z0 = BZ - D / 2, Z1 = BZ + D / 2;
    const tiles = (rx, ry) => TX.canvasTex(256, 256, (c, w, h) => { // white subway tile, a little grimy toward the bottom
      c.fillStyle = '#c4c9c0'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < 16; y++) for (let x = -1; x < 8; x++) { const ox = (y % 2) * 16; c.fillStyle = '#f2f4ee'; c.fillRect(x * 32 + ox + 1, y * 16 + 1, 30, 14); c.fillStyle = `rgba(90,80,40,${Math.random() * 0.06 + (y > 11 ? 0.06 : 0)})`; c.fillRect(x * 32 + ox + 1, y * 16 + 1, 30, 14); }
    }, { repeat: [rx, ry] }).t;
    const wallM = (w) => MT(tiles(w / 1.6, H / 1.6), { roughness: 0.35 }), pl = (mat, w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); return m; };
    pl(wallM(W), W, H, BX, H / 2, Z0, 0); pl(wallM(W), W, H, BX, H / 2, Z1, Math.PI); pl(wallM(D), D, H, X1, H / 2, BZ, -Math.PI / 2);
    { const side = (BZ - DOOR.w / 2) - Z0; pl(wallM(side), side, H, X0, H / 2, Z0 + side / 2, Math.PI / 2); pl(wallM(side), side, H, X0, H / 2, Z1 - side / 2, Math.PI / 2); pl(wallM(DOOR.w), DOOR.w, H - DOOR.h, X0, DOOR.h + (H - DOOR.h) / 2, BZ, Math.PI / 2); }
    const checker = TX.canvasTex(256, 256, (c, w, h) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#1d1d20' : '#d6d2c4'; c.fillRect(x * 32, y * 32, 32, 32); } for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(70,55,20,${Math.random() * 0.12})`; c.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 9, 2 + Math.random() * 6); } }, { repeat: [W / 1.4, D / 1.4] }).t;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.12, D), MT(checker, { roughness: 0.45 })); fl.rotation.x = -Math.PI / 2; fl.position.set(BX - 0.06, 0.002, BZ); fl.receiveShadow = true; g.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M(0xc8c8c0)); ce.rotation.x = Math.PI / 2; ce.position.set(BX, H, BZ); g.add(ce);
    const porc = M(0xf2f0ea, { roughness: 0.22 }), chrome = M(0xc8ccd0, { metalness: 0.9, roughness: 0.2 }), part = M(0x4f6272, { roughness: 0.45 }), dark = M(0x1a1a1a);
    // fixtures: Meshy models from the reference images (props urinal, stalls, toilet, sink_vanity, mop_bucket, wet_floor_sign, loaded after the bar opens);
    // the primitive stand-ins below show until each one arrives (and stay if it can't load)
    const swap = (stand, name, opts, x, y, z) => place(g, name, opts, x, y, z, () => { stand.visible = false; });
    const urG = new THREE.Group(); g.add(urG);
    for (const x of [BX - 1.0, BX + 0.2]) { box(0.44, 0.66, 0.3, porc, x, 0.98, Z0 + 0.16, urG); box(0.32, 0.46, 0.06, M(0xd8d6ce), x, 0.92, Z0 + 0.3, urG, false); cyl(0.02, 0.02, 0.6, chrome, x, 1.62, Z0 + 0.06, 8, urG, false); obstacles.push({ x, z: Z0 + 0.25, r: 0.35 });
      place(g, 'urinal', { h: 1.3 }, x, 0.3, Z0 + 0.3, () => { urG.visible = false; }); }
    box(0.04, 0.8, 0.4, part, BX - 0.4, 1.1, Z0 + 0.22, g); // privacy panel between them
    // two stalls along the back wall (doors facing the room), a toilet in each
    const SX = X1 - 1.55, sz = [Z0 + 0.65, Z0 + 1.95], stG = new THREE.Group(); g.add(stG);
    box(1.55, 1.85, 0.04, part, X1 - 0.78, 1.1, Z0 + 1.3, stG); box(1.55, 1.85, 0.04, part, X1 - 0.78, 1.1, Z0 + 2.6, stG);
    sz.forEach((z, i) => {
      const tG = new THREE.Group(); g.add(tG);
      box(0.36, 0.38, 0.5, porc, X1 - 0.38, 0.2, z, tG); box(0.4, 0.05, 0.46, M(0x111111, { roughness: 0.4 }), X1 - 0.42, 0.42, z, tG, false); box(0.18, 0.42, 0.46, porc, X1 - 0.1, 0.62, z, tG);
      swap(tG, 'toilet', { h: 0.95, rotY: -Math.PI / 2 }, X1 - 0.45, 0, z);
      const d = new THREE.Group(); d.position.set(SX, 0, z - 0.6); d.rotation.y = i ? -0.9 : -0.35; stG.add(d); box(0.04, 1.6, 1.15, part, 0, 1.0, 0.575, d);
      obstacles.push({ x: X1 - 0.75, z, r: 0.72 });
    });
    { const gr = TX.canvasTex(256, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.font = '700 26px "Segoe Print","Comic Sans MS",cursive'; c.fillStyle = '#111'; c.save(); c.rotate(-0.08); c.fillText('BET THE UNDER', 14, 46); c.restore(); c.fillStyle = '#a01818'; c.font = '700 22px "Segoe Print","Comic Sans MS",cursive'; c.fillText('sal was here', 60, 98); }).t;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshStandardMaterial({ map: gr, transparent: true, roughness: 0.6 })); m.position.set(X1 - 0.8, 1.5, Z0 + 1.28); m.rotation.y = Math.PI; stG.add(m); }
    swap(stG, 'stalls', { w: 1.6, h: 2.0, d: 2.6, rotY: -Math.PI / 2 }, X1 - 0.82, 0, Z0 + 1.32);
    // sinks + mirror on the near wall
    const skG = new THREE.Group(); g.add(skG);
    box(2.5, 0.08, 0.55, M(0x3a3a3c, { roughness: 0.3 }), BX - 0.3, 0.86, Z1 - 0.29, skG); box(2.5, 0.8, 0.04, M(0x2a2a2c), BX - 0.3, 0.42, Z1 - 0.54, skG);
    for (const x of [BX - 0.95, BX + 0.35]) { cyl(0.2, 0.15, 0.1, porc, x, 0.86, Z1 - 0.28, 16, skG, false); cyl(0.015, 0.015, 0.2, chrome, x, 1.0, Z1 - 0.08, 8, skG, false); box(0.03, 0.03, 0.14, chrome, x, 1.1, Z1 - 0.14, skG, false); }
    swap(skG, 'sink_vanity', { w: 2.4, h: 1.15, d: 0.62, rotY: Math.PI }, BX - 0.3, 0, Z1 - 0.33);
    pl(new THREE.MeshStandardMaterial({ color: 0x9fb0ba, metalness: 0.2, roughness: 0.15, emissive: 0x1a2228 }), 2.3, 0.9, BX - 0.3, 1.72, Z1 - 0.02, Math.PI); // no reflections in here: a dim, greenish mirror
    box(0.3, 0.26, 0.2, chrome, X0 + 0.5, 1.3, Z1 - 0.1, g); // hand dryer
    obstacles.push({ x: BX - 0.95, z: Z1 - 0.3, r: 0.45 }, { x: BX + 0.35, z: Z1 - 0.3, r: 0.45 });
    const mbG = new THREE.Group(); g.add(mbG); cyl(0.2, 0.17, 0.32, M(0xe8c020, { roughness: 0.5 }), X1 - 0.35, 0.16, Z1 - 0.4, 12, mbG); obstacles.push({ x: X1 - 0.4, z: Z1 - 0.45, r: 0.35 }); // mop bucket
    swap(mbG, 'mop_bucket', { h: 1.3, rotY: -2.4 }, X1 - 0.42, 0, Z1 - 0.45);
    place(g, 'wet_floor_sign', { h: 0.64, rotY: -Math.PI / 2 + 0.5 }, BX - 1.3, 0, BZ + 0.75); obstacles.push({ x: BX - 1.3, z: BZ + 0.75, r: 0.3 });
    // tile art (art/tile_wall, art/tile_floor): mirrored repeat hides the seams
    { const mats = []; g.traverse((o) => { if (o.isMesh && o.material && o.material.map && o.geometry.type === 'PlaneGeometry' && o.material.map.wrapS === THREE.RepeatWrapping) mats.push(o); });
      fetch('art/manifest.json').then((r) => (r.ok ? r.json() : { files: [] })).then((mf) => { const have = new Set(mf.files || []);
        for (const [name, pick, size] of [['tile_wall', (o) => o.rotation.x === 0, 1.0], ['tile_floor', (o) => o.rotation.x < -1, 1.8]]) { if (!have.has(name)) continue;
          new THREE.TextureLoader().load(`art/${name}.webp`, (t) => { t.colorSpace = THREE.SRGBColorSpace; for (const o of mats.filter(pick)) { const w = o.geometry.parameters.width, h = o.geometry.parameters.height, c = t.clone(); c.wrapS = c.wrapT = THREE.MirroredRepeatWrapping; c.repeat.set(w / size, h / size); c.needsUpdate = true; o.material.map = c; o.material.color.set(0xffffff); o.material.needsUpdate = true; } }); } }).catch(() => {}); }
    // flickering fluorescent tube
    box(1.4, 0.06, 0.16, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8f0ff).multiplyScalar(1.6) }), BX, H - 0.05, BZ, g, false);
    const light = new THREE.PointLight(0xdce8ff, 5, 7, 1.4); light.position.set(BX, H - 0.25, BZ); light.userData.noDim = true; g.add(light);
    const pivot = new THREE.Group(); g.add(pivot); const bulb = null;
    stations.push({ x: BX - 0.3, z: Z1 - 0.95, r: 1.0, text: 'E - Splash cold water on your face (sober up a little)', act: () => BK.send({ type: 'splash' }) });
    // Sal and his bat (only in the kill scene): the bat continues the line of the right arm from the hand, so raising the arm raises the bat
    const sal = makePreset('sal'); sal.group.position.set(BX - 0.6, 0, BZ); sal.group.rotation.y = -Math.PI / 2; sal.group.visible = false; g.add(sal.group);
    const bat = new THREE.Group(), batM = M(0xc89a5a, { roughness: 0.55 }); bat.position.set(0, -0.6, 0.02); sal.arms[1].add(bat);
    cyl(0.018, 0.022, 0.22, M(0x2a1a10), 0, -0.04, 0, 8, bat, false); cyl(0.022, 0.05, 0.78, batM, 0, -0.5, 0, 10, bat, false);
    // name tags and bubbles draw on top of everything (depthTest off), so hide the bar's while the kill scene plays in here
    let hidden = null, on = false, flick = 0;
    const show = (v) => {
      if (v === on) return; on = v; sal.group.visible = v;
      if (v) { hidden = []; scene.traverse((o) => { if (o.isSprite && o.material && o.material.depthTest === false && o.visible) { let in_ = false; for (let q = o; q; q = q.parent) if (q === g) in_ = true; if (!in_) { o.visible = false; hidden.push(o); } } }); }
      else if (hidden) { hidden.forEach((o) => (o.visible = true)); hidden = null; }
    };
    // walkable box (world.js clamps movement to it) and the door that swings open for anyone near it
    const bounds = { x0: X0, x1: X1, z0: Z0, z1: Z1, dz0: BZ - DOOR.w / 2, dz1: BZ + DOOR.w / 2 };
    const tick = (dt, t, nearDoor) => {
      const bo = BK.S && BK.S.barEvent && BK.S.barEvent.kind === 'blackout'; // the blackout takes the restroom too
      if (!on) { flick -= dt; light.intensity = bo ? 0.15 : flick > 0 ? 0.8 : 5; if (flick < -3 - Math.random() * 6) flick = 0.05 + Math.random() * 0.12; } // the tube buzzes and blinks now and then
      const d = doors.back; if (d && !on && nearDoor !== null) { const tgt = (d.userData.base ?? (d.userData.base = d.rotation.y)) + (nearDoor ? -1.35 : 0); d.rotation.y += (tgt - d.rotation.y) * Math.min(1, dt * 6); }
    };
    return { group: g, sal, pivot, light, bulb, chair: { x: BX + 0.6, z: BZ }, show, bounds, tick };
  })();
  neonPlane('EXIT', '#ff3030', 0.9, 0.38, 5.0, 2.6, ROOM.z - 0.1, Math.PI, 70);
  // neon wall
  neonPlane('GOOD SPORTS', '#27e08a', 3.0, 0.7, -ROOM.x + 0.12, 3.5, -4.6, Math.PI / 2, 54); neonPlane('BAD DECISIONS', '#ff60b0', 3.2, 0.7, -ROOM.x + 0.12, 2.8, -4.6, Math.PI / 2, 50);
  neonPlane('Cold Beer', '#a060ff', 3.0, 1.0, ROOM.x - 0.12, 3.8, -2.9, -Math.PI / 2, 64);
  [['LAGER', '#ff4040', 0.9, 0.5, -0.9], ['ALE', '#ffb030', 0.7, 0.5, 1.0], ['PILSNER', '#4da3ff', 1.1, 0.5, 4.1], ['STOUT', '#ff8030', 0.8, 0.5, 5.8]].forEach(([t, c, w, h, z]) => neonPlane(t, c, w, h, ROOM.x - 0.14, 3.35, z, -Math.PI / 2, 44));
  // chalkboard drinks menu
  const chalk = TX.canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = '#22302c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6a4a28'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = '#eef2e8'; g.textAlign = 'left'; g.font = '700 48px "Segoe Print","Comic Sans MS",cursive'; g.fillText('DRINKS', 150, 66);
    g.font = '600 32px "Segoe Print","Comic Sans MS",cursive'; const items = [['Domestic', '$30'], ['Well Shot', '$60'], ['Special', '$90'], ['Top Shelf', '$120']];
    items.forEach(([n, p], i) => { g.fillStyle = '#eef2e8'; g.fillText(n, 44, 140 + i * 60); g.textAlign = 'right'; g.fillText(p, w - 44, 140 + i * 60); g.textAlign = 'left'; g.fillStyle = '#eef2e855'; for (let x = 200; x < 360; x += 12) g.fillRect(x, 150 + i * 60, 6, 2); });
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 1); }
  }).t;
  plane(1.7, 1.28, new THREE.MeshStandardMaterial({ map: chalk, roughness: 1 }), 10.4, 2.1, ROOM.z - 0.06, Math.PI);
  // extra TVs (ambient broadcasts)
  const amb = (i, w, h, x, y, z, ry) => { tvFrame(w, h, x, y, z, ry); plane(w, h, tvMat(tv.amb[i]), x + (ry === 0 ? 0 : ry > 0 ? 0.09 : -0.09), y, z + (ry === 0 ? 0.09 : 0), ry); };
  amb(0, 2.4, 1.35, -ROOM.x + 0.12, 3.5, 3.4, Math.PI / 2); amb(1, 2.0, 1.12, -ROOM.x + 0.12, 3.5, 5.8, Math.PI / 2);
  amb(2, 2.0, 1.12, 9.2, 2.9, -ROOM.z + 0.1, 0); amb(1, 1.8, 1.0, -8.8, 3.3, -ROOM.z + 0.1, 0);
  // framed jerseys (AI prop)
  if (hasProp('jerseyframe')) [[-11.1, 2.25, -ROOM.z + 0.07, 0], [11.1, 2.25, -ROOM.z + 0.07, 0]].forEach(([x, y, z, ry]) => { const f = prop('jerseyframe', { h: 1.05, w: 0.88, d: 0.09 }); f.position.set(x, y - 0.525, z); f.rotation.y = ry; scene.add(f); });
  // warm strip lights under the back-bar shelves
  if (!hasProp('backbar')) [1.22, 1.82, 2.42].forEach((y) => box(0.04, 0.02, 7.6, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(1.3) }), ROOM.x - 0.1, y - 0.02, 2.5, scene, false));

  // dust motes
  const dustN = 130, dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dustPos[i * 3] = (Math.random() - 0.5) * 23; dustPos[i * 3 + 1] = Math.random() * 4.5; dustPos[i * 3 + 2] = (Math.random() - 0.5) * 15; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe8c0, size: 0.03, transparent: true, opacity: 0.5, depthWrite: false })));

  // ---------- high-top tables + bottles on tables around the bar (bottles.js makes the grabbable bottles) ----------
  const topM = M(0x3a2414, { roughness: 0.35 }), metalM = M(0x1a1a1e, { metalness: 0.7, roughness: 0.35 });
  const HIGHTOPS = [[-2.6, -3.9], [5.0, -3.9], [-3.2, -0.6], [6.3, 0.2]];
  for (const [x, z] of HIGHTOPS) {
    cyl(0.34, 0.34, 0.045, topM, x, 1.05, z, 20); cyl(0.36, 0.36, 0.02, metalM, x, 1.025, z, 20, scene, false);
    cyl(0.035, 0.035, 1.02, metalM, x, 0.52, z, 10); cyl(0.24, 0.26, 0.03, metalM, x, 0.015, z, 18, scene, false);
    obstacles.push({ x, z, r: 0.4 });
  }
  // surface spots: [x, top-of-surface y, z, station radius]; booth/counter spots need a longer reach since you can't walk right up to them
  const bottleSpots = [];
  HIGHTOPS.forEach(([x, z]) => { bottleSpots.push([x - 0.1, 1.075, z + 0.06, 1.15], [x + 0.12, 1.075, z - 0.05, 1.15]); });
  [-3.5, -0.5, 2.5].forEach((bx) => bottleSpots.push([bx + 0.32, BOOTH.table + 0.022, ROOM.z - 1.8, 1.9]));
  [-1.2, 1.6, 4.0].forEach((z) => bottleSpots.push([9.72, 1.13, z, 1.45]));
  bottleSpots.push([9.95, 0.78, -6.2, 1.5], [-7.55, 1.065, 6.55, 1.75]);
  stations.push({ x: 8.45, z: 5.4, r: 1.1, text: 'E - Grab bottles (click to throw)', act: () => BK.bottles && BK.bottles.grab() });
  // jukebox: E cycles through the songs (4 procedural tracks), long-press not needed
  stations.push({ x: -10.9, z: 6.3, r: 1.25, text: 'E - Jukebox (next song)', act: () => { const n = BK.audio && BK.audio.music.next(); BK.sfx && BK.sfx('click'); if (n) BK.toast('🎵 ' + n, 'info'); } });
  // ---------- seats the player can take (E). hip = where the pelvis goes, yaw = facing (same convention as me.yaw), sit = seat-top height ----------
  const seats = [];
  const addSeat = (o) => seats.push(o);
  [-3.5, -0.5, 2.5].forEach((bx) => { for (const dx of [-0.5, 0.5]) {
    addSeat({ x: bx + dx, z: BOOTH.hipA, yaw: 0, sit: BOOTH.seat, exit: [bx + dx, 4.4], text: 'booth' });
    addSeat({ x: bx + dx, z: BOOTH.hipB, yaw: Math.PI, sit: BOOTH.seat, exit: [bx + dx, 4.4], text: 'booth' });
  } });
  [-0.2, 1.0, 2.2, 3.4, 4.6, 5.8].forEach((z) => addSeat({ x: 9.05, z, yaw: -Math.PI / 2, sit: 0.8, exit: [8.1, z], text: 'bar stool' }));
  [7.4, 8.0, 8.6].forEach((x) => addSeat({ x, z: 6.92, yaw: 0, sit: 0.45, exit: [x, 5.9], text: 'couch' }));
  const takenSeat = (s) => npcs.some((n) => n.seated && Math.hypot(n.P.group.position.x - s.x, n.P.group.position.z - s.z) < 0.55);
  seats.forEach((s) => { s.free = !takenSeat(s); if (s.free) stations.push({ x: s.x, z: s.z, r: s.text === 'booth' ? 2.0 : s.text === 'couch' ? 1.5 : 0.8, text: 'E - Sit (' + s.text + ')', seat: s, act: () => BK.sit && BK.sit(s) }); });


  // ---------- NPC wandering: a deterministic schedule from the synced game clock, so every client sees the same people in the same places ----------
  const SEG = 16, WALK = 1.15, POI = [[0, -7], [10, 2], [3.4, 3.4], [-9, -5], [-6, 2], [4, -1]];
  const blockedAt = (x, z, pad) => obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad) || (x < -9.0 && z > -2 && z < 7.5) || (x > 6.7 && z < -3.0) || x > 7.6 || z < -5.2 || z > 4.9 || Math.abs(x) > ROOM.x - 1.2;
  const pathClear = (a, c) => { const n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 0.35); for (let i = 0; i <= n; i++) if (blockedAt(a[0] + (c[0] - a[0]) * i / n, a[1] + (c[1] - a[1]) * i / n, 0.38)) return false; return true; };
  let WPS = null; const wps = () => WPS || (WPS = (() => { const a = []; for (let x = -8.5; x <= 7.5; x += 1.25) for (let z = -5; z <= 4.8; z += 1.25) if (!blockedAt(x, z, 0.6)) a.push([x, z]); return a; })()); // lazy: games/roulette add their obstacles after the bar is built
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const CYC = 24; // each wanderer loops through a fixed 24-stop route (~6 min), so any clock value maps to a stop in O(1)
  const buildRoute = (n) => { const r = [[n.base.x, n.base.z]]; for (let j = 0; j < CYC - 1; j++) { const prev = r[j], rg = rng(n.seed * 977 + j * 131), last = j === CYC - 2; let pick = null;
      for (let tries = 0; tries < 20 && !pick; tries++) { const W = wps(), cand = W[Math.floor(rg() * W.length)]; if (Math.hypot(cand[0] - prev[0], cand[1] - prev[1]) > 2 && pathClear(prev, cand) && (!last || pathClear(cand, r[0]))) pick = cand; } r.push(pick || (last ? r[0] : prev)); } return r; };
  const wpOf = (n, k) => (n.wp || (n.wp = buildRoute(n)))[((k % CYC) + CYC) % CYC];
  const wanderPos = (n, T) => {
    const Tn = T % (SEG * CYC) + n.phase, k = Math.floor(Tn / SEG), u = Tn - k * SEG, a = wpOf(n, k - 1), c = wpOf(n, k), d = Math.hypot(c[0] - a[0], c[1] - a[1]), wd = d / WALK;
    if (d < 0.4 || u >= wd) { const poi = POI[Math.floor(rng(n.seed * 31 + (((k % CYC) + CYC) % CYC))() * POI.length)]; return { x: c[0], z: c[1], walking: false, ry: Math.atan2(-(poi[0] - c[0]), -(poi[1] - c[1])) }; }
    const f = u / wd, e = f * f * (3 - 2 * f) * 0.35 + f * 0.65; return { x: a[0] + (c[0] - a[0]) * e, z: a[1] + (c[1] - a[1]) * e, walking: true, ry: Math.atan2(-(c[0] - a[0]), -(c[1] - a[1])) };
  };
  // seated NPCs get a living seated pose (seated.js): drinks in hand, gaze, gestures, reactions to TV scores
  const life = createSeatedLife({ scene });
  npcs.forEach((n, i) => { if (!n.seated || !n.P.skinned) return;
    const couch = n.name === 'Couch guy', boss = n.name === 'Uncle Sal', sleep = n.mode === 'sleep';
    const stoolN = n.name === 'Regular'; life.add(n, { kind: couch ? 'lap' : 'table', table: stoolN ? 1.14 : 0.78, seat: stoolN ? 0.8 : boss ? 0.52 : couch ? 0.45 : BOOTH.seat, reach: stoolN ? 0.55 : boss ? 0.32 : 0.4, style: boss ? 'boss' : sleep ? 'sleep' : couch ? 'couch' : n.mode, glass: sleep ? null : boss ? 'tumbler' : n.mode === 'drink' || couch ? 'pint' : i % 2 ? 'bottle' : 'pint' }); });
  BK.onScore = (good = true) => { if (good) life.onScore(); };
  npcs.forEach((n, i) => { if (!n.seated && ['Spectator', 'Patron', 'Watcher'].includes(n.name)) { n.wander = true; n.seed = 1000 + i * 17; n.phase = (i * 5.3) % SEG; n.wp = null; n.off = { x: 0, z: 0 }; } });

  // ---------- Gina's kiss: someone went all in and hit. She walks over (around the furniture), leans in, and walks back ----------
  const gina = npcs.find((n) => n.who === 'Gina'); let kissing = null;
  const looseClear = (a, c) => { const n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 0.3); for (let i = 0; i <= n; i++) { const x = a[0] + (c[0] - a[0]) * i / n, z = a[1] + (c[1] - a[1]) * i / n; if (Math.hypot(x - a[0], z - a[1]) < 0.6 || Math.hypot(x - c[0], z - c[1]) < 0.6) continue; if (obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 0.2)) return false; } return true; };
  const via = (a, c) => { if (looseClear(a, c)) return null; let best = null, bd = 1e9; for (const w of wps()) { const d = Math.hypot(w[0] - a[0], w[1] - a[1]) + Math.hypot(c[0] - w[0], c[1] - w[1]); if (d < bd && looseClear(a, w) && looseClear(w, c)) { bd = d; best = w; } } return best; };
  const kiss = (target, onKiss) => { if (!gina || (kissing && kissing.phase !== 'back')) return; kissing = { target, onKiss, phase: 'go', t0: null, wp: undefined, plan: 0 }; };
  function kissTick(n, t, dt) {
    const K = kissing, g = n.P.group, at = [g.position.x, g.position.z]; if (K.t0 === null) K.t0 = t;
    const tp = K.target(); if (!tp && K.phase !== 'back') { K.phase = 'back'; K.wp = undefined; }
    let goal; if (K.phase === 'back') goal = [n.base.x, n.base.z]; else { const dx = at[0] - tp.x, dz = at[1] - tp.z, d = Math.hypot(dx, dz) || 1; goal = [tp.x + dx / d * 0.62, tp.z + dz / d * 0.62]; }
    if (K.phase === 'kiss') { // face them, lean in
      const u = t - K.at, face = Math.atan2(-(tp.x - at[0]), -(tp.z - at[1])); let d = face - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 8);
      animate(n.P, 'idle', t); const lean = Math.min(1, u / 0.6) * (u > 2.0 ? Math.max(0, 1 - (u - 2.0) / 0.5) : 1); n.P.torso.rotation.x = 0.28 * lean; n.P.head.rotation.x = 0.12 * lean; if (n.P.skinUpdate) n.P.skinUpdate();
      if (u > 0.7 && !K.smooched) { K.smooched = true; BK.sfx && BK.sfx('kiss', { pos: { x: at[0], y: 1.6, z: at[1] } }); n.bubble.set('💋'); n.until = t + 1.6; }
      if (n.bubble.sprite.visible && t > n.until) n.bubble.set('');
      if (u > 2.6) { K.phase = 'back'; K.wp = undefined; n.bubble.set(''); } return;
    }
    if (K.wp === undefined || t > K.plan) { K.wp = via(at, goal); K.plan = t + 1.0; }
    const aim = K.wp || goal, dx = aim[0] - at[0], dz = aim[1] - at[1], dist = Math.hypot(dx, dz), sp = (K.phase === 'back' ? 1.6 : 2.3) * dt;
    if (dist > 0.05) { g.position.x += dx / dist * Math.min(sp, dist); g.position.z += dz / dist * Math.min(sp, dist); const face = Math.atan2(-dx, -dz); let d = face - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 8); }
    if (K.wp && dist < 0.25) { K.wp = null; K.plan = t + 1.0; }
    n.P.moveSpeed = K.phase === 'back' ? 1.6 : 2.3; animate(n.P, 'walk', t);
    const gd = Math.hypot(goal[0] - at[0], goal[1] - at[1]);
    if (K.phase === 'go' && (gd < 0.12 || t - K.t0 > 14)) { K.phase = 'kiss'; K.at = t; K.onKiss && K.onKiss(); }
    else if (K.phase === 'back' && gd < 0.08) { g.position.set(n.base.x, g.position.y, n.base.z); g.rotation.y = n.base.ry; kissing = null; }
  }
  const ginaHead = () => (gina ? headPos(gina.P) : null);

  function update(t, dt, me) {
    const ph = BK.S && BK.S.paper ? BK.S.paper.head : ''; if (ph !== paperHead) { paperHead = ph; drawPaper(ph); }
    let talking = npcs.filter((n) => n.bubble && n.bubble.sprite.visible).length;
    for (const n of npcs) {
      if (n.cine) continue; // the developer: puppeted by cine.js (hidden off stage)
      if (n === gina && kissing) { kissTick(n, t, dt); continue; }
      const koNow = n.ko && n.ko > BK.now();
      if (n.dizzy) n.dizzy.update(dt, t, headPos(n.P), !!koNow); // stars orbit the head while out cold, then shrink away
      if (koNow || n._koOn) { // knocked out by a bottle: stars, slump (seated) or fall flat on the back (standing)
        if (koNow && !n._koOn) { n._koOn = true; n.P.group.rotation.order = 'YXZ'; if (!n.dizzy) n.dizzy = makeDizzy(scene); }
        if (koNow) { animate(n.P, n.seated ? 'sleep' : 'idle', t); if (n.life) life.place(n.life); if (!n.seated) { n.P.group.rotation.x += (Math.PI / 2 - n.P.group.rotation.x) * Math.min(1, dt * 12); n.P.group.position.y = (n.P.baseY || 0) + 0.2; } else n.P.legs.forEach((l) => (l.rotation.x = 1.45)); if (n.bubble) n.bubble.set(''); continue; }
        n._koOn = false; if (n.wander) { const s = wanderPos(n, BK.now() / 1000); n.off.x = n.P.group.position.x - s.x; n.off.z = n.P.group.position.z - s.z; n._sx = n.P.group.position.x; n._sz = n.P.group.position.z; } n.P.group.rotation.x = 0; n.P.group.position.y = n.P.baseY || 0;  BK.sfx && BK.sfx('boing', { pos: { x: n.P.group.position.x, y: 1.4, z: n.P.group.position.z } });
      }
      let mode = n.mode;
      if (n.wander) {
        const w = wanderPos(n, BK.now() / 1000), g = n.P.group, ol = Math.hypot(n.off.x, n.off.z);
        if (ol > 0.02) { const s = Math.min(ol, 1.2 * dt); n.off.x -= n.off.x / ol * s; n.off.z -= n.off.z / ol * s; } // after a knockout, walk back to the schedule
        const tx = w.x + n.off.x, tz = w.z + n.off.z, mv = w.walking || ol > 0.05;
        n._sx = (n._sx ?? tx); n._sz = (n._sz ?? tz); const k = Math.min(1, dt * 12); n._sx += (tx - n._sx) * k; n._sz += (tz - n._sz) * k; g.position.x = n._sx; g.position.z = n._sz;
        let face = w.ry; if (!w.walking && ol > 0.05) face = Math.atan2(-(n.off.x * -1), -(n.off.z * -1)); // returning to the schedule after a KO: face the way we're walking
        let d = face - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 7);
        if (mv) { mode = 'walk'; n.P.moveSpeed = 1.2; }
      }
      if (n.throwT && t < n.throwT && !n.life) mode = 'point'; // winding up to throw a bottle at someone
      if (n.offscreen) continue; // in a zone the camera can't see into (world.js / zones.js): no animation work
      if (n.life) { life.tick(n.life, t, dt, { me, cam: { x: me.x, y: me.sit ? me.sit.sit + 0.76 : 1.65, z: me.z }, npcs }); animate(n.P, 'seated', t); life.place(n.life); }
      else { animate(n.P, mode, t); if (n.seated) n.P.legs.forEach((l) => (l.rotation.x = 1.45)); }
      if (n.bubble) { // speech bubbles: only nearby NPCs in front of you, at most two at once, sized by distance so they never fill the screen
        const bs = n.bubble.sprite, gp = n.P.group.position, d = Math.hypot(gp.x - me.x, gp.z - me.z), want = !(BK.settings && BK.settings.bubbles === false);
        if (n.forced) { /* scripted line (guided first night): shows regardless of the chatter limits */
          if (!n.forced.shown) { n.forced.shown = true; n.bubble.set(n.forced.text); n.until = t + n.forced.secs; talking++; }
          if (t > n.until) { n.forced = null; n.bubble.set(''); talking--; n.next = t + 6; }
          if (bs.visible) { const k = Math.min(1, Math.max(0.55, 0.38 + d * 0.11)); bs.scale.set(1.2 * k, 0.375 * k, 1); }
          continue;
        }
        if (bs.visible && (t > n.until || !want || d > 8)) { n.bubble.set(''); talking--; }
        const ahead = me.yaw === undefined || ((gp.x - me.x) * -Math.sin(me.yaw) + (gp.z - me.z) * -Math.cos(me.yaw)) / (d || 1) > 0.25;
        if (t > n.next && want && d < 6 && ahead && talking < 2 && !bs.visible) { n.bubble.set(n.lines[Math.floor(Math.random() * n.lines.length)]); n.until = t + 3.8; talking++; }
        if (t > n.next) n.next = t + 8 + Math.random() * 14;
        if (bs.visible) { const k = Math.min(1, Math.max(0.55, 0.38 + d * 0.11)); bs.scale.set(1.2 * k, 0.375 * k, 1); }
      }
    }
    const p = dg.attributes.position; for (let i = 0; i < dustN; i++) { p.array[i * 3 + 1] += dt * 0.03 * (1 + (i % 3)); if (p.array[i * 3 + 1] > 4.6) p.array[i * 3 + 1] = 0.1; p.array[i * 3] += Math.sin(t * 0.2 + i) * dt * 0.02; }
    p.needsUpdate = true;
  }
  // scripted speech: say('Bartender' | 'Old Vinnie' | 'Uncle Sal', text) - by display name (n.who) or role name
  const say = (who, text, secs = 6) => { const n = npcs.find((x) => x.who === who) || npcs.find((x) => x.name === who); if (!n || !n.bubble) return null; if (n.bubble.sprite.visible && !n.forced) n.bubble.set(''); n.forced = { text, secs, shown: false }; return n; };
  // the street door opens for anyone walking up to it (null: a cutscene is driving it)
  const frontDoor = (dt, near) => { const d = doors.front; if (!d || near === null) return; const tgt = (d.userData.base ?? (d.userData.base = d.rotation.y)) + (near ? 1.35 : 0); d.rotation.y += (tgt - d.rotation.y) * Math.min(1, dt * 6); };
  return { owner, dev, stations, obstacles, npcs, seats, update, wanderPos, life, bottleSpots, doors, say, backroom, kiss, ginaHead, spawn, frontDoor };
}
