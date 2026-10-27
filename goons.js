// Sal's muscle: server-authoritative hitmen (end-of-night hunt, for unpaid loans) and collectors (mid-night installments from whoever owes Sal).
// Everyone sees the same goons: positions, targets, grabs and knockdowns are simulated here at 10 Hz and streamed
// to clients as {type:'goons'}; the arrival / ending cutscenes are timed by room.cine (clients film them).
const fs = require('fs');
const path = require('path');

const OBS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'obstacles.json'), 'utf8')); } catch { return { room: { x: 12, z: 8 }, circles: [] }; } })();
const RX = OBS.room.x, RZ = OBS.room.z;
const FRONT = { x: 5.0, z: RZ - 0.4 }, FRONT_OUT = { x: 5.0, z: RZ + 1.2 };   // front door (z = +8 wall)
const BACK = { x: RX - 0.5, z: -6.6 }, BACK_OUT = { x: RX + 1.2, z: -6.6 };    // back-room door behind Sal's corner (x = +12 wall)
const STEP_MS = 100;
const T = { huntIntro: 7000, shakeIntro: 4500, beaten: 6000, kill: 12500, leave: 4500, grabTake: 2000, patDown: 2600, stun: 2500, regrab: 3000 };
// hitmen only go down to bottles: fists bounce off, a free-moving hitman sidesteps some throws (one that is busy holding
// someone can't), and a downed one gets back up after TUNE.getUp unless the crew drops them all at the same time
const TUNE = { dodge: 0.3, getUp: 13000, regain: 0.5, breakFree: 10, regrab: 4000 }; // playtest: the first tuning was near-impossible. breakFree = Space presses within 2.5s to wrench loose // regain: share of his hits a hitman gets back when he stands up
const SPEED = { enter: 1.7, hitman: 2.4, collector: 2.2, leave: 2.2, drag: 1.5 }; // players walk 3.8 and run 6.2: you can get away

// ---- navigation: a 0.4 m grid of free cells (furniture circles + walls blocked, door corridors open), BFS distance fields
const CELL = 0.4, GW = Math.ceil((RX * 2 + 4) / CELL), GH = Math.ceil((RZ * 2 + 4) / CELL), OX = -RX - 2, OZ = -RZ - 2;
const ci = (x) => Math.max(0, Math.min(GW - 1, Math.floor((x - OX) / CELL))), cj = (z) => Math.max(0, Math.min(GH - 1, Math.floor((z - OZ) / CELL)));
const cx = (i) => OX + (i + 0.5) * CELL, cz = (j) => OZ + (j + 0.5) * CELL;
const FREE = new Uint8Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
  const x = cx(i), z = cz(j);
  let ok = Math.abs(x) < RX - 0.45 && Math.abs(z) < RZ - 0.45;
  if (!ok && Math.abs(x - FRONT.x) < 0.55 && z > RZ - 1.2 && z < RZ + 1.8) ok = true; // through the front door
  if (!ok && Math.abs(z - BACK.z) < 0.55 && x > RX - 1.2 && x < RX + 1.8) ok = true;   // through the back door
  if (ok) for (const [ox, oz, r] of OBS.circles) if (Math.hypot(x - ox, z - oz) < r + 0.3) { ok = false; break; }
  FREE[j * GW + i] = ok ? 1 : 0;
}
const nearestFree = (x, z) => {
  const i0 = ci(x), j0 = cj(z); if (FREE[j0 * GW + i0]) return [i0, j0];
  for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = i0 + di, j = j0 + dj; if (i >= 0 && j >= 0 && i < GW && j < GH && FREE[j * GW + i]) return [i, j]; }
  return [i0, j0];
};
const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
function field(x, z) { // Dijkstra-ish distance from every free cell to (x, z)
  const D = new Float32Array(GW * GH).fill(1e9), [gi, gj] = nearestFree(x, z), q = [gi + gj * GW]; D[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % GW, j = (k - i) / GW, d = D[k];
    for (const [di, dj, w] of N8) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue; const nk = nj * GW + ni; if (!FREE[nk] || D[nk] <= d + w) continue; if (di && dj && (!FREE[j * GW + ni] || !FREE[nj * GW + i])) continue; D[nk] = d + w; q.push(nk); }
  }
  return D;
}
// one step along a distance field: head for the best neighbouring cell (or straight at the goal when close)
function stepToward(g, D, gx, gz, speed, dt) {
  const d = Math.hypot(gx - g.x, gz - g.z); if (d < 0.05) return true;
  let tx = gx, tz = gz;
  if (d > 0.9) {
    const i = ci(g.x), j = cj(g.z); let best = D[j * GW + i], bi = i, bj = j;
    for (const [di, dj] of N8) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue; const v = D[nj * GW + ni]; if (v < best) { best = v; bi = ni; bj = nj; } }
    // look two cells ahead along the gradient so the walk reads as a line, not a staircase
    let ai = bi, aj = bj; for (let k = 0; k < 2; k++) { let b2 = D[aj * GW + ai], ni2 = ai, nj2 = aj; for (const [di, dj] of N8) { const ni = ai + di, nj = aj + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue; const v = D[nj * GW + ni]; if (v < b2) { b2 = v; ni2 = ni; nj2 = nj; } } ai = ni2; aj = nj2; }
    tx = cx(ai); tz = cz(aj);
  }
  const dx = tx - g.x, dz = tz - g.z, l = Math.hypot(dx, dz) || 1, s = Math.min(l, speed * dt);
  g.x += (dx / l) * s; g.z += (dz / l) * s; g.ry = Math.atan2(-dx, -dz); g.moving = true;
  return d < 0.15;
}

