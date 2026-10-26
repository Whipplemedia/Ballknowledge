const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { SPORTS, SEASONS } = require('./seasons');

const PORT = process.env.PORT || 3000;
const SPEED = Number(process.env.BK_SPEED || 1); // dev: divide all timers
const PACES = {
  normal: { label: 'Normal (2 min windows)', window: 120000, air: 180000, lead: 30000 },
  quick: { label: 'Quick (50 sec windows)', window: 50000, air: 70000, lead: 15000 },
};
const START_MONEY = 2000;
const LOAN = 1000, LOAN_DEBT = 1250, MAX_LOANS = 3, MOB_CUT = 0.2, HUNT_MS = 100000;
const SPIN_MS = 8000, DRUNK_DECAY_MS = 6000;
const BOTTLE_RESPAWN_MS = 45000;
// roulette: total return multiplier for a winning bet (stake included), and whether a pick covers number n
const rouletteMult = (pk) => (/^\d{1,2}$/.test(pk) && Number(pk) <= 36 ? 36 : ['red', 'black', 'odd', 'even', 'low', 'high'].includes(pk) ? 2 : /^[dc][123]$/.test(pk) ? 3 : 0);
const rouletteWins = (pk, n) => {
  if (/^\d+$/.test(pk)) return Number(pk) === n; if (n === 0) return false;
  if (pk === 'red' || pk === 'black') return colorOf(n) === pk; if (pk === 'odd') return n % 2 === 1; if (pk === 'even') return n % 2 === 0;
  if (pk === 'low') return n <= 18; if (pk === 'high') return n >= 19; if (pk[0] === 'd') return Math.ceil(n / 12) === Number(pk[1]); if (pk[0] === 'c') return ((n - 1) % 3) + 1 === Number(pk[1]);
  return false;
};
const DRINKS = [
  { id: 'beer', name: 'Cold Domestic', emoji: '🍺', price: 30, add: 18, blurb: 'Lukewarm, but it works.' },
  { id: 'shot', name: 'Well Shot', emoji: '🥃', price: 60, add: 30, blurb: 'Does not taste like anything good.' },
  { id: 'whiskey', name: 'Top-Shelf Whiskey', emoji: '🥂', price: 120, add: 42, blurb: 'The expensive stuff. Confidence in a glass.' },
  { id: 'mystery', name: 'Bartender\'s Special', emoji: '🧪', price: 90, add: 55, blurb: 'Ingredients: unknown. Side effects: yes.' },
];
const MG = { darts: { max: 180 }, bowling: { max: 20 }, cornhole: { max: 12 } };
const OPPS = { rookie: { label: 'Rookie', mult: 1.6 }, regular: { label: 'Regular', mult: 2.0 }, shark: { label: 'The Shark', mult: 2.8 } };
const NPC_SKILL = { darts: { rookie: [45, 18], regular: [70, 22], shark: [98, 26] }, bowling: { rookie: [9, 3], regular: [12.5, 3.2], shark: [16, 3] }, cornhole: { rookie: [3, 1.8], regular: [5, 2], shark: [7.5, 2] } };
const POOL_MULT = { rookie: 1.7, shark: 2.6 };
const QUOTA_MULT = [1.0, 1.12, 1.3];
const TICKETS = { base: 5, crewWin: 15, quota: 8 };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
const BOUNTIES = [
  { id: 'darts_reg', text: 'Beat the Regular or Shark at darts', reward: 12, on: 'challengeWin', test: (d) => d.game === 'darts' && d.opp !== 'rookie' },
  { id: 'bowl_win', text: 'Win a bowling challenge', reward: 10, on: 'challengeWin', test: (d) => d.game === 'bowling' },
  { id: 'corn_win', text: 'Win a cornhole challenge', reward: 10, on: 'challengeWin', test: (d) => d.game === 'cornhole' },
  { id: 'shark', text: 'Beat The Shark at anything', reward: 18, on: 'challengeWin', test: (d) => d.opp === 'shark' },
  { id: 'pool', text: 'Win a game of pool', reward: 12, on: 'poolWin' },
  { id: 'spread', text: 'Win a spread bet', reward: 8, on: 'betWin', test: (d) => d.mk === 'spread' },
  { id: 'total', text: 'Win an over/under bet', reward: 8, on: 'betWin', test: (d) => d.mk === 'total' },
  { id: 'dog', text: 'Win a bet at +140 or longer', reward: 12, on: 'betWin', test: (d) => d.dec >= 2.4 },
  { id: 'big', text: 'Win a $400+ bet', reward: 12, on: 'betWin', test: (d) => d.stake >= 400 },
  { id: 'drunkwin', text: 'Win a bet while buzzed or drunker', reward: 12, on: 'betWin', test: (d) => d.band >= 2 },
  { id: 'wasted', text: 'Get absolutely wasted', reward: 8, on: 'drunk', test: (d) => d.level >= 85 },
  { id: 'rlt', text: 'Hit green or a straight number on roulette', reward: 20, on: 'roulette', test: (d) => d.win && (d.color === 'green' || d.isNum) },
  { id: 'fixed', text: 'Fix a game and watch it flip', reward: 12, on: 'fixFlip' },
  { id: 'fight', text: 'Win a bet on a bar fight', reward: 8, on: 'fightWin' },
  { id: 'collect', text: 'Help beat down Sal\'s collectors', reward: 12, on: 'shakeBeat' },
];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

const rooms = new Map();
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const money = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const dur = (ms) => Math.max(1, Math.round(ms / SPEED));

