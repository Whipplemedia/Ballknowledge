import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const DrunkShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0 }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; uniform float time; varying vec2 vUv;
  void main(){
    float a = amount; vec2 uv = vUv;
    uv += a*0.014*vec2(sin(uv.y*18.0+time*1.8), cos(uv.x*14.0+time*1.4));
    vec2 dir = vec2(sin(time*0.7), cos(time*0.9))*a*0.014;
    vec3 c;
    c.r = texture2D(tDiffuse, uv + dir*1.6).r; c.g = texture2D(tDiffuse, uv).g; c.b = texture2D(tDiffuse, uv - dir*1.6).b;
    vec3 d = texture2D(tDiffuse, uv + vec2(sin(time*0.5)*0.035*a, cos(time*0.4)*0.01*a)).rgb;
    c = mix(c, d, 0.4*smoothstep(0.3, 1.0, a));
    vec2 bl = dir*2.2;
    vec3 b = (texture2D(tDiffuse, uv+bl).rgb + texture2D(tDiffuse, uv-bl).rgb + texture2D(tDiffuse, uv+bl.yx).rgb + texture2D(tDiffuse, uv-bl.yx).rgb)*0.25;
    c = mix(c, b, 0.55*a);
    float v = smoothstep(0.95, 0.25, distance(vUv, vec2(0.5)));
    c *= mix(1.0, 0.5 + 0.5*v, a);
    gl_FragColor = vec4(c, 1.0);
  }`,
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, 1.16);
    c = (c - 0.5) * 1.07 + 0.5; c *= vec3(1.03, 1.0, 0.96);
    float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5))); c *= mix(0.78, 1.0, v);
    gl_FragColor = vec4(c, 1.0); }`,
};
export function createFX(renderer, scene, camera) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.5, 0.92); composer.addPass(bloom);
  const drunk = new ShaderPass(DrunkShader); drunk.enabled = false; composer.addPass(drunk);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));
  return {
    render() { composer.render(); },
    setSize(w, h) { composer.setSize(w, h); bloom.setSize(w, h); },
    setBloom(on) { bloom.enabled = on; },
    setDrunk(a, t) { bloom.strength = 0.38 + a * 0.5; drunk.enabled = a > 0.02; drunk.uniforms.amount.value = a; drunk.uniforms.time.value = t; },
  };
}
