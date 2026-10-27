import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gltfLoader } from './loading.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { jerseyTex, floralTex, buttonShirtTex } from './textures.js';

// ---- authored Blender characters (blender/*.py -> public/models/*.glb). Procedural makePerson() below is the fallback. ----
const AI_NAMES = ['bub', 'bartender', 'sal', 'hitman', 'jock', 'knowItAll', 'gambler', 'chill', 'dieHard', 'rookie', 'gina', 'vinnie', 'ray', 'steve'];
const AI_HEIGHT = { bub: 1.88, bartender: 1.72, sal: 1.8, hitman: 1.95, jock: 1.9, knowItAll: 1.85, gambler: 1.8, chill: 1.86, dieHard: 1.84, rookie: 1.8, gina: 1.7, vinnie: 1.74, ray: 1.9, steve: 1.82 };
const MODEL_NAMES = AI_NAMES.map((n) => n + '_ai');
const MODELS = {};
if (typeof location !== 'undefined' && !/[?&]models=0/.test(location.search)) {
  const loader = gltfLoader();
  await Promise.all(MODEL_NAMES.map((n) => loader.loadAsync('models/' + n + '.glb').then((g) => { MODELS[n] = g.scene; }).catch(() => {})));
}
const TINTED_SHIRT = { jock: 0, knowItAll: 0, dieHard: 0, gambler: 0, sal: 0, hitman: 0, bartender: 0 }; // shirts with baked prints/suits keep their colors
const MODEL_OK = new Set(['skin', 'shirt', 'pants', 'hair', 'hat', 'backpack', 'glasses', 'stache', 'scale', 'hairStyle', 'shorts', 'mouth', 'look', 'number']);
const ROLE_K = { skin2: 0.9, shirt2: 0.92, hat2: 0.78 };

// ---- per-player recolor of the baked AI texture (region masks by color: skin / hair / shirt), cached by key ----
const RECOLOR_CACHE = new Map();
const NOT_SHIRT_BONES = new Set(['LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']); // socks + soles share the shirt's cream color
function buildShirtMask(mesh, N) { // UV-space mask of every triangle except those touching the lower-leg/foot bones
  const g = mesh.geometry, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
  const mc = document.createElement('canvas'); mc.width = mc.height = N; const c = mc.getContext('2d'); c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineWidth = 3;
  const ok = (v) => { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; bi = si.getComponent(v, k); } } return NOT_SHIRT_BONES.has(bones[bi].name); };
  const idx = g.index, n = idx ? idx.count : uv.count;
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, d = idx ? idx.getX(t + 2) : t + 2;
    if ((ok(a) ? 1 : 0) + (ok(b) ? 1 : 0) + (ok(d) ? 1 : 0) >= 1) continue;
    c.beginPath(); c.moveTo(uv.getX(a) * N, uv.getY(a) * N); c.lineTo(uv.getX(b) * N, uv.getY(b) * N); c.lineTo(uv.getX(d) * N, uv.getY(d) * N); c.closePath(); c.fill(); c.stroke();
  }
  const dd = c.getImageData(0, 0, N, N).data, out = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) out[i] = dd[i * 4] > 128 ? 1 : 0; return out;
}
function recolorTexture(srcTex, { shirt, skin, hair }, shirtMask) {
  const key = [srcTex.uuid, shirt, skin, hair, shirtMask ? 1 : 0].join('|'); if (RECOLOR_CACHE.has(key)) return RECOLOR_CACHE.get(key);
  const N = 1024, cv = document.createElement('canvas'); cv.width = cv.height = N; const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(srcTex.image, 0, 0, N, N); const im = cx.getImageData(0, 0, N, N), d = im.data;
  const T = (c) => (c == null ? null : [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);
  const tS = T(shirt), tK = T(skin), tH = T(hair); const BASE = { skin: 0.762, hair: 0.172, shirt: 0.774 };
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx > 0 ? (mx - mn) / mx : 0, dd = Math.max(mx - mn, 1e-6);
    let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h *= 60; if (h < 0) h += 360;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b; let t = null, base = 1;
    if (tK && sat > 0.30 && mx > 0.62 && h > 5 && h < 40) { t = tK; base = BASE.skin; }
    else if (tH && mx < 0.40 && sat > 0.35 && h > 5 && h < 40) { t = tH; base = BASE.hair; }
    else if (tS && (!shirtMask || shirtMask[i >> 2]) && sat > 0.07 && sat <= 0.30 && mx > 0.55 && mx < 0.95 && h > 10 && h < 50) { t = tS; base = BASE.shirt; }
    if (!t) continue;
    const k = Math.min(1.6, lum / base);
    d[i] = Math.min(255, t[0] * k * 255); d[i + 1] = Math.min(255, t[1] * k * 255); d[i + 2] = Math.min(255, t[2] * k * 255);
  }
  cx.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.flipY = srcTex.flipY; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = srcTex.anisotropy; tex.wrapS = srcTex.wrapS; tex.wrapT = srcTex.wrapT;
  RECOLOR_CACHE.set(key, tex); return tex;
}


