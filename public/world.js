import * as THREE from 'three';

const BK = window.BK; window.__dbg = {};
const canvas = document.getElementById('world');
const promptEl = document.getElementById('prompt');
const cross = Object.assign(document.createElement('div'), { id: 'cross' });
document.body.appendChild(cross); cross.style.display = 'none';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 18, 42);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 80);
camera.rotation.order = 'YXZ';

const ROOM = { x: 12, z: 8 };
const EYE = 1.65;

// ---------- helpers ----------
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...o });
const box = (w, h, d, color, x, y, z, parent = scene, o) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)); m.position.set(x, y, z); parent.add(m); return m;
};
const cyl = (rt, rb, h, color, x, y, z, seg = 12, parent = scene, o) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, o)); m.position.set(x, y, z); parent.add(m); return m;
};
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { c, g, t };
}
function label(text, color = '#fff', scale = 1) {
  const { t } = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#000a'; g.roundRect(0, 0, w, h, 14); g.fill(); g.fillStyle = color; g.font = 'bold 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2, w - 16); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.6 * scale, 0.4 * scale, 1); s.renderOrder = 10; return s;
}

// ---------- room ----------
let tvs = [0, 1, 2].map(() => canvasTex(512, 288, (g, w, h) => { g.fillStyle = '#071024'; g.fillRect(0, 0, w, h); g.fillStyle = '#4da3ff'; g.font = 'bold 40px system-ui'; g.textAlign = 'center'; g.fillText('BALL KNOWLEDGE', w / 2, h / 2); }));
const obstacles = []; // {x,z,r}
const stations = []; // {x,z,r,text,act}