function seeded(str) { // mulberry32 over a string hash
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- odds ----------
const parsePct = (rec) => { const n = String(rec).split('-').map(Number); const g = n.reduce((a, b) => a + b, 0); return g ? n[0] / g : 0.5; };
const dec = (p, vig = 1.05) => Math.max(1.03, Math.round((1 / (clamp(p, 0.04, 0.96) * vig)) * 100) / 100);
const american = (d) => (d >= 2 ? '+' + Math.round((d - 1) * 100) : String(-Math.round(100 / (d - 1))));
const half = (x) => Math.round(x * 2) / 2;

function buildMarkets(sport, season, ev, rng) {
  const pa = clamp(parsePct(season.teams[ev.a].rec), 0.12, 0.88), pb = clamp(parsePct(season.teams[ev.b].rec), 0.12, 0.88);
  let p = (pa * (1 - pb)) / (pa * (1 - pb) + pb * (1 - pa));
  if (!ev.n) p += sport.home;
  p = clamp(p, 0.1, 0.9);
  const ml = { a: { dec: dec(p) }, b: { dec: dec(1 - p) } };
  const fav = p >= 0.5 ? 'a' : 'b', dog = fav === 'a' ? 'b' : 'a', pf = Math.max(p, 1 - p);
  let m, specDec;
  if (sport.fixed) {
    m = sport.fixed;
    const pc = clamp(pf - 0.2, 0.28, 0.62);
    specDec = { [fav]: dec(pc), [dog]: dec(1 - pc) };
  } else {
    m = Math.max(0.5, half(Math.log(pf / (1 - pf)) * sport.S));
    specDec = { a: 1.91, b: 1.91 };
  }
  const spread = { [fav]: { line: -m, dec: specDec[fav] }, [dog]: { line: m, dec: specDec[dog] } };
  const noise = { football: 3, basketball: 4, hockey: 0.7, baseball: 1.2 }[sport.kind] || 3;
  const base = season.ou || sport.ou;
  const line = Math.max(0.5, half(base + (rng() - 0.5) * 2 * noise));
  const total = { line: Math.floor(line) + 0.5, over: { dec: 1.91 }, under: { dec: 1.91 } };
  for (const s of ['a', 'b']) ml[s].am = american(ml[s].dec);
  return { ml, spread, total, p };
}

// ---------- highlight script (simulated recap that always lands on the true score) ----------
function validRem(r) { return r >= 0 && r !== 1; }
function splitFootball(score, rng) {
  const out = []; let r = score;
  while (r > 0) {
    const opts = [[7, 0.6], [3, 0.36], [2, 0.04]].filter(([x]) => x <= r && validRem(r - x));
    let roll = rng() * opts.reduce((a, [, w]) => a + w, 0), x = opts[opts.length - 1][0];
    for (const [v, w] of opts) { if ((roll -= w) <= 0) { x = v; break; } }
    out.push(x); r -= x;
  }
  return out;
}
function splitBasket(score, rng) {
  const out = []; let r = score;
  while (r > 0) { const x = r >= 3 ? pick([2, 2, 2, 2, 3, 3, 1]) : r; out.push(Math.min(x, r)); r -= out[out.length - 1]; }
  return out;
}
function genHighlights(sport, ev, season, rng) {
  const sc = { a: ev.rsa, b: ev.rsb };
  const nm = (s) => season.teams[ev[s]].short, star = (s) => { const st = season.teams[ev[s]].stars; return st.length ? st[Math.floor(rng() * st.length)][0] : null; };
  const kind = sport.kind;
  const T = ev.ot || ev.ex ? Math.min(sc.a, sc.b) - (kind === 'basketball' ? Math.floor(rng() * 3) : 0) : null; // regulation tie score
  const items = []; // {f, team, pts, txt, per}
  const add = (team, pts, f, txt, per) => items.push({ f, team, pts, txt, per });
  const regF = (i, n, ot) => (ot ? 0.9 + 0.08 * (i + 1) / (n + 1) : 0.04 + 0.84 * ((i + 1) / (n + 1)));
  for (const s of ['a', 'b']) {
    const total = sc[s], regTotal = T === null ? total : Math.max(0, Math.min(total, T)), otTotal = total - regTotal;
    const split = (n) => (kind === 'football' ? splitFootball(n, rng) : kind === 'basketball' ? splitBasket(n, rng) : Array(n).fill(1));
    const reg = split(regTotal), ot = split(otTotal);
    const times = (arr, otF) => arr.map(() => (otF ? 0.9 + rng() * 0.08 : 0.04 + rng() * 0.84)).sort((x, y) => x - y);
    const tr = times(reg, false), to = times(ot, true);
    const label = (pts, f, o) => {
      const per = o ? 'OT' : kind === 'baseball' ? `${f < 0.5 ? 'T' : 'B'}${Math.max(1, Math.min(9, Math.ceil(f * 9 / 0.92)))}` : sport.pace.length ? sport.pace[Math.min(sport.pace.length - 1, Math.floor(f / 0.9 * sport.pace.length))] : '';
      const who = star(s) || nm(s);
      let txt;
      if (kind === 'football') txt = pts === 7 ? `TOUCHDOWN ${nm(s)}! ${who} finds the end zone` : pts === 3 ? `Field goal good for ${nm(s)}` : `Safety - ${nm(s)} gets 2`;
      else if (kind === 'basketball') txt = pts === 3 ? `${who} hits a three!` : pts === 2 ? `${nm(s)} scores inside` : `${nm(s)} at the line`;
      else if (kind === 'hockey') txt = `GOAL ${nm(s)}! ${who} lights the lamp`;
      else txt = `${nm(s)} scores - ${who} drives in a run`;
      return { txt, per };
    };
    reg.forEach((pts, i) => { const { txt, per } = label(pts, tr[i], false); add(s, pts, tr[i], txt, per); });
    ot.forEach((pts, i) => { const { txt, per } = label(pts, to[i], true); add(s, pts, to[i], txt, per); });
  }
  items.sort((x, y) => x.f - y.f);
  // flavor filler so the broadcast keeps moving
  const flavors = {
    football: ['Big stop by the {a} defense', 'Third-down conversion keeps the drive alive', 'Penalty flag - replay under review', '{b} punts it away'],
    basketball: ['Timeout {a}', 'Huge block at the rim', 'Coach is furious on the sideline', 'Crowd is on its feet'],
    hockey: ['Great save by the {a} goalie', 'Power play for {b}', 'Hit along the boards - whistle', 'Post! So close'],
    baseball: ['Strikeout looking', 'Double play ends the threat', 'Pitching change for {b}', 'Fly out to deep center'],
  }[kind];
  const out = []; let sa = 0, sb = 0, per0 = sport.pace[0] || (kind === 'baseball' ? 'T1' : '');
  let nextFlavor = 0.06;
  const push = (f, txt, per) => out.push({ f: Math.min(1, f), sa, sb, txt, per: per || per0 });
  push(0, 'Opening kickoff of the highlights package...', per0);
  for (const it of items) {
    while (nextFlavor < it.f - 0.02) { push(nextFlavor, pick(flavors).replace('{a}', nm('a')).replace('{b}', nm('b')), per0); nextFlavor += 0.07 + rng() * 0.05; }
    if (it.team === 'a') sa += it.pts; else sb += it.pts;
    per0 = it.per || per0; push(it.f, it.txt, it.per); nextFlavor = Math.max(nextFlavor, it.f + 0.03);
    if (kind === 'basketball' && out.length > 4 && rng() < 0.5) out[out.length - 1].txt = ''; // silent score changes keep it fast
  }
  push(0.985, ev.ot || ev.ex ? 'FINAL (extra time)' : 'FINAL', 'FINAL'); out[out.length - 1].sa = ev.rsa; out[out.length - 1].sb = ev.rsb;
  out.push({ f: 1, sa: ev.rsa, sb: ev.rsb, txt: 'FINAL', per: 'FINAL' });
  return out;
}

// ---------- rooms ----------
function newCode() {
  let c; do c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[rnd(24)]).join(''); while (rooms.has(c));
  return c;
}
function newPlayer(id, name, ws) {
  return { id, name, ws, token: crypto.randomBytes(16).toString('hex'), connected: true, money: START_MONEY, debt: 0, loans: 0, mobTied: false, bets: {}, fix: {}, results: {}, drunk: 0, drunkT: 0,
    finalCorrect: null, fate: null, lastMg: 0, lastHit: 0, lastBottle: 0, lastTake: 0, credits: [], koUntil: 0, koImmune: 0, lastDrink: 0, remaining: 0, color: 0, x: 0, z: 2, ry: 0, tickets: 0, bounties: [], challenge: null, pool: null, streak: { darts: 0, bowling: 0, cornhole: 0 }, cos: {} };
}
function createRoom() {
  const room = { code: newCode(), hostId: null, btaken: {}, players: new Map(), phase: 'lobby', sport: 'nba', pace: 'normal', season: null, sportDef: null, events: [], feed: [],
    tick: null, quota: [], shake: null, barEvent: null, nextBarEvent: 0, lastBarKind: null, hp: 0, maxHp: 0, huntEnd: 0, finalWinner: null, altered: false, summary: null, spin: null, t0: 0 };
  rooms.set(room.code, room); return room;
}
const feed = (room, text) => { room.feed.push({ t: Date.now(), text }); if (room.feed.length > 50) room.feed.shift(); };
const plist = (room) => [...room.players.values()];
const send = (p, msg) => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
const toast = (p, text, kind = 'info') => send(p, { type: 'toast', text, kind });
const drunkNow = (p) => { const now = Date.now(); if (p.drunk > 0) { p.drunk = Math.max(0, p.drunk - (now - p.drunkT) / dur(DRUNK_DECAY_MS)); } p.drunkT = now; return p.drunk; };
const band = (d) => (d < 15 ? 0 : d < 40 ? 1 : d < 65 ? 2 : d < 85 ? 3 : 4);

