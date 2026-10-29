// Planar mirrors: the scene rendered again from the camera reflected in the glass (an oblique clip plane cuts away everything
// behind the glass), then projected onto the glass. Only the one you're nearest to and looking at renders, at a modest resolution.
// world.js shows your own body (normally never drawn: you're in first person) and hides your first-person hands for that render only.
import * as THREE from 'three';

const VS = `uniform mat4 textureMatrix; varying vec4 vUv; void main() { vUv = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `uniform sampler2D tDiffuse; uniform vec3 tint; varying vec4 vUv; void main() { vec4 c = texture2DProj(tDiffuse, vUv); gl_FragColor = vec4(c.rgb * tint, 1.0); }`;

export function createMirror({ w, h, res = 512, tint = 0xe8eef2 }) {
  const rt = new THREE.WebGLRenderTarget(res, Math.round(res * h / w), { samples: 2 });
  const textureMatrix = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: rt.texture }, textureMatrix: { value: textureMatrix }, tint: { value: new THREE.Color(tint) } }, vertexShader: VS, fragmentShader: FS });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); // faces +z
  const vcam = new THREE.PerspectiveCamera(), plane = new THREE.Plane(), N = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Vector3(), R = new THREE.Matrix4();
  const look = new THREE.Vector3(), view = new THREE.Vector3(), target = new THREE.Vector3(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), box = new THREE.Box3();
  return {
    mesh,
    // is it worth rendering this frame? (in front of it, close enough, on screen)
    wants(camera, maxDist = 9) {
      mesh.updateMatrixWorld(); P.setFromMatrixPosition(mesh.matrixWorld); C.setFromMatrixPosition(camera.matrixWorld); R.extractRotation(mesh.matrixWorld); N.set(0, 0, 1).applyMatrix4(R);
      if (view.subVectors(C, P).dot(N) <= 0.05) return 0; const d = C.distanceTo(P); if (d > maxDist) return 0;
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv); box.setFromObject(mesh);
      return frustum.intersectsBox(box) ? 1 / (d + 0.1) : 0;
    },
    render(renderer, scene, camera) { // the Reflector recipe (three.js examples), driven by hand so it runs outside the composer
      mesh.updateMatrixWorld(); P.setFromMatrixPosition(mesh.matrixWorld); C.setFromMatrixPosition(camera.matrixWorld); R.extractRotation(mesh.matrixWorld); N.set(0, 0, 1).applyMatrix4(R);
      view.subVectors(P, C); view.reflect(N).negate(); view.add(P);
      R.extractRotation(camera.matrixWorld); look.set(0, 0, -1).applyMatrix4(R).add(C);
      target.subVectors(P, look); target.reflect(N).negate(); target.add(P);
      vcam.position.copy(view); vcam.up.set(0, 1, 0).applyMatrix4(R).reflect(N); vcam.lookAt(target);
      vcam.far = camera.far; vcam.layers.mask = camera.layers.mask; vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(camera.projectionMatrix);
      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse).multiply(mesh.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(N, P); plane.applyMatrix4(vcam.matrixWorldInverse); clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const e = vcam.projectionMatrix.elements; q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]); clip.multiplyScalar(2 / clip.dot(q));
      e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
      const prevRT = renderer.getRenderTarget(), prevXr = renderer.xr.enabled, prevShadow = renderer.shadowMap.autoUpdate, prevNeed = renderer.shadowMap.needsUpdate;
      mesh.visible = false; renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false; // reuse this frame's shadows
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, vcam);
      renderer.setRenderTarget(prevRT); renderer.xr.enabled = prevXr; renderer.shadowMap.autoUpdate = prevShadow; renderer.shadowMap.needsUpdate = prevNeed; mesh.visible = true;
    },
  };
}
