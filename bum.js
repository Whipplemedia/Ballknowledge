// Dusty (public/story.json "bum"): he lives on the street. All night he shuffles between his spots outside (the dumpster by the
// bar, the sidewalks, the gas-station lot); every so often he picks a mark and goes for their wallet - outside, in the gas station,
// or in the bar when Sal's collectors aren't around. Server-authoritative like goons.js: he walks at the target (the bar's nav grid
// indoors, straight lines outside), lifts a chunk of cash if he gets a hand in your pocket, and runs off with it. Two hits (bottles,
// or punches up close) send him packing; hit him while he's carrying your money and he drops it. Afterwards he goes back to loitering.
// Streamed as {type:'bum', b} at 10 Hz (b = null when there's no night on).
const { nav } = require('./goons');

const STEP_MS = 100;
const T = { grab: 2400, stun: 1100, give: 45000, chase: 30000 };
const SPEED = { walk: 1.9, flee: 3.4, loiter: 0.9 }; // you walk 3.8: you can always just leave
// where he hangs out (all outside, on the street side the players walk): by the dumpster, the sidewalks, under the L, the gas-station lot
const SPOTS = [[13.8, 9.9], [9.2, 10.6], [-2.5, 10.2], [-11, 10.8], [20, 11.2], [3, 23.4], [16.5, 24.6], [24, 33.6], [31, 28]];
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
  // getting there: goons.js route() - the bar's grid indoors, straight lines outside, through the doors without bouncing on the threshold
  const walk = (room, b, gx, gz, speed, dt) => { b.moving = true; return nav.route((x, z) => fieldTo(room, x, z), b, gx, gz, speed, dt); };

  const farSpot = (x, z) => { const s = [...SPOTS].sort((a, b) => Math.hypot(b[0] - x, b[1] - z) - Math.hypot(a[0] - x, a[1] - z))[Math.floor(Math.random() * 3)]; return { x: s[0], z: s[1] }; };
  // the night starts with him out on the street
  function ensure(room) {
    if (room.bum) return; const s = SPOTS[Math.floor(Math.random() * SPOTS.length)], now = Date.now();
    room.bum = { id: 'bum', x: s[0], z: s[1], ry: 0, out: { x: s[0], z: s[1] }, target: null, state: 'loiter', wp: null, pause: now + 3000, hp: 2, maxHp: 2, until: 0, loot: 0, hit: 0, born: now, training: false, moving: false };
    clearInterval(room.bumTimer); room.bumTimer = setInterval(() => step(room), STEP_MS);
  }
  const busy = (room) => !!(room.bum && room.bum.state !== 'loiter');
  // he picks his mark and heads for them from wherever he is (if he's not around yet, he comes up the street / across the lot / in the door)
  function spawn(room, target, training) {
    const now = Date.now(); if (!room.bum) { const e = entry(target); ensure(room); Object.assign(room.bum, { x: e.x, z: e.z }); }
    Object.assign(room.bum, { target: target.id, state: 'walk', hp: 2, until: 0, loot: 0, born: now, training: !!training, out: farSpot(target.x || 0, target.z || 0) });
    feed(room, `🥫 ${name} is shuffling toward ${target.name}${training ? '' : '. Keep a hand on your wallet - or a bottle.'}`);
    toast(target, training ? `${name} the bum has his eye on your wallet! Grab a bottle (E at any table) and click to throw - or punch him twice.` : `👀 ${name} is coming for your wallet! Bottle him, punch him (click, up close) or keep moving.`, 'mob');
    broadcast(room);
  }
  function resume(room) { if (room.bum) { clearInterval(room.bumTimer); room.bumTimer = setInterval(() => step(room), STEP_MS); } }
  function stop(room) { clearInterval(room.bumTimer); room.bumTimer = null; room.bum = null; fields.delete(room.code); for (const p of room.players.values()) send(p, { type: 'bum', b: null }); }

  // somebody to rob: connected, carrying cash, not in the restroom. Players outside the bar look like easier marks.
  function pickTarget(room, avoidBar, notId = null) { // notId: last time's mark (never the same player twice in a row, unless they're the only one)
    let ok = plist(room).filter((p) => p.connected !== false && p.money >= 150 && !p.dead && !inRestroom(p.x || 0, p.z || 0) && !(avoidBar && inBar(p.x || 0, p.z || 0)));
    if (ok.length > 1 && notId) ok = ok.filter((p) => p.id !== notId);
    if (!ok.length) return null;
    const w = ok.map((p) => (inBar(p.x || 0, p.z || 0) ? 1 : 3)), tot = w.reduce((a, b) => a + b, 0); let r = Math.random() * tot;
    for (let i = 0; i < ok.length; i++) { r -= w[i]; if (r <= 0) return ok[i]; } return ok[0];
  }

  // a bottle (stun) or a punch (in reach) on him
  function hit(room, p, bottle) {
    const b = room.bum, now = Date.now(); if (!b || b.state === 'run' || b.state === 'gone') return false;
    if (b.state === 'loiter') { b.hit = now; b.hp -= 1; if (b.hp <= 0) { b.state = 'run'; b.out = farSpot(p.x, p.z); b.born = now; feed(room, `🍾 ${p.name} chased ${name} off his corner. He'll be back.`); } else toast(p, `${name}: "Hey! I'm just standing here!"`, 'info'); broadcast(room); return true; }
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
        if (room.tally) { room.tally.robbed++; room.tally.robbedAmt += take; }
        toast(p, `${name} lifted ${money(take)} and ran! Bottle him before he gets away.`, 'err'); feed(room, `🥫 ${name} picked ${p.name}'s pocket for ${money(take)}!`); broadcast(room);
      }
    } else if (b.state === 'flee' || b.state === 'run') {
      if (b.state === 'flee' && b.until && now < b.until) { /* stunned for a beat */ }
      else if (walk(room, b, b.out.x, b.out.z, b.state === 'flee' ? SPEED.flee : SPEED.flee * 1.1, dt) || dist(b, b.out) < 0.3 || now - b.born > T.give) {
        if (b.loot > 0) feed(room, `🥫 ${name} got away with ${money(b.loot)}.`);
        if (inBar(b.x, b.z) || inStore(b.x, b.z)) { const s = farSpot(b.x, b.z); b.x = s.x; b.z = s.z; } // never left loitering indoors
        Object.assign(b, { state: 'loiter', target: null, loot: 0, hp: 2, training: false, wp: null, pause: now + 4000 }); broadcast(room);
      }
    } else if (b.state === 'loiter') { // shuffle between his spots, stopping for a while at each
      if (now >= b.pause) {
        if (!b.wp) { const s = SPOTS[Math.floor(Math.random() * SPOTS.length)]; b.wp = { x: s[0] + (Math.random() - 0.5), z: s[1] + (Math.random() - 0.5) }; }
        if (walk(room, b, b.wp.x, b.wp.z, SPEED.loiter, dt)) { b.wp = null; b.pause = now + 4000 + Math.random() * 9000; }
      }
    }
    const msg = { type: 'bum', b: [+b.x.toFixed(2), +b.z.toFixed(2), +b.ry.toFixed(2), b.state, b.hp, b.maxHp, b.target, b.moving ? 1 : 0, now - b.hit < 300 ? 1 : 0, b.loot, (b.smoke || 0) > now ? 1 : 0] };
    for (const q of room.players.values()) send(q, msg);
  }

  // a cigarette for him: 'now' if he was coming for this player (he takes it and leaves), 'later' if he's just around (he'll skip them next time)
  function giveCig(room, p) {
    const b = room.bum; if (!b || dist(p, b) > 2.6 || b.state === 'run' || b.state === 'flee') return null; const now = Date.now(); b.smoke = now + 120000;
    if (b.target === p.id && (b.state === 'walk' || b.state === 'grab' || b.state === 'stun')) { b.state = 'run'; b.born = now; b.out = farSpot(b.x, b.z); broadcast(room); return 'now'; }
    if (b.state === 'loiter') { b.pause = Math.max(b.pause, now + 6000); b.ry = Math.atan2(-(p.x - b.x), -(p.z - b.z)); } return 'later';
  }
  // Sal's men are coming in: he makes himself scarce (back to his corner)
  function scram(room) { const b = room.bum; if (b && b.state !== 'loiter' && b.state !== 'run' && b.state !== 'flee') { b.state = 'run'; b.born = Date.now(); b.out = farSpot(b.x, b.z); } }
  return { spawn, ensure, busy, scram, resume, stop, hit, pickTarget, giveCig };
};