module.exports = function createGoons({ feed, toast, broadcast, plist, money, send, onDone }) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const alive = (g) => g.state !== 'down' && g.state !== 'gone';
  const fields = new Map(); // per room: target key -> {D, at}
  const fieldFor = (room, key, x, z) => {
    let m = fields.get(room.code); if (!m) fields.set(room.code, (m = new Map()));
    const f = m.get(key); if (f && Date.now() - f.at < 400 && Math.hypot(f.x - x, f.z - z) < 0.6) return f.D;
    const D = field(x, z); m.set(key, { D, at: Date.now(), x, z }); return D;
  };

  function spawn(room, kind, n, hpTotal, info) {
    const now = Date.now(), intro = kind === 'hunt' ? T.huntIntro : T.shakeIntro;
    const each = info.hp || Math.max(8, Math.round(hpTotal / n)), spots = [[5.0, 4.6], [3.9, 5.1], [6.1, 5.1], [5.6, 5.7], [4.4, 5.8], [6.6, 4.4]];
    room.goons = { kind, phase: 'intro', list: Array.from({ length: n }, (_, k) => ({ id: 'g' + k, x: FRONT_OUT.x + (k - (n - 1) / 2) * 0.7, z: FRONT_OUT.z + k * 0.9, ry: 0, state: 'enter', spot: spots[k % spots.length], hp: each, maxHp: each, target: null, until: 0, cool: 0, hit: 0 })) };
    room.cine = { kind: kind === 'hunt' ? 'huntIntro' : 'shakeIntro', start: now, until: now + intro, ...info };
    clearInterval(room.goonTimer); room.goonTimer = setInterval(() => step(room), STEP_MS);
    return now + intro;
  }
  // after a restart (snapshot restore) the simulation has to be re-armed
  function resume(room) { if (room.goons && room.goons.phase !== 'done') { clearInterval(room.goonTimer); room.goonTimer = setInterval(() => step(room), STEP_MS); } }
  function stop(room) { clearInterval(room.goonTimer); room.goonTimer = null; if (room.goons) room.goons.phase = 'done'; room.goons = null; for (const p of room.players.values()) { p.heldBy = null; p.dragBy = null; } fields.delete(room.code); }

  const debtors = (room) => plist(room).filter((p) => p.remaining > 0 && !p.dead);
  function pickTarget(room, g) {
    const G = room.goons, taken = new Map(); for (const o of G.list) if (o !== g && o.target && alive(o)) taken.set(o.target, (taken.get(o.target) || 0) + 1);
    const owes = (p) => p.debt > 0 && !p.dead && p.money > 0; // collectors only shake down the people who owe Sal
    let pool = G.kind === 'hunt' ? debtors(room) : plist(room).filter((p) => owes(p) && !(G.patted || {})[p.id]);
    if (G.kind !== 'hunt' && !pool.length) { G.patted = {}; pool = plist(room).filter(owes); }
    pool = pool.filter((p) => p.connected !== false || G.kind === 'hunt');
    pool.sort((a, b) => (taken.get(a.id) || 0) - (taken.get(b.id) || 0) || dist(g, a) - dist(g, b));
    return pool[0] ? pool[0].id : null;
  }
  const release = (room, g) => { if (g.target) { const p = room.players.get(g.target); if (p && p.heldBy === g.id) p.heldBy = null; } if (g.state === 'grab') g.state = 'chase'; g.cool = Date.now() + T.regrab; };

  // damage from a punch (in reach) or a bottle (stun)
  function hit(room, p, gid, dmg, stun) {
    const G = room.goons; if (!G || G.phase !== 'fight') return false; const g = G.list.find((o) => o.id === gid); if (!g || !alive(g)) return false;
    if (!stun && dist(p, g) > 2.6) return false;
    const now = Date.now();
    if (G.kind === 'hunt') {
      if (!stun) { if (now - (p.fistMsg || 0) > 4000) { p.fistMsg = now; toast(p, 'Your fist bounces off him. Only bottles will drop a hitman - grab some and click to throw.', 'err'); } return false; }
      if ((g.state === 'chase' || g.state === 'idle') && Math.random() < TUNE.dodge) { /* he saw it coming */
        g.dodge = now; toast(p, 'He sidestepped it! Hit him while he\'s busy grabbing someone.', 'err');
        for (const q of room.players.values()) send(q, { type: 'goonDodge', id: g.id, by: p.id }); return true;
      }
      dmg = 1;
    }
    g.hp -= dmg; g.hit = now;
    if (stun) { release(room, g); g.state = 'stun'; g.until = now + T.stun; }
    if (g.hp <= 0) { g.hp = 0; release(room, g); g.state = 'down'; g.until = G.kind === 'hunt' ? now + TUNE.getUp : 0; const up = G.list.filter(alive).length; feed(room, `👊 ${p.name} dropped one of Sal's ${G.kind === 'hunt' ? 'hitmen' : 'collectors'}${G.kind === 'hunt' && up ? ` - ${up} still standing. Drop them all before he gets up!` : '.'}`); }
    if (G.list.every((o) => !alive(o))) outro(room, 'beaten');
    return true;
  }

  // the held player mashes Space: enough presses inside 2.5s and he lets go (stunned for a beat, can't regrab for TUNE.regrab)
  function struggle(room, p) {
    const G = room.goons, now = Date.now(); if (!G || G.phase !== 'fight' || !p.heldBy || now - (p.strLast || 0) < 60) return false;
    const g = G.list.find((o) => o.id === p.heldBy); if (!g) return false;
    p.strLast = now; if (now - (p.strT || 0) > 2500) p.strN = 0; if (!p.strN) p.strT = now; p.strN = (p.strN || 0) + 1;
    if (p.strN < (G.kind === 'hunt' ? TUNE.breakFree : 6)) return false;
    p.strN = 0; release(room, g); g.state = 'stun'; g.until = now + 1200; g.cool = now + TUNE.regrab; p.slippery = now + 2500; // nobody else can grab you for a moment
    toast(p, 'You wrenched free - RUN!', 'win'); feed(room, `💪 ${p.name} broke free from a ${G.kind === 'hunt' ? 'hitman' : 'collector'}!`); return true;
  }

  function outro(room, kind, victims = []) {
    const G = room.goons, now = Date.now(); if (!G || G.phase === 'outro') return; G.phase = 'outro'; G.outro = kind;
    for (const p of room.players.values()) p.heldBy = null;
    if (kind === 'beaten') { room.cine = { kind: G.kind === 'hunt' ? 'huntBeaten' : 'shakeBeaten', start: now, until: now + T.beaten }; for (const g of G.list) { g.state = 'down'; g.until = now + 2600; } }
    else if (kind === 'kill') {
      room.cine = { kind: 'kill', start: now, until: now + T.kill, victims: victims.map((p) => p.id), names: victims.map((p) => p.name) };
      victims.forEach((p, k) => { const g = G.list[k % G.list.length]; g.state = 'drag'; g.hp = Math.max(g.hp, 1); g.target = p.id; p.dragBy = g.id; });
      for (const g of G.list) if (g.state !== 'drag') g.state = 'leave';
    } else { room.cine = null; for (const g of G.list) { g.state = 'leave'; g.target = null; } G.until = now + T.leave; }
    G.until = room.cine ? room.cine.until : G.until;
    broadcast(room);
  }

  function step(room) {
    const G = room.goons; if (!G) return stop(room);
    const now = Date.now(), dt = STEP_MS / 1000;
    for (const g of G.list) g.moving = false;
    if (G.phase === 'intro') {
      for (const g of G.list) { const D = fieldFor(room, 'spot' + g.id, g.spot[0], g.spot[1]); if (stepToward(g, D, g.spot[0], g.spot[1], SPEED.enter, dt)) { g.ry = Math.atan2(0, 1); g.state = 'idle'; } }
      if (now >= room.cine.until) { G.phase = 'fight'; room.cine = null; for (const g of G.list) { g.state = 'chase'; g.target = pickTarget(room, g); } broadcast(room); }
    } else if (G.phase === 'fight') {
      for (const g of G.list) {
        if (g.state === 'down') { /* a hitman doesn't stay down for long */
          if (G.kind === 'hunt' && g.until && now >= g.until) { g.state = 'chase'; g.hp = Math.max(1, Math.ceil(g.maxHp * TUNE.regain)); g.target = pickTarget(room, g); feed(room, '😠 A hitman is back on his feet!'); for (const q of room.players.values()) toast(q, 'A hitman got back up! Drop them all at once.', 'mob'); broadcast(room); }
          continue;
        }
        if (g.state === 'stun') { if (now >= g.until) g.state = 'chase'; else continue; }
        let p = g.target && room.players.get(g.target);
        const done = !p || (G.kind === 'hunt' ? p.remaining <= 0 || p.dead : p.money <= 0 || p.debt <= 0 || (G.patted || {})[p.id]);
        if (done) { if (p && p.heldBy === g.id) p.heldBy = null; g.target = pickTarget(room, g); g.state = g.target ? 'chase' : 'idle'; p = g.target && room.players.get(g.target); }
        if (!p) continue;
        if (g.state === 'chase') {
          const D = fieldFor(room, 'p' + p.id, p.x, p.z);
          if (dist(g, p) > 1.05) stepToward(g, D, p.x, p.z, G.kind === 'hunt' ? SPEED.hitman : SPEED.collector, dt);
          else if (now >= g.cool && !p.heldBy && !(p.slippery > now) && !(p.koUntil > now && G.kind !== 'hunt')) { g.state = 'grab'; p.heldBy = g.id; g.until = now + (G.kind === 'hunt' ? T.grabTake : T.patDown); g.ry = Math.atan2(-(p.x - g.x), -(p.z - g.z)); toast(p, G.kind === 'hunt' ? 'A hitman has you! Mash SPACE to break free - crew, bottle him now.' : 'A collector is going through your pockets... mash SPACE to shake him off.', 'mob'); }
          else g.ry = Math.atan2(-(p.x - g.x), -(p.z - g.z));
        } else if (g.state === 'grab') {
          g.ry = Math.atan2(-(p.x - g.x), -(p.z - g.z));
          if (now >= g.until) {
            if (G.kind === 'hunt') { // the shakedown: every couple of seconds they shake a chunk of the debt out of you
              const take = Math.min(p.money, Math.max(50, Math.ceil(p.remaining * 0.25)));
              if (take > 0) { p.money -= take; p.remaining -= take; p.debt = Math.max(0, p.remaining); toast(p, `They shook ${money(take)} out of you.`, 'mob'); }
              if (p.remaining <= 0) { p.remaining = 0; p.fate = 'paid up'; p.heldBy = null; feed(room, `💸 The hitmen shook ${p.name} down until the debt was paid.`); g.target = null; g.state = 'idle'; }
              else if (take <= 0) g.until = now + 1e9; // broke: they just hold on until the crew saves you or time runs out
              else g.until = now + T.grabTake;
            } else { // collectors pat you down once, take your share of the tax, move on
              const sh = room.shake, left = sh ? sh.tax - sh.paid : 0, share = Math.ceil(left / Math.max(1, plist(room).filter((q) => q.debt > 0).length));
              const take = Math.min(Math.floor(p.money), share, p.debt); if (take > 0 && sh) { p.money -= take; p.debt -= take; sh.paid += take; toast(p, `The collectors took ${money(take)} from you (off what you owe Sal).`, 'mob'); }
              (G.patted = G.patted || {})[p.id] = 1; p.heldBy = null; g.state = 'chase'; g.target = null; g.cool = now + 1500;
              if (sh && sh.paid >= sh.tax) { feed(room, '💼 The collectors got what they came for.'); outro(room, 'leave'); }
            }
          }
        }
      }
      if (G.kind === 'hunt' && !debtors(room).length) { feed(room, '✅ Every debt is paid. The hitmen leave.'); outro(room, 'leave'); }
    } else if (G.phase === 'outro') {
      for (const g of G.list) {
        if (g.state === 'down') { if (g.until && now >= g.until) g.state = 'leave'; else continue; }
        if (g.state === 'leave') { const D = fieldFor(room, 'front', FRONT_OUT.x, FRONT_OUT.z); if (stepToward(g, D, FRONT_OUT.x, FRONT_OUT.z, SPEED.leave, dt)) g.state = 'gone'; }
        if (g.state === 'drag') { const D = fieldFor(room, 'back', BACK_OUT.x, BACK_OUT.z); if (stepToward(g, D, BACK_OUT.x, BACK_OUT.z, SPEED.drag, dt)) g.state = 'gone'; const p = room.players.get(g.target); if (p) { p.x = g.x - Math.sin(g.ry + Math.PI) * 0.75; p.z = g.z - Math.cos(g.ry + Math.PI) * 0.75; } }
      }
      if (room.cine ? now >= room.cine.until : now >= G.until || G.list.every((g) => g.state === 'gone'))  { /* a cutscene ending always plays out in full */ const kind = G.kind, how = G.outro; stop(room); onDone(room, kind, how); broadcast(room); return; }
    }
    // stream the goons (compact) to everyone
    const held = {}, drag = {}; for (const p of room.players.values()) { if (p.heldBy) held[p.id] = p.heldBy; if (p.dragBy) drag[p.id] = p.dragBy; }
    const msg = { type: 'goons', kind: G.kind, phase: G.phase, outro: G.outro || null, held, drag, g: G.list.map((g) => [g.id, +g.x.toFixed(2), +g.z.toFixed(2), +g.ry.toFixed(2), g.state, g.hp, g.maxHp, g.target || '', g.moving ? 1 : 0, now - g.hit < 300 ? 1 : 0]) };
    for (const p of room.players.values()) send(p, msg);
  }

  return { spawn, resume, stop, hit, struggle, outro, hpLeft: (room) => (room.goons ? room.goons.list.reduce((a, g) => a + g.hp, 0) : 0), hpMax: (room) => (room.goons ? room.goons.list.reduce((a, g) => a + g.maxHp, 0) : 0) };
};
module.exports.DOORS = { FRONT, BACK };
module.exports.TUNE = TUNE;
module.exports.nav = { field, stepToward, FRONT, FRONT_OUT }; // bum.js walks the same grid indoors
