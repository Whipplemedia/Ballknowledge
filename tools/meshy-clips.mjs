// Meshy animation GLBs (animated on the Bub rig) -> a compact clips file people.js reads (addClips with 'fps' clips):
// per clip { dur, fps: 30, rest: {bone: quat}, hip0, tracks: {bone: {q: [x,y,z,w,...], p?: [x,y,z,...]}} }, values to 3 decimals.
// Usage: node tools/meshy-clips.mjs <out.json> <file.glb> <SrcName=clipName,...> [<file.glb> <map>...]   (merges into out.json)
// Needs @gltf-transform/core (GT_CORE env, default /tmp/gt/node_modules/@gltf-transform/core/dist/index.js).
import fs from 'fs';
const { NodeIO } = await import(process.env.GT_CORE || '/tmp/gt/node_modules/@gltf-transform/core/dist/index.js');
const [out, ...args] = process.argv.slice(2), FPS = 30, r3 = (v) => Math.round(v * 1e3) / 1e3, r4 = (v) => Math.round(v * 1e4) / 1e4;
const clips = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {}, io = new NodeIO();
const slerp = (a, b, k) => { const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = d < 0 ? -1 : 1, o = a.map((v, i) => v * (1 - k) + s * b[i] * k), n = Math.hypot(...o); return o.map((v) => v / n); };
function sample(sampler, t, n) { // linear (slerp for quaternions) at time t
  const ti = sampler.getInput().getArray(), vo = sampler.getOutput().getArray(); let i = 0; while (i < ti.length - 2 && ti[i + 1] < t) i++;
  const j = Math.min(i + 1, ti.length - 1), k = ti[j] > ti[i] ? Math.min(1, Math.max(0, (t - ti[i]) / (ti[j] - ti[i]))) : 0;
  const a = Array.from(vo.slice(i * n, i * n + n)), b = Array.from(vo.slice(j * n, j * n + n));
  return n === 4 ? slerp(a, b, k) : a.map((v, m) => v + (b[m] - v) * k);
}
for (let a = 0; a < args.length; a += 2) {
  const doc = await io.read(args[a]), map = Object.fromEntries(args[a + 1].split(',').map((s) => s.split('=')));
  for (const anim of doc.getRoot().listAnimations()) {
    const name = map[anim.getName()] || map['*']; if (!name) continue;
    let dur = 0; for (const s of anim.listSamplers()) { const ti = s.getInput().getArray(); dur = Math.max(dur, ti[ti.length - 1]); }
    const n = Math.round(dur * FPS) + 1, times = Array.from({ length: n }, (_, f) => Math.min(dur, f / FPS)), tracks = {}, rest = {}; let hip0 = 0;
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode(), b = node.getName(), path = ch.getTargetPath(), s = ch.getSampler();
      if (path === 'rotation') { rest[b] = node.getRotation().map(r4); (tracks[b] = tracks[b] || {}).q = times.flatMap((t) => sample(s, t, 4).map(r3)); }
      if (path === 'translation' && b === 'Hips') { hip0 = r4(node.getTranslation()[1]); (tracks[b] = tracks[b] || {}).p = times.flatMap((t) => sample(s, t, 3).map(r3)); }
    }
    clips[name] = { dur: r4(dur), fps: FPS, rest, hip0, tracks }; console.log(name, '<-', anim.getName(), 'dur', r4(dur), 'bones', Object.keys(tracks).length);
  }
}
fs.writeFileSync(out, JSON.stringify(clips)); console.log(out, (fs.statSync(out).size / 1024).toFixed(0), 'KB,', Object.keys(clips).length, 'clips');