(function build() {
  scene.add(new THREE.AmbientLight(0x8890c0, 0.9));
  const key = new THREE.PointLight(0xfff0d0, 90, 40); key.position.set(0, 5.5, 0); scene.add(key);
  const red = new THREE.PointLight(0xff3040, 40, 14); red.position.set(9, 3, -5); scene.add(red);
  const green = new THREE.PointLight(0x27e08a, 30, 14); green.position.set(-9, 3, 0); scene.add(green);
  const blue = new THREE.PointLight(0x4da3ff, 35, 14); blue.position.set(0, 3.5, -6); scene.add(blue);

  // floor checker
  const floorTex = canvasTex(128, 128, (g) => { g.fillStyle = '#2a2140'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#1b1530'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); }).t;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(12, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x * 2, ROOM.z * 2), mat(0x151a30)); ceil.rotation.x = Math.PI / 2; ceil.position.y = 5; scene.add(ceil);
  // walls
  const wallC = 0x2b2f5e;
  box(ROOM.x * 2, 5, 0.3, wallC, 0, 2.5, -ROOM.z); box(ROOM.x * 2, 5, 0.3, wallC, 0, 2.5, ROOM.z);
  box(0.3, 5, ROOM.z * 2, wallC, -ROOM.x, 2.5, 0); box(0.3, 5, ROOM.z * 2, wallC, ROOM.x, 2.5, 0);
  // neon sign
  const sign = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#0000'; g.fillRect(0, 0, w, h); g.font = '900 84px system-ui'; g.textAlign = 'center'; g.fillStyle = '#27e08a'; g.shadowColor = '#27e08a'; g.shadowBlur = 24; g.fillText('BALL KNOWLEDGE', w / 2, 92); }).t;
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: sign, transparent: true })); signM.position.set(0, 4.5, -ROOM.z + 0.2); scene.add(signM);

  // bar counter (decor + obstacle)
  box(7, 1.1, 1, 0x5a3a22, 0, 0.55, 7.2); box(7.2, 0.1, 1.2, 0x8a5a33, 0, 1.12, 7.2);
  for (let i = -3; i <= 3; i += 1.5) { cyl(0.25, 0.25, 0.1, 0xc0392b, i, 0.75, 6.2, 12); cyl(0.05, 0.05, 0.7, 0x888, i, 0.35, 6.2, 6); }
  obstacles.push({ x: -2.6, z: 7.2, r: 1.2 }, { x: 0, z: 7.2, r: 1.2 }, { x: 2.6, z: 7.2, r: 1.2 });
  // tables
  [[-4, 0], [4, 0.5], [-6, -3]].forEach(([x, z]) => { cyl(0.9, 0.9, 0.08, 0x6d4c2f, x, 0.8, z, 16); cyl(0.08, 0.08, 0.8, 0x333, x, 0.4, z, 8); obstacles.push({ x, z, r: 1 }); });

  // --- TV wall + sportsbook terminal ---
  [-4.2, 0, 4.2].forEach((x, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2), new THREE.MeshBasicMaterial({ map: tvs[i].t }));
    m.position.set(x, 2.9, -ROOM.z + 0.2); scene.add(m);
    box(3.8, 2.2, 0.1, 0x111, x, 2.9, -ROOM.z + 0.12);
  });
  box(1.6, 1.2, 0.8, 0x1a2a4a, 0, 0.6, -6.6); box(1.2, 0.7, 0.1, 0x4da3ff, 0, 1.4, -6.45, scene, { emissive: 0x2060a0 });
  const t1 = label('📱 SPORTSBOOK'); t1.position.set(0, 2.1, -6.2); scene.add(t1);
  obstacles.push({ x: 0, z: -6.6, r: 1 });
  stations.push({ x: 0, z: -5.6, r: 2.2, text: 'E - Place bets', act: () => BK.openPanel('book') });

  // --- Uncle Sal's booth ---
  const sal = new THREE.Group(); sal.position.set(9.5, 0, -5.5); scene.add(sal);
  box(5, 0.1, 4, 0x5a0f1c, 0, 0.05, 0, sal);
  box(2.6, 0.9, 1, 0x3a0d14, 0, 0.45, 1.2, sal); // booth backing
  cyl(0.28, 0.32, 0.9, 0x111, 0, 1.15, 0, 10, sal); cyl(0.3, 0.3, 0.8, 0x1c1c1c, 0, 0.45, 0, 10, sal); // suit
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat(0xd9a679)); head.position.set(0, 1.78, 0); sal.add(head);
  cyl(0.38, 0.38, 0.04, 0x111, 0, 1.97, 0, 12, sal); cyl(0.22, 0.24, 0.2, 0x111, 0, 2.08, 0, 12, sal); // hat
  box(0.5, 0.05, 0.05, 0x111, 0, 1.74, 0.2, sal);
  const salLabel = label('🕴️ UNCLE SAL', '#ff7a88'); salLabel.position.set(9.5, 2.7, -5.5); scene.add(salLabel);
  obstacles.push({ x: 9.5, z: -5.5, r: 0.9 });
  stations.push({ x: 9.5, z: -4.2, r: 2.4, text: 'E - Talk to Uncle Sal', act: () => BK.openPanel('mob') });
  BK.sal = sal;

  // --- arcade corner (left) ---
  box(0.2, 2, 2, 0x222, -ROOM.x + 0.2, 1.6, -2); // dartboard backing
  const board = new THREE.Group(); board.position.set(-ROOM.x + 0.35, 1.8, -2); board.rotation.y = Math.PI / 2; scene.add(board);
  [[0.8, 0x111], [0.6, 0x1d6b3a], [0.4, 0x8c1c2c], [0.15, 0x1d6b3a], [0.06, 0xffc83d]].forEach(([r, c], i) => { const m = cyl(r, r, 0.04, c, 0, 0, 0.02 * i, 24, board); m.rotation.x = Math.PI / 2; });
  const l1 = label('🎯 DARTS'); l1.position.set(-ROOM.x + 0.8, 3, -2); scene.add(l1);
  stations.push({ x: -ROOM.x + 2, z: -2, r: 2, text: 'E - Play darts', act: () => playMG('darts') });

  box(2.4, 0.15, 9, 0x7a5430, -9.2, 0.08, 2.5); box(2.2, 0.05, 8.8, 0xc99a5a, -9.2, 0.17, 2.5); // lane
  [[0, 0], [-0.15, 0.3], [0.15, 0.3], [-0.3, 0.6], [0, 0.6], [0.3, 0.6], [-0.45, 0.9], [-0.15, 0.9], [0.15, 0.9], [0.45, 0.9]].forEach(([px, pz]) => cyl(0.06, 0.08, 0.38, 0xffffff, -9.2 + px, 0.4, -1.7 - pz, 6));
  const l2 = label('🎳 BOWLING'); l2.position.set(-9.2, 2.2, 6.4); scene.add(l2);
  stations.push({ x: -9.2, z: 6.3, r: 1.8, text: 'E - Go bowling', act: () => playMG('bowling') });

  [[-6, 5.2], [-3.4, 5.2]].forEach(([x, z]) => { const b = box(1.2, 0.35, 2.4, 0xc9a15b, x, 0.3, z - 0.0); b.rotation.x = 0.2; cyl(0.12, 0.12, 0.06, 0, x, 0.52, z - 0.6, 12); });
  const l3 = label('🌽 CORNHOLE'); l3.position.set(-4.7, 1.6, 5.2); scene.add(l3);
  stations.push({ x: -4.7, z: 3.9, r: 1.8, text: 'E - Cornhole', act: () => playMG('cornhole') });

  // --- roulette ---
  box(2.6, 0.9, 1.4, 0x0d5a2e, -6.5, 0.45, -5.2); cyl(0.5, 0.5, 0.08, 0x2a1810, -6.0, 0.95, -5.2, 24); cyl(0.08, 0.08, 0.2, 0xffc83d, -6.0, 1.05, -5.2, 8);
  const l4 = label('🎰 ROULETTE'); l4.position.set(-6.5, 2, -5.2); scene.add(l4);
  obstacles.push({ x: -6.5, z: -5.2, r: 1.4 });
  stations.push({ x: -6.5, z: -3.9, r: 2, text: 'E - Roulette & casino', act: () => BK.openPanel('arcade') });
})();