function networth(room, p) {
  let n = p.money - p.debt;
  for (const [idx, b] of Object.entries(p.bets)) { const ev = room.events[idx]; if (ev && ev.status !== 'final') for (const x of Object.values(b)) n += x.stake; }
  if (p.challenge) n += p.challenge.stake; if (p.pool) n += p.pool.stake;
  return n;
}
function award(room, p, type, data = {}) {
  for (const b of p.bounties) if (!b.done && b.on === type && (!b.test || b.test(data, p))) { b.done = true; p.tickets += b.reward; toast(p, `🎯 Bounty complete: ${b.text} (+${b.reward} tickets)`, 'win'); }
}
function awardAll(room, type, data) { for (const p of room.players.values()) award(room, p, type, data); }

function startGame(room) {
  const sport = SPORTS[room.sport];
  room.sportDef = sport;
  const season = pick(SEASONS[room.sport]); room.season = season;
  const pc = PACES[room.pace], win = dur(pc.window), air = dur(pc.air), lead = dur(pc.lead);
  const now = Date.now(); room.t0 = now;
  room.events = season.events.map((e, i) => {
    const rng = seeded(room.code + ':' + i + ':' + now);
    const openAt = i === 0 ? now : now + lead + i * win, closeAt = now + lead + (i + 1) * win;
    return { idx: i, ...e, openAt, closeAt, resolveAt: closeAt + air, status: i === 0 ? 'open' : 'upcoming', mk: buildMarkets(sport, season, e, rng), result: null, air: null };
  });
  room.events[0].openAt = now;
  for (const p of room.players.values()) {
    Object.assign(p, { money: START_MONEY, debt: 0, loans: 0, mobTied: false, bets: {}, fix: {}, results: {}, drunk: 0, drunkT: now, finalCorrect: null, fate: null, remaining: 0, tickets: 0, challenge: null, pool: null, streak: { darts: 0, bowling: 0, cornhole: 0 }, lastChallenge: 0 });
    p.bounties = [...BOUNTIES].sort(() => Math.random() - 0.5).slice(0, 3).map((b) => ({ ...b, done: false }));
  }
  const nE = room.events.length, start = START_MONEY * room.players.size;
  room.quota = [{ kind: 'mid', idx: Math.max(0, Math.round(nE * 0.33) - 1) }, { kind: 'mid', idx: Math.max(1, Math.round(nE * 0.7) - 1) }, { kind: 'final', idx: nE - 1 }].map((q, i) => ({ ...q, target: Math.round(start * QUOTA_MULT[i]), status: 'pending', crew: 0 }));
  room.shake = null; room.barEvent = null; room.nextBarEvent = now + dur(55000 + rnd(30000)); room.lastBarKind = null;
  room.altered = false; room.finalWinner = null; room.phase = 'play';
  feed(room, `${sport.emoji} A season has been assigned. Nobody will tell you which one. Place your bets before the clock runs out.`);
  clearInterval(room.tick); room.tick = setInterval(() => tick(room), 400);
  broadcast(room);
}

// ---------- tick: open -> airing (locked) -> final ----------
function resolveSpin(room) {
  const sp = room.spin; room.spin = null; const p = room.players.get(sp.pid); if (!p) return;
  const { n, color, bets, total } = sp;
  let win = 0, numWin = false; for (const b of bets) if (rouletteWins(b.pick, n)) { win += b.stake * rouletteMult(b.pick); if (/^\d+$/.test(b.pick)) numWin = true; }
  p.money += win; award(room, p, 'roulette', { win: win > 0, color, isNum: numWin });
  const net = win - total;
  toast(p, win ? `${n} ${color}! You get back ${money(win)} (${net >= 0 ? '+' : ''}${money(net)})` : `${n} ${color}. You lose ${money(total)}.`, net > 0 ? 'win' : 'err');
  feed(room, `🎰 ${p.name} ${net > 0 ? 'won ' + money(net) : 'lost ' + money(-net)} on roulette (${n} ${color}).`);
  broadcast(room);
}
function tick(room) {
  if (room.spin && Date.now() >= room.spin.until + 400) resolveSpin(room);
  if (room.phase === 'hunt') { if (Date.now() >= room.huntEnd) endHunt(room); return; } // hitmen deadline (tick-driven so it survives a restart)
  if (room.phase !== 'play') return;
  const now = Date.now(); let changed = false;
  for (const ev of room.events) {
    if (ev.status === 'upcoming' && now >= ev.openAt) { ev.status = 'open'; changed = true; feed(room, `📣 ${ev.label}: ${ev.a} vs ${ev.b} - betting is OPEN.`); }
    if (ev.status === 'open' && now >= ev.closeAt) { lockEvent(room, ev); changed = true; }
    if (ev.status === 'airing' && now >= ev.resolveAt) { finalizeEvent(room, ev); changed = true; }
  }
  if (room.shake && now >= room.shake.until) { endShake(room, false); changed = true; }
  if (room.barEvent && now >= room.barEvent.until) { endBarEvent(room); changed = true; }
  else if (!room.barEvent && !room.shake && now >= room.nextBarEvent) { startBarEvent(room); changed = true; }
  if (changed) {
    broadcast(room);
    if (room.events.every((e) => e.status === 'final') && room.phase === 'play' && !room.shake) settle(room);
  }
}

function lockEvent(room, ev) {
  const season = room.season, nat = ev.sa > ev.sb ? 'a' : 'b';
  const fixers = plist(room).filter((p) => p.fix[ev.idx]);
  const sides = new Set(fixers.map((p) => p.fix[ev.idx]));
  const price = fixPrice(room, ev);
  for (const p of fixers) { p.debt += price; p.mobTied = true; p._fixPaid = true; toast(p, `The mob took ${money(price)} for the fix on ${ev.label}. It's on your tab.`, 'mob'); }
  let winner = nat, fixed = false, contested = sides.size > 1;
  if (sides.size === 1) { const s = [...sides][0]; if (s !== nat) { winner = s; fixed = true; room.altered = true; } }
  ev.rsa = ev.sa; ev.rsb = ev.sb;
  if (fixed) { ev.rsa = ev.sb; ev.rsb = ev.sa; } // flip the scoreboard
  ev.result = { sa: ev.rsa, sb: ev.rsb, winner, fixed, contested };
  if (fixed && !contested) for (const p of fixers) award(room, p, 'fixFlip');
  const rng = seeded(room.code + ':air:' + ev.idx);
  ev.air = { plays: genHighlights(room.sportDef, ev, season, rng) };
  ev.status = 'airing';
  feed(room, `📺 ${ev.label} is on the TV - highlights rolling.`);
}

function settleBets(room, ev) {
  const r = ev.result, win = r.winner;
  for (const p of room.players.values()) {
    const bets = p.bets[ev.idx] || {}, notes = []; let delta = 0, ret = 0;
    for (const [mk, b] of Object.entries(bets)) {
      let won = false, label;
      if (mk === 'ml') { won = b.pick === win; label = `${b.pick === 'a' ? ev.a : ev.b} ML`; }
      else if (mk === 'spread') { const my = b.pick === 'a' ? r.sa : r.sb, other = b.pick === 'a' ? r.sb : r.sa; won = my + b.line > other; label = `${b.pick === 'a' ? ev.a : ev.b} ${b.line > 0 ? '+' : ''}${b.line}`; }
      else { const tot = r.sa + r.sb; won = b.pick === 'over' ? tot > b.line : tot < b.line; label = `${b.pick === 'over' ? 'Over' : 'Under'} ${b.line}`; }
      if (won) { const pay = b.stake * b.dec; ret += pay; delta += pay - b.stake; notes.push(`✅ ${label}: +${money(pay - b.stake)}`); award(room, p, 'betWin', { mk, dec: b.dec, stake: b.stake, band: b.band || 0 }); } else { delta -= b.stake; notes.push(`❌ ${label}: -${money(b.stake)}`); }
    }
    p.money += ret;
    if (ev.final) p.finalCorrect = !!(bets.ml && bets.ml.pick === win);
    if (p.fix[ev.idx]) notes.push(r.contested ? 'Another crew fixed it the other way - the mob kept both fees.' : r.fixed ? 'The fix was in.' : 'You paid for a fix on a result that was already going your way.');
    p.results[ev.idx] = { delta: Math.round(delta), notes };
    if (notes.length || bets.ml) toast(p, `${ev.label}: ${delta >= 0 ? '+' : ''}${money(delta)}`, delta >= 0 ? 'win' : 'err');
  }
}

