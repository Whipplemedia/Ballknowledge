import * as THREE from 'three';
import { makePreset, animate } from './people.js';
import { makeDizzy, headPos } from './dizzy.js';
import { label } from './textures.js';
import { STORY } from './story.js';

// Client view of the bum (server bum.js streams {type:'bum', b} at 10 Hz; b = null when he's gone): smoothed position, a shuffle,
// a reach into your pocket, a stagger when hit, stars when he's been run off, and a "$" tag while he's carrying someone's cash.
// He's a bottle/punch target like Sal's men: list() feeds bottles.js and the punch raycast in world.js (goonId 'bum').
export function createBumView({ scene, audio }) {
  let o = null; const name = (STORY.bum && STORY.bum.name) || 'Dusty';
  function make(x, z) {
    const P = makePreset('bum'); P.group.position.set(x, 0, z); P.group.traverse((c) => { c.userData.goonId = 'bum'; });
    const tag = label(name, '#c8b48a', 0.75); tag.position.y = 2.3; P.group.add(tag);
    const loot = label('💰', '#7dff9a', 0.6); loot.position.y = 2.62; loot.visible = false; P.group.add(loot);
    const say = label('"Hey buddy, got a minute?"', '#ffe9b8', 0.62); say.position.y = 2.62; say.visible = false; P.group.add(say); // the tell: he's coming for somebody
    scene.add(P.group); return { id: 'bum', P, loot, say, lootAmt: 0, dizzy: makeDizzy(scene), tx: x, tz: z, try: 0, state: 'walk', moving: 0, hp: 2 };
  }
  function drop() { if (!o) return; scene.remove(o.P.group); o.dizzy.update(1, 0, null, false); scene.remove(o.dizzy.root); o = null; }
  return {
    onMsg(m) {
      if (!m.b) return drop();
      const [x, z, ry, state, hp, , , moving, hit, loot, smoking] = m.b;
      if (!o) { o = make(x, z); audio.sfx('step', { pos: { x, y: 0.2, z } }); }
      if (hit && hp < o.hp) audio.sfx('punch', { pos: { x, y: 1.3, z } });
      if (state !== o.state && state === 'flee' && loot > 0) audio.sfx('coin', { pos: { x, y: 1.2, z } });
      if (state !== o.state && state === 'run') audio.sfx('boing', { pos: { x, y: 1.4, z } });
      if (state !== o.state && state === 'walk') audio.sfx('murmur', { pos: { x, y: 1.6, z }, v: 0.7 });
      o.say.visible = state === 'walk' && !(loot > 0);
      Object.assign(o, { tx: x, tz: z, try: ry, state, hp, moving, smoking: !!smoking }); // smoking: somebody gave him a cigarette (public/items.js puts it in his mouth)
      if (loot !== o.lootAmt) { o.lootAmt = loot; o.P.group.remove(o.loot); o.loot = label(loot > 0 ? `💰 $${loot}` : '', '#7dff9a', 0.6); o.loot.position.y = 2.62; o.loot.visible = loot > 0; o.P.group.add(o.loot); }
    },
    update(dt, t) {
      if (!o) return;
      const g = o.P.group, k = Math.min(1, dt * 10), px = g.position.x, pz = g.position.z;
      g.position.x += (o.tx - g.position.x) * k; g.position.z += (o.tz - g.position.z) * k;
      let d = o.try - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 8);
      const sp = Math.hypot(g.position.x - px, g.position.z - pz) / Math.max(dt, 0.001); o.P.moveSpeed = sp;
      const mode = o.state === 'grab' ? 'point' : o.state === 'stun' ? 'stagger' : sp > 0.4 ? 'walk' : 'idle';
      animate(o.P, mode, t, Math.min(1.5, sp / 3));
      o.dizzy.update(dt, t, headPos(o.P), o.state === 'stun' || o.state === 'run');
    },
    list() { return o ? [o] : []; },
    get(id) { return id === 'bum' ? o : null; },
  };
}
