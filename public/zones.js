import * as THREE from 'three';

// ---------- zone culling + a fixed light pool (performance) ----------
// three.js draws everything inside the view frustum, walls or not, and every lit material evaluates every light in the scene.
// So static things are tagged by where they stand, each zone on its own camera layer: the bar, the restroom, the street and
// the gas-station lot ("out"), and the store's interior. Each frame the camera only sees the zones it could: its own, plus the one past
// a doorway when that doorway is in view (the bar's two doors only while they're open). Layer 0 (players, goons, thrown bottles, the
// doors themselves, anything straddling two zones) is always drawn. Shadows go by the camera's layers too, so hidden zones cast nothing.
// The scene's point lights become "virtual": they keep their own position/colour/intensity (blackouts, the party light and cutscenes
// still drive them), but only a pool of POOL (10) real lights is ever on, fed from the strongest ones nearby in visible zones and crossfaded.
// The light count never changes, so shaders never recompile when you walk through a door.
export const ZL = { bar: 1, out: 2, store: 3, rest: 4 };
const POOL = 10;

export function createZones({ scene, camera, bar: barBox, rest: restBox, store: storeBox, frontDoor, backDoor, storeDoor, frontOpen, backOpen }) {
  const _b = new THREE.Box3(), _v = new THREE.Vector3(), frustum = new THREE.Frustum(), _m = new THREE.Matrix4(), _s = new THREE.Sphere();
  const inside = (b, box, m = 0) => b.min.x >= box.min.x - m && b.max.x <= box.max.x + m && b.min.z >= box.min.z - m && b.max.z <= box.max.z + m;
  const touches = (b, box, m = 0.45) => b.max.x > box.min.x - m && b.min.x < box.max.x + m && b.max.z > box.min.z - m && b.min.z < box.max.z + m; // padded: a zone's walls (and whatever hangs on their outside) stay always-drawn
  const Z = [[barBox, ZL.bar], [restBox, ZL.rest], [storeBox, ZL.store]];
  const zoneOfBox = (b) => {
    for (const [box, z] of Z) if (inside(b, box)) return z;
    return Z.some(([box]) => touches(b, box)) ? 0 : ZL.out; // straddles a wall: always drawn (or split below)
  };
  const zoneOfPoint = (p) => { for (const [box, z] of Z) if (p.x >= box.min.x && p.x <= box.max.x && p.z >= box.min.z && p.z <= box.max.z) return z; return ZL.out; };
  const roots = [];
  const setLayer = (o, l) => o.traverse((c) => { if (!c.isLight && c.userData.zone !== 'all') c.layers.set(l); });
  // tag(o): o and everything under it, by its world bounding box; a group that straddles zones is split into its children
  function tag(o) {
    if (o.isLight || o.isCamera || o.userData.zone === 'all') return;
    _b.setFromObject(o); if (_b.isEmpty()) return;
    const z = zoneOfBox(_b);
    if (z) { setLayer(o, z); o.userData.zoneL = z; roots.push(o); return; }
    for (const c of o.children) tag(c);
  }
  // children added under a tagged root later (cosmetics arriving, a held glass) pick up its layer
  let propT = 0;
  const propagate = () => { for (const r of roots) { const z = r.userData.zoneL; r.traverse((c) => { if (!c.isLight && c.userData.zone !== 'all' && c.layers.mask !== 1 << z) c.layers.set(z); }); } };

  // ---- light pool ----
  const virt = []; const pool = [];
  function initLights() {
    scene.updateMatrixWorld(true);
    scene.traverse((o) => { if (o.isPointLight && !o.userData.pool) virt.push({ l: o, base: o.intensity, z: zoneOfPoint(o.getWorldPosition(new THREE.Vector3())), p: new THREE.Vector3(), slot: null, score: 0 }); });
    for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); l.userData.pool = true; l.userData.noDim = true; scene.add(l); pool.push({ l, v: null, w: 0 }); }
    for (const v of virt) v.l.visible = false; // the count of lights the shaders see is now fixed: POOL + the spot + the hemisphere
  }
  let pickT = 0;
  function updateLights(dt, mask) {
    if ((pickT -= dt) <= 0) { pickT = 0.25; const c = camera.position;
      for (const v of virt) { v.l.getWorldPosition(v.p); const on = mask & (1 << v.z), I = v.l.intensity; const d2 = v.p.distanceToSquared(c), reach = (v.l.distance || 20) + 8;
        v.score = !on || I < 0.01 || d2 > reach * reach ? 0 : Math.max(I, v.base) / (1 + d2 * 0.05) * (v.slot ? 1.3 : 1); } // already-on lights are sticky (no flicker between two equal lamps)
      const want = virt.filter((v) => v.score > 0).sort((a, b) => b.score - a.score).slice(0, POOL); const set = new Set(want);
      for (const s of pool) if (s.v && !set.has(s.v)) s.drop = true; else s.drop = false;
      for (const v of want) if (!v.slot) { const s = pool.find((q) => !q.v); if (s) { s.v = v; v.slot = s; s.w = 0; s.drop = false; } } } // a free slot takes it now; otherwise it waits for one to fade out
    for (const s of pool) {
      if (!s.v) continue;
      s.w = s.drop ? s.w - dt * 3.5 : Math.min(1, s.w + dt * 3.5);
      if (s.w <= 0) { s.v.slot = null; s.v = null; s.l.intensity = 0; continue; }
      const v = s.v.l; s.v.l.getWorldPosition(s.l.position); s.l.color.copy(v.color); s.l.distance = v.distance; s.l.decay = v.decay; s.l.intensity = v.intensity * s.w;
    }
  }

  // ---- per frame: which zones the camera can see ----
  const fd = new THREE.Vector3(frontDoor.x, 1.2, frontDoor.z), bd = new THREE.Vector3(backDoor.x, 1.2, backDoor.z), sd = new THREE.Vector3(storeDoor.x, 1.5, storeDoor.z);
  const seen = (p, r) => frustum.intersectsSphere(_s.set(p, r));
  const api = { mask: 0xffff, barOn: true,
    tagAll() { for (const c of [...scene.children]) tag(c); initLights(); },
    tag,
    update() {
      const now = performance.now(), dt = Math.min(0.5, Math.max(0, (now - (api.last || now)) / 1000)); api.last = now; // own clock: the loop's dt can come in negative on its first frames
      camera.updateMatrixWorld(); frustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const p = camera.position, z = zoneOfPoint(p), nearF = p.distanceTo(fd) < 1.7, nearB = p.distanceTo(bd) < 1.5, nearS = p.distanceTo(sd) < 2.0;
      const fThru = frontOpen() && seen(fd, 1.8), bThru = backOpen() && seen(bd, 1.6), sSee = seen(sd, 2.4); // a doorway you can see through
      const bar = z === ZL.bar || nearF || nearB || fThru || (z === ZL.rest && bThru);
      const rest = z === ZL.rest || nearB || (z === ZL.bar && bThru);
      const out = z === ZL.out || nearF || nearS || (z === ZL.bar && fThru) || (z === ZL.store && sSee);
      const store = z === ZL.store || nearS || (out && sSee);
      const mask = 1 | (bar ? 1 << ZL.bar : 0) | (rest ? 1 << ZL.rest : 0) | (out ? 1 << ZL.out : 0) | (store ? 1 << ZL.store : 0);
      camera.layers.mask = api.mask = mask; api.barOn = bar;
      updateLights(dt, mask);
      if ((propT -= dt) <= 0) { propT = 1; propagate(); }
    },
    debug: () => ({ pickT, virt: virt.map((v) => [v.z, +v.score.toFixed(3), !!v.slot]), pool: pool.map((s) => [!!s.v, +s.w.toFixed(2), s.drop]) }),
    allOn() { camera.layers.mask = api.mask = 0xffff; },
  };
  return api;
}