function finalizeEvent(room, ev) {
  ev.status = 'final';
  settleBets(room, ev);
  const r = ev.result, w = r.winner === 'a' ? ev.a : ev.b, l = r.winner === 'a' ? ev.b : ev.a;
  feed(room, `🏁 FINAL - ${ev.label}: ${w} def. ${l}, ${r.winner === 'a' ? r.sa + '-' + r.sb : r.sb + '-' + r.sa}${ev.ot ? ' (OT)' : ''}.`);
  if (r.fixed) feed(room, `🕵️ Rumors swirl about the officiating in the ${ev.label}...`);
  if (ev.final) room.finalWinner = w;
  const q = room.quota.find((x) => x.idx === ev.idx && x.status === 'pending'); if (q) checkQuota(room, q);
}

// ---------- the mob's quota ----------
function checkQuota(room, q) {
  const crew = plist(room).reduce((a, p) => a + networth(room, p), 0); q.crew = Math.round(crew);
  if (crew >= q.target) {
    q.status = 'met'; feed(room, `✅ Sal is pleased: the crew hit the ${money(q.target)} quota.`);
    for (const p of room.players.values()) { p.tickets += TICKETS.quota; if (q.kind === 'mid') p.money += 150; toast(p, q.kind === 'mid' ? `Sal's thank-you: +$150 and +${TICKETS.quota} tickets` : `Final quota met: +${TICKETS.quota} tickets`, 'win'); }
  } else {
    q.status = 'missed'; feed(room, `⚠️ The crew missed the ${money(q.target)} quota (${money(crew)}).`);
    if (q.kind === 'mid') startShake(room, q.target - crew);
  }
}
function startShake(room, shortfall) {
  const tax = clamp(Math.round(shortfall * 0.5 / 50) * 50, 400, 3000);
  room.shake = { tax, paid: 0, hp: 60 + tax / 30, maxHp: 60 + tax / 30, until: Date.now() + dur(32000), hits: {} };
  feed(room, `🔫 Sal's collectors walk in. They want ${money(tax)} - pay up together, or beat them down!`);
}
function endShake(room, beaten) {
  const sh = room.shake; if (!sh) return; room.shake = null;
  if (beaten) { feed(room, `👊 The crew threw Sal's collectors out. Free of charge.`); awardAll(room, 'shakeBeat'); return; }
  const left = sh.tax - sh.paid;
  if (left <= 0) { feed(room, `💸 The crew paid the collectors. Sal is satisfied.`); return; }
  const each = Math.ceil(left / room.players.size);
  for (const p of room.players.values()) { const take = Math.min(p.money, each); p.money -= take; toast(p, `The collectors shook you down for ${money(take)}.`, 'mob'); }
  feed(room, `💼 The collectors took the remaining ${money(left)} and left.`);
}

// ---------- chaos: random bar events ----------
const FIGHTERS = ['Big Tony', 'Skinny Pete', 'Two-Beer Terry', 'Crazy Carl', 'Mad Dog Mike', 'Slappy Sam', 'Gentle Gus', 'Brick Bobby'];
function startBarEvent(room) {
  const kinds = ['happy', 'fight', 'blackout', 'tip'].filter((k) => k !== room.lastBarKind);
  const open = room.events.find((e) => e.status === 'open');
  let kind = pick(kinds); if (kind === 'tip' && !open) kind = 'happy'; if (process.env.BK_FORCE_EVENT) kind = process.env.BK_FORCE_EVENT; // dev/testing only
  const now = Date.now(); room.lastBarKind = kind;
  if (kind === 'happy') { room.barEvent = { kind, until: now + dur(45000), title: 'HAPPY HOUR', text: 'Drinks are HALF PRICE!' }; feed(room, '🍻 HAPPY HOUR! Drinks are half price.'); }
  else if (kind === 'blackout') { room.barEvent = { kind, until: now + dur(18000), title: 'BLACKOUT', text: 'The power is out! No hints, no TVs.' }; feed(room, '🔦 The power went out!'); }
  else if (kind === 'fight') { const [a, b] = [...FIGHTERS].sort(() => Math.random() - 0.5); room.barEvent = { kind, until: now + dur(24000), betUntil: now + dur(14000), red: a, blue: b, bets: {}, title: 'BAR FIGHT!', text: `${a} vs ${b} - place your bets!` }; feed(room, `🥊 BAR FIGHT! ${a} (red) vs ${b} (blue).`); }
  else { const nat = open.sa > open.sb ? 'a' : 'b', side = Math.random() < 0.62 ? nat : nat === 'a' ? 'b' : 'a', who = pick(['Old Pete', 'Dizzy Dave', 'The Guy In The Corner', 'Sketchy Steve']); room.barEvent = { kind, until: now + dur(45000), title: 'HOT TIP', text: `${who} slides you a napkin...`, tip: { from: who, idx: open.idx, side } }; feed(room, `🗒️ ${who} whispers a hot tip to the crew.`); }
}
function endBarEvent(room) {
  const be = room.barEvent; room.barEvent = null; room.nextBarEvent = Date.now() + dur(65000 + rnd(50000));
  if (be.kind === 'fight') {
    const win = Math.random() < 0.5 ? 'red' : 'blue'; feed(room, `🥊 ${win === 'red' ? be.red : be.blue} wins the bar fight!`);
    for (const [pid, b] of Object.entries(be.bets)) { const p = room.players.get(pid); if (!p) continue; if (b.side === win) { p.money += b.stake * 1.9; toast(p, `Your fighter won! +${money(b.stake * 0.9)}`, 'win'); award(room, p, 'fightWin'); } else toast(p, `Your fighter got flattened. -${money(b.stake)}`, 'err'); }
  }
}



function _unused() {}
const fixPrice = (room, ev) => 1500 + 300 * ev.idx + (ev.final ? 2000 : 0);

// ---------- settlement (mob collects, hitmen arrive) ----------
function settle(room) {
  let total = 0;
  for (const p of room.players.values()) {
    const won = p.finalCorrect === true; let owe = p.debt;
    if (p.mobTied && won) owe += Math.round(MOB_CUT * Math.max(0, p.money - START_MONEY));
    const pay = Math.min(p.money, owe);
    if (owe > 0) { p.money -= pay; feed(room, `💼 The mob collected ${money(pay)} from ${p.name}.`); }
    p.remaining = owe - pay; p.debt = p.remaining; total += p.remaining;
  }
  const hunted = plist(room).filter((p) => p.remaining > 0);
  if (!hunted.length) return finish(room);
  room.maxHp = room.hp = clamp(60 + total / 40, 60, 600);
  room.phase = 'hunt'; room.huntEnd = Date.now() + dur(HUNT_MS);
  feed(room, `🔫 The hitmen are here for ${hunted.map((p) => p.name).join(', ')}. Pay up, win it back, or beat them down first!`);
  broadcast(room);
}
function endHunt(room) {
  if (room.phase !== 'hunt') return;
  const beaten = room.hp <= 0;
  for (const p of room.players.values()) {
    if (p.remaining > 0) { p.fate = beaten ? 'survived (beat the hitmen)' : 'dead'; if (!beaten) feed(room, `💀 ${p.name} was taken out by the mob.`); p.remaining = 0; }
    else if (p.mobTied) p.fate = 'paid up';
  }
  finish(room);
}
function finish(room) {
  clearInterval(room.tick); room.barEvent = null; room.shake = null;
  const s = room.season, ps = plist(room);
  for (const p of ps) if (!p.fate) p.fate = p.mobTied ? 'paid up' : 'safe';
  const correct = ps.filter((p) => p.finalCorrect).length;
  room.summary = { year: s.year, league: s.league, champion: s.champion, finalWinner: room.finalWinner, altered: room.altered, blurb: s.blurb,
    crewWon: correct >= Math.ceil(ps.length / 2) && correct > 0, correct, total: ps.length,
    players: ps.map((p) => ({ id: p.id, name: p.name, finalCorrect: p.finalCorrect, fate: p.fate, money: Math.round(p.money), tickets: TICKETS.base + p.tickets + (p.fate === 'dead' ? 0 : 3) + (correct >= Math.ceil(ps.length / 2) && correct > 0 ? TICKETS.crewWin : 0), bounties: p.bounties.filter((b) => b.done).length })) };
  room.phase = 'ended'; broadcast(room);
}

