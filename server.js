const http = require('http');
const fs = require('fs');
const path = require('path');
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
const DRINKS = [
  { id: 'beer', name: 'Cold Domestic', emoji: '🍺', price: 30, add: 18, blurb: 'Lukewarm, but it works.' },
  { id: 'shot', name: 'Well Shot', emoji: '🥃', price: 60, add: 30, blurb: 'Does not taste like anything good.' },
  { id: 'whiskey', name: 'Top-Shelf Whiskey', emoji: '🥂', price: 120, add: 42, blurb: 'The expensive stuff. Confidence in a glass.' },
  { id: 'mystery', name: 'Bartender\'s Special', emoji: '🧪', price: 90, add: 55, blurb: 'Ingredients: unknown. Side effects: yes.' },
];
const MG = { darts: { max: 180, rate: 3 }, bowling: { max: 20, rate: 25 }, cornhole: { max: 12, rate: 35 } };
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

const rooms = new Map();
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
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
  return { id, name, ws, connected: true, money: START_MONEY, debt: 0, loans: 0, mobTied: false, bets: {}, fix: {}, results: {}, drunk: 0, drunkT: 0,
    finalCorrect: null, fate: null, lastMg: 0, lastHit: 0, lastDrink: 0, remaining: 0, color: 0, x: 0, z: 2, ry: 0 };
}
function createRoom() {
  const room = { code: newCode(), hostId: null, players: new Map(), phase: 'lobby', sport: 'nba', pace: 'normal', season: null, sportDef: null, events: [], feed: [],
    tick: null, hp: 0, maxHp: 0, huntEnd: 0, huntTimer: null, finalWinner: null, altered: false, summary: null, spin: null, t0: 0 };
  rooms.set(room.code, room); return room;
}
const feed = (room, text) => { room.feed.push({ t: Date.now(), text }); if (room.feed.length > 50) room.feed.shift(); };
const plist = (room) => [...room.players.values()];
const send = (p, msg) => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
const toast = (p, text, kind = 'info') => send(p, { type: 'toast', text, kind });
const drunkNow = (p) => { const now = Date.now(); if (p.drunk > 0) { p.drunk = Math.max(0, p.drunk - (now - p.drunkT) / dur(DRUNK_DECAY_MS)); } p.drunkT = now; return p.drunk; };
const band = (d) => (d < 15 ? 0 : d < 40 ? 1 : d < 65 ? 2 : d < 85 ? 3 : 4);

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
  for (const p of room.players.values()) Object.assign(p, { money: START_MONEY, debt: 0, loans: 0, mobTied: false, bets: {}, fix: {}, results: {}, drunk: 0, drunkT: now, finalCorrect: null, fate: null, remaining: 0 });
  room.altered = false; room.finalWinner = null; room.phase = 'play';
  feed(room, `${sport.emoji} A season has been assigned. Nobody will tell you which one. Place your bets before the clock runs out.`);
  clearInterval(room.tick); room.tick = setInterval(() => tick(room), 400);
  broadcast(room);
}

// ---------- tick: open -> airing (locked) -> final ----------
function tick(room) {
  if (room.phase !== 'play') return;
  const now = Date.now(); let changed = false;
  for (const ev of room.events) {
    if (ev.status === 'upcoming' && now >= ev.openAt) { ev.status = 'open'; changed = true; feed(room, `📣 ${ev.label}: ${ev.a} vs ${ev.b} - betting is OPEN.`); }
    if (ev.status === 'open' && now >= ev.closeAt) { lockEvent(room, ev); changed = true; }
    if (ev.status === 'airing' && now >= ev.resolveAt) { finalizeEvent(room, ev); changed = true; }
  }
  if (changed) {
    broadcast(room);
    if (room.events.every((e) => e.status === 'final')) settle(room);
  }
}

