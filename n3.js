// Night 3 (the last night of a campaign, or a single night): The End Zone gentlemen's club opens next to the bar, and the city
// police patrol the street. Server-authoritative like bum.js: the club's games (Make It Rain, bottle service and the VIP
// athlete, shot roulette, Amateur Night on the pole), the bachelor-party job's groom, and two cops walking a beat with
// flashlights who stop anyone outside who looks like they've been drinking for a 60 s sobriety test (the drills run on the
// client; failing costs 50 s in the back of the squad car). Cops are streamed as {type:'cops', c} at 10 Hz.
const STEP_MS = 100;
const ROOM = { x: 12, z: 8 }, STORE = { x0: 18, x1: 30, z0: 36, z1: 48 }; // public/bar.js ROOM, public/outside.js OUT.casino
const CLUB = { x0: -27, x1: -13, z0: -4, z1: 8, door: -20 };              // public/club.js CLUB
const inBar = (x, z) => Math.abs(x) < ROOM.x && z < ROOM.z + 0.2 && z > -ROOM.z - 4;
const inStore = (x, z) => x > STORE.x0 && x < STORE.x1 && z > STORE.z0 - 0.2 && z < STORE.z1;
const inClub = (x, z) => x > CLUB.x0 && x < CLUB.x1 && z > CLUB.z0 && z < CLUB.z1 + 0.2;
const inRest = (x, z) => x > ROOM.x - 0.5 && z < -3.5;
const outside = (x, z) => !inBar(x, z) && !inStore(x, z) && !inClub(x, z) && !inRest(x, z);
// the cops' beat: the bar's sidewalk past the club, across the street, along the far curb (they never go in anywhere)
const BEAT = [[-24, 10.6], [-8, 10.4], [9, 10.6], [20, 11.2], [20, 23.4], [4, 23.6], [-14, 23.2], [-24, 22.8]];
const CAR = { x: -3.5, z: 13.6 };                                          // public/cops.js CAR (the cruiser at the bar-side curb)
const SPEED = { walk: 1.25, go: 2.6 };
// the cops get more aggressive every night: how many are out, how far and wide the flashlight reaches, the chance a stop happens when they
// spot you (sober or buzzed - anyone outside can get stopped; 20+ on the drunk meter is far likelier), how often they re-check you, how hard they chase, how long a passed test lasts
const LEVELS = {
  1: { cops: 1, range: 6.0, cone: 0.45, sober: 0.10, drunk: 0.60, every: 25000, chase: 12000, go: 2.4, walk: 1.15, immune: 180000 },
  2: { cops: 2, range: 7.5, cone: 0.55, sober: 0.25, drunk: 0.85, every: 20000, chase: 15000, go: 2.7, walk: 1.25, immune: 120000 },
  3: { cops: 2, range: 9.0, cone: 0.65, sober: 0.40, drunk: 1.00, every: 15000, chase: 20000, go: 3.1, walk: 1.45, immune: 90000 },
};
const DRUNK = 20;
const TEST_MS = 60000, CAR_MS = 50000, DANCE_MS = 42000, RAIN_SHOT = 20, RAIN_TIP = 200, VIP_PRICE = 300, ATHLETE_PRICE = 50;
const SHOT_STAKES = [25, 50, 100];