// ---------- hints (drunk confidence) ----------
function hintFor(room, p, ev) {
  const d = drunkNow(p), b = band(d); if (b === 0) return null;
  const season = room.season, rng = seeded(p.id + ':' + ev.idx + ':' + b);
  const acc = [0, 0.64, 0.78, 0.9, 0.5][b];
  const nat = ev.sa > ev.sb ? 'a' : 'b', other = (s) => (s === 'a' ? 'b' : 'a');
  const mlSide = rng() < acc ? nat : other(nat);
  const tot = ev.sa + ev.sb, truthTot = tot > ev.mk.total.line ? 'over' : 'under';
  const totPick = rng() < acc - 0.06 ? truthTot : truthTot === 'over' ? 'under' : 'over';
  const margin = Math.abs(ev.sa - ev.sb);
  const cover = (() => { const sa = ev.mk.spread.a.line; return ev.sa + sa > ev.sb ? 'a' : 'b'; })();
  const spSide = rng() < acc - 0.1 ? cover : other(cover);
  const nm = (s) => ev[s], sh = (s) => season.teams[ev[s]].short;
  const starOf = (s) => { const st = season.teams[ev[s]].stars; return st.length ? st[Math.floor(rng() * st.length)][0] : null; };
  const T = (arr) => arr[Math.floor(rng() * arr.length)];
  const hint = { band: b, level: ['sober', 'tipsy', 'buzzed', 'drunk', 'wasted'][b], acc };
  if (b === 1) {
    hint.ml = { side: mlSide, conf: 1, text: T([`Mmm... something about ${sh(mlSide)} just feels right tonight.`, `I've got a weird good feeling about ${sh(mlSide)}.`, `Don't ask me why, but ${sh(mlSide)}.`]) };
    hint.total = { pick: totPick, conf: 1, text: totPick === 'over' ? 'This one feels like it gets loud.' : 'Feels like a grind. Low scoring, maybe.' };
  } else if (b === 2) {
    const s = starOf(mlSide);
    hint.ml = { side: mlSide, conf: 2, text: s ? `${s} is gonna EAT tonight. I can feel it.` : `${nm(mlSide)} are locked in. Trust the buzz.` };
    hint.total = { pick: totPick, conf: 2, text: totPick === 'over' ? `Both offenses are cooking - over ${ev.mk.total.line}, easy.` : `Defenses win this one. Under ${ev.mk.total.line}.` };
    hint.spread = { side: spSide, conf: 2, text: margin >= Math.abs(ev.mk.spread[spSide].line) ? `${sh(spSide)} cover without sweating.` : `Tight game - take the points.` };
  } else if (b === 3) {
    hint.ml = { side: mlSide, conf: 3, text: `I would bet the HOUSE on ${nm(mlSide)}. Put that on a napkin.` };
    hint.total = { pick: totPick, conf: 3, text: `${totPick === 'over' ? 'OVER' : 'UNDER'} ${ev.mk.total.line}. I will fight anyone.` };
    hint.spread = { side: spSide, conf: 3, text: `${sh(spSide)} ${ev.mk.spread[spSide].line > 0 ? '+' : ''}${ev.mk.spread[spSide].line}. Lock it.` };
  } else {
    const rs = rng() < 0.5 ? 'a' : 'b';
    hint.ml = { side: rs, conf: 3, text: T([`hic... ${sh(rs)}... or the other guy... definitely the first one`, `bro... bro... ${nm(rs)}. i'm SO sure. what were we talking about`, `*burp* trust me... ${sh(rs)}!`]) };
    hint.total = { pick: rng() < 0.5 ? 'over' : 'under', conf: 3, text: 'the number is... a number. go big.' };
  }
  return hint;
}

// ---------- intel panel ----------
function intel(room, ev, side) {
  const season = room.season, name = ev[side], team = season.teams[name];
  const form = room.events.filter((e) => e.status === 'final' && e.idx < ev.idx && (e.a === name || e.b === name)).slice(-5).map((e) => {
    const mine = e.a === name ? 'a' : 'b', won = e.result.winner === mine;
    return { res: won ? 'W' : 'L', opp: e.a === name ? e.b : e.a, score: `${e.result[mine === 'a' ? 'sa' : 'sb']}-${e.result[mine === 'a' ? 'sb' : 'sa']}`, label: e.label };
  });
  return { name, short: team.short, color: team.color, rec: team.rec, stars: team.stars, note: team.note, form, home: !ev.n && side === 'a' };
}
function seriesText(room, ev) {
  if (!ev.series) return null;
  const tally = Object.assign({}, ev.pre || {});
  const first = room.events.find((e) => e.series === ev.series);
  const base = Object.assign({}, first.pre || {});
  const t = base;
  for (const e of room.events) if (e.series === ev.series && e.idx < ev.idx && e.status === 'final') { const w = e.result.winner === 'a' ? e.a : e.b; t[w] = (t[w] || 0) + 1; }
  const A = t[ev.a] || 0, B = t[ev.b] || 0;
  const sh = (n) => room.season.teams[n].short;
  return A === B ? `Series tied ${A}-${B}` : `${sh(A > B ? ev.a : ev.b)} leads ${Math.max(A, B)}-${Math.min(A, B)}`;
}