// ---- crowd variants for the other AI characters: hue-rotate clothing triangles (by bone) and retone skin ----
const CLOTH_BONES = new Set(['Hips', 'Spine', 'Spine01', 'Spine02', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']);
function buildBoneMask(mesh, N, set) {
  const g = mesh.geometry, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
  const mc = document.createElement('canvas'); mc.width = mc.height = N; const c = mc.getContext('2d'); c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineWidth = 3;
  const ok = (v) => { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; bi = si.getComponent(v, k); } } return set.has(bones[bi].name); };
  const idx = g.index, n = idx ? idx.count : uv.count;
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, d = idx ? idx.getX(t + 2) : t + 2;
    if ((ok(a) ? 1 : 0) + (ok(b) ? 1 : 0) + (ok(d) ? 1 : 0) < 2) continue;
    c.beginPath(); c.moveTo(uv.getX(a) * N, uv.getY(a) * N); c.lineTo(uv.getX(b) * N, uv.getY(b) * N); c.lineTo(uv.getX(d) * N, uv.getY(d) * N); c.closePath(); c.fill(); c.stroke();
  }
  const dd = c.getImageData(0, 0, N, N).data, out = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) out[i] = dd[i * 4] > 128 ? 1 : 0; return out;
}
function recolorNpc(srcTex, key, { hue, skin }, clothMask) {
  if (RECOLOR_CACHE.has(key)) return RECOLOR_CACHE.get(key);
  const N = 1024, cv = document.createElement('canvas'); cv.width = cv.height = N; const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(srcTex.image, 0, 0, N, N); const im = cx.getImageData(0, 0, N, N), d = im.data;
  const tK = skin == null ? null : [((skin >> 16) & 255) / 255, ((skin >> 8) & 255) / 255, (skin & 255) / 255];
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx > 0 ? (mx - mn) / mx : 0, dd = Math.max(mx - mn, 1e-6);
    let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h *= 60; if (h < 0) h += 360;
    const isSkin = sat > 0.28 && mx > 0.62 && h > 5 && h < 40;
    if (isSkin) { if (tK) { const k = Math.min(1.6, (0.299 * r + 0.587 * g + 0.114 * b) / 0.762); d[i] = Math.min(255, tK[0] * k * 255); d[i + 1] = Math.min(255, tK[1] * k * 255); d[i + 2] = Math.min(255, tK[2] * k * 255); } continue; }
    if (hue && clothMask[i >> 2] && sat > 0.2 && mx > 0.12) { // rotate hue, keep value/saturation
      const nh = (h + hue) % 360, c = mx * sat, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = mx - c; let rr = 0, gg = 0, bb = 0;
      if (nh < 60) { rr = c; gg = x; } else if (nh < 120) { rr = x; gg = c; } else if (nh < 180) { gg = c; bb = x; } else if (nh < 240) { gg = x; bb = c; } else if (nh < 300) { rr = x; bb = c; } else { rr = c; bb = x; }
      d[i] = (rr + m) * 255; d[i + 1] = (gg + m) * 255; d[i + 2] = (bb + m) * 255;
    }
  }
  cx.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.flipY = srcTex.flipY; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = srcTex.anisotropy; tex.wrapS = srcTex.wrapS; tex.wrapT = srcTex.wrapT;
  RECOLOR_CACHE.set(key, tex); return tex;
}