// ---------- TV screens ----------
function drawTVs() {
  const S = BK.S; if (!S) return;
  const lines = [[], [], []];
  const r = S.round;
  if (S.phase === 'betting' && S.market) {
    lines[0] = [r.label, `Round ${r.index + 1}/${r.total}`];
    lines[1] = S.market.map((t) => `${t.team}  ${t.am}`);
    const ready = S.players.filter((p) => p.ready).length;
    lines[2] = ['BETTING OPEN', `${ready}/${S.players.length} locked in`];
  } else if (S.phase === 'result' && S.result) {
    lines[0] = [S.result.label, 'FINAL'];
    lines[1] = [S.result.winner, S.result.score];
    lines[2] = S.result.sideResults.map((s) => `${s.kind}: ${(s.winner === 'a' ? s.a : s.b).split(' ').slice(-1)[0]}`);
  } else if (S.phase === 'hunt') {
    lines[0] = ['THE MOB IS HERE']; lines[1] = [`HITMEN HP ${S.hunt.hp}`]; lines[2] = ['FIGHT BACK!'];
  }
  const key = JSON.stringify(lines);
  if (drawTVs.key === key) return; drawTVs.key = key;
  tvs.forEach((tv, i) => {
    const { g, c, t } = tv; g.fillStyle = '#071024'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = i === 2 ? '#27e08a' : '#ffc83d'; g.font = 'bold 30px system-ui'; g.textAlign = 'center';
    lines[i].forEach((l, k) => { g.fillStyle = k === 0 ? '#ffc83d' : '#e8ecff'; g.font = k === 0 ? 'bold 34px system-ui' : 'bold 28px system-ui'; g.fillText(l, c.width / 2, 80 + k * 64, c.width - 30); });
    t.needsUpdate = true;
  });
}