// ---------- state views ----------
function evSummary(ev, forTv) {
  const o = { idx: ev.idx, label: ev.label, a: ev.a, b: ev.b, status: ev.status, openAt: ev.openAt, closeAt: ev.closeAt, resolveAt: ev.resolveAt, final: !!ev.final, n: !!ev.n, ot: !!ev.ot, ex: ev.ex || 0 };
  if (ev.status === 'final') o.result = ev.result;
  if (ev.status === 'airing') o.plays = ev.air.plays;
  return o;
}
function view(room, p) {
  const d = Math.round(drunkNow(p));
  const v = { type: 'state', now: Date.now(), code: room.code, you: p.id, host: room.hostId === p.id, phase: room.phase, sport: room.sport, pace: room.pace,
    sports: Object.entries(SPORTS).map(([id, s]) => ({ id, label: s.label, emoji: s.emoji })), paces: Object.entries(PACES).map(([id, x]) => ({ id, label: x.label })),
    feed: room.feed.slice(-25), drinks: DRINKS, btaken: room.btaken, // bottle spots on tables: index -> respawn time

    players: plist(room).map((q) => ({ id: q.id, name: q.name, color: q.color, cos: q.cos || {}, money: Math.round(q.money), connected: q.connected, fate: q.fate, drunk: Math.round(drunkNow(q)),
      hunted: room.phase === 'hunt' && q.remaining > 0, finalCorrect: room.phase === 'ended' ? q.finalCorrect : null })),
    me: { money: Math.round(p.money), debt: Math.round(p.debt), loans: p.loans, mobTied: p.mobTied, remaining: Math.round(p.remaining), drunk: d, decay: dur(DRUNK_DECAY_MS), band: band(d), bets: p.bets, fix: p.fix, results: p.results, tickets: p.tickets || 0, streak: p.streak || {}, challenge: p.challenge, pool: p.pool ? { opp: p.pool.opp, stake: p.pool.stake } : null,
      bounties: (p.bounties || []).map((b) => ({ id: b.id, text: b.text, reward: b.reward, done: b.done })) } };
  if (room.season && room.phase !== 'lobby') {
    v.events = room.events.map((e) => evSummary(e));
    v.teams = Object.fromEntries(Object.entries(room.season.teams).map(([n, t]) => [n, { short: t.short, color: t.color }]));
    v.quota = room.quota.map((q) => ({ kind: q.kind, idx: q.idx, target: q.target, status: q.status, crew: q.crew }));
    v.crewNow = Math.round(plist(room).reduce((a, q) => a + networth(room, q), 0));
    v.barEvent = room.barEvent ? { kind: room.barEvent.kind, until: room.barEvent.until, betUntil: room.barEvent.betUntil, red: room.barEvent.red, blue: room.barEvent.blue, title: room.barEvent.title, text: room.barEvent.text, mine: room.barEvent.bets ? room.barEvent.bets[p.id] || null : null } : null;
    v.shake = room.shake ? { tax: room.shake.tax, paid: room.shake.paid, hp: Math.ceil(room.shake.hp), maxHp: Math.ceil(room.shake.maxHp), until: room.shake.until } : null;
    v.spinning = room.spin ? { by: room.spin.name, until: room.spin.until } : null;
    const cur = room.events.find((e) => e.status === 'open');
    if (cur && room.phase === 'play') {
      v.cur = { idx: cur.idx, mk: cur.mk, series: seriesText(room, cur), fixPrice: fixPrice(room, cur), intel: { a: intel(room, cur, 'a'), b: intel(room, cur, 'b') },
        hint: room.barEvent && room.barEvent.kind === 'blackout' ? null : hintFor(room, p, cur), tip: room.barEvent && room.barEvent.tip && room.barEvent.tip.idx === cur.idx ? room.barEvent.tip : null, crew: plist(room).reduce((acc, q) => { const b = (q.bets[cur.idx] || {}).ml; if (b) acc[b.pick]++; return acc; }, { a: 0, b: 0 }) };
    }
  }
  if (room.phase === 'hunt') v.hunt = { hp: Math.ceil(room.hp), maxHp: Math.ceil(room.maxHp), until: room.huntEnd };
  if (room.phase === 'ended') v.summary = room.summary;
  return v;
}
function broadcast(room) { for (const p of room.players.values()) send(p, view(room, p)); }

// ---------- message handling ----------
const inPlay = (room) => room.phase === 'play' || room.phase === 'hunt';

