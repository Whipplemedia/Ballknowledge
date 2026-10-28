import { makePreset, animate } from './people.js';
import { label } from './textures.js';

// Bar fights (server barEvent kind 'fight', then fightOver for the knockout). Two brawlers square up between the pool table and
// the booths, circle, and trade punches with the authored clips: a guard stance, a punch whose fist lands ~1.1 s in, a hit
// reaction timed to that impact (and a knock back), slips when it misses. The exchange schedule is seeded by the fight's end time,
// so every client sees the same punches at the same moments. A punch that lands snaps the other man's head and shoulders back
// (a procedural flinch over his guard: the authored hit-reaction clip throws the whole body around, too much for a jab). A bottle on a fighter staggers him on the spot. When the server
// picks the winner, he throws the last punch and the loser goes down (once:knockdown) and stays down.
const C = { x: 1.0, z: -2.2 }, SEP = 1.05;
const PUNCH = { speed: 1.6, impact: 1.13 / 1.6, len: 2.467 / 1.6 }, REACT = { len: 1.1 };
// the knockdown clip throws the hips ~0.65 m up before he lands (a stunt fall); most of that rise is cancelled so he drops backwards instead
const KD_LIFT = [[0, 0], [0.2, 0.15], [0.3, 0.45], [0.45, 0.66], [0.6, 0.55], [0.7, 0.3], [0.85, 0]];
const kdLift = (t) => { for (let i = 1; i < KD_LIFT.length; i++) { const [t1, v1] = KD_LIFT[i], [t0, v0] = KD_LIFT[i - 1]; if (t <= t1) return t < t0 ? 0 : v0 + (v1 - v0) * (t - t0) / (t1 - t0); } return 0; };
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const ease = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const bump = (u, up, down) => (u < 0 ? 0 : u < up ? ease(u / up) : Math.max(0, 1 - (u - up) / down)); // 0 -> 1 -> 0

