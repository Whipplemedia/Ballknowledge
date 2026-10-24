import * as THREE from 'three';
import * as TX from './textures.js';
import { makePerson, animate } from './people.js';

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
  scene.add(new THREE.HemisphereLight(0x8a7a9a, 0x2a1a10, 0.55));

  // ---------- shell ----------
  const fl = TX.woodFloor([6, 4]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), MT(fl.t, { roughness: 0.55 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), MT(TX.ceilingTiles([12, 8]).t)); ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM.h; scene.add(ceil);
  const wallPaint = TX.paintedWall('#56684a', [6, 1.5]).t, panel = TX.paneling([6, 1]).t;
  const walls = [[ROOM.x * 2, 0, -ROOM.z, 0], [ROOM.x * 2, 0, ROOM.z, Math.PI], [ROOM.z * 2, -ROOM.x, 0, Math.PI / 2], [ROOM.z * 2, ROOM.x, 0, -Math.PI / 2]];
  for (const [len, x, z, ry] of walls) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(len, ROOM.h - 1.4), MT(wallPaint.clone ? wallPaint : wallPaint)); up.position.set(0, 1.4 + (ROOM.h - 1.4) / 2, 0.01); g.add(up);
    const lo = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.4), MT(panel)); lo.position.set(0, 0.7, 0.01); g.add(lo);
    box(len, 0.08, 0.1, M(0x2a170b), 0, 1.4, 0.05, g, false); box(len, 0.18, 0.08, M(0x1d1008), 0, 0.09, 0.05, g, false);
  }

  // ---------- lighting ----------
  const pend = [[-6, -2], [0, 1], [6, -2], [3.5, 3.4], [-7, 4]];
  pend.forEach(([x, z], i) => {
    cyl(0.03, 0.03, 1.2, M(0x111111), x, 4.4, z, 6, scene, false);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 16, 1, true), M(0x1b3a2a, { side: THREE.DoubleSide })); shade.position.set(x, 3.75, z); scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(3) })); bulb.position.set(x, 3.68, z); scene.add(bulb);
    const l = lamp(x, 3.5, z, 0xffd2a0, i === 1 ? 60 : 38, 15);
    if (i === 1) { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.002; l.shadow.camera.near = 0.5; l.shadow.camera.far = 16; }
  });
  lamp(9, 2.5, -5, 0xff3040, 40, 12); lamp(-9, 3, -5, 0x27e08a, 26, 12); lamp(0, 3.8, -6.5, 0x4da3ff, 38, 14); lamp(10.5, 3.2, 3, 0xffa030, 28, 12);

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
  neonPlane('BALL KNOWLEDGE', '#27e08a', 8, 0.85, 0, 4.68, -ROOM.z + 0.12, 0, 56);
  neonPlane('COLD BEER', '#4da3ff', 2.6, 0.7, -9.5, 3.4, -ROOM.z + 0.12, 0, 56);
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
  const tvFrame = (w, h, x, y, z, ry = 0) => { const m = box(w + 0.25, h + 0.25, 0.12, M(0x0a0a0c, { roughness: 0.4 }), x, y, z); m.rotation.y = ry; return m; };
  tvFrame(5, 2.8, 0, 2.95, -ROOM.z + 0.1); plane(5, 2.8, tvMat(tv.center), 0, 2.95, -ROOM.z + 0.18);
  tvFrame(3.4, 1.9, -4.8, 2.95, -ROOM.z + 0.1); plane(3.4, 1.9, tvMat(tv.left), -4.8, 2.95, -ROOM.z + 0.18);
  tvFrame(3.4, 1.9, 4.8, 2.95, -ROOM.z + 0.1); plane(3.4, 1.9, tvMat(tv.right), 4.8, 2.95, -ROOM.z + 0.18);
  { const f = tvFrame(2.6, 1.46, ROOM.x - 0.12, 3.5, 1.2, -Math.PI / 2); plane(2.6, 1.46, tvMat(tv.center), ROOM.x - 0.2, 3.5, 1.2, -Math.PI / 2); }
  { tvFrame(2.6, 1.46, -ROOM.x + 0.12, 3.5, 0.2, Math.PI / 2); plane(2.6, 1.46, tvMat(tv.center), -ROOM.x + 0.2, 3.5, 0.2, Math.PI / 2); }

  // ---------- bar counter (right wall) ----------
  const wood = M(0x5a3520, { roughness: 0.6 }), lacquer = M(0x7a4a28, { roughness: 0.25, metalness: 0.1 });
  box(1.0, 1.1, 8.2, MT(TX.paneling([4, 1]).t), 10.1, 0.55, 2.5); box(1.3, 0.09, 8.5, lacquer, 10.05, 1.14, 2.5);
  cyl(0.04, 0.04, 8.2, M(0xc9a24a, { metalness: 0.9, roughness: 0.25 }), 9.35, 0.22, 2.5, 8).rotation.x = Math.PI / 2;
  obstacles.push(...[-1, 0.5, 2, 3.5, 5, 6.4].map((z) => ({ x: 10.1, z, r: 1.15 })));
  // back bar
  plane(8.4, 3.6, MT(TX.brick([4, 2]).t), ROOM.x - 0.02, 2.2, 2.5, -Math.PI / 2);
  plane(7.6, 1.4, new THREE.MeshStandardMaterial({ color: 0x8aa4b0, roughness: 0.08, metalness: 0.9, emissive: 0x0a1218 }), ROOM.x - 0.05, 2.4, 2.5, -Math.PI / 2);
  [1.25, 1.85, 2.45].forEach((y) => { box(0.4, 0.05, 7.8, wood, ROOM.x - 0.25, y, 2.5); });
  const bottleCols = [0x2e7d32, 0x6d4c1f, 0xb0bec5, 0x8d1b2a, 0xe0a030, 0x1b5e8a];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 20; i++) {
    const c = bottleCols[(i * 7 + r * 3) % bottleCols.length], z = -1.2 + i * 0.4 + (r % 2) * 0.1, y = 1.25 + r * 0.6, h = 0.26 + ((i + r) % 3) * 0.05;
    cyl(0.05, 0.06, h, M(c, { roughness: 0.2, metalness: 0.2, emissive: c, emissiveIntensity: 0.12 }), ROOM.x - 0.25, y + h / 2 + 0.03, z, 8, scene, false); cyl(0.02, 0.025, 0.1, M(c), ROOM.x - 0.25, y + h + 0.08, z, 6, scene, false);
  }
  [1, 2, 3, 4].forEach((z, i) => { cyl(0.025, 0.03, 0.3, M(0xc9c9d0, { metalness: 0.9, roughness: 0.2 }), 10.35, 1.34, z, 8); box(0.05, 0.16, 0.05, M([0xd22, 0x2a6, 0xe9a, 0x36c][i]), 10.35, 1.55, z, scene, false); });
  box(0.45, 0.28, 0.4, M(0xc8b080), 10.0, 1.32, 5.7); // register
  for (let i = 0; i < 6; i++) { const z = -0.2 + i * 1.2; cyl(0.22, 0.2, 0.08, TX.vinyl ? MT(TX.vinyl('#8b1d24').t) : M(0x8b1d24), 9.0, 0.78, z, 14); cyl(0.04, 0.04, 0.74, M(0x888888, { metalness: 0.8 }), 9.0, 0.38, z, 6); cyl(0.2, 0.2, 0.03, M(0x888888, { metalness: 0.8 }), 9.0, 0.02, z, 12, scene, false); obstacles.push({ x: 9.0, z, r: 0.28 }); }
  stations.push({ x: 8.1, z: 2.5, r: 2.4, text: 'E - Order a drink (bartender)', act: () => BK.openPanel('bar') });
  // crates + trash
  box(0.7, 0.4, 0.5, M(0x8a6a3a), 11.3, 0.2, 7.2); box(0.7, 0.4, 0.5, M(0x8a6a3a), 11.3, 0.62, 7.2); cyl(0.3, 0.26, 0.7, M(0x333c3c, { metalness: 0.5 }), 11.2, 0.35, -2.2, 12); obstacles.push({ x: 11.2, z: 7.2, r: 0.6 }, { x: 11.2, z: -2.2, r: 0.5 });

  // ---------- pool table ----------
  const feltM = MT(TX.felt('#0d6b35').t, { roughness: 1 }), PX = 3.4, PZ = 3.4;
  box(2.9, 0.12, 1.6, M(0x4a2a14), PX, 0.82, PZ); box(2.6, 0.04, 1.3, feltM, PX, 0.9, PZ);
  [[-1.4, -0.75], [1.4, -0.75], [-1.4, 0.75], [1.4, 0.75]].forEach(([x, z]) => box(0.18, 0.8, 0.18, M(0x2a170b), PX + x, 0.4, PZ + z));
  [[-1.3, -0.65], [0, -0.67], [1.3, -0.65], [-1.3, 0.65], [0, 0.67], [1.3, 0.65]].forEach(([x, z]) => cyl(0.08, 0.08, 0.02, M(0x050505), PX + x, 0.925, PZ + z, 10, scene, false));
  [[0.2, 0.1], [0.3, -0.1], [0.4, 0.15], [0.5, 0], [0.6, -0.2], [-0.8, 0]].forEach(([x, z], i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M([0xffffff, 0xd22, 0x228, 0xe92, 0x2a2, 0x111][i], { roughness: 0.2 })); b.position.set(PX + x, 0.95, PZ + z); b.castShadow = true; scene.add(b); });
  const plb = box(2.4, 0.08, 0.3, M(0x1b3a2a), PX, 3.0, PZ); box(2.3, 0.02, 0.2, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(2) }), PX, 2.95, PZ, scene, false);
  cyl(0.02, 0.02, 2, M(0x111), PX - 1, 4, PZ, 6, scene, false); cyl(0.02, 0.02, 2, M(0x111), PX + 1, 4, PZ, 6, scene, false);
  obstacles.push({ x: PX - 1.1, z: PZ, r: 0.95 }, { x: PX, z: PZ, r: 0.95 }, { x: PX + 1.1, z: PZ, r: 0.95 });

  // ---------- booths ----------
  [-3.5, -0.5, 2.5].forEach((x, i) => {
    const vm = MT(TX.vinyl(i === 1 ? '#1d4e7a' : '#8b1d24').t, { roughness: 0.5 });
    box(2.2, 0.45, 0.7, vm, x, 0.23, ROOM.z - 0.4); box(2.2, 0.8, 0.18, vm, x, 0.85, ROOM.z - 0.1); box(1.1, 0.06, 0.8, M(0x6b4a2b, { roughness: 0.3 }), x, 0.78, ROOM.z - 1.5); box(0.12, 0.76, 0.12, M(0x333), x, 0.38, ROOM.z - 1.5);
    box(2.2, 0.45, 0.7, vm, x, 0.23, ROOM.z - 2.6); box(2.2, 0.8, 0.18, vm, x, 0.85, ROOM.z - 2.9, scene);
    obstacles.push({ x: x - 0.6, z: ROOM.z - 0.5, r: 0.9 }, { x: x + 0.6, z: ROOM.z - 0.5, r: 0.9 }, { x, z: ROOM.z - 1.5, r: 0.7 });
  });
  // couch + jukebox
  const couchM = M(0x6b5a3a, { roughness: 1 }); box(2.2, 0.45, 0.9, couchM, 8.0, 0.23, 7.0); box(2.2, 0.7, 0.2, couchM, 8.0, 0.65, 7.5); box(0.25, 0.6, 0.9, couchM, 6.9, 0.3, 7.0); box(0.25, 0.6, 0.9, couchM, 9.1, 0.3, 7.0); obstacles.push({ x: 7.5, z: 7.0, r: 0.8 }, { x: 8.5, z: 7.0, r: 0.8 });
  box(0.9, 1.5, 0.6, M(0x7a1a2a, { roughness: 0.4 }), -11, 0.75, 7.2); plane(0.7, 0.5, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc040).multiplyScalar(1.8) }), -11, 1.2, 6.89, 0); obstacles.push({ x: -11, z: 7.2, r: 0.8 });

  // ---------- terminal (sportsbook) ----------
  box(1.8, 1.1, 0.9, M(0x1a2a4a, { roughness: 0.4 }), 0, 0.55, -6.6);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshBasicMaterial({ map: tv.kiosk, toneMapped: false })); scr.position.set(0, 1.5, -6.42); scr.rotation.x = -0.25; scene.add(scr);
  box(1.5, 0.9, 0.08, M(0x0a0a0c), 0, 1.5, -6.5);
  obstacles.push({ x: 0, z: -6.6, r: 1.1 });
  stations.push({ x: 0, z: -5.5, r: 2.2, text: 'E - Place bets (Sportsbook)', act: () => BK.openPanel('book') });

  // ---------- Uncle Sal's corner ----------
  box(5, 0.05, 4, M(0x5a0f1c, { roughness: 1 }), 9.5, 0.03, -5.5, scene, false);
  box(2.8, 0.5, 0.8, MT(TX.vinyl('#3a0d14').t), 9.5, 0.27, -7.4); box(2.8, 0.9, 0.16, MT(TX.vinyl('#3a0d14').t), 9.5, 0.9, -7.8); box(1.6, 0.06, 0.9, M(0x2a1208), 9.5, 0.75, -6.4); box(0.12, 0.7, 0.12, M(0x222), 9.5, 0.38, -6.4);
  const sal = makePerson({ skin: 0xd9a679, shirt: 0x15151a, pants: 0x15151a, hair: 0x111111, hairStyle: 'short', beard: false, scale: 1.04 });
  sal.group.position.set(9.5, 0, -7.1); sal.group.rotation.y = 0; scene.add(sal.group);
  { const hat = new THREE.Group(); const br = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16), M(0x0a0a0a)); const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.17, 14), M(0x0a0a0a)); cr.position.y = 0.1; hat.add(br, cr); hat.position.y = 0.17; sal.head.add(hat); }
  sal.arms.forEach((a) => (a.rotation.x = -0.5)); sal.legs.forEach((l) => (l.rotation.x = -1.4));
  npcs.push({ P: sal, mode: 'idle', seated: true, name: 'Uncle Sal', lines: ['Everything has a price, kid.', 'Need a little... help?', 'I know a guy. I always know a guy.', 'Pay me back and we stay friends.'] });
  const sl = TX.label('🕴️ UNCLE SAL', '#ff7a88'); sl.position.set(9.5, 2.8, -6.6); scene.add(sl);
  obstacles.push({ x: 9.5, z: -6.5, r: 1.2 });
  stations.push({ x: 9.5, z: -4.2, r: 2.5, text: 'E - Talk to Uncle Sal', act: () => BK.openPanel('mob') });

  // ---------- NPCs ----------
  const spawn = (opts, x, z, ry, mode, lines, name) => { const P = makePerson(opts); P.group.position.set(x, 0, z); P.group.rotation.y = ry; scene.add(P.group); npcs.push({ P, mode, lines, name, base: { x, z, ry } }); return P; };
  const sit = (P, y = 0.52) => { P.legs.forEach((l) => (l.rotation.x = -1.45)); P.baseY = y - 0.52 + 0.02; P.group.position.y = P.baseY; P.seat = y; };
  const bt = spawn({ skin: 0xe3b48f, shirt: 0x3a3a46, pants: 0x1a1a22, hair: 0x8a8a8a, hairStyle: 'short', apron: true, beard: true }, 11.1, 0, 0, 'polish', ['What\'ll it be?', 'No credit. Don\'t ask.', 'You look thirsty.', 'We close when I say we close.'], 'Bartender');
  bt.group.position.set(11.1, 0, 2.5); bt.group.rotation.y = Math.PI / 2; npcs[npcs.length - 1].base = { x: 11.1, z: 2.5, ry: Math.PI / 2 };
  const bl = TX.label('Bartender', '#ffd9a0', 0.8); bl.position.set(11.1, 2.3, 2.5); scene.add(bl);
  const fly = (skin, shirt, hair, z, lines, mode = 'drink', hs = 'short') => { const P = spawn({ skin, shirt, pants: 0x30343c, hair, hairStyle: hs }, 9.0, z, Math.PI / 2, mode, lines, 'Regular'); sit(P, 0.95); };
  fly(0xf0c8a0, 0x7a2a2a, 0x3a2a1a, 0.9, ['I had Cleveland. Don\'t ask.', 'My cousin says it\'s rigged.', 'Hic... who\'s winning?', 'Another round!']);
  fly(0xc58c5c, 0x2a5a8a, 0x111111, 3.3, ['I put my rent on the over.', 'Ball knowledge, baby!', 'Everyone\'s a genius until they lose.', 'Underdogs always bite.'], 'drink', 'bald');
  fly(0xf5d0b0, 0x3a6a3a, 0xb06a2a, 4.7, ['*laughing too hard*', 'Tell me that\'s not a lock!', 'Is it Tuesday?', 'I love this place.'], 'cheer', 'long');
  const pl1 = spawn({ skin: 0xe0b890, shirt: 0xd8d0b0, pants: 0x4a4a52, hair: 0x2a1a0a, hairStyle: 'short', cap: 0x2a5aa8 }, 3.4, 4.5, Math.PI, 'pool', ['Eight ball, corner pocket.', 'You\'re hustling me.', 'Watch the cue chalk.'], 'Shark');
  const pl2 = spawn({ skin: 0x8d5a3a, shirt: 0x9a3a8a, pants: 0x222, hair: 0x111, hairStyle: 'short' }, 5.3, 3.4, Math.PI / 2 * 3, 'idle', ['Double or nothing?', 'Nice shot. Lucky.', 'I need a beer.'], 'Shark');
  const sleeper = spawn({ skin: 0xf0c8a0, shirt: 0x6a6a2a, pants: 0x3a3a3a, hair: 0x5a4a3a, hairStyle: 'short', beard: true }, 2.5, ROOM.z - 1.5, 0, 'sleep', ['zzz... not the under...', '...five more minutes...'], 'Sleeper');
  sleeper.group.position.set(2.5, 0.2, ROOM.z - 1.2); sleeper.baseY = 0.2;
  const sofa = spawn({ skin: 0xd8a070, shirt: 0xaa5a2a, pants: 0x2a3a5a, hair: 0x222, hairStyle: 'long' }, 8.0, 6.9, Math.PI, 'drink', ['This couch has seen things.', 'Don\'t sit here. I mean it.'], 'Couch guy'); sit(sofa, 0.5);
  const sleeperLbl = null;
  // bubbles
  for (const n of npcs) { const b = TX.bubble(); b.sprite.position.set(0, 2.35, 0); n.P.group.add(b.sprite); n.bubble = b; n.next = 4 + Math.random() * 12; n.until = 0; }

  // dust motes
  const dustN = 260, dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dustPos[i * 3] = (Math.random() - 0.5) * 23; dustPos[i * 3 + 1] = Math.random() * 4.5; dustPos[i * 3 + 2] = (Math.random() - 0.5) * 15; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe8c0, size: 0.03, transparent: true, opacity: 0.5, depthWrite: false })); scene.add(dust);

  function update(t, dt, me) {
    for (const n of npcs) {
      animate(n.P, n.mode, t);
      if (n.seated) { n.P.legs.forEach((l) => (l.rotation.x = -1.4)); n.P.arms.forEach((a) => (a.rotation.x = -0.5)); }
      else if (n.P.seat) n.P.legs.forEach((l) => (l.rotation.x = -1.45));
      if (n.name === 'Sleeper') n.P.legs.forEach((l) => (l.rotation.x = -1.4));
      const near = Math.hypot(n.P.group.position.x - me.x, n.P.group.position.z - me.z) < 7;
      if (n.bubble) {
        if (t > n.until && n.bubble.sprite.visible) n.bubble.set('');
        if (t > n.next && near) { n.bubble.set(n.lines[Math.floor(Math.random() * n.lines.length)]); n.until = t + 3.8; n.next = t + 7 + Math.random() * 14; }
      }
      if (n.name !== 'Sleeper' && n.base === undefined && n.seated) { /* sal stays */ }
      if (n.base && n.name !== 'Bartender' && n.name !== 'Regular' && n.name !== 'Sleeper' && n.name !== 'Couch guy') { /* shark: face the table */ }
    }
    const p = dg.attributes.position; for (let i = 0; i < dustN; i++) { p.array[i * 3 + 1] += dt * 0.03 * (1 + (i % 3)); if (p.array[i * 3 + 1] > 4.6) p.array[i * 3 + 1] = 0.1; p.array[i * 3] += Math.sin(t * 0.2 + i) * dt * 0.02; }
    p.needsUpdate = true;
  }
  return { stations, obstacles, npcs, update, sal };
}