// ---------- avatars ----------
const COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22];
function makeAvatar(name, color) {
  const g = new THREE.Group();
  cyl(0.28, 0.32, 1.0, COLORS[color % 6], 0, 0.9, 0, 10, g); cyl(0.22, 0.25, 0.7, 0x2c3e50, 0, 0.35, 0, 10, g);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat(0xf0c8a0)); head.position.y = 1.65; g.add(head);
  box(0.3, 0.06, 0.08, 0x222, 0, 1.68, -0.2, g); // visor so you can see facing
  const l = label(name, '#fff', 0.8); l.position.y = 2.2; g.add(l);
  scene.add(g); return g;
}
const avatars = new Map(); // id -> {g, tx,tz,try}
BK.onPos = (m) => { const a = avatars.get(m.id); if (a) { a.tx = m.x; a.tz = m.z; a.try = m.ry; } else pending.set(m.id, m); };
const pending = new Map();

function syncAvatars() {
  const S = BK.S; const inGame = S && ['betting', 'result', 'hunt'].includes(S.phase);
  const ids = new Set(inGame ? S.players.filter((p) => p.id !== S.you).map((p) => p.id) : []);
  for (const [id, a] of avatars) if (!ids.has(id)) { scene.remove(a.g); avatars.delete(id); }
  if (!inGame) return;
  for (const p of S.players) {
    if (p.id === S.you || avatars.has(p.id)) continue;
    const g = makeAvatar(p.name, p.color), pm = pending.get(p.id);
    g.position.set(pm ? pm.x : -3 + p.color * 1.2, 0, pm ? pm.z : 2);
    avatars.set(p.id, { g, tx: g.position.x, tz: g.position.z, try: pm ? pm.ry : 0 });
  }
}

// ---------- hitmen ----------
const hitmen = [];
function makeHitman() {
  const g = new THREE.Group();
  cyl(0.3, 0.34, 1.1, 0x111118, 0, 0.9, 0, 8, g); cyl(0.24, 0.26, 0.8, 0x0c0c12, 0, 0.4, 0, 8, g);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), mat(0xc79a72)); head.position.y = 1.7; g.add(head);
  cyl(0.38, 0.38, 0.04, 0x050505, 0, 1.9, 0, 10, g); cyl(0.22, 0.24, 0.22, 0x050505, 0, 2.02, 0, 10, g);
  box(0.34, 0.08, 0.05, 0xff2030, 0, 1.72, 0.2, g, { emissive: 0xff2030 });
  g.userData.hit = true; g.traverse((o) => { o.userData.hitman = g; });
  return g;
}
function syncHitmen() {
  const S = BK.S, on = S && S.phase === 'hunt';
  if (on && !hitmen.length) for (let i = 0; i < 3; i++) { const g = makeHitman(); g.position.set(-2 + i * 2, 0, ROOM.z - 2); scene.add(g); hitmen.push({ g, flash: 0, ph: i * 2 }); }
  if (!on && hitmen.length) { hitmen.forEach((h) => scene.remove(h.g)); hitmen.length = 0; }
}

// ---------- player controls ----------
const me = { x: 0, z: 2, yaw: 0, pitch: 0, vx: 0, vz: 0 };
const keys = {};
addEventListener('keydown', (e) => {
  if (!active() || BK.ui.open || mgOpen()) return;
  keys[e.code] = true;
  if (e.code === 'KeyE') { const s = nearest(); if (s) s.act(); }
  if (e.code === 'KeyC') BK.openPanel('crew');
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  me.yaw -= e.movementX * 0.0022; me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - e.movementY * 0.0022));
});
const ray = new THREE.Raycaster();
canvas.addEventListener('mousedown', () => {
  if (document.pointerLockElement !== canvas) { if (active() && !BK.ui.open && !mgOpen()) canvas.requestPointerLock(); return; }
  const S = BK.S;
  if (S && S.phase === 'hunt') {
    BK.send({ type: 'attack' });
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hit = ray.intersectObjects(hitmen.map((h) => h.g), true)[0];
    if (hit) { const h = hitmen.find((q) => q.g === hit.object.userData.hitman); if (h) h.flash = 1; }
  }
});
const active = () => { const S = BK.S; return S && ['betting', 'result', 'hunt'].includes(S.phase); };
const mgOpen = () => !document.getElementById('mg').classList.contains('hidden');
const nearest = () => stations.filter((s) => Math.hypot(s.x - me.x, s.z - me.z) < s.r).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];

