import * as THREE from 'three';
import { makePreset, animate } from './people.js';
import { makeDizzy, headPos } from './dizzy.js';
import { canvasTex } from './textures.js';

// Client view of Sal's muscle (server goons.js streams {type:'goons'} at 10 Hz): smooth positions, clip animations
// (stance / punch / hit reaction / knockdown / taunt / pat-down), a health bar, dizzy stars when stunned or down.
export function createGoonsView({ scene, BK, audio }) {
  const map = new Map(); let msg = null, at = 0;
  const bar = () => { const { c, g, t } = canvasTex(128, 18, () => {}); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false })); s.scale.set(0.7, 0.1, 1); s.renderOrder = 12; return { s, draw(f) { g.clearRect(0, 0, 128, 18); g.fillStyle = '#000b'; g.fillRect(0, 0, 128, 18); g.fillStyle = f > 0.5 ? '#ff4d5e' : f > 0.25 ? '#ff9b3d' : '#ffd04a'; g.fillRect(2, 2, 124 * Math.max(0, f), 14); t.needsUpdate = true; } }; };
  function make(kind, id) {
    const P = makePreset('hitman', kind === 'shake' ? { hue: 0.55 } : {}); P.group.traverse((o) => { o.userData.goonId = id; });
    const hb = bar(); hb.s.position.y = 2.25; P.group.add(hb.s);
    const dt = canvasTex(256, 64, (g) => { g.font = '900 44px system-ui'; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText('DODGED!', 128, 48); g.fillStyle = '#ffd04a'; g.fillText('DODGED!', 128, 48); });
    const dodgeTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: dt.t, depthTest: false, transparent: true, toneMapped: false })); dodgeTag.scale.set(0.9, 0.22, 1); dodgeTag.position.y = 2.5; dodgeTag.renderOrder = 13; dodgeTag.visible = false; P.group.add(dodgeTag);
    scene.add(P.group); return { id, P, kind, hb, dodgeTag, dodgeT: 0, dodgeSide: 1, dizzy: makeDizzy(scene), x: 0, z: 0, ry: 0, tx: 0, tz: 0, try: 0, state: 'enter', hp: 1, max: 1, lastHp: -1, sp: 0, fresh: true };
  }
  const api = {
    held: {}, drag: {}, kind: null, phase: null,
    onMsg(m) {
      msg = m; at = performance.now(); api.held = m.held || {}; api.drag = m.drag || {}; api.kind = m.kind; api.phase = m.phase;
      const seen = new Set();
      for (const [id, x, z, ry, state, hp, max, target, moving, hit] of m.g) {
        seen.add(id); let o = map.get(id); if (!o) { o = make(m.kind, id); map.set(id, o); o.P.group.position.set(x, 0, z); o.P.group.rotation.y = ry; }
        o.tx = x; o.tz = z; o.try = ry; if (o.state !== state && state === 'down') audio.sfx('bonk', { pos: { x, y: 1.2, z } });
        o.state = state; o.target = target; o.moving = moving;
        if (hit && o.hp > hp) audio.sfx('punch', { pos: { x, y: 1.3, z } });
        o.hp = hp; o.max = max;
      }
      for (const [id, o] of map) if (!seen.has(id)) api.remove(id);
    },
    // a hitman sidestepped a bottle: a quick hop to his side and a "DODGED" pop above his head
    dodge(id) { const o = map.get(id); if (!o) return; o.dodgeT = performance.now(); o.dodgeSide = Math.random() < 0.5 ? -1 : 1; o.dodgeTag.visible = true; },
    remove(id) { const o = map.get(id); if (!o) return; scene.remove(o.P.group); o.dizzy.update(1, 0, null, false); scene.remove(o.dizzy.root); map.delete(id); },
    list: () => [...map.values()].filter((o) => o.state !== 'gone'),
    get: (id) => map.get(id),
    active: () => map.size > 0,
    update(dt, t, cineKind) {
      if (map.size && performance.now() - at > 1500) { for (const id of [...map.keys()]) api.remove(id); api.held = {}; api.drag = {}; } // stream stopped: they're gone
      for (const o of map.values()) {
        const g = o.P.group, k = Math.min(1, dt * 10), px = g.position.x, pz = g.position.z;
        g.position.x += (o.tx - g.position.x) * k; g.position.z += (o.tz - g.position.z) * k;
        let d = o.try - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * 8);
        const sp = Math.hypot(g.position.x - px, g.position.z - pz) / Math.max(dt, 1e-3); o.sp += (sp - o.sp) * Math.min(1, dt * 6);
        g.visible = o.state !== 'gone';
        { const k2 = (performance.now() - o.dodgeT) / 450; /* sidestep: out and back along his own left/right */
          if (k2 < 1) { const off = Math.sin(k2 * Math.PI) * 0.55 * o.dodgeSide; o.P.group.children[0].position.x = off; o.dodgeTag.position.y = 2.5 + k2 * 0.4; o.dodgeTag.material.opacity = 1 - k2 * k2; }
          else if (o.dodgeTag.visible) { o.P.group.children[0].position.x = 0; o.dodgeTag.visible = false; } }
        const lead = o.id === 'g0';
        let mode = 'clip:stance';
        if (o.state === 'down') mode = 'once:knockdown';
        else if (o.state === 'stun') mode = 'once:hitReact';
        else if (o.state === 'grab') mode = o.kind === 'hunt' ? 'clip:punch' : 'clip:scheme';
        else if (o.sp > 0.25 || o.moving) mode = 'walk';
        else if (lead && (cineKind === 'huntIntro' || cineKind === 'shakeIntro')) mode = o.kind === 'hunt' ? 'clip:taunt' : 'clip:scheme';
        o.P.moveSpeed = Math.max(0.6, o.sp); animate(o.P, mode, t, mode === 'walk' ? Math.min(1.4, o.sp / 3.5) : 1);
        if (o.lastHp !== o.hp) { o.lastHp = o.hp; o.hb.draw(o.hp / Math.max(1, o.max)); }
        o.hb.s.visible = o.state !== 'down' && o.state !== 'gone' && o.hp < o.max;
        o.dizzy.update(dt, t, headPos(o.P), o.state === 'down' || o.state === 'stun');
      }
    },
  };
  return api;
}