export function createBrawl({ scene, audio }) {
  let F = null; // { seed, red, blue, ex: [...], f: [fighterRed, fighterBlue], hits, over }
  function schedule(seed, until) { // exchanges every ~1.9-2.8 s across the whole fight (until - 30 s .. until + 2 s)
    const R = rng(seed), ex = []; let at = until - 30000;
    while (at < until + 2000) { const att = R() < 0.5 ? 0 : 1, hit = R() < 0.62; ex.push({ at, att, hit, taunt: hit && R() < 0.18 }); at += 1900 + R() * 900 + (hit ? 400 : 0); }
    return ex;
  }
  function spawn(red, blue, seed, until) {
    const f = [['dieHard', {}, red, '#ff7a88'], ['jock', {}, blue, '#7ab0ff']] /* red corner: the orange jersey; blue corner: the navy #12 */.map(([pre, over, nm, col], i) => {
      const P = makePreset(pre, over); const l = label(nm, col, 0.9); l.position.y = 2.35; P.group.add(l); scene.add(P.group);
      P.group.rotation.order = 'YXZ'; return { P, i, mode: '', reactAt: -1e9, kb: 0, slip: 0, fl: 0, down: false };
    });
    F = { seed, until, red, blue, ex: schedule(seed, until), f, hits: { red: 0, blue: 0 }, over: null, sounds: new Set() };
  }
  function clear() { if (!F) return; for (const o of F.f) scene.remove(o.P.group); F = null; }
  const play = (o, mode, t, speed) => { if (o.mode !== mode) { o.mode = mode; o.P.clipMode = null; /* restart a 'once' clip even if it's the same one */ } animate(o.P, mode, t, speed); };
  const sfx = (key, name, o, opt = {}) => { if (F.sounds.has(key)) return; F.sounds.add(key); const g = o.P.group.position; audio.sfx(name, { pos: { x: g.x, y: 1.4, z: g.z }, ...opt }); };

  return {
    // follow the server: a fight is on (barEvent kind 'fight'), or just ended (fightOver: the knockout)
    sync(S) {
      const be = S && S.barEvent, fo = S && S.fightOver, on = be && be.kind === 'fight';
      if (on && (!F || F.seed !== be.until)) { clear(); spawn(be.red, be.blue, be.until, be.until); }
      if (F && on && be.hits) { for (const [side, k] of [['red', 0], ['blue', 1]]) if ((be.hits[side] || 0) > F.hits[side]) { F.hits[side] = be.hits[side]; F.f[k].reactAt = performance.now(); } } // a bottle connected
      if (!on && fo && F && fo.seed === F.seed && !F.over) F.over = { win: fo.winner === 'red' ? 0 : 1, at: performance.now() };
      if (!on && fo && !F) { spawn(fo.red, fo.blue, fo.seed, fo.seed); F.over = { win: fo.winner === 'red' ? 0 : 1, at: performance.now() - Math.max(0, Date.now() - fo.start) }; }
      if (!on && (!fo || (F && fo.seed !== F.seed))) clear();
    },
    update(dt, t, now) { // now: the shared server clock (BK.now())
      if (!F) return;
      if (F.over && performance.now() - F.over.at > 7000) return clear(); // the knockout has played out
      const ang = 0.35 * Math.sin(now / 3100) + now / 9000 % (Math.PI * 2), dx = Math.cos(ang), dz = Math.sin(ang); // the pair slowly circles
      const local = performance.now();
      for (const o of F.f) { o.lunge = 0; o.kbT = 0; o.slipT = 0; o.flT = 0; o.drop = 0; }
      let mode = ['clip:stance', 'clip:stance'], speed = [1, 1];
      if (F.over) { // the knockout: winner's last punch, loser drops and stays down; the winner gloats
        const u = (local - F.over.at) / 1000, w = F.over.win, l = 1 - w, W = F.f[w], L = F.f[l];
        if (u < PUNCH.len) { mode[w] = 'once:punch'; speed[w] = PUNCH.speed; W.lunge = bump(u, PUNCH.impact, 0.6) * 0.2; } else { mode[w] = 'clip:taunt'; }
        if (u > PUNCH.impact - 0.12) { mode[l] = 'once:knockdown'; L.kbT = ease((u - PUNCH.impact) / 1.1) * 0.75; L.drop = kdLift(u - PUNCH.impact + 0.12) * 0.85; sfx('ko', 'punch', L, { v: 1.3 }); if (u > PUNCH.impact + 0.9) sfx('ko2', 'bonk', L); if (u > PUNCH.impact + 0.4) sfx('koc', 'cheer', L, { v: 1 }); }
      } else {
        // the current exchange (each lasts until the next one starts)
        let e = null; for (const x of F.ex) { if (x.at <= now) e = x; else break; }
        if (e) {
          const u = (now - e.at) / 1000, a = e.att, d = 1 - a, A = F.f[a], D = F.f[d], key = e.at;
          if (u < PUNCH.len) { mode[a] = 'once:punch'; speed[a] = PUNCH.speed; A.lunge = bump(u, PUNCH.impact, 0.5) * 0.18; }
          else if (e.taunt && u < PUNCH.len + 2.2) mode[a] = 'clip:taunt';
          if (e.hit) {
            D.flT = bump(u - PUNCH.impact, 0.07, 0.55) * (e.taunt ? 1.3 : 1); // head and shoulders snap back, then he recovers his guard
            D.kbT = bump(u - PUNCH.impact, 0.18, 1.2) * 0.32;
            if (u > PUNCH.impact) sfx(key + 'h', 'punch', D); if (u > PUNCH.impact + 0.3 && (key / 1000 | 0) % 3 === 0) sfx(key + 'c', 'cheer', D, { v: 0.55 });
          } else { D.slipT = bump(u - PUNCH.impact + 0.25, 0.25, 0.7) * (((key / 1000) | 0) % 2 ? 1 : -1) * 0.3; if (u > PUNCH.impact - 0.05) sfx(key + 'w', 'whoosh', D, { v: 0.5 }); }
        }
        for (const o of F.f) if (local - o.reactAt < REACT.len * 1000) { const u = (local - o.reactAt) / 1000; o.flT = Math.max(o.flT, bump(u, 0.06, 0.8) * 1.5); o.kbT = Math.max(o.kbT, bump(u - 0.05, 0.2, 1) * 0.3); } // a bottle to the head
      }
      // place them: facing each other across the circle, plus lunges, knock-backs and slips (smoothed)
      for (const o of F.f) {
        const s = o.i ? 1 : -1, k = Math.min(1, dt * 10); o.kb += (o.kbT - o.kb) * k; o.slip += (o.slipT - o.slip) * k; o.fl += (o.flT - o.fl) * Math.min(1, dt * 22);
        const off = SEP / 2 + o.kb - o.lunge, g = o.P.group;
        g.position.x = C.x + dx * s * off + -dz * o.slip; g.position.z = C.z + dz * s * off + dx * o.slip;
        g.rotation.y = Math.atan2(dx * s, dz * s); // face the other one (forward = (-sin ry, -cos ry))
        g.rotation.x = o.fl * 0.32; g.rotation.z = -o.slip * 0.4 + o.fl * 0.12 * (o.i ? 1 : -1); // flinch back (and a little sideways); lean out of a slip
        if (mode[o.i] === 'once:knockdown') g.rotation.x = g.rotation.z = 0;
        o.P.moveSpeed = 0; play(o, mode[o.i], t, speed[o.i]); g.position.y -= o.drop; // after animate (which sets the base height)
      }
    },
    spot() { return F ? C : null; }, // the ring: world.js keeps regulars from standing in it
    list() { return F ? F.f.map((o) => ({ P: o.P, i: o.i, side: o.i ? 'blue' : 'red' })) : []; },
  };
}