function handle(room, p, m) {
  switch (m.type) {
    case 'setSport': if (room.hostId === p.id && room.phase === 'lobby' && SPORTS[m.sport]) { room.sport = m.sport; broadcast(room); } break;
    case 'setPace': if (room.hostId === p.id && room.phase === 'lobby' && PACES[m.pace]) { room.pace = m.pace; broadcast(room); } break;
    case 'start': if (room.hostId === p.id && room.phase === 'lobby') startGame(room); break;
    case 'rematch': if (room.hostId === p.id && room.phase === 'ended') {
      Object.assign(room, { phase: 'lobby', season: null, events: [], feed: [], altered: false, summary: null, spin: null, shake: null, barEvent: null, quota: [] });
      for (const q of room.players.values()) Object.assign(q, { bets: {}, fix: {}, results: {} });
      broadcast(room);
    } break;
    case 'bet': {
      const ev = room.events[m.ev]; if (room.phase !== 'play' || !ev || ev.status !== 'open') { toast(p, 'Betting is closed on that game.', 'err'); break; }
      const mk = m.market, pk = m.pick, stake = Math.floor(Number(m.stake));
      const okPick = (mk === 'ml' || mk === 'spread') ? ['a', 'b'].includes(pk) : mk === 'total' ? ['over', 'under'].includes(pk) : false;
      if (!okPick) break;
      const bets = (p.bets[ev.idx] = p.bets[ev.idx] || {});
      if (bets[mk]) { p.money += bets[mk].stake; delete bets[mk]; }
      if (!(stake >= 10) || stake > p.money) { toast(p, 'Invalid stake.', 'err'); broadcast(room); break; }
      const mkt = ev.mk, d = mk === 'ml' ? mkt.ml[pk].dec : mk === 'spread' ? mkt.spread[pk].dec : mkt.total[pk].dec;
      const line = mk === 'spread' ? mkt.spread[pk].line : mk === 'total' ? mkt.total.line : null;
      p.money -= stake; bets[mk] = { pick: pk, stake, dec: d, line, band: band(drunkNow(p)) }; broadcast(room); break;
    }
    case 'cancelBet': {
      const ev = room.events[m.ev]; if (!ev || ev.status !== 'open') break;
      const bets = p.bets[ev.idx] || {}; if (bets[m.market]) { p.money += bets[m.market].stake; delete bets[m.market]; broadcast(room); } break;
    }
    case 'loan':
      if (room.phase !== 'play' || p.loans >= MAX_LOANS) { toast(p, 'The mob is not lending right now.', 'err'); break; }
      p.loans++; p.money += LOAN; p.debt += LOAN_DEBT; p.mobTied = true;
      toast(p, `The mob lent you ${money(LOAN)}. You owe ${money(LOAN_DEBT)}.`, 'mob'); broadcast(room); break;
    case 'fix': {
      const ev = room.events[m.ev]; if (room.phase !== 'play' || !ev || ev.status !== 'open') break;
      if (m.side === null) delete p.fix[ev.idx]; else if (['a', 'b'].includes(m.side)) p.fix[ev.idx] = m.side;
      broadcast(room); break;
    }
    case 'drink': {
      const dr = DRINKS.find((x) => x.id === m.id);
      if (!dr || !inPlay(room) || Date.now() - p.lastDrink < 1200) break;
      const price = Math.round(dr.price * (room.barEvent && room.barEvent.kind === 'happy' ? 0.5 : 1));
      if (p.money < price) { toast(p, 'Bartender: "Come back when you can pay."', 'err'); break; }
      if (drunkNow(p) >= 100) { toast(p, 'Bartender: "You\'re cut off, pal."', 'err'); break; }
      p.lastDrink = Date.now(); p.money -= price; p.drunk = Math.min(100, drunkNow(p) + dr.add); award(room, p, 'drunk', { level: p.drunk });
      toast(p, `${dr.emoji} ${dr.name} - ${money(price)}. ${p.drunk >= 85 ? 'The room is spinning.' : p.drunk >= 40 ? 'You feel... confident.' : 'Warm.'}`, 'info'); broadcast(room); break;
    }
    case 'challenge': {
      const g = MG[m.game], opp = OPPS[m.opp]; if (room.phase !== 'play' || !g || !opp) break;
      const stake = Math.floor(Number(m.stake));
      if (p.challenge) { p.money += p.challenge.stake; p.challenge = null; }
      if (!(stake >= 25 && stake <= 300 && stake <= p.money)) { toast(p, 'Stakes are $25 - $300.', 'err'); broadcast(room); break; }
      const [mu, sd] = NPC_SKILL[m.game][m.opp], streak = p.streak[m.game] || 0;
      const target = Math.round(clamp(mu * (1 + 0.07 * streak) + gauss() * sd, 0, g.max));
      p.money -= stake; p.challenge = { game: m.game, opp: m.opp, stake, target, mult: opp.mult, expires: Date.now() + 180000 };
      toast(p, `${opp.label} posted a ${target}. Beat it for ${money(stake * opp.mult)}.`, 'mob'); broadcast(room); break;
    }
    case 'challengeCancel': if (p.challenge) { p.money += p.challenge.stake; p.challenge = null; broadcast(room); } break;
    case 'mg': {
      const g = MG[m.game];
      if (!inPlay(room) || !g || Date.now() - p.lastMg < 4000) break;
      const pts = Math.floor(Number(m.pts)); if (!(pts >= 0 && pts <= g.max)) break;
      p.lastMg = Date.now();
      const ch = p.challenge && p.challenge.game === m.game && Date.now() < p.challenge.expires ? p.challenge : null;
      if (!ch) { toast(p, `${m.game}: ${pts} - practice round (no payout). Challenge someone to play for cash.`, 'info'); break; }
      p.challenge = null; const L = OPPS[ch.opp].label;
      if (pts > ch.target) { const pay = ch.stake * ch.mult; p.money += pay; p.streak[m.game] = (p.streak[m.game] || 0) + 1; toast(p, `🏆 You beat ${L} ${pts}-${ch.target}! +${money(pay - ch.stake)}`, 'win'); award(room, p, 'challengeWin', { game: m.game, opp: ch.opp }); feed(room, `🎯 ${p.name} beat ${L} at ${m.game}.`); }
      else if (pts === ch.target) { p.money += ch.stake; toast(p, `Tie at ${pts}. Stake returned.`, 'info'); }
      else { p.streak[m.game] = 0; toast(p, `${L} wins ${ch.target}-${pts}. -${money(ch.stake)}`, 'err'); }
      broadcast(room); break;
    }
    case 'poolStart': {
      if (room.phase !== 'play' || !POOL_MULT[m.opp]) break;
      const stake = Math.floor(Number(m.stake)); if (p.pool) break;
      if (!(stake >= 25 && stake <= 500 && stake <= p.money)) { toast(p, 'Pool stakes are $25 - $500.', 'err'); break; }
      p.money -= stake; p.pool = { opp: m.opp, stake, at: Date.now() }; broadcast(room); break;
    }
    case 'poolEnd': {
      if (!p.pool) break; const pl = p.pool; p.pool = null;
      const won = !!m.won && Date.now() - pl.at > 15000 / Math.max(1, SPEED);
      if (won) { const pay = pl.stake * POOL_MULT[pl.opp]; p.money += pay; toast(p, `🎱 You beat the ${OPPS[pl.opp] ? OPPS[pl.opp].label : pl.opp} at pool! +${money(pay - pl.stake)}`, 'win'); award(room, p, 'poolWin'); feed(room, `🎱 ${p.name} won a game of pool.`); }
      else toast(p, `🎱 You lost the game. -${money(pl.stake)}`, 'err');
      broadcast(room); break;
    }
    case 'shakePay': {
      const sh = room.shake; if (!sh || room.phase !== 'play') break;
      const amt = Math.min(p.money, sh.tax - sh.paid, Math.floor(Number(m.amount) || sh.tax)); if (amt <= 0) break;
      p.money -= amt; sh.paid += amt; if (sh.paid >= sh.tax) endShake(room, false); broadcast(room); break;
    }
    case 'fightBet': {
      const be = room.barEvent; if (!be || be.kind !== 'fight' || Date.now() > be.betUntil || !['red', 'blue'].includes(m.side)) break;
      const stake = Math.floor(Number(m.stake)); if (be.bets[p.id] || !(stake >= 10 && stake <= Math.min(300, p.money))) break;
      p.money -= stake; be.bets[p.id] = { side: m.side, stake }; broadcast(room); break;
    }
    case 'cosmetics': {
      const cos = {}; for (const k of ['head', 'face', 'body', 'hand', 'back']) { const v = m.cos && m.cos[k]; if (typeof v === 'string' && /^[a-z0-9_]{1,24}$/.test(v)) cos[k] = v; }
      p.cos = cos; broadcast(room); break;
    }
    case 'roulette': { // m.bets = [{ pick, stake }]: a number '0'-'36', red/black, odd/even, low/high, d1-d3 (dozens), c1-c3 (columns)
      if (!inPlay(room)) break;
      if (room.spin) { toast(p, 'The wheel is already spinning - wait your turn.', 'err'); break; }
      const raw = Array.isArray(m.bets) ? m.bets : [{ pick: m.pick === 'green' ? '0' : m.pick, stake: m.stake }];
      const bets = []; for (const b of raw.slice(0, 40)) { const pick = String(b && b.pick), stake = Math.floor(Number(b && b.stake)); if (rouletteMult(pick) && stake >= 10) bets.push({ pick, stake }); }
      const total = bets.reduce((a, b) => a + b.stake, 0);
      if (!bets.length || bets.length !== raw.length) { toast(p, 'Invalid wager.', 'err'); break; }
      if (total > p.money) { toast(p, `You only have ${money(p.money)}.`, 'err'); break; }
      const n = rnd(37), color = colorOf(n); p.money -= total;
      const ms = dur(SPIN_MS); room.spin = { pid: p.id, name: p.name, until: Date.now() + ms, n, color, bets, total };
      for (const q of room.players.values()) send(q, { type: 'spin', n, color, by: p.name, mine: q === p, ms, bets });
      broadcast(room); // resolved by tick() -> resolveSpin once the ball has landed
      break;
    }
    case 'pay': {
      if (room.phase !== 'hunt' || p.remaining <= 0) break;
      const amt = Math.min(p.money, p.remaining, Math.floor(Number(m.amount) || p.remaining));
      if (amt > 0) { p.money -= amt; p.remaining -= amt; p.debt = p.remaining; if (p.remaining <= 0) { p.fate = 'paid up'; feed(room, `✅ ${p.name} paid off the mob.`); } }
      if (plist(room).every((q) => q.remaining <= 0)) finish(room); else broadcast(room); break;
    }
    case 'give': {
      const to = room.players.get(m.to); const amt = Math.floor(Number(m.amount));
      if (!to || to === p || !inPlay(room) || !(amt > 0 && amt <= p.money)) break;
      p.money -= amt; to.money += amt; toast(to, `${p.name} sent you ${money(amt)}`, 'win'); broadcast(room); break;
    }
    case 'rtc': { // WebRTC signaling relay for voice chat (offers/answers/ICE/hello). Only within the room; payload is opaque and size-capped.
      const raw = JSON.stringify(m.data || null); if (raw.length > 12000) break;
      const to = room.players.get(m.to); if (to && to !== p) send(to, { type: 'rtc', from: p.id, data: m.data });
      else if (m.to === '*') for (const q of room.players.values()) if (q !== p) send(q, { type: 'rtc', from: p.id, data: m.data });
      break;
    }
    case 'takeBottle': { // pick up a bottle from a table spot; it respawns for everyone after BOTTLE_RESPAWN_MS
      const i = Number(m.i), t = Date.now();
      if (!Number.isInteger(i) || i < 0 || i >= 64 || !inPlay(room) || t - p.lastTake < 300 || p.koUntil > t) break;
      if ((room.btaken[i] || 0) > t) break; p.lastTake = t;
      room.btaken[i] = t + BOTTLE_RESPAWN_MS; send(p, { type: 'bottleGot', i }); broadcast(room); break;
    }
    case 'bottle': { // a thrown bottle: relay so everyone sees/hears it; give the thrower one hit credit (valid for 4s)
      const t = Date.now(); if (!inPlay(room) || t - p.lastBottle < 700) break; p.lastBottle = t;
      const n = ['x', 'y', 'z', 'vx', 'vy', 'vz'].map((k) => Number(m[k])); if (!n.every(Number.isFinite)) break;
      p.credits = p.credits.filter((c) => t - c < 4000); p.credits.push(t);
      for (const q of room.players.values()) if (q !== p) send(q, { type: 'bottle', from: p.id, x: n[0], y: n[1], z: n[2], vx: n[3], vy: n[4], vz: n[5] });
      break;
    }
    case 'bottleHit': { // thrower reports a hit on a player or an NPC; knocks them out for 5s (3s immunity after waking)
      const t = Date.now(); p.credits = p.credits.filter((c) => t - c < 4000); if (!p.credits.length || !inPlay(room)) break; p.credits.shift();
      room.npcKo = room.npcKo || {};
      if (m.kind === 'npc') { const i = Math.floor(Number(m.npc)); if (!(i >= 0 && i < 80) || t < (room.npcKo[i] || 0)) break; room.npcKo[i] = t + 5000 + 2000;
        for (const q of room.players.values()) send(q, { type: 'ko', npc: i, until: t + 5000, by: p.id }); feed(room, `🍾 ${p.name} bottled a bar regular.`); broadcast(room); break; }
      const v = room.players.get(m.target); if (!v || v === p || t < v.koImmune) break;
      v.koUntil = t + 5000; v.koImmune = t + 5000 + 3000;
      for (const q of room.players.values()) send(q, { type: 'ko', id: v.id, until: v.koUntil, by: p.id }); feed(room, `🍾 ${p.name} knocked out ${v.name} with a bottle!`); broadcast(room); break;
    }
    case 'pos': {
      const x = Number(m.x), z = Number(m.z), ry = Number(m.ry);
      if (![x, z, ry].every(Number.isFinite)) break;
      p.x = clamp(x, -30, 30); p.z = clamp(z, -30, 30); p.ry = ry; const sit = Number.isFinite(Number(m.sit)) && Number(m.sit) > 0 ? clamp(Number(m.sit), 0.2, 1.2) : 0; const jy = Number.isFinite(Number(m.jy)) ? clamp(Number(m.jy), 0, 1.2) : 0; const lp = Number.isFinite(Number(m.p)) ? clamp(Number(m.p), -1.6, 1.6) : 0;
      for (const q of room.players.values()) if (q !== p) send(q, { type: 'pos', id: p.id, x: p.x, z: p.z, ry, sit, jy, p: lp });
      break;
    }
    case 'attack':
      if (room.shake && room.phase === 'play') { if (Date.now() - p.lastHit < 90) break; p.lastHit = Date.now(); room.shake.hp -= 1; if (room.shake.hp <= 0) endShake(room, true); broadcast(room); break; }
      if (room.phase !== 'hunt' || Date.now() - p.lastHit < 90) break;
      p.lastHit = Date.now(); room.hp -= 1;
      if (room.hp <= 0) { room.hp = 0; feed(room, `👊 The crew beat the hitmen senseless!`); endHunt(room); } else broadcast(room);
      break;
  }
}