function lockEvent(room, ev) {
  const season = room.season, nat = ev.sa > ev.sb ? 'a' : 'b';
  const fixers = plist(room).filter((p) => p.fix[ev.idx]);
  const sides = new Set(fixers.map((p) => p.fix[ev.idx]));
  const price = fixPrice(room, ev);
  for (const p of fixers) { p.debt += price; p.mobTied = true; toast(p, `The mob took ${money(price)} for the fix on ${ev.label}. It's on your tab.`, 'mob'); }
  let winner = nat, fixed = false, contested = sides.size > 1;
  if (sides.size === 1) { const s = [...sides][0]; if (s !== nat) { winner = s; fixed = true; room.altered = true; } }
  ev.rsa = ev.sa; ev.rsb = ev.sb;
  if (fixed) { ev.rsa = ev.sb; ev.rsb = ev.sa; } // flip the scoreboard
  ev.result = { sa: ev.rsa, sb: ev.rsb, winner, fixed, contested };
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
      if (won) { const pay = b.stake * b.dec; ret += pay; delta += pay - b.stake; notes.push(`✅ ${label}: +${money(pay - b.stake)}`); } else { delta -= b.stake; notes.push(`❌ ${label}: -${money(b.stake)}`); }
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
}

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
  clearTimeout(room.huntTimer); room.huntTimer = setTimeout(() => endHunt(room), dur(HUNT_MS));
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
  clearTimeout(room.huntTimer); clearInterval(room.tick);
  const s = room.season, ps = plist(room);
  for (const p of ps) if (!p.fate) p.fate = p.mobTied ? 'paid up' : 'safe';
  const correct = ps.filter((p) => p.finalCorrect).length;
  room.summary = { year: s.year, league: s.league, champion: s.champion, finalWinner: room.finalWinner, altered: room.altered, blurb: s.blurb,
    crewWon: correct >= Math.ceil(ps.length / 2) && correct > 0, correct, total: ps.length,
    players: ps.map((p) => ({ name: p.name, finalCorrect: p.finalCorrect, fate: p.fate, money: Math.round(p.money) })) };
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
    feed: room.feed.slice(-25), drinks: DRINKS,
    players: plist(room).map((q) => ({ id: q.id, name: q.name, color: q.color, money: Math.round(q.money), connected: q.connected, fate: q.fate, drunk: Math.round(drunkNow(q)),
      hunted: room.phase === 'hunt' && q.remaining > 0, finalCorrect: room.phase === 'ended' ? q.finalCorrect : null })),
    me: { money: Math.round(p.money), debt: Math.round(p.debt), loans: p.loans, mobTied: p.mobTied, remaining: Math.round(p.remaining), drunk: d, decay: dur(DRUNK_DECAY_MS), band: band(d), bets: p.bets, fix: p.fix, results: p.results } };
  if (room.season && room.phase !== 'lobby') {
    v.events = room.events.map((e) => evSummary(e));
    v.teams = Object.fromEntries(Object.entries(room.season.teams).map(([n, t]) => [n, { short: t.short, color: t.color }]));
    v.spinning = room.spin ? { by: room.spin.name, until: room.spin.until } : null;
    const cur = room.events.find((e) => e.status === 'open');
    if (cur && room.phase === 'play') {
      v.cur = { idx: cur.idx, mk: cur.mk, series: seriesText(room, cur), fixPrice: fixPrice(room, cur), intel: { a: intel(room, cur, 'a'), b: intel(room, cur, 'b') },
        hint: hintFor(room, p, cur), crew: plist(room).reduce((acc, q) => { const b = (q.bets[cur.idx] || {}).ml; if (b) acc[b.pick]++; return acc; }, { a: 0, b: 0 }) };
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
      Object.assign(room, { phase: 'lobby', season: null, events: [], feed: [], altered: false, summary: null, spin: null });
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
      p.money -= stake; bets[mk] = { pick: pk, stake, dec: d, line }; broadcast(room); break;
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
      if (p.money < dr.price) { toast(p, 'Bartender: "Come back when you can pay."', 'err'); break; }
      if (drunkNow(p) >= 100) { toast(p, 'Bartender: "You\'re cut off, pal."', 'err'); break; }
      p.lastDrink = Date.now(); p.money -= dr.price; p.drunk = Math.min(100, drunkNow(p) + dr.add);
      toast(p, `${dr.emoji} ${dr.name} - ${money(dr.price)}. ${p.drunk >= 85 ? 'The room is spinning.' : p.drunk >= 40 ? 'You feel... confident.' : 'Warm.'}`, 'info'); broadcast(room); break;
    }
    case 'mg': {
      const g = MG[m.game];
      if (!inPlay(room) || !g || Date.now() - p.lastMg < 5000) break;
      const pts = Math.floor(Number(m.pts)); if (!(pts >= 0 && pts <= g.max)) break;
      p.lastMg = Date.now(); const win = pts * g.rate; p.money += win; toast(p, `${m.game}: ${pts} pts = ${money(win)}`, win ? 'win' : 'info'); broadcast(room); break;
    }
    case 'roulette': {
      if (!inPlay(room)) break;
      if (room.spin) { toast(p, 'The wheel is already spinning - wait your turn.', 'err'); break; }
      const stake = Math.floor(Number(m.stake)); const pk = m.pick;
      const isNum = !['red', 'black', 'green'].includes(pk) && /^\d{1,2}$/.test(String(pk)) && Number(pk) <= 36;
      if (!(stake >= 10 && stake <= p.money) || !(['red', 'black', 'green'].includes(pk) || isNum)) { toast(p, 'Invalid wager.', 'err'); break; }
      const n = rnd(37), color = colorOf(n); p.money -= stake;
      const ms = dur(SPIN_MS); room.spin = { name: p.name, until: Date.now() + ms };
      for (const q of room.players.values()) send(q, { type: 'spin', n, color, by: p.name, mine: q === p, ms });
      broadcast(room);
      setTimeout(() => {
        let win = 0; if (isNum) win = Number(pk) === n ? stake * 36 : 0; else if (pk === color) win = stake * (color === 'green' ? 36 : 2);
        p.money += win; room.spin = null;
        toast(p, win ? `${n} ${color}! You win ${money(win - stake)}` : `${n} ${color}. You lose ${money(stake)}.`, win ? 'win' : 'err');
        feed(room, `🎰 ${p.name} ${win ? 'won ' + money(win - stake) : 'lost ' + money(stake)} on roulette (${n} ${color}).`);
        broadcast(room);
      }, ms + 400);
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
    case 'pos': {
      const x = Number(m.x), z = Number(m.z), ry = Number(m.ry);
      if (![x, z, ry].every(Number.isFinite)) break;
      p.x = clamp(x, -30, 30); p.z = clamp(z, -30, 30); p.ry = ry;
      for (const q of room.players.values()) if (q !== p) send(q, { type: 'pos', id: p.id, x: p.x, z: p.z, ry });
      break;
    }
    case 'attack':
      if (room.phase !== 'hunt' || Date.now() - p.lastHit < 90) break;
      p.lastHit = Date.now(); room.hp -= 1;
      if (room.hp <= 0) { room.hp = 0; feed(room, `👊 The crew beat the hitmen senseless!`); endHunt(room); } else broadcast(room);
      break;
  }
}

