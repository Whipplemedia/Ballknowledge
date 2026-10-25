import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Static AI-generated props (public/models/props/<name>.glb, made via Meshy, see blender/meshy_tasks.json).
// Everything is optional: callers check hasProp() and fall back to their procedural meshes.
const NAMES = ['stool', 'booth', 'tv', 'terminal', 'pin', 'ball', 'return', 'bag', 'lamp', 'pool', 'cornboard'];
const SRC = {};
if (typeof location !== 'undefined' && !/[?&]props=0/.test(location.search)) {
  const loader = new GLTFLoader();
  await Promise.all(NAMES.map((n) => loader.loadAsync('models/props/' + n + '.glb').then((g) => { SRC[n] = g.scene; }).catch(() => {})));
}
export const hasProp = (n) => !!SRC[n];

// Returns a Group whose origin is the bottom-centre (anchor 'bottom') or centre (anchor 'center') of the prop,
// scaled so its bounding box is w x h x d (any may be null: it then follows the first given dimension uniformly).
export function prop(name, { w = null, h = null, d = null, rotY = 0, rotX = 0, anchor = 'bottom', shadow = true } = {}) {
  const inner = SRC[name].clone(true), rot = new THREE.Group(), g = new THREE.Group();
  rot.rotation.set(rotX, rotY, 0, 'YXZ'); rot.add(inner); g.add(rot); g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g), s = b.getSize(new THREE.Vector3());
  const k = (w ?? h ?? d) / (w != null ? s.x : h != null ? s.y : s.z);
  rot.scale.set(w != null ? w / s.x : k, h != null ? h / s.y : k, d != null ? d / s.z : k); g.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(g), c = b2.getCenter(new THREE.Vector3());
  rot.position.set(-c.x, anchor === 'bottom' ? -b2.min.y : -c.y, -c.z);
  if (shadow) g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