function move(dt) {
  if (BK.ui.open || mgOpen()) { me.vx = me.vz = 0; return; }
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sp = (keys.ShiftLeft ? 6.2 : 3.8);
  const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  let dx = (-sin * f + cos * s), dz = (-cos * f - sin * s); const len = Math.hypot(dx, dz) || 1;
  dx = (dx / len) * sp * dt * (f || s ? 1 : 0); dz = (dz / len) * sp * dt * (f || s ? 1 : 0);
  me.x += dx; me.z += dz;
  me.x = Math.max(-ROOM.x + 0.6, Math.min(ROOM.x - 0.6, me.x)); me.z = Math.max(-ROOM.z + 0.6, Math.min(ROOM.z - 0.6, me.z));
  for (const o of obstacles) { const ex = me.x - o.x, ez = me.z - o.z, d = Math.hypot(ex, ez), min = o.r + 0.3; if (d < min && d > 0) { me.x = o.x + (ex / d) * min; me.z = o.z + (ez / d) * min; } }
}

let lastSend = 0, lastPos = '';
function netSend(t) {
  if (t - lastSend < 80) return; lastSend = t;
  const k = `${me.x.toFixed(2)},${me.z.toFixed(2)},${me.yaw.toFixed(2)}`;
  if (k === lastPos) return; lastPos = k; BK.send({ type: 'pos', x: me.x, z: me.z, ry: me.yaw });
}

// ---------- loop ----------
let prev = performance.now(), spawned = false;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

BK.onRender = () => { syncAvatars(); syncHitmen(); drawTVs(); if (active() && !spawned) { spawned = true; const S = BK.S; const me_ = S.players.find((p) => p.id === S.you); me.x = -3 + (me_ ? me_.color : 0) * 1.2; me.z = 2; me.yaw = 0; me.pitch = 0; } if (!active()) spawned = false; };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  const on = active(); cross.style.display = on && !BK.ui.open ? 'block' : 'none';
  if (!on) { promptEl.classList.add('hidden'); return; }
  move(dt); netSend(now);
  camera.position.set(me.x, EYE + Math.sin(now / 180) * (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD ? 0.03 : 0), me.z);
  camera.rotation.set(me.pitch, me.yaw, 0);
  for (const a of avatars.values()) {
    a.g.position.x += (a.tx - a.g.position.x) * Math.min(1, dt * 10); a.g.position.z += (a.tz - a.g.position.z) * Math.min(1, dt * 10);
    a.g.rotation.y += (a.try - a.g.rotation.y) * Math.min(1, dt * 10);
  }
  hitmen.forEach((h, i) => {
    const tx = Math.sin(now / 1500 + h.ph) * 4, tz = ROOM.z - 4 + Math.cos(now / 1900 + h.ph) * 2;
    h.g.position.x += (tx - h.g.position.x) * dt * 0.8; h.g.position.z += (tz - h.g.position.z) * dt * 0.8;
    h.g.lookAt(me.x, 0, me.z); h.flash = Math.max(0, h.flash - dt * 4);
    h.g.position.y = Math.abs(Math.sin(now / 250 + h.ph)) * 0.08; h.g.scale.setScalar(1 + h.flash * 0.25);
  });
  if (BK.sal) BK.sal.rotation.y = Math.atan2(me.x - 9.5, me.z + 5.5) * 0.4;
  const st = nearest();
  if (st && !BK.ui.open && !mgOpen()) { promptEl.textContent = st.text; promptEl.classList.remove('hidden'); } else promptEl.classList.add('hidden');
  if (!st && !BK.ui.open && !mgOpen() && document.pointerLockElement !== canvas) { promptEl.textContent = 'Click to look around'; promptEl.classList.remove('hidden'); }
  renderer.render(scene, camera);
}
window.__dbg = { renderer, scene, camera, me }; requestAnimationFrame(frame);