// ---------- transport ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(__dirname, 'public', path.normalize(f).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  let room = null, player = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!room) {
      if (m.type !== 'join') return;
      const name = String(m.name || '').trim().slice(0, 16) || 'Player';
      const r = m.code ? rooms.get(String(m.code).toUpperCase()) : createRoom();
      const fail = (text) => ws.send(JSON.stringify({ type: 'error', text }));
      if (!r) return fail('Room not found.');
      if (r.phase !== 'lobby') return fail('Game already in progress.');
      if (r.players.size >= 6) return fail('Room is full.');
      room = r; player = newPlayer(Math.random().toString(36).slice(2, 9), name, ws);
      player.color = room.players.size % 6; player.x = -3 + player.color * 1.2;
      room.players.set(player.id, player);
      if (!room.hostId) room.hostId = player.id;
      feed(room, `${name} joined the crew.`);
      return broadcast(room);
    }
    handle(room, player, m);
  });
  ws.on('close', () => {
    if (!room || !player) return;
    player.connected = false;
    if (room.phase === 'lobby') room.players.delete(player.id);
    if (![...room.players.values()].some((q) => q.connected)) { clearTimeout(room.huntTimer); clearInterval(room.tick); rooms.delete(room.code); return; }
    if (room.hostId === player.id) room.hostId = [...room.players.values()].find((q) => q.connected).id;
    broadcast(room);
  });
});

if (require.main === module) server.listen(PORT, () => console.log(`Ball Knowledge running on http://localhost:${PORT}`));
module.exports = { genHighlights, buildMarkets, splitFootball, splitBasket };