// ---------- transport ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const ICE = () => { const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]; if (process.env.TURN_URL) ice.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' }); return ice; };
const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/ice.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(ICE())); }
  const path0 = req.url.split('?')[0], f = path0 === '/' ? '/index.html' : path0;
  const file = path.join(__dirname, 'public', path.normalize(f).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const ROOM_GRACE_MS = 10 * 60 * 1000; // an empty room waits this long for its players to come back before it is deleted
function reapLater(room) { clearTimeout(room.reap); room.reap = setTimeout(() => { if (![...room.players.values()].some((q) => q.connected)) { clearInterval(room.tick); rooms.delete(room.code); } }, ROOM_GRACE_MS); }
wss.on('connection', (ws) => {
  let room = null, player = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!room) {
      if (m.type !== 'join') return;
      const fail = (text, extra = {}) => ws.send(JSON.stringify({ type: 'error', text, ...extra }));
      const r = m.code ? rooms.get(String(m.code).toUpperCase()) : null;
      // rejoin: a returning player (refresh, dropped wifi, server restart) reclaims their seat with the token they were given
      if (m.token) {
        const q = r && [...r.players.values()].find((x) => x.token === m.token);
        if (!q) return fail('That game is no longer running.', { stale: true });
        if (q.ws && q.ws !== ws && q.ws.readyState === 1) { try { q.ws.send(JSON.stringify({ type: 'error', text: 'You opened the game in another tab.', kicked: true })); q.ws.close(); } catch {} }
        room = r; player = q; q.ws = ws; const was = q.connected; q.connected = true; clearTimeout(r.reap);
        ws.send(JSON.stringify({ type: 'session', code: r.code, token: q.token }));
        if (!was) feed(r, `${q.name} is back.`);
        return broadcast(r);
      }
      const name = String(m.name || '').trim().slice(0, 16) || 'Player';
      const rr = m.code ? r : createRoom();
      if (!rr) return fail('Room not found.');
      if (rr.phase !== 'lobby') return fail('Game already in progress.');
      if (rr.players.size >= 6) return fail('Room is full.');
      room = rr; player = newPlayer(Math.random().toString(36).slice(2, 9), name, ws);
      player.color = room.players.size % 6; player.x = -3 + player.color * 1.2;
      room.players.set(player.id, player);
      if (!room.hostId) room.hostId = player.id;
      ws.send(JSON.stringify({ type: 'session', code: room.code, token: player.token }));
      feed(room, `${name} joined the crew.`);
      return broadcast(room);
    }
    if (player.ws !== ws) return; // replaced by a newer connection
    handle(room, player, m);
  });
  ws.on('close', () => {
    if (!room || !player || player.ws !== ws) return;
    player.connected = false;
    if (room.phase === 'lobby') room.players.delete(player.id);
    else feed(room, `📴 ${player.name} lost connection.`);
    if (![...room.players.values()].some((q) => q.connected)) { if (!room.players.size) { clearInterval(room.tick); rooms.delete(room.code); } else reapLater(room); return; }
    if (room.hostId === player.id || !room.players.has(room.hostId)) room.hostId = [...room.players.values()].find((q) => q.connected).id;
    broadcast(room);
  });
});

// ---------- snapshots: rooms survive a server restart/redeploy when BK_STATE_DIR points at persistent storage (e.g. a Railway volume) ----------
const STATE_DIR = process.env.BK_STATE_DIR || '', STATE_FILE = STATE_DIR && path.join(STATE_DIR, 'rooms.json');
const SKIP = new Set(['ws', 'tick', 'reap', 'sportDef']);
function snapshot() {
  if (!STATE_FILE) return;
  const out = [...rooms.values()].filter((r) => r.phase !== 'lobby').map((r) => JSON.parse(JSON.stringify({ ...r, players: [...r.players.values()] }, (k, v) => (SKIP.has(k) ? undefined : v))));
  try { fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify({ at: Date.now(), rooms: out })); fs.renameSync(STATE_FILE + '.tmp', STATE_FILE); } catch (e) { console.error('snapshot failed', e.message); }
}
function restore() {
  if (!STATE_FILE || !fs.existsSync(STATE_FILE)) return;
  try {
    const { at, rooms: list } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if (Date.now() - at > ROOM_GRACE_MS) return;
    for (const r of list) {
      r.players = new Map(r.players.map((p) => [p.id, { ...p, ws: null, connected: false }])); r.sportDef = SPORTS[r.sport];
      rooms.set(r.code, r); if (r.phase === 'play' || r.phase === 'hunt') r.tick = setInterval(() => tick(r), 400); reapLater(r);
    }
    console.log(`restored ${list.length} room(s) from snapshot`);
  } catch (e) { console.error('restore failed', e.message); }
}
if (STATE_FILE) { restore(); setInterval(snapshot, 4000); }
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { snapshot(); process.exit(0); });

if (require.main === module) server.listen(PORT, () => console.log(`Ball Knowledge running on http://localhost:${PORT}`));
module.exports = { genHighlights, buildMarkets, splitFootball, splitBasket };
