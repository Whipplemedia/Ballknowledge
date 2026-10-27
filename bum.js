// Dusty (public/story.json "bum"): a pickpocket who shuffles up to whoever looks easiest to rob, outside on the street, in the
// gas station, or in the bar when Sal's collectors aren't around. Server-authoritative like goons.js: he walks at the target
// (the bar's nav grid indoors, straight lines outside), lifts a chunk of cash if he gets a hand in your pocket, and runs off
// with it. Two hits (bottles, or punches up close) send him packing; hit him while he's carrying your money and he drops it.
// Streamed as {type:'bum', b} at 10 Hz (b = null when he's gone).
const { nav } = require('./goons');

const STEP_MS = 100;
const T = { grab: 2400, stun: 1100, give: 45000, chase: 30000 };
const SPEED = { walk: 1.9, flee: 3.4 }; // you walk 3.8: you can always just leave
const ROOM = { x: 12, z: 8 }, STORE = { x0: 18, x1: 30, z0: 36, z1: 48, door: 24.07 }; // public/bar.js ROOM, public/outside.js OUT.casino
const inBar = (x, z) => Math.abs(x) < ROOM.x && z < ROOM.z + 0.2 && z > -ROOM.z;
const inStore = (x, z) => x > STORE.x0 && x < STORE.x1 && z > STORE.z0 - 0.2 && z < STORE.z1;
const inRestroom = (x, z) => x > ROOM.x && z < -3.5;