module.exports = function createN3({ feed, toast, broadcast, plist, money, send, drunkNow, dur, STORY, tipFor }) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  // ---- the night ----
  // o: { club: The End Zone is open (the last night), level: 1-3 (how hard the cops are tonight), intro: play the squad-car scene }
  function start(room, o) {
    stop(room); if (!o) { room.n3 = null; return; }
    const now = Date.now(), cine = room.cine ? room.cine.until : now, level = Math.max(1, Math.min(3, o.level || 1));
    room.n3 = { on: true, club: !!o.club, level, T: LEVELS[level], stage: null, groomBy: null, introAt: o.intro ? cine + 400 : 0, outAt: o.intro ? 0 : cine + 2000, cops: [
      { id: 'cop1', name: 'Officer Kowalski', x: CAR.x - 1.4, z: CAR.z - 1.3, ry: 0, wp: 1, state: 'car', target: null, until: 0, moving: false },
      { id: 'cop2', name: 'Officer Reyes', x: CAR.x + 1.4, z: CAR.z - 1.3, ry: 0, wp: 5, state: 'car', target: null, until: 0, moving: false }].slice(0, LEVELS[level].cops) };
    for (const p of room.players.values()) Object.assign(p, { rain: 0, whisper: null, vip: false, athlete: {}, shots: null, sober: null, carUntil: 0, copImmune: 0, copRoll: 0 });
    room.n3Timer = setInterval(() => step(room), STEP_MS);
  }
  function stop(room) { clearInterval(room.n3Timer); room.n3Timer = null; if (room.n3) for (const p of room.players.values()) send(p, { type: 'cops', c: null }); }
  // ---- the cops ----
  const walkTo = (c, x, z, sp, dt) => { const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz); c.moving = d > 0.05; if (d < 0.05) return true; const s = Math.min(d, sp * dt); c.x += dx / d * s; c.z += dz / d * s; c.ry = Math.atan2(-dx, -dz); return d <= s + 0.01; };
  function sees(c, p, T) { // in the flashlight: close, in front, outside, free to be stopped (drunk or not)
    if (!p.x && !p.z) return false; const d = dist(c, p); if (d > T.range) return false;
    const fx = -Math.sin(c.ry), fz = -Math.cos(c.ry), cos = ((p.x - c.x) * fx + (p.z - c.z) * fz) / Math.max(0.01, d);
    return cos > Math.cos(T.cone) && outside(p.x, p.z) && !p.dead && !p.sober && !(p.carUntil > Date.now()) && !(p.copImmune > Date.now()) && !p.heldBy && !(p.koUntil > Date.now());
  }
  // spotted: roll whether he bothers (once per player per T.every - standing in the light doesn't reroll every tick)
  function wantsStop(p, T, now) { if (now < (p.copRoll || 0)) return false; p.copRoll = now + T.every; return Math.random() < (drunkNow(p) >= DRUNK ? T.drunk : T.sober); }
  function step(room) {
    const N = room.n3; if (!N) return; const now = Date.now(), dt = STEP_MS / 1000;
    const quiet = room.phase === 'play' && !room.goons && !room.shake && !(room.cine && now < room.cine.until);
    if (N.introAt && now >= N.introAt && !(room.cine && now < room.cine.until) && room.phase === 'play') { N.introAt = 0; room.cine = { kind: 'copsIntro', start: now, until: now + 9000, level: N.level }; broadcast(room); }
    if (N.outAt && now >= N.outAt && room.phase === 'play') { N.outAt = 0; for (const c of N.cops) c.state = 'patrol';
      const line = N.level >= 3 ? '🚔 The cops are out in force tonight. They\'ll stop anybody - and they\'re not in a good mood.' : `🚔 ${N.cops.length > 1 ? 'Two officers' : 'An officer'} on the street again tonight. Keep your head down out there.`;
      feed(room, line); for (const q of room.players.values()) toast(q, line, 'mob'); }
    for (const c of N.cops) {
      c.moving = false;
      if (c.state === 'car') { if (!N.introAt && !N.outAt && now - (room.cine && room.cine.kind === 'copsIntro' ? room.cine.start : 0) > 3500) c.state = 'patrol'; continue; } // they get out during the intro
      if (c.state === 'patrol') {
        const w = BEAT[c.wp]; if (walkTo(c, w[0], w[1], N.T.walk, dt)) c.wp = (c.wp + 1) % BEAT.length;
        if (quiet) for (const p of plist(room)) if (sees(c, p, N.T) && !N.cops.some((o) => o.target === p.id) && wantsStop(p, N.T, now)) { c.state = 'stop'; c.target = p.id; c.until = now + N.T.chase; toast(p, `🔦 "${c.name}, City Police. Hold it right there, pal."`, 'mob'); break; }
      } else if (c.state === 'stop') { // walk up to them; once there, the test starts
        const p = room.players.get(c.target);
        if (!p || !outside(p.x, p.z) || now > c.until || !quiet) { c.state = 'patrol'; c.target = null; continue; }
        if (dist(c, p) > 1.5) walkTo(c, p.x, p.z, N.T.go, dt);
        else { c.state = 'test'; c.ry = Math.atan2(-(p.x - c.x), -(p.z - c.z)); p.sober = { cop: c.id, start: now, until: now + TEST_MS, drunk: Math.round(drunkNow(p)), seed: Math.floor(Math.random() * 1e9) };
          send(p, { type: 'sobriety', t: p.sober, cop: c.name }); feed(room, `🚔 ${c.name} pulled ${p.name} aside for a sobriety test.`); broadcast(room); }
      } else if (c.state === 'test') { const p = room.players.get(c.target); if (!p || !p.sober) { c.state = 'patrol'; c.target = null; } else if (now > p.sober.until + 5000) result(room, p, 0); }
      else if (c.state === 'escort') { const p = room.players.get(c.target); if (!p || !(p.carUntil > now)) { c.state = 'patrol'; c.target = null; } }
    }
    for (const p of room.players.values()) if (p.carUntil && now >= p.carUntil) { p.carUntil = 0; p.copImmune = now + N.T.immune; toast(p, '🚔 "Alright, you\'re free to go. Walk it off."', 'info'); broadcast(room); }
    if (N.stage && now > N.stage.until + 4000) { N.stage = null; broadcast(room); }
    const msg = { type: 'cops', c: N.cops.map((c) => [c.id, +c.x.toFixed(2), +c.z.toFixed(2), +c.ry.toFixed(2), c.state, c.target || '', c.moving ? 1 : 0]) };
    for (const q of room.players.values()) send(q, msg);
  }
  function result(room, p, passed) { // the sobriety test is over: 3 of 5 drills to walk away; otherwise 50 s in the back of the squad car
    const N = room.n3, s = p.sober; if (!s) return; p.sober = null; const c = N.cops.find((o) => o.id === s.cop), now = Date.now();
    if (passed >= 3) { p.copImmune = now + N.T.immune; toast(p, `🚔 You passed (${passed}/5). "Huh. Alright. Get outta here."`, 'win'); feed(room, `🚔 ${p.name} passed the sobriety test (${passed}/5).`); if (c) { c.state = 'patrol'; c.target = null; } }
    else { p.carUntil = now + CAR_MS; toast(p, `🚔 You failed (${passed}/5). Back of the squad car for 50 seconds. Your phone still works.`, 'err'); feed(room, `🚔 ${p.name} failed the sobriety test and is sitting in the back of the squad car.`); if (c) c.state = 'escort'; }
    broadcast(room);
  }
  // ---- the club ----
  function handle(room, p, m) {
    const N = room.n3; if (!N || !N.on) return false; const now = Date.now(), play = room.phase === 'play';
    if (!N.club && m.type !== 'soberResult') return false; // the club's games only on the night it's open
    switch (m.type) {
      case 'soberResult': if (p.sober) result(room, p, Math.max(0, Math.min(5, Math.floor(Number(m.passed) || 0)))); return true;
      case 'rain': { // Make It Rain: $20 a shot from the money gun. Every $200 you put on stage, a dancer leans in with gossip on the open game
        if (!play || !inClub(p.x, p.z)) return true; const n = Math.max(1, Math.min(10, Math.floor(Number(m.n) || 1))), k = Math.min(n, Math.floor(p.money / RAIN_SHOT)); if (k <= 0) { toast(p, 'You\'re out of singles.', 'err'); return true; }
        p.money -= k * RAIN_SHOT; p.rain = (p.rain || 0) + k * RAIN_SHOT; N.hype = Math.min(100, (N.hype || 0) + k * 3); N.rainAt = now; N.rainBy = p.id;
        if (p.rain >= RAIN_TIP) { p.rain -= RAIN_TIP; const ev = room.events.find((e) => e.status === 'open');
          if (ev) { p.whisper = { from: 'dancer', who: pick(['Destiny', 'Diamond']), ev: ev.idx }; toast(p, '💋 A dancer leans in close. She wants to tell you something.', 'win'); }
          else toast(p, '💋 "Come back when there\'s a game on, sugar."', 'info'); }
        broadcast(room); return true;
      }
      case 'vip': { // bottle service: into the VIP section with the athlete for the rest of the night
        if (!play || p.vip) return true; if (p.money < VIP_PRICE) { toast(p, `Bottle service is ${money(VIP_PRICE)}.`, 'err'); return true; }
        p.money -= VIP_PRICE; p.vip = true; feed(room, `🍾 ${p.name} got bottle service at The End Zone.`); toast(p, '🍾 You\'re in the VIP. Buy the athlete a drink - he talks when he drinks.', 'win'); broadcast(room); return true;
      }
      case 'athleteTalk': { // the star in the VIP: buy him a drink and ask one question about the open game, once a game
        if (!play) return true; if (!p.vip) { toast(p, 'Bouncer: "VIP only, buddy. Bottle service first."', 'err'); return true; }
        const ev = room.events.find((e) => e.status === 'open'); if (!ev) { toast(p, '"No game on? Then I\'m off the clock, bro."', 'info'); return true; }
        p.athlete = p.athlete || {}; if (p.athlete[ev.idx]) { toast(p, '"I already told you everything, bro."', 'info'); return true; }
        p.whisper = { from: 'athlete', who: 'Primetime', ev: ev.idx }; broadcast(room); return true;
      }
      case 'askCancel': if (p.whisper && p.whisper.from === 'athlete') { p.whisper = null; broadcast(room); } return true;
      case 'ask': { // a question for whoever's whispering (the dancer after $200 on stage, or the athlete for a $50 drink)
        const w = p.whisper, q = Math.floor(Number(m.q)); if (!w || !(q >= 0 && q < 3)) return true;
        const ev = room.events.find((e) => e.status === 'open' && e.idx === w.ev); if (!ev) { p.whisper = null; toast(p, 'Too late - that game\'s betting closed.', 'info'); broadcast(room); return true; }
        if (w.from === 'athlete') { if (p.money < ATHLETE_PRICE) { toast(p, `A drink for him is ${money(ATHLETE_PRICE)}.`, 'err'); return true; } p.money -= ATHLETE_PRICE; p.athlete = p.athlete || {}; p.athlete[ev.idx] = 1; }
        const t = tipFor(room, ev, w.from + ':' + p.id, w.from === 'athlete' ? 0.75 : 0.7), win = ev[t.side], lose = t.side === 'a' ? ev.b : ev.a;
        const A = w.from === 'athlete'
          ? [`"Off the record? ${win} all day. Bet the house."`, `"${lose}'s best player rolled his ankle at practice. They're hiding it."`, `"${lose}'s locker room is a mess. Two guys fighting about minutes. ${win} walks."`]
          : [`"${win}. Trust me, babe - I hear things in here."`, `"${lose}'s best player was in here Tuesday on crutches. Don't tell anyone I said that."`, `"${win}'s coach was in here last night celebrating early. Like, real early."`];
        p.whisper = null;
        send(p, { type: 'tip', who: w.who, from: w.from, q, side: t.side, team: win, label: ev.label, text: A[q], acc: t.acc }); broadcast(room); return true;
      }
      case 'shotStart': { // shot roulette with the shot girl: six shots, one is ghost pepper. Each safe one grows the pot; cash out any time
        if (!play || p.shots) return true; const st = SHOT_STAKES.includes(Number(m.stake)) ? Number(m.stake) : 25; if (p.money < st) { toast(p, 'Not enough cash.', 'err'); return true; }
        p.money -= st; p.shots = { stake: st, pot: st, n: 6, hot: Math.floor(Math.random() * 6), taken: [] }; broadcast(room); return true;
      }
      case 'shotPick': { const s = p.shots, i = Math.floor(Number(m.i)); if (!s || !(i >= 0 && i < 6) || s.taken.includes(i)) return true;
        if (i === s.hot) { p.shots = null; send(p, { type: 'fx', kind: 'hotShot' }); toast(p, `🌶️ GHOST PEPPER. You lose the ${money(s.pot)} pot - and your eyes are watering.`, 'err'); feed(room, `🌶️ ${p.name} found the ghost-pepper shot.`); broadcast(room); return true; }
        s.taken.push(i); s.pot = Math.round(s.pot * 0.95 * s.n / (s.n - 1)); s.n--; send(p, { type: 'fx', kind: 'shot' });
        if (s.n === 1) { p.money += s.pot; toast(p, `🥃 You drank every safe shot! +${money(s.pot)}`, 'win'); feed(room, `🥃 ${p.name} survived shot roulette for ${money(s.pot)}.`); p.shots = null; }
        broadcast(room); return true; }
      case 'shotCash': { const s = p.shots; if (!s) return true; p.shots = null; p.money += s.pot; toast(p, `🥃 Cashed out: +${money(s.pot)}`, s.pot > s.stake ? 'win' : 'info'); broadcast(room); return true; }
      case 'danceStart': { // Amateur Night: one dancer at a time on the main stage
        if (!play || !inClub(p.x, p.z)) return true; if (N.stage && now < N.stage.until + 4000) { toast(p, 'Someone\'s already on stage.', 'err'); return true; }
        N.stage = { pid: p.id, name: p.name, start: now, until: now + DANCE_MS, move: 'idle', moveAt: now, combo: 0 }; feed(room, `💃 ${p.name} is up for Amateur Night at The End Zone!`); broadcast(room); return true;
      }
      case 'danceMove': { const s = N.stage; if (!s || s.pid !== p.id) return true; s.move = String(m.move || 'idle').slice(0, 20); s.moveAt = now; s.combo = Math.floor(Number(m.combo) || 0);
        for (const q of room.players.values()) send(q, { type: 'stage', pid: p.id, move: s.move, combo: s.combo }); return true; }
      case 'danceEnd': { const s = N.stage; if (!s || s.pid !== p.id) return true; N.stage = null;
        const frac = Math.max(0, Math.min(1, Number(m.score) || 0)), early = now - s.start < 20000, tips = early ? 0 : Math.round(Math.pow(frac, 1.6) * 350 / 5) * 5; // client-reported: capped at $350, needs a real song's worth of dancing
        p.money += tips; toast(p, tips ? `💃 The crowd threw ${money(tips)} on the stage!` : '💃 Tough crowd. Nobody tipped.', tips ? 'win' : 'info'); if (tips >= 150) feed(room, `💃 ${p.name} killed it at Amateur Night: ${money(tips)} in tips.`); broadcast(room); return true; }
      default: return false;
    }
  }
  const view = (room, p) => { const N = room.n3; if (!N) return null; const s = N.stage, w = p.whisper, wev = w && room.events.find((e) => e.status === 'open' && e.idx === w.ev); if (w && !wev) p.whisper = null;
    return { on: N.on, club: N.club, level: N.level, stage: s ? { pid: s.pid, name: s.name, until: s.until, move: s.move } : null, groomBy: N.groomBy, groomDone: !!N.groomDone, hype: N.hype || 0,
      me: { vip: !!p.vip, shots: p.shots ? { stake: p.shots.stake, pot: p.shots.pot, n: p.shots.n, taken: p.shots.taken } : null, sober: p.sober ? { until: p.sober.until } : null, carUntil: p.carUntil || 0, rain: p.rain || 0, whisper: wev ? { from: w.from, who: w.who, label: wev.label, a: wev.a, b: wev.b } : null } }; };
  const busy = (p) => !!(p.sober || p.carUntil > Date.now());
  return { start, stop, handle, view, busy, inClub, CLUB };
};
