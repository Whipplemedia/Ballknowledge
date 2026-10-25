import * as THREE from 'three';
import * as TX from './textures.js';
import { makePreset, makePerson, randomPatron, animate } from './people.js';
import { BY_ID, applyCosmetics } from './cosmetics.js';

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
  const walls = [[ROOM.x * 2, 0, -ROOM.z, 0], [ROOM.x * 2, 0, ROOM.z, Math.PI], [ROOM.z * 2, -ROOM.x, 0, Math.PI / 2], [ROOM.z * 2, ROOM.x, 0, -Math.PI / 2]];
  for (const [len, x, z, ry] of walls) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(len, ROOM.h - 1.4), MT(wallPaint.clone ? wallPaint : wallPaint)); up.position.set(0, 1.4 + (ROOM.h - 1.4) / 2, 0.01); g.add(up);
    const lo = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.4), MT(panel)); lo.position.set(0, 0.7, 0.01); g.add(lo);
    box(len, 0.08, 0.1, M(0x2a170b), 0, 1.4, 0.05, g, false); box(len, 0.18, 0.08, M(0x1d1008), 0, 0.09, 0.05, g, false);
  }

  // ---------- lighting ----------
  const pend = [[-6, -2], [0, 1], [6, -2], [3.5, 3.4]];
  pend.forEach(([x, z], i) => {
    cyl(0.03, 0.03, 1.2, M(0x111111), x, 4.4, z, 6, scene, false);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 16, 1, true), M(0x1b3a2a, { side: THREE.DoubleSide })); shade.position.set(x, 3.75, z); scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(3) })); bulb.position.set(x, 3.68, z); scene.add(bulb);
    const l = lamp(x, 3.5, z, 0xffd2a0, i === 1 ? 34 : 20, 14);
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
    if (seat !== null) { P.baseY = seat + 0.07 - 0.9; P.group.position.y = P.baseY; }
    const n = { P, mode, lines, name, base: { x, z, ry }, seated: seat !== null, bubble: null, next: 4 + Math.random() * 14, until: 0 };
    const bb = TX.bubble(); bb.sprite.position.set(0, 2.55, 0); P.group.add(bb.sprite); n.bubble = bb; npcs.push(n); return n;
  };
  const tag = (txt, x, y, z, col = '#ffd9a0') => { const l = TX.label(txt, col, 0.8); l.position.set(x, y, z); scene.add(l); };
  // Uncle Sal in his booth
  spawn(makePreset('sal'), 9.5, -7.0, Math.PI, 'idle', ['Everything has a price, kid.', 'Need a little... help?', 'I know a guy. I always know a guy.', 'Pay me back and we stay friends.'], 'Uncle Sal', 0.52);
  // bartender behind the counter, polishing
  spawn(makePreset('bartender'), 11.15, 2.5, Math.PI / 2, 'polish', ['What\'ll it be?', 'No credit. Don\'t ask.', 'You look thirsty.', 'Tip your bartender.'], 'Bartender');
  tag('Bartender', 11.1, 2.55, 2.5);
  // regulars on stools facing the bar (stools at x=9, z=-0.2 + i*1.2)
  const stool = (z, name, over, mode, lines) => spawn(makePreset(name, over), 9.05, z, -Math.PI / 2, mode, lines, 'Regular', 0.8);
  stool(-0.2, 'rookie', {}, 'drink', ['Is this the over or the under?', 'First time here. Be nice.', 'What\'s a moneyline?']);
  stool(1.0, 'jock', {}, 'cheer', ['LET\'S GOOO!', 'I called it. I CALLED it.', 'Ball knowledge, baby!']);
  stool(2.2, 'knowItAll', {}, 'point', ['Actually, the odds don\'t work like that.', 'Statistically speaking...', 'I read the box scores.']);
  stool(3.4, 'chill', {}, 'drink', ['I had Cleveland. Don\'t ask.', 'Rent was due. Bet was bigger.', 'Another round...']);
  stool(4.6, 'dieHard', {}, 'cheer', ['That ref is BLIND!', 'My cousin says it\'s rigged.', 'Never bet against my team.']);
  stool(5.8, 'gambler', {}, 'drink', ['Double or nothing?', 'The house always wins. Not tonight.', 'I put my rent on the over.']);
  // pool table
  spawn(makePreset('gambler', { hat: { color: 0x2a5aa8, backwards: false }, outfit: 'tee', shirt: 0xd8d0b0, stache: false }), 3.4, 4.5, face(3.4, 4.5, 3.4, 3.4), 'pool', ['Eight ball, corner pocket.', 'You\'re hustling me.', 'Watch the cue chalk.'], 'Shark');
  spawn(makePreset('dieHard', { glasses: false, shirt: 0x9a3a8a, outfit: 'tee', hat: { color: 0x222222, backwards: true } }), 5.4, 3.4, face(5.4, 3.4, 4.4, 3.4), 'idle', ['Double or nothing?', 'Nice shot. Lucky.', 'I need a beer.'], 'Shark');
  spawn(randomPatron(2), 5.9, 4.9, face(5.9, 4.9, 4.4, 3.6), 'cheer', ['Sink it!', 'Ohhh!', 'Scratch!'], 'Watcher');
  // booths (front wall). benches at z=7.6 (face -z) and z=5.4 (face +z); seat top ~0.45
  const benchA = (x, p, i) => spawn(p, x, 7.5, 0, 'drink', ['This booth is cursed.', 'Ssh, the game is on.', 'Order me a beer?'], 'Patron', 0.45);
  const benchB = (x, p) => spawn(p, x, 5.5, Math.PI, 'idle', ['Told you. Told you.', 'Lock in the under.', '*laughs*'], 'Patron', 0.45);
  benchA(-3.95, randomPatron(5)); benchA(-3.05, randomPatron(8)); benchB(-3.5, randomPatron(1));
  benchB(-0.95, randomPatron(4)); benchB(-0.05, randomPatron(7));
  const sleeper = spawn(makePreset('rookie', { beard: 'stubble', hat: null, hairStyle: 'messy', hair: 0x5a4a3a, shirt: 0x6a6a2a, outfit: 'tee' }), 2.5, 7.3, 0, 'sleep', ['zzz... not the under...', '...five more minutes...'], 'Sleeper', 0.45);
  spawn(makePreset('chill', { shirt: 0x3a5a3a }), 7.6, 6.7, 0, 'drink', ['This couch has seen things.', 'Don\'t sit here. I mean it.'], 'Couch guy', 0.45);
  // roulette dealer, bowling & cornhole spectators
  spawn(makePreset('knowItAll', { glasses: false, outfit: 'suit', shirt: 0x1d2a22, tie: 0x2a8a4a, hairStyle: 'slick', hair: 0x1a1210, mouth: 'smile' }), -7.0, -6.75, Math.PI, 'idle', ['Place your bets.', 'No more bets.', 'Red or black?'], 'Dealer');
  tag('Dealer', -7.0, 2.7, -6.75);
  spawn(randomPatron(3), -8.8, 3.6, face(-8.8, 3.6, -10.6, 3.0), 'cheer', ['Strike! Strike!', 'Come on, pocket!', 'Gutter. Classic.'], 'Spectator');
  spawn(randomPatron(6), -8.0, 1.6, face(-8.0, 1.6, -6.0, 4.4), 'drink', ['Bags up!', 'Watch the wind.', 'Nice toss.'], 'Spectator');
  spawn(randomPatron(9), -8.5, -4.6, face(-8.5, -4.6, -10, -7.6), 'point', ['Triple twenty!', 'Don\'t choke.', 'He\'s shaking.'], 'Spectator');
  spawn(randomPatron(10), -1.8, -2.4, face(-1.8, -2.4, 0, -7), 'idle', ['Which season is this?', 'I feel like I know this one.', 'Rewind the highlights.'], 'Patron');
  spawn(randomPatron(11), 5.8, -0.6, face(5.8, -0.6, 4.8, -7.6), 'point', ['Look at that line.', 'Easy money.', 'I\'ve seen this game.'], 'Patron');

  // ---------- Pro Shop corner ----------
  box(2.4, 1.0, 0.8, M(0x4a2a14), -8.6, 0.5, 6.7); box(2.55, 0.07, 0.95, M(0x8a5a30, { roughness: 0.3 }), -8.6, 1.03, 6.7);
  const stand = (id, x, y = 1.07) => { const g = new THREE.Group(); g.position.set(x, y, 6.65); BY_ID[id].make(g); g.scale.setScalar(0.8); scene.add(g); box(0.12, 0.1, 0.12, M(0x222), x, 1.1, 6.65); return g; };
  [['helmet_fb', -9.5], ['tophat', -8.9], ['crown', -8.3], ['viking', -7.7]].forEach(([id, x]) => { const s = stand(id, x, 1.35); s.position.y = 1.2; });
  for (const [id, x] of [['golf_club', -9.9], ['bat', -9.5], ['hockey_stick', -9.1]]) { const g = new THREE.Group(); g.position.set(x, 1.6, ROOM.z - 0.2); BY_ID[id].make(g); g.rotation.set(0, 0, 0); g.children.forEach(() => {}); g.rotation.x = 0.0; g.rotation.z = 0.0; g.rotation.x = 0; g.position.y = 0.9; scene.add(g); }
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
  box(1.2, 2.3, 0.1, M(0x3a2010), 5.0, 1.15, ROOM.z - 0.08); box(0.7, 1.0, 0.04, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a8ab0).multiplyScalar(0.8) }), 5.0, 1.55, ROOM.z - 0.14, scene, false);
  neonPlane('EXIT', '#ff3030', 0.9, 0.38, 5.0, 2.6, ROOM.z - 0.1, Math.PI, 70);
  // neon wall
  neonPlane('GOOD SPORTS', '#27e08a', 3.0, 0.7, -ROOM.x + 0.12, 3.5, -4.6, Math.PI / 2, 54); neonPlane('BAD DECISIONS', '#ff60b0', 3.2, 0.7, -ROOM.x + 0.12, 2.8, -4.6, Math.PI / 2, 50);
  neonPlane('Ball Knowledge', '#a060ff', 3.4, 1.0, ROOM.x - 0.12, 3.8, -2.9, -Math.PI / 2, 60);
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
  // warm strip lights under the back-bar shelves
  [1.22, 1.82, 2.42].forEach((y) => box(0.04, 0.02, 7.6, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(1.3) }), ROOM.x - 0.1, y - 0.02, 2.5, scene, false));

  // dust motes
  const dustN = 260, dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dustPos[i * 3] = (Math.random() - 0.5) * 23; dustPos[i * 3 + 1] = Math.random() * 4.5; dustPos[i * 3 + 2] = (Math.random() - 0.5) * 15; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe8c0, size: 0.03, transparent: true, opacity: 0.5, depthWrite: false })));

  function update(t, dt, me) {
    for (const n of npcs) {
      animate(n.P, n.mode, t);
      if (n.seated) n.P.legs.forEach((l) => (l.rotation.x = 1.45));
      const near = Math.hypot(n.P.group.position.x - me.x, n.P.group.position.z - me.z) < 7;
      if (n.bubble) {
        if (t > n.until && n.bubble.sprite.visible) n.bubble.set('');
        if (t > n.next && near) { n.bubble.set(n.lines[Math.floor(Math.random() * n.lines.length)]); n.until = t + 3.8; n.next = t + 8 + Math.random() * 14; }
      }
    }
    const p = dg.attributes.position; for (let i = 0; i < dustN; i++) { p.array[i * 3 + 1] += dt * 0.03 * (1 + (i % 3)); if (p.array[i * 3 + 1] > 4.6) p.array[i * 3 + 1] = 0.1; p.array[i * 3] += Math.sin(t * 0.2 + i) * dt * 0.02; }
    p.needsUpdate = true;
  }
  return { stations, obstacles, npcs, update };
}