module.exports = function createBum({ feed, toast, broadcast, plist, money, send, STORY }) {
  const name = (STORY.bum && STORY.bum.name) || 'Dusty';
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const fields = new Map();
  const fieldTo = (room, x, z) => { const k = room.code, f = fields.get(k); if (f && Date.now() - f.at < 400 && Math.hypot(f.x - x, f.z - z) < 0.6) return f.D; const D = nav.field(x, z); fields.set(k, { D, at: Date.now(), x, z }); return D; };

  // where he comes from: out of the dark down the street, across the gas-station lot, or in through the bar's front door
  function entry(p) {
    if (inBar(p.x, p.z)) return { x: nav.FRONT_OUT.x, z: nav.FRONT_OUT.z + 1.5 };
    if (inStore(p.x, p.z)) return { x: STORE.door, z: STORE.z0 - 3.5 };
    const side = p.x < 10 ? 1 : -1; return { x: p.x + side * 13, z: Math.max(9.4, Math.min(p.z, 21.5)) };
  }
  // the next point to walk to on the way from b to (gx, gz): doors first when one of them is inside and the other isn't
  function waypoint(b, gx, gz) {
    const bIn = inBar(b.x, b.z), gIn = inBar(gx, gz), bS = inStore(b.x, b.z), gS = inStore(gx, gz);
    if (gIn && !bIn) return { x: nav.FRONT_OUT.x, z: nav.FRONT_OUT.z, door: true };
    if (!gIn && bIn) return { x: nav.FRONT_OUT.x, z: nav.FRONT_OUT.z, grid: true };
    if (gS && !bS) return { x: STORE.door, z: STORE.z0 - 0.8, door: true };
    if (!gS && bS) return { x: STORE.door, z: STORE.z0 + 0.6 };
    return { x: gx, z: gz, grid: bIn };
  }
  function walk(room, b, gx, gz, speed, dt) {
    let w = waypoint(b, gx, gz);
    if (w.door && Math.hypot(w.x - b.x, w.z - b.z) < 0.4) { /* at the doorway: step through it */ w = { x: gx, z: gz, grid: inBar(gx, gz) }; }
    b.moving = true;
    if (w.grid) return nav.stepToward(b, fieldTo(room, w.x, w.z), w.x, w.z, speed, dt);
    const dx = w.x - b.x, dz = w.z - b.z, l = Math.hypot(dx, dz) || 1, s = Math.min(l, speed * dt);
    b.x += (dx / l) * s; b.z += (dz / l) * s; b.ry = Math.atan2(-dx, -dz); return l < 0.15;
  }

  function spawn(room, target, training) {
    const now = Date.now(), e = entry(target);
    room.bum = { id: 'bum', x: e.x, z: e.z, ry: 0, out: e, target: target.id, state: 'walk', hp: training ? 2 : 2, maxHp: 2, until: 0, loot: 0, hit: 0, born: now, training: !!training, moving: false };
    clearInterval(room.bumTimer); room.bumTimer = setInterval(() => step(room), STEP_MS);
    feed(room, `🥫 ${name} is shuffling toward ${target.name}${training ? '' : '. Keep a hand on your wallet - or a bottle.'}`);
    toast(target, training ? `${name} the bum has his eye on your wallet! Grab a bottle (E at any table) and click to throw - or punch him twice.` : `👀 ${name} is coming for your wallet! Bottle him, punch him (click, up close) or keep moving.`, 'mob');
    broadcast(room);
  }
  function resume(room) { if (room.bum) { clearInterval(room.bumTimer); room.bumTimer = setInterval(() => step(room), STEP_MS); } }
  function stop(room) { clearInterval(room.bumTimer); room.bumTimer = null; room.bum = null; fields.delete(room.code); for (const p of room.players.values()) send(p, { type: 'bum', b: null }); }

  // somebody to rob: connected, carrying cash, not in the restroom. Players outside the bar look like easier marks.
  function pickTarget(room, avoidBar) {
    const ok = plist(room).filter((p) => p.connected !== false && p.money >= 150 && !p.dead && !inRestroom(p.x || 0, p.z || 0) && !(avoidBar && inBar(p.x || 0, p.z || 0)));
    if (!ok.length) return null;
    const w = ok.map((p) => (inBar(p.x || 0, p.z || 0) ? 1 : 3)), tot = w.reduce((a, b) => a + b, 0); let r = Math.random() * tot;
    for (let i = 0; i < ok.length; i++) { r -= w[i]; if (r <= 0) return ok[i]; } return ok[0];
  }

  // a bottle (stun) or a punch (in reach) on him
  function hit(room, p, bottle) {
    const b = room.bum, now = Date.now(); if (!b || b.state === 'run' || b.state === 'gone') return false;
    if (!bottle && dist(p, b) > 2.4) return false;
    b.hp -= 1; b.hit = now; // a bottle from anywhere, or a shove up close: two of either and he's gone
    if (b.hp <= 0) {
      b.state = 'run'; b.until = now;
      if (b.loot > 0) { // he drops what he took
        room.drops = room.drops || []; room.drops.push({ id: require('crypto').randomBytes(4).toString('hex'), x: b.x, z: b.z, amt: b.loot, until: now + 30000 });
        feed(room, `🍾 ${p.name} ran ${name} off - he dropped ${money(b.loot)} on the way out. Grab it!`); b.loot = 0;
      } else feed(room, `🍾 ${p.name} ran ${name} off before he got a dime.`);
      if (b.training) { const t = room.players.get(b.target); if (t) toast(t, 'That\'s how it\'s done: bottles work on anybody who comes for your money.', 'win'); }
    } else { b.state = b.loot > 0 ? 'flee' : 'stun'; b.until = now + T.stun; toast(p, bottle ? `Nice shot! One more and ${name} is gone.` : `You shoved ${name} off. Once more!`, 'win'); }
    broadcast(room); return true;
  }

  function step(room) {
    const b = room.bum; if (!b) return stop(room);
    const now = Date.now(), dt = STEP_MS / 1000; b.moving = false;
    const p = room.players.get(b.target);
    if (b.state === 'walk' || b.state === 'stun') {
      if (b.state === 'stun' && now < b.until) { /* staggered */ }
      else if (!p || p.dead || p.money <= 0 || inRestroom(p.x, p.z) || now - b.born > T.chase) { b.state = 'run'; feed(room, `🥫 ${name} gave up and wandered off, muttering.`); broadcast(room); }
      else {
        b.state = 'walk';
        if (dist(b, p) > 0.95) walk(room, b, p.x, p.z, SPEED.walk, dt);
        else if (!(p.koUntil > now)) { b.state = 'grab'; b.until = now + T.grab; b.ry = Math.atan2(-(p.x - b.x), -(p.z - b.z)); toast(p, `${name} has a hand in your pocket! Bottle him - quick!`, 'mob'); broadcast(room); }
      }
    } else if (b.state === 'grab') {
      if (!p || dist(b, p) > 1.8) { b.state = 'walk'; } // you slipped away
      else if (now >= b.until) {
        const take = Math.min(Math.floor(p.money), 400, Math.max(40, Math.round(p.money * 0.12)));
        p.money -= take; b.loot = take; b.state = 'flee'; b.until = 0;
        toast(p, `${name} lifted ${money(take)} and ran! Bottle him before he gets away.`, 'err'); feed(room, `🥫 ${name} picked ${p.name}'s pocket for ${money(take)}!`); broadcast(room);
      }
    } else if (b.state === 'flee' || b.state === 'run') {
      if (b.state === 'flee' && b.until && now < b.until) { /* stunned for a beat */ }
      else if (walk(room, b, b.out.x, b.out.z, b.state === 'flee' ? SPEED.flee : SPEED.flee * 1.1, dt) || dist(b, b.out) < 0.3 || now - b.born > T.give) {
        if (b.loot > 0) feed(room, `🥫 ${name} got away with ${money(b.loot)}.`);
        stop(room); broadcast(room); return;
      }
    }
    const msg = { type: 'bum', b: [+b.x.toFixed(2), +b.z.toFixed(2), +b.ry.toFixed(2), b.state, b.hp, b.maxHp, b.target, b.moving ? 1 : 0, now - b.hit < 300 ? 1 : 0, b.loot] };
    for (const q of room.players.values()) send(q, msg);
  }

  return { spawn, resume, stop, hit, pickTarget };
};
