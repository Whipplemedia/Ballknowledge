import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Shared GLTF loader for the meshopt-compressed models (EXT_meshopt_compression + WebP textures), and the loading bar:
// every model goes through THREE.DefaultLoadingManager, so its progress drives #loadbar until the bar is ready.
export function gltfLoader() { const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); return l; }

const M = THREE.DefaultLoadingManager;
const show = (done, total) => {
  window.__load = { done, total };
  const el = document.getElementById('loadbar'); if (!el) return;
  const pct = total ? Math.round((done / total) * 100) : 0; el.querySelector('i').style.width = pct + '%'; el.querySelector('span').textContent = `Loading the bar... ${pct}%`;
};
M.onStart = (url, done, total) => show(done, total);
M.onProgress = (url, done, total) => show(done, total);
M.onError = (url) => console.warn('Could not load', url);