// ---- Meshy walk/run clips (public/models/clips.json): rotation tracks per bone, retargeted onto each character's own rest pose ----
const CLIPS = {};
if (typeof location !== 'undefined' && !/[?&]clips=0/.test(location.search)) {
  try {
    const j = await (await fetch('models/clips.json')).json(), q = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
    const srcInv = {}; for (const k in j.rest) srcInv[k] = q(j.rest[k]).invert();
    for (const name in j) { // walk/run (Bub's rig) + fight/gesture clips (the hitman's rig): each clip may carry its own rest pose
      if (name === 'rest') continue; const c = j[name], inv = {}; if (c.rest) for (const k in c.rest) inv[k] = q(c.rest[k]).invert();
      const tr = {}; for (const b in c.tracks) { const t = c.tracks[b]; if (!t.q) continue; tr[b] = { t: t.t, q: t.q, srcInv: (c.rest ? inv[b] : srcInv[b]) || new THREE.Quaternion() }; }
      const hp = c.tracks.Hips && c.tracks.Hips.p ? c.tracks.Hips.p : null, hy = []; if (hp) for (let i = 1; i < hp.length; i += 3) hy.push(hp[i]);
      CLIPS[name] = { dur: c.dur, tr, hy, hmean: hy.length ? hy.reduce((a, b) => a + b, 0) / hy.length : 0, hip0: c.hip0 || 0 };
    }
  } catch { /* clips are optional */ }
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qd = new THREE.Quaternion();
function sampleBone(clip, bone, time, out) { // out <- local rotation delta relative to the clip's own rest pose
  const tr = clip.tr[bone]; if (!tr) return false; const T = tr.t, n = T.length, u = ((time % clip.dur) + clip.dur) % clip.dur;
  let i = Math.min(n - 2, Math.max(0, Math.floor(u / (T[n - 1] / (n - 1))))); while (i < n - 2 && T[i + 1] < u) i++; while (i > 0 && T[i] > u) i--;
  const f = Math.min(1, Math.max(0, (u - T[i]) / Math.max(1e-6, T[i + 1] - T[i])));
  _qa.set(tr.q[i * 4], tr.q[i * 4 + 1], tr.q[i * 4 + 2], tr.q[i * 4 + 3]); _qb.set(tr.q[(i + 1) * 4], tr.q[(i + 1) * 4 + 1], tr.q[(i + 1) * 4 + 2], tr.q[(i + 1) * 4 + 3]);
  out.copy(_qa).slerp(_qb, f); out.premultiply(tr.srcInv); return true;
}
function sampleHipY(clip, time) { if (!clip.hy.length) return 0; if (clip.hip0) { const n = clip.hy.length, u = Math.min(1, Math.max(0, time / clip.dur)) * (n - 1), i = Math.floor(u), f = u - i; return (clip.hy[i] * (1 - f) + clip.hy[Math.min(n - 1, i + 1)] * f - clip.hip0) / clip.hip0; } /* fraction of hip height (gestures/knockdown) */ const n = clip.hy.length, u = (((time % clip.dur) + clip.dur) % clip.dur) / clip.dur * (n - 1), i = Math.floor(u), f = u - i; return (clip.hy[i] * (1 - f) + clip.hy[Math.min(n - 1, i + 1)] * f - clip.hmean) * 0.01; }

// ---- Meshy (AI-generated) skinned characters: public/models/<name>_ai.glb, Mixamo-style skeleton ----
const Q0 = new THREE.Quaternion(), V_DOWN = new THREE.Vector3(0, -1, 0);
const qAlign = (from, to) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
const qSlerp0 = (q, k) => Q0.clone().slerp(q, k);
const qEuler = (o) => new THREE.Quaternion().setFromEuler(o.rotation);
const qAxisX = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
function fromSkinned(src, name, over) {
  const rig = SkeletonUtils.clone(src), outer = new THREE.Group(), inner = new THREE.Group();
  inner.rotation.y = Math.PI; inner.add(rig); outer.add(inner);
  const B = {}; let skinned = null;
  rig.traverse((o) => { if (o.isBone) B[o.name] = o; if (o.isSkinnedMesh) { skinned = o; o.frustumCulled = false; o.castShadow = true; } });
  const need = ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  if (!skinned || need.some((n) => !B[n])) return null;
  outer.updateMatrixWorld(true);
  // scale to game height (~1.9) and stand on the floor
  const box = new THREE.Box3().setFromObject(skinned), sc = (AI_HEIGHT[name] || 1.88) / (box.max.y - box.min.y);
  inner.scale.setScalar(sc); inner.position.y = -box.min.y * sc; outer.updateMatrixWorld(true);
  const wq = (b) => b.getWorldQuaternion(new THREE.Quaternion()), wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const rest = {}; for (const n in B) { rest[n] = wq(B[n]); B[n].userData.restQ = B[n].quaternion.clone(); }
  const dir = (a, b) => wp(B[b]).sub(wp(B[a]));
  const idle = {};
  for (const sd of ['Left', 'Right']) {
    idle[sd + 'Arm'] = qAlign(dir(sd + 'Arm', sd + 'ForeArm'), V_DOWN).multiply(rest[sd + 'Arm']);
    idle[sd + 'ForeArm'] = qAlign(dir(sd + 'ForeArm', sd + 'Hand'), V_DOWN).multiply(rest[sd + 'ForeArm']);
    idle[sd + 'UpLeg'] = qAlign(dir(sd + 'UpLeg', sd + 'Leg'), V_DOWN).multiply(rest[sd + 'UpLeg']);
    idle[sd + 'Leg'] = qAlign(dir(sd + 'Leg', sd + 'Foot'), V_DOWN).multiply(rest[sd + 'Leg']);
  }
  const S = { ...PRESETS.bub, ...over }; const P = { group: outer, phase: Math.random() * 6, spec: S, model: true, skinned: true, bones: B };
  // invisible pivots in the same layout as the procedural rig: animate() drives them, the skeleton follows, cosmetics attach to them
  const mk = (x, y, z, par = outer) => { const o = new THREE.Object3D(); o.position.set(x, y, z); par.add(o); return o; };
  const hp = (n) => wp(B[n]); const hips = hp('Hips');
  P.legs = [mk(hp('LeftUpLeg').x, hp('LeftUpLeg').y, 0), mk(hp('RightUpLeg').x, hp('RightUpLeg').y, 0)];
  P.arms = [mk(hp('LeftArm').x, hp('LeftArm').y, 0), mk(hp('RightArm').x, hp('RightArm').y, 0)];
  P.hipY = hips.y; const hd = hp('Head'); P.head = mk(0, hd.y + 0.08, 0); P.torso = mk(0, (hips.y + hp('Spine02').y) / 2, 0);
  const ID = new THREE.Quaternion(), rootWorld = {}; // world quat of the nodes above the hips
  const up = B.Hips.parent; const upW = up ? wq(up) : ID;
  const order = []; rig.traverse((o) => { if (o.isBone) order.push(o); });
  const arms = { Left: P.arms[0], Right: P.arms[1] }, legs = { Left: P.legs[0], Right: P.legs[1] };
  P.skinUpdate = () => {
    const cur = new Map(); if (up) cur.set(up, upW);
    const dT = qEuler(P.torso), dH = qEuler(P.head);
    const put = (b, W) => { const pw = cur.get(b.parent) || ID; b.quaternion.copy(pw.clone().invert().multiply(W)); cur.set(b, W); };
    const keep = (b) => { const pw = cur.get(b.parent) || ID; b.quaternion.copy(b.userData.restQ); cur.set(b, pw.clone().multiply(b.userData.restQ)); };
    const chainArm = (sd) => {
      const a = arms[sd], dA = qEuler(a), D = dT.clone().multiply(dA), raise = Math.max(0, a.rotation.x - 0.6);
      const flex = a.userData.flex ?? (0.22 + Math.min(1.9, raise * 1.2)); // seated.js sets an explicit elbow bend
      put(B[sd + 'Arm'], D.clone().multiply(idle[sd + 'Arm']));
      const Wf = D.clone().multiply(qAxisX(flex)).multiply(idle[sd + 'ForeArm']); put(B[sd + 'ForeArm'], Wf);
      put(B[sd + 'Hand'], Wf.clone().multiply(rest[sd + 'ForeArm'].clone().invert().multiply(rest[sd + 'Hand'])));
    };
    const chainLeg = (sd) => {
      const l = legs[sd], dL = qEuler(l), x = l.rotation.x, phi = x > 0.8 ? x : Math.max(0, -x) * 0.9;
      put(B[sd + 'UpLeg'], dL.clone().multiply(idle[sd + 'UpLeg']));
      put(B[sd + 'Leg'], dL.clone().multiply(qAxisX(-phi)).multiply(idle[sd + 'Leg']));
      put(B[sd + 'Foot'], rest[sd + 'Foot']); if (B[sd + 'ToeBase']) put(B[sd + 'ToeBase'], rest[sd + 'ToeBase']);
    };
    for (const b of order) {
      const n = b.name;
      if (n === 'Spine') put(b, qSlerp0(dT, 1 / 3).multiply(rest[n])); else if (n === 'Spine01') put(b, qSlerp0(dT, 2 / 3).multiply(rest[n])); else if (n === 'Spine02') put(b, dT.clone().multiply(rest[n]));
      else if (n === 'neck') put(b, dT.clone().multiply(rest[n])); else if (n === 'Head') put(b, dT.clone().multiply(dH).multiply(rest[n]));
      else if (n === 'LeftArm') chainArm('Left'); else if (n === 'RightArm') chainArm('Right');
      else if (n === 'LeftUpLeg') chainLeg('Left'); else if (n === 'RightUpLeg') chainLeg('Right');
      else if (/ForeArm$|Hand$|Leg$|Foot$|ToeBase$/.test(n) && cur.has(b)) continue;
      else if (!cur.has(b)) keep(b);
    }
    if (P.clipW > 0.001 && CLIPS[P.clipName]) { // blend in the authored walk/run clip on top of the procedural pose
      const clip = CLIPS[P.clipName];
      for (const b of order) { if (!sampleBone(clip, b.name, P.clipT, _qd)) continue; b.quaternion.slerp(_qd.premultiply(b.userData.restQ), P.clipW); }
      inner.position.y = P.bobBase + sampleHipY(clip, P.clipT) * (P.hipY || 1) * P.clipW;
    } else inner.position.y = P.bobBase;
  };
  // Bub's texture is split into flat color regions, so skin / hair / shirt can be recolored per player. Other characters keep their art (only a faint crowd tint).
  if (name === 'bub' && (over.shirt != null || over.skin != null || over.hair != null)) {
    const cl = new Map(); rig.traverse((o) => { if (!o.isMesh || !o.material.map) return; if (!cl.has(o.material)) { const m = o.material.clone(); if (o.isSkinnedMesh && !src.userData.shirtMask) src.userData.shirtMask = buildShirtMask(o, 1024); m.map = recolorTexture(o.material.map, over, src.userData.shirtMask); cl.set(o.material, m); } o.material = cl.get(o.material); });
  } else if (over.hue != null || (over.crowdSkin != null)) {
    const cl = new Map(); rig.traverse((o) => { if (!o.isMesh || !o.material.map) return; if (!cl.has(o.material)) { const m = o.material.clone(); if (o.isSkinnedMesh && !src.userData.clothMask) src.userData.clothMask = buildBoneMask(o, 1024, CLOTH_BONES); m.map = recolorNpc(o.material.map, name + '|' + (over.hue | 0) + '|' + (over.crowdSkin ?? 'x'), { hue: over.hue, skin: over.crowdSkin }, src.userData.clothMask); cl.set(o.material, m); } o.material = cl.get(o.material); });
  } else {
    const vary = over.shirt ?? over.skin;
    if (vary != null) { const tc = new THREE.Color(0xffffff).lerp(new THREE.Color(vary), 0.16); const cl = new Map(); rig.traverse((o) => { if (!o.isMesh) return; if (!cl.has(o.material)) { const m = o.material.clone(); m.color.multiply(tc); cl.set(o.material, m); } o.material = cl.get(o.material); }); }
  }
  P.modelName = name; P.skinMesh = skinned; // Pro Shop outfits repaint Bub's texture (setOutfit)
  if (over.scale) outer.scale.setScalar(over.scale);
  P.bobBase = inner.position.y; P.clipW = 0; P.clipT = 0; P.clipName = 'walk';
  P.skinUpdate();
  return P;
}
function fromModel(name, over) {
  if (MODELS[name + '_ai']) { const ai = fromSkinned(MODELS[name + '_ai'], name, over); if (ai) return ai; }
  const src = MODELS[name]; if (!src) return null;
  for (const k of Object.keys(over)) if (!MODEL_OK.has(k)) return null;
  if (over.hat && Object.keys(over.hat).some((k) => k !== 'color' && k !== 'backwards')) return null;
  const rig = src.clone(true), g = new THREE.Group(); g.add(rig);
  const S = { ...PRESETS[name], ...over };
  const find = (n) => rig.getObjectByName(n);
  const P = { group: g, legs: [find('legL'), find('legR')], arms: [find('armL'), find('armR')], head: find('head'), torso: find('torso'), phase: Math.random() * 6, spec: S, model: true };
  if (P.legs.some((x) => !x) || P.arms.some((x) => !x) || !P.head || !P.torso) return null;
  const tint = {}; // role -> hex
  if (over.skin != null) tint.skin = over.skin; if (over.hair != null) tint.hair = over.hair;
  if (over.shirt != null && !(name in TINTED_SHIRT)) tint.shirt = over.shirt;
  if (over.pants != null && ['chill', 'rookie', 'bartender'].includes(name)) tint.pants = over.pants;
  if (over.hat && over.hat.color != null) tint.hat = over.hat.color;
  const cl = new Map();
  const hide = (pre, on) => { if (on) return; rig.traverse((o) => { if (o.name.startsWith(pre)) o.visible = false; }); };
  hide('hat_', over.hat !== null); hide('pack_', over.backpack !== false); hide('glasses_', over.glasses !== false); hide('stache_', over.stache !== false);
  if (over.hat !== null && S.hat) hide('hairtop_', false);
  rig.traverse((o) => {
    if (!o.isMesh) return; o.castShadow = true;
    const role = (o.material.name || '').split('_')[0], base = role.replace(/2$/, '');
    if (tint[base] == null) return;
    const key = o.material.uuid; if (!cl.has(key)) { const m = o.material.clone(); m.color.set(tint[base]).multiplyScalar(ROLE_K[role] ?? 1); cl.set(key, m); }
    o.material = cl.get(key);
  });
  g.scale.setScalar(S.scale ?? 1);
  return P;
}

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
  // named regulars (Meshy models; the procedural fallback is only used if a model fails to load)
  gina: { skin: SK.tan, hair: 0x5a3018, hairStyle: 'long', female: true, outfit: 'tank', shirt: 0x7a1e26, pants: 0x3a4458, mouth: 'smile' },
  vinnie: { skin: SK.light, hair: 0x9a9a9a, hairStyle: 'short', outfit: 'hoodie', shirt: 0x1f6f6a, pants: 0x1f6f6a, stache: true, mouth: 'flat' },
  ray: { skin: SK.brown, hair: 0x1a1210, hairStyle: 'short', beard: 'full', outfit: 'jersey', shirt: 0x1f6a34, number: '33', pants: 0x1f6a34, mouth: 'grin' },
  steve: { skin: SK.light, hair: 0x7a5a32, hairStyle: 'messy', beard: 'stubble', outfit: 'tee', shirt: 0x8a3a3a, pants: 0x5a6a8a, fat: true, mouth: 'open' },
  hitman: { skin: SK.light, hair: 0x0a0a0a, hairStyle: 'short', hat: { color: 0x0c0c0e, style: 'fedora' }, outfit: 'suit', shirt: 0x0e0e12, pants: 0x0e0e12, sunglasses: true, mouth: 'flat', scale: 1.06 },
};
const PATRON_BASES = ['jock', 'knowItAll', 'gambler', 'chill', 'dieHard', 'rookie'];
const SHIRTS = [0x2e5aa8, 0xa83232, 0x2f8f5a, 0xc8a02a, 0x7a3fa0, 0xd0702a, 0x2a8a9a, 0x5a5a62];
// Pro Shop outfits (Meshy retextures of Bub, baked to Bub's UV layout): swap the body texture, keeping this player's skin and hair colors. null puts their own shirt back.
export const canWearOutfit = (P) => !!(P && P.skinMesh && P.modelName === 'bub');
export function setOutfit(P, tex) {
  if (!canWearOutfit(P)) return false; const mesh = P.skinMesh;
  if (!P._ownMat) { mesh.material = mesh.material.clone(); P._ownMat = true; P._baseMap = mesh.material.map; }
  const S = P.spec || {}; mesh.material.map = tex ? recolorTexture(tex, { skin: S.skin, hair: S.hair, shirt: null }, null) : P._baseMap; mesh.material.needsUpdate = true; return true;
}
export function makePreset(name, over = {}) { return fromModel(name, over) || makePerson({ ...PRESETS[name], ...over }); }
const HUES = [0, 40, 90, 150, 200, 250, 300, 330, 20, 120], CROWD_SKINS = [0xf6d2b8, 0xe0a478, 0xa8704a, 0x7a5033, 0xf2c09a, 0xc58c5c];
export function randomPatron(i = 0) {
  const base = PRESETS[PATRON_BASES[i % PATRON_BASES.length]], c = SHIRTS[(i * 3 + 1) % SHIRTS.length], sk = Object.values(SK)[(i * 2) % 5];
  const baseName = PATRON_BASES[i % PATRON_BASES.length];
  const hatO = i % 3 === 0 ? { color: SHIRTS[(i + 2) % SHIRTS.length], backwards: i % 2 === 0 } : undefined;
  const mp = fromModel(baseName, { skin: sk, shirt: c, hue: HUES[(i * 5 + 2) % HUES.length], crowdSkin: i % 4 === 0 ? null : CROWD_SKINS[i % CROWD_SKINS.length], ...(hatO ? { hat: hatO } : {}) }); if (mp) return mp;
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
  const reset = () => { aL.userData.flex = aR.userData.flex = null; aL.rotation.y = aR.rotation.y = 0; lL.rotation.z = lR.rotation.z = 0; P.group.position.y = base; P.group.rotation.z = 0; lL.rotation.x = lR.rotation.x = aL.rotation.x = aR.rotation.x = 0; aL.rotation.z = aR.rotation.z = 0; P.head.rotation.set(0, 0, 0); P.torso.rotation.set(0, 0, 0); };
  reset();
  if (mode === 'walk') { const s = Math.sin(ph * 9 * speed) * 0.7 * Math.min(1, speed); lL.rotation.x = s; lR.rotation.x = -s; aL.rotation.x = -s * 0.8; aR.rotation.x = s * 0.8; P.group.position.y = base + Math.abs(Math.sin(ph * 9 * speed)) * 0.03; }
  else if (mode === 'drink') { const c = (Math.sin(ph * 0.7) + 1) / 2, up = c > 0.72 ? (c - 0.72) / 0.28 : 0; aR.rotation.x = -2.2 * up; aR.rotation.z = 0.2 * up; P.head.rotation.x = -0.15 * up; P.head.rotation.y = Math.sin(ph * 0.3) * 0.4; }
  else if (mode === 'polish') { aR.rotation.x = -1.2 + Math.sin(ph * 6) * 0.25; aL.rotation.x = -1.0; P.head.rotation.y = Math.sin(ph * 0.4) * 0.5; }
  else if (mode === 'pool') { const k = Math.sin(ph * 1.4); aR.rotation.x = -1.0 + k * 0.5; aL.rotation.x = -1.2; P.torso.rotation.x = 0.5; P.head.rotation.x = 0.3; }
  else if (mode === 'sit') { lL.rotation.x = lR.rotation.x = 1.45; aL.rotation.x = aR.rotation.x = -0.55; P.head.rotation.y = Math.sin(ph * 0.35) * 0.3; }
  else if (mode === 'seated' && P.sp) { const q = P.sp; aL.rotation.set(q.aLx, q.aLy, q.aLz, 'YXZ'); aR.rotation.set(q.aRx, q.aRy, q.aRz, 'YXZ'); aL.userData.flex = q.aLf; aR.userData.flex = q.aRf; P.torso.rotation.set(q.tx, q.ty, q.tz, 'YXZ'); P.head.rotation.set(q.hx, q.hy, q.hz, 'YXZ'); lL.rotation.x = q.lLx; lR.rotation.x = q.lRx; lL.rotation.z = q.lLz; lR.rotation.z = q.lRz; }
  else if (mode === 'sleep') { P.head.rotation.x = 0.9; P.torso.rotation.x = 0.4; aL.rotation.x = aR.rotation.x = -1.3; }
  else if (mode === 'cheer') { aL.rotation.x = -2.6 + Math.sin(ph * 5) * 0.3; aR.rotation.x = -2.4 + Math.cos(ph * 5) * 0.3; P.group.position.y = base + Math.abs(Math.sin(ph * 5)) * 0.06; }
  else if (mode === 'stagger') { P.group.rotation.z = Math.sin(ph * 1.7) * 0.12; P.head.rotation.z = Math.sin(ph * 1.1) * 0.25; }
  else if (mode === 'fight') { const k = Math.sin(ph * 7); aL.rotation.x = -1.5 * Math.max(0, k) - 0.35; aR.rotation.x = -1.5 * Math.max(0, -k) - 0.35; P.torso.rotation.x = 0.25; P.head.rotation.x = 0.15; P.group.rotation.z = Math.sin(ph * 5) * 0.08; P.group.position.y = base + Math.abs(Math.sin(ph * 7)) * 0.05; lL.rotation.x = Math.sin(ph * 7) * 0.3; lR.rotation.x = -Math.sin(ph * 7) * 0.3; }
  else if (mode === 'point') { aR.rotation.x = -1.5 + Math.sin(ph * 2) * 0.1; P.head.rotation.y = Math.sin(ph * 0.35) * 0.3; }
  else { P.head.rotation.y = Math.sin(ph * 0.35) * 0.35; aR.rotation.x = Math.sin(ph * 0.5) * 0.05; }
  // the gestures above were written with the x-axis sign flipped (arms/torso/head swung backward); flip once here so forward is forward
  aL.rotation.x *= -1; aR.rotation.x *= -1; P.head.rotation.x *= -1; P.torso.rotation.x *= -1;
  if (P.skinned) { // crossfade the authored walk/run clips in and out of the procedural pose
    const dt = Math.min(0.1, Math.max(0, t - (P._lt ?? t))); P._lt = t; const sp = P.moveSpeed ?? speed * 3.5;
    // 'clip:<name>' loops an authored clip, 'once:<name>' plays it from the start once and holds the last frame (knockdown etc.)
    const cm = /^(clip|once):(\w+)$/.exec(mode), auth = cm && CLIPS[cm[2]] ? cm[2] : null;
    const want = auth || (mode === 'walk' && CLIPS.walk ? (sp > 2.4 && CLIPS.run ? 'run' : 'walk') : null);
    if (auth) {
      if (P.clipMode !== mode) { P.clipMode = mode; P.clipName = auth; P.clipT = 0; P.clipW = Math.max(P.clipW, 0.35); }
      P.clipT += dt * (speed || 1); if (cm[1] === 'once') P.clipT = Math.min(P.clipT, CLIPS[auth].dur - 0.001);
    } else if (want) {
      P.clipMode = null;
      if (P.clipName !== want) { P.clipT = P.clipW < 0.05 ? 0 : P.clipT / CLIPS[P.clipName].dur * CLIPS[want].dur; P.clipName = want; }
      P.clipT += dt * (want === 'run' ? Math.min(1.5, Math.max(0.7, sp / 4.2)) : Math.min(1.6, Math.max(0.6, sp / 1.4)));
    }
    if (!want) P.clipMode = null; P.clipW += ((want ? 1 : 0) - P.clipW) * Math.min(1, dt * (auth ? 12 : 9)); if (!want && P.clipW < 0.02) P.clipW = 0;
  }
  if (P.skinUpdate) P.skinUpdate();
}
