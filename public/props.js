import * as THREE from 'three';
import { gltfLoader } from './loading.js';

// Static AI-generated props (public/models/props/<name>.glb, made via Meshy, see blender/meshy_tasks.json).
// Everything is optional: callers check hasProp() and fall back to their procedural meshes.
const NAMES = ['stool', 'booth', 'tv', 'terminal', 'pin', 'ball', 'return', 'bag', 'lamp', 'pool', 'cornboard', 'backbar', 'jerseyframe', 'jukebox', 'couch', 'counter'];
const SRC = {};
if (typeof location !== 'undefined' && !/[?&]props=0/.test(location.search)) {
  const loader = gltfLoader();
  await Promise.all(NAMES.map((n) => loader.loadAsync('models/props/' + n + '.glb').then((g) => { SRC[n] = g.scene; }).catch(() => {})));
}
export const hasProp = (n) => !!SRC[n];

// Returns a Group whose origin is the bottom-centre (anchor 'bottom') or centre (anchor 'center') of the prop,
// scaled so its bounding box is w x h x d (any may be null: it then follows the first given dimension uniformly).
// keep only the triangles whose centroid passes keep(x, y, z) in the model's own space (non-indexed copy so bounding boxes shrink too)
function cropTris(root, keep) {
  root.traverse((o) => {
    if (!o.isMesh) return; const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, idx = g.index, n = idx ? idx.count : pos.count;
    const P = [], N = [], U = [];
    for (let t = 0; t < n; t += 3) {
      const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3, cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (!keep(cx, cy, cz)) continue;
      for (const v of [a, b, c]) { P.push(pos.getX(v), pos.getY(v), pos.getZ(v)); if (nor) N.push(nor.getX(v), nor.getY(v), nor.getZ(v)); if (uv) U.push(uv.getX(v), uv.getY(v)); }
    }
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); if (nor) ng.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); if (uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); o.geometry = ng;
  });
}
export function prop(name, { w = null, h = null, d = null, rotY = 0, rotX = 0, anchor = 'bottom', shadow = true, crop = null } = {}) {
  const inner = SRC[name].clone(true); if (crop) cropTris(inner, crop);
  const _unused = null, rot = new THREE.Group(), g = new THREE.Group();
  rot.rotation.set(rotX, rotY, 0, 'YXZ'); rot.add(inner); g.add(rot); g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g), s = b.getSize(new THREE.Vector3());
  const k = (w ?? h ?? d) / (w != null ? s.x : h != null ? s.y : s.z);
  rot.scale.set(w != null ? w / s.x : k, h != null ? h / s.y : k, d != null ? d / s.z : k); g.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(g), c = b2.getCenter(new THREE.Vector3());
  rot.position.set(-c.x, anchor === 'bottom' ? -b2.min.y : -c.y, -c.z);
  g.userData.prop = name;
  if (shadow) g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Props that aren't in view when the bar opens (the restroom, the street, the gas station) load after it: lazyProp() resolves when the
// model is in, then prop() works for it as for any other. place() puts a fitted copy in the scene once it arrives.
const LAZY = {};
export function lazyProp(name) {
  if (!LAZY[name]) LAZY[name] = SRC[name] ? Promise.resolve(true) : (typeof location !== 'undefined' && !/[?&]props=0/.test(location.search) ? gltfLoader().loadAsync('models/props/' + name + '.glb').then((g) => { SRC[name] = g.scene; return true; }).catch(() => false) : Promise.resolve(false));
  return LAZY[name];
}
let placeHook = null; export const onPlace = (f) => { placeHook = f; }; // zones.js tags late arrivals by where they land
export function place(parent, name, opts, x, y, z, then) {
  return lazyProp(name).then((ok) => { if (!ok) return null; const g = prop(name, opts); g.position.set(x, y, z); parent.add(g); if (then) then(g); if (placeHook) { g.updateMatrixWorld(true); placeHook(g); } return g; });
}
