const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const { SPORTS, SEASONS } = require('./seasons');
const { winProb } = require('./odds');
const { makeFakeSeason } = require('./fakeseason');
const { paperFor } = require('./paper');
const createGoons = require('./goons');
const createBum = require('./bum');

const PORT = process.env.PORT || 3000;
const SPEED = Number(process.env.BK_SPEED || 1); // dev: divide all timers
const PACES = {
  normal: { label: 'Normal (2 min windows)', window: 120000, air: 180000, lead: 30000 },
  quick: { label: 'Quick (50 sec windows)', window: 50000, air: 70000, lead: 15000 },
};
const MODES = {
  real: { label: '🎞️ Real season', blurb: 'A real season from history. The year is hidden - the team names are not.' },
  fake: { label: '🎲 Made-up season', blurb: 'A fictional league generated tonight. Nobody can know the results - they are rolled from the odds.' },
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
// the gas station: the counter (cheap beer, smokes, energy drinks, scratch-offs), the ATM, and the pouch in the men's room urinals
const GAS = { beer: { price: 8, add: 18 }, cig: 12, pack: 50, energy: 25 }; // the bar's beer is $30
const CIG_MS = 120000, ENERGY_MS = 60000, ZYN_MS = 90000, ZYN_RESPAWN_MS = 150000, LUCK = 0.15; // a lit cigarette: +15% on the odds of a winning roulette spin, slot pull or scratcher
const ATM_MAX = 100, ATM_FEE = 5; // a night's withdrawals; at closing they come back out of what you put in the fund
// scratch-offs: match three amounts. Prizes x the ticket tier ($5 / $20); ~29% of tickets win something, ~70% back
const SCRATCH = { tiers: [5, 20], prizes: [[1, 0.16], [2, 0.08], [4, 0.04], [10, 0.012], [50, 0.002]], decoys: [1, 2, 4, 10, 50, 200] };
const SCRATCH_PW = SCRATCH.prizes.reduce((a, [, w]) => a + w, 0);
const lucky = (p) => (p.cigUntil || 0) > Date.now();
const luckQ = (pw) => Math.min(1, LUCK * pw / Math.max(0.01, 1 - pw)); // flip a loss with this chance: the win chance becomes pw * 1.15
const MG = { darts: { max: 180 }, bowling: { max: 20 }, cornhole: { max: 12 }, golf: { max: 24 } }; // golf: Stableford points over 3 holes (public/golf.js)
const OPPS = { rookie: { label: 'Rookie', mult: 1.6 }, regular: { label: 'Regular', mult: 2.0 }, shark: { label: 'The Shark', mult: 2.8 } };
const NPC_SKILL = { golf: { rookie: [6, 2], regular: [9, 2], shark: [11.5, 2] }, darts: { rookie: [45, 18], regular: [70, 22], shark: [98, 26] }, bowling: { rookie: [9, 3], regular: [12.5, 3.2], shark: [16, 3] }, cornhole: { rookie: [3, 1.8], regular: [5, 2], shark: [7.5, 2] } };
const POOL_MULT = { rookie: 1.7, shark: 2.6 };
// ---------- the story: save the bar (names and the developer's plan live in public/story.json) ----------
// The developer holds the bar's lease and wants it gone; the owner can buy him out. Each night the crew's winnings above
// their starting bankroll go into the Save the Bar fund; reach the buyout by the last night and the bar is saved.
// Mid-night the developer drops in to check the fund's pace (room.quota): behind it, he adds a permit fee to the buyout.
// Sal is now the bank of last resort: loans (and debts that escaped the hitmen, +50%, carried to the next night) are all the
// mob cares about. His collectors only come for people who owe him; the hitmen only for what's unpaid at closing.
const STORY = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'story.json'), 'utf8'));
const NIGHTS = 3, ROLL_VIG = 1.5, FLOOR_CASH = 250; // under $250 at the start of a night: the owner slips you the difference from the till
const BUYOUT_PER = { campaign: 1500, single: 600 }, PERMIT_FEE = 150, CHECK_AT = [0.33, 0.7]; // buyout per player; the developer's check-ins (share of the night's games)
const FORMATS = {
  campaign: { label: '📖 Campaign (3 nights)', blurb: `${STORY.dev.full} wants ${STORY.bar} gone. Win enough over three nights to buy him out. Winnings go to the fund; your bankroll carries over.` },
  single: { label: '🌙 Single night', blurb: `One night, one season, a smaller buyout. Save ${STORY.bar} by closing time.` },
};
const TICKETS = { base: 5, crewWin: 15, quota: 8 };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
const BOUNTIES = [
  { id: 'darts_reg', text: 'Beat the Regular or Shark at darts', reward: 12, on: 'challengeWin', test: (d) => d.game === 'darts' && d.opp !== 'rookie' },
  { id: 'bowl_win', text: 'Win a bowling challenge', reward: 10, on: 'challengeWin', test: (d) => d.game === 'bowling' },
  { id: 'corn_win', text: 'Win a cornhole challenge', reward: 10, on: 'challengeWin', test: (d) => d.game === 'cornhole' },
  { id: 'golf_win', text: 'Win a Golden Tee-Off challenge', reward: 10, on: 'challengeWin', test: (d) => d.game === 'golf' },
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
const dec =(p, vig = 1.05) => Math.max(1.03, Math.round((1 / (clamp(p, 0.04, 0.96) * vig)) * 100) / 100);
const american = (d) => (d >= 2 ? '+' + Math.round((d - 1) * 100) : String(-Math.round(100 / (d - 1))));
const half = (x) => Math.round(x * 2) / 2;

function buildMarkets(sport, season, ev, rng) {
  const p = winProb(sport, season.teams[ev.a].rec, season.teams[ev.b].rec, !ev.n);
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
  const room = { code: newCode(), hostId: null, btaken: {}, players: new Map(), phase: 'lobby', sport: 'nba', pace: 'normal', mode: 'real', format: 'campaign', camp: null, season: null, sportDef: null, events: [], feed: [],
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
  let n = p.money - p.debt - (p.atm || 0);
  for (const [idx, b] of Object.entries(p.bets)) { const ev = room.events[idx]; if (ev && ev.status !== 'final') for (const x of Object.values(b)) n += x.stake; }
  if (p.challenge) n += p.challenge.stake; if (p.pool) n += p.pool.stake;
  return n;
}
function award(room, p, type, data = {}) {
  jobEvent(room, p, type, data);
  for (const b of p.bounties) if (!b.done && b.on === type && (!b.test || b.test(data, p))) { b.done = true; p.tickets += b.reward; toast(p, `🎯 Bounty complete: ${b.text} (+${b.reward} tickets)`, 'win'); }
}
function awardAll(room, type, data) { for (const p of room.players.values()) award(room, p, type, data); }

// real seasons: prefer one nobody in the crew has played (each browser reports what it has seen), then the least-seen
const seasonId = (sport, s) => `${sport}:${s.year}`;
function pickSeason(room) {
  const all = SEASONS[room.sport], seen = (s) => { const id = seasonId(room.sport, s); let n = (room.recent || []).includes(id) ? 10 : 0; for (const p of room.players.values()) if (p.seen && p.seen.has(id)) n++; return n; };
  const low = Math.min(...all.map(seen)), s = pick(all.filter((x) => seen(x) === low));
  room.recent = [...(room.recent || []), seasonId(room.sport, s)].slice(-12);
  return s;
}
function startGame(room) {
  const sport = SPORTS[room.sport];
  room.sportDef = sport;
  const season = room.mode === 'fake' ? makeFakeSeason(room.sport, sport, seeded(room.code + ':fake:' + Date.now())) : pickSeason(room); room.season = season;
  const pc = PACES[room.pace], win = dur(pc.window), air = dur(pc.air), lead = dur(pc.lead);
  const now = Date.now(); room.t0 = now;
  const camp = room.format === 'campaign' ? (room.camp = room.camp || { night: 1, nights: NIGHTS, log: [] }) : null, night = camp ? camp.night : 1;
  room.night = night; room.finale = !!camp && night === camp.nights;
  // the guided first night: on night 1 when someone is new here (or the host forced it). Sal sends one collector early to teach bottles.
  room.guided = night === 1 && (room.guide === 'on' || ((room.guide || 'auto') === 'auto' && plist(room).some((p) => !p.tutDone))); room.trained = false;
  room.events = season.events.map((e, i) => {
    const rng = seeded(room.code + ':' + i + ':' + now);
    const openAt = i === 0 ? now : now + lead + i * win, closeAt = now + lead + (i + 1) * win;
    return { idx: i, ...e, openAt, closeAt, resolveAt: closeAt + air, status: i === 0 ? 'open' : 'upcoming', mk: buildMarkets(sport, season, e, rng), result: null, air: null };
  });
  room.events[0].openAt = now;
  for (const p of room.players.values()) {
    // tonight's bankroll (carried over in a campaign) and anything still owed to Sal from last night
    const carried = camp && night > 1 && p.campCash != null ? p.campCash : START_MONEY, front = Math.max(0, FLOOR_CASH - carried);
    p.startCash = carried + front; p.fronted = front; p.tab = camp ? p.rollover || 0 : 0; p.rollover = 0; p.gave = 0; // tab: only what escaped Sal's hitmen last night
    Object.assign(p, { money: p.startCash, debt: p.tab, loans: 0, mobTied: false, bets: {}, fix: {}, results: {}, drunk: 0, drunkT: now, finalCorrect: null, fate: null, remaining: 0, tickets: 0, challenge: null, pool: null, streak: { darts: 0, bowling: 0, cornhole: 0 }, lastChallenge: 0 });
    p.heat = 0; p.banUntil = null; p.bk = 0; p.dead = false;
    p.tol = Math.round((Math.random() * 2 - 1) * 10); p.tips = {}; p.over = false; p.hangUntil = 0; // hidden drink sweet spot for this season
    p.bounties = [...BOUNTIES].sort(() => Math.random() - 0.5).slice(0, 3).map((b) => ({ ...b, done: false }));
    p.job = null; p.jobNext = 0; p.jobsDone = 0; p.vinnie = {};
    Object.assign(p, { atm: 0, atmMark: false, cigs: 0, cans: 0, cigUntil: 0, wiredUntil: 0, zynUntil: 0, bumPass: false, scratch: null });
  }
  const nE = room.events.length, start = plist(room).reduce((a, p) => a + p.startCash - p.tab, 0), crewN = Math.max(1, room.players.size);
  // the buyout (set on the first night) and tonight's share of what's left of it
  const fund = camp ? (camp.fund = camp.fund || { banked: 0, buyout: Math.max(1500, Math.round(BUYOUT_PER.campaign * crewN / 500) * 500) }) : { banked: 0, buyout: Math.max(1000, Math.round(BUYOUT_PER.single * crewN / 250) * 250) };
  room.fund = fund; room.crewStart = start; const nightsLeft = camp ? camp.nights - night + 1 : 1;
  room.goal = Math.max(0, Math.ceil((fund.buyout - fund.banked) / nightsLeft / 50) * 50);
  room.quota = [...CHECK_AT.map((f, i) => ({ kind: 'mid', idx: Math.max(i, Math.round(nE * f) - 1), frac: f })), { kind: 'final', idx: nE - 1, frac: 1 }].map((q) => ({ ...q, target: Math.round(start + room.goal * q.frac), status: 'pending', crew: 0 }));
  room.verdictAt = 0; room.deposited = false; room.deposit = 0; room.nextBum = now + (process.env.BK_BUM_SOON ? 20000 : dur(55000 + rnd(35000))); /* BK_BUM_SOON: dev/testing only */ bum.stop(room); bum.ensure(room); /* Dusty is out on the street all night */ room.pendingShake = 0; room.zynAt = 0; room.zynSpot = rnd(2);
  room.shake = null; room.barEvent = null; room.nextBarEvent = now + dur(55000 + rnd(30000)); room.lastBarKind = null;
  room.altered = false; room.finalWinner = null; room.phase = 'play'; room.paper = paperFor(room);
  feed(room, season.fake ? `${sport.emoji} Welcome to the ${season.league}. None of these teams exist and nothing is written yet - every result is rolled live from the odds.` : `${sport.emoji} A season has been assigned. Nobody will tell you which one. Place your bets before the clock runs out.`);
  feed(room, `🏚️ ${camp ? `Night ${night} of ${camp.nights}. ` : ''}${STORY.dev.full} wants ${money(fund.buyout)} to walk away from ${STORY.bar}. The fund has ${money(fund.banked)}. Tonight's goal: ${money(room.goal)} in winnings.`);
  if (plist(room).some((p) => p.tab > 0)) feed(room, `💼 Uncle Sal remembers who still owes him from last night. He collects at closing time.`);
  room.cine = { kind: 'opening', start: now, until: now + 11500, goal: room.goal, buyout: fund.buyout, banked: fund.banked, at: room.quota[0].idx + 1, night, nights: camp ? camp.nights : 1 };
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
  if (room.verdictAt) { if (Date.now() >= room.verdictAt) { room.verdictAt = 0; finish(room); } return; } // the save-the-bar verdict scene is playing; nothing else happens until it's done
  if (room.spin && Date.now() >= room.spin.until + 400) resolveSpin(room);
  if (room.phase === 'hunt') { // hitmen deadline (tick-driven so it survives a restart): whoever still owes gets dragged to the back room
    if (Date.now() >= room.huntEnd && room.goons && room.goons.phase === 'fight') { const v = plist(room).filter((p) => p.remaining > 0); if (v.length) goons.outro(room, 'kill', v); else goons.outro(room, 'leave'); }
    return;
  }
  if (room.phase !== 'play') return;
  const now = Date.now(); let changed = false;
  for (const ev of room.events) {
    if (ev.status === 'upcoming' && now >= ev.openAt) { ev.status = 'open'; changed = true; feed(room, `📣 ${ev.label}: ${ev.a} vs ${ev.b} - betting is OPEN.`); }
    if (ev.status === 'open' && now >= ev.closeAt) { lockEvent(room, ev); changed = true; }
    if (ev.status === 'airing' && now >= ev.resolveAt) { finalizeEvent(room, ev); changed = true; }
  }
  if (room.shake && now >= room.shake.until && (!room.goons || room.goons.phase === 'fight')) { endShake(room, false); changed = true; }
  if (room.guided && !room.trained && !room.shake && !room.goons && !bum.busy(room) && room.events.some((e) => e.status === 'airing')) { startTraining(room); changed = true; }
  if (room.pendingShake && now >= room.pendingShake && !room.goons && !(room.cine && now < room.cine.until)) { room.pendingShake = 0; bum.scram(room); startShake(room); changed = true; }
  if (!room.bum) bum.ensure(room); // (after a restart)
  if (!bum.busy(room) && !room.shake && !room.goons && !(room.cine && now < room.cine.until) && now >= room.nextBum) { // chaos: the bum goes for somebody's wallet
    room.nextBum = now + dur(80000 + rnd(60000)); const marked = plist(room).find((q) => q.atmMark && q.money >= 40 && q.connected !== false && !q.dead); if (marked) marked.atmMark = false;
    const t = marked || bum.pickTarget(room, false);
    if (t && t.bumPass) { t.bumPass = false; toast(t, `${STORY.bum ? STORY.bum.name : 'Dusty'} was coming your way - then he recognized you, nodded, and kept walking. That cigarette paid off.`, 'win'); changed = true; }
    else if (t) { bum.spawn(room, t, false); changed = true; } }
  if (room.drops && room.drops.some((d) => now >= d.until)) { room.drops = room.drops.filter((d) => now < d.until); changed = true; }
  if (room.barEvent && now >= room.barEvent.until) { endBarEvent(room); changed = true; }
  else if (!room.barEvent && !room.shake && !room.goons && now >= room.nextBarEvent) { startBarEvent(room); changed = true; }
  if (changed) {
    broadcast(room);
    if (room.events.every((e) => e.status === 'final') && room.phase === 'play' && !room.shake && !room.goons) settle(room);
  }
}

function lockEvent(room, ev) {
  const season = room.season, nat = ev.sa > ev.sb ? 'a' : 'b';
  const fixers = plist(room).filter((p) => p.fix[ev.idx]);
  const sides = new Set(fixers.map((p) => p.fix[ev.idx]));
  const price = fixPrice(room, ev);
  for (const p of fixers) { p.debt += price; p.mobTied = true; p._fixPaid = true; toast(p, `The mob took ${money(price)} for the fix on ${ev.label}. It's on your tab.`, 'mob'); }
  let winner = nat, fixed = false, contested = sides.size > 1, voided = false;
  if (sides.size === 1) {
    const s = [...sides][0], risk = Math.max(...fixers.map((p) => fixRisk(room, p, ev, s)));
    if (Math.random() < risk) { // the league flags it: the game is void, the fee is still owed, the fixers are barred for two games
      voided = true; for (const p of fixers) { p.banUntil = ev.idx + 2; toast(p, `🚨 The league caught your fix on ${ev.label}. Bets voided - and you're barred from the sportsbook for 2 games. Sal still wants his fee.`, 'err'); }
      feed(room, `🚨 League investigators flagged the ${ev.label}. All bets are void; ${fixers.map((p) => p.name).join(' and ')} barred from betting for 2 games.`);
    } else if (s !== nat) { winner = s; fixed = true; room.altered = true; }
  }
  for (const p of fixers) p.heat = (p.heat || 0) + 1;
  ev.rsa = ev.sa; ev.rsb = ev.sb;
  if (fixed) { ev.rsa = ev.sb; ev.rsb = ev.sa; } // flip the scoreboard
  ev.result = { sa: ev.rsa, sb: ev.rsb, winner, fixed, contested, voided };
  if (fixed && !contested) for (const p of fixers) award(room, p, 'fixFlip');
  const rng = seeded(room.code + ':air:' + ev.idx);
  ev.air = { plays: genHighlights(room.sportDef, ev, season, rng) };
  ev.status = 'airing';
  feed(room, `📺 ${ev.label} is on the TV - highlights rolling.`);
}

function settleBets(room, ev) {
  const r = ev.result, win = r.winner;
  for (const p of room.players.values()) {
    const bets = p.bets[ev.idx] || {}, notes = [], lines = []; let delta = 0, ret = 0; // lines: one per bet, for the phone
    if (r.voided) { for (const [mk, b] of Object.entries(bets)) { ret += b.stake; lines.push({ mk, stake: b.stake, won: null, void: true, net: 0 }); } p.money += ret; if (ev.final) p.finalCorrect = false; if (Object.keys(bets).length) notes.push('🚨 VOID - the league caught a fix. Stakes returned.'); p.results[ev.idx] = { delta: 0, notes, lines, voided: true }; continue; }
    for (const [mk, b] of Object.entries(bets)) {
      let won = false, label;
      if (mk === 'ml') { won = b.pick === win; label = `${b.pick === 'a' ? ev.a : ev.b} ML`; }
      else if (mk === 'spread') { const my = b.pick === 'a' ? r.sa : r.sb, other = b.pick === 'a' ? r.sb : r.sa; won = my + b.line > other; label = `${b.pick === 'a' ? ev.a : ev.b} ${b.line > 0 ? '+' : ''}${b.line}`; }
      else { const tot = r.sa + r.sb; won = b.pick === 'over' ? tot > b.line : tot < b.line; label = `${b.pick === 'over' ? 'Over' : 'Under'} ${b.line}`; }
      if (won) { p.bk = (p.bk || 0) + (mk === 'ml' ? Math.round(100 * b.dec) * (ev.final ? 2 : 1) : 50); /* Ball Knowledge: long shots count more, the final double */ const pay = b.stake * b.dec; ret += pay; delta += pay - b.stake; notes.push(`✅ ${label}: +${money(pay - b.stake)}`); award(room, p, 'betWin', { mk, dec: b.dec, stake: b.stake, band: b.band || 0 }); } else { delta -= b.stake; notes.push(`❌ ${label}: -${money(b.stake)}`); }
      lines.push({ mk, label, won, stake: b.stake, net: Math.round(won ? b.stake * (b.dec - 1) : -b.stake) });
    }
    p.money += ret;
    if (ev.final) p.finalCorrect = !!(bets.ml && bets.ml.pick === win);
    if (p.fix[ev.idx]) notes.push(r.contested ? 'Another crew fixed it the other way - the mob kept both fees.' : r.fixed ? 'The fix was in.' : 'You paid for a fix on a result that was already going your way.');
    p.results[ev.idx] = { delta: Math.round(delta), notes, lines };
    { const lost = lines.filter((l) => l.won === false).reduce((x, l) => x + l.stake, 0);
      if (lost >= PELT_LOSS && room.phase === 'play') pelt(room, p, lost); // blow $500+ on one game and the bar lets you have it
      if (lines.some((l) => l.won && bets[l.mk] && bets[l.mk].allIn)) kiss(room, p); } // went all in and hit
    // no toast: the phone buzzes with the result (client diffs p.results)
  }
}

// ---------- slot machines (the gas-station casino, public/outside.js) ----------
const SLOT_N = 6, SLOT_BETS = [10, 25, 50, 100], SLOT_SYMS = ['7', 'ball', 'bar', 'bell', 'lemon', 'cherry'], SLOT_W = [1, 2, 3, 4, 5, 5];
const SLOT_PAY = { '7': 100, ball: 30, bar: 20, bell: 12, lemon: 8, cherry: 10 }; // three of a kind, times the bet
const slotSym = () => { let x = Math.random() * 20; for (let k = 0; k < SLOT_SYMS.length; k++) { if ((x -= SLOT_W[k]) < 0) return SLOT_SYMS[k]; } return 'cherry'; };
// share of pulls that pay more than the bet (for the cigarette's luck)
const SLOT_PW = (() => { let w = 0; for (let i = 0; i < 200000; i++) if (slotPay([slotSym(), slotSym(), slotSym()]) > 1) w++; return w / 200000; })();
function slotPay(r) { if (r[0] === r[1] && r[1] === r[2]) return SLOT_PAY[r[0]]; const ch = r.filter((x) => x === 'cherry').length; return ch === 2 ? 1.5 : ch === 1 ? 0.5 : 0; }

// ---------- the crowd: bottles for big losers, Gina for whoever goes all in and hits ----------
const PELT_LOSS = 500, PELT_MS = 4200, GINA_PRICE = 20;
function pelt(room, p, lost) {
  const t = Date.now(); for (const q of room.players.values()) send(q, { type: 'pelt', id: p.id, until: t + PELT_MS });
  feed(room, `🍾 ${p.name} just lost ${money(lost)} on one game. The bar lets them have it.`);
  setTimeout(() => { // the barrage ends with you on the floor
    if (room.phase !== 'play' || room.players.get(p.id) !== p) return; const t2 = Date.now(); if (p.koUntil > t2) return;
    p.koUntil = t2 + 6000; p.koImmune = p.koUntil + 3000; for (const q of room.players.values()) send(q, { type: 'ko', id: p.id, until: p.koUntil, pelt: true }); broadcast(room);
  }, PELT_MS);
}
function kiss(room, p) {
  const t = Date.now(); if ((room.kissAt || 0) > t) return; room.kissAt = t + 12000;
  for (const q of room.players.values()) send(q, { type: 'kiss', id: p.id, at: t }); feed(room, `💋 ${p.name} went all in and hit. Gina noticed.`);
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

// ---------- the developer's check-ins (room.quota: crew net worth targets on pace for tonight's goal) ----------
const owing = (room) => plist(room).filter((p) => p.debt > 0 && !p.dead);
function checkQuota(room, q) {
  const crew = plist(room).reduce((a, p) => a + networth(room, p), 0), n = Math.max(1, room.players.size), now = Date.now(); q.crew = Math.round(crew);
  const met = crew >= q.target; q.status = met ? 'met' : 'missed';
  if (met) {
    feed(room, q.kind === 'mid' ? `📋 ${STORY.dev.name} checked the fund: on pace. "Huh. Beginner's luck."` : `✅ Tonight's goal is in the bag. ${STORY.owner.name} owes you all a round.`);
    for (const p of room.players.values()) { p.tickets += TICKETS.quota; if (q.kind === 'mid') p.money += 100; toast(p, q.kind === 'mid' ? `On pace! ${STORY.owner.name} comps you $100 (+${TICKETS.quota} tickets)` : `Tonight's goal met: +${TICKETS.quota} tickets`, 'win'); }
  } else if (q.kind === 'mid') {
    const fee = PERMIT_FEE * n; room.fund.buyout += fee; q.fee = fee;
    feed(room, `📋 ${STORY.dev.name} checked the fund: behind pace. "That'll be a permit fee." The buyout went up ${money(fee)} to ${money(room.fund.buyout)}.`);
  } else feed(room, `⚠️ The crew came up short of tonight's goal (${money(crew - room.crewStart)} of ${money(room.goal)}).`);
  if (q.kind === 'mid' && !room.goons && !(room.cine && now < room.cine.until)) room.cine = { kind: 'checkIn', start: now, until: now + 7000, met, fee: q.fee || 0, buyout: room.fund.buyout, gained: Math.round(crew - room.crewStart), target: Math.round(q.target - room.crewStart) };
  if (q.kind === 'mid' && owing(room).length) room.pendingShake = now + 8000; // Sal checks in on his loans too: his collectors walk in once the developer is gone
}
// the guided first night: the bum shows up early and the napkin teaches bottles on him
function startTraining(room) {
  room.trained = true; const t = bum.pickTarget(room, false) || plist(room)[0]; if (t) bum.spawn(room, t, true);
}
// Sal's collectors: an installment on what the crew owes him (40%), from the people who owe it. Throw them out and it waits for closing time.
function startShake(room) {
  const debt = owing(room).reduce((a, p) => a + p.debt, 0); if (debt <= 0) return;
  const tax = clamp(Math.round(debt * 0.4 / 50) * 50, 200, 3000);
  const fightAt = goons.spawn(room, 'shake', 2, 60 + tax / 30, { amount: tax, names: owing(room).map((p) => p.name) });
  const walk = Math.max(0, ...owing(room).map((p) => Math.hypot((p.x || 0) - 5, (p.z || 0) - 8))) / 2.2 * 1000; // they follow debtors out to the street or the gas station: give them the walk
  room.shake = { tax, paid: 0, until: fightAt + dur(32000) + walk };
  feed(room, `🔫 Sal's collectors walk in for an installment: ${money(tax)} from ${owing(room).map((p) => p.name).join(', ')}. Pay it - or throw them out.`);
}
function endShake(room, beaten) {
  const sh = room.shake; if (!sh) return; room.shake = null;
  if (room.goons && room.goons.kind === 'shake' && room.goons.phase !== 'outro') goons.outro(room, beaten ? 'beaten' : 'leave');
  if (beaten) { feed(room, `👊 The crew threw Sal's collectors out. The loans are still due at closing time.`); awardAll(room, 'shakeBeat'); return; }
  const left = sh.tax - sh.paid;
  if (left <= 0) { feed(room, `💸 The installment is paid. Sal is satisfied - for now.`); return; }
  const who = owing(room), each = Math.ceil(left / Math.max(1, who.length)); let took = 0;
  for (const p of who) { const take = Math.min(Math.floor(p.money), each, p.debt); p.money -= take; p.debt -= take; took += take; if (take > 0) toast(p, `The collectors shook you down for ${money(take)} (off what you owe Sal).`, 'mob'); }
  feed(room, `💼 The collectors took ${money(took)} toward Sal's loans and left.`);
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
    const h = be.hits || { red: 0, blue: 0 }, pRed = clamp(0.5 + 0.12 * (h.blue - h.red), 0.15, 0.85), win = Math.random() < pRed ? 'red' : 'blue'; /* every bottle on a fighter tips it against him */
    const now = Date.now(); room.fightOver = { winner: win, red: be.red, blue: be.blue, start: now, until: now + 6000, seed: be.until }; // clients play the knockout (public/brawl.js)
    feed(room, `🥊 ${win === 'red' ? be.red : be.blue} wins the bar fight!`);
    for (const [pid, b] of Object.entries(be.bets)) { const p = room.players.get(pid); if (!p) continue; if (b.side === win) { p.money += b.stake * 1.9; toast(p, `Your fighter won! +${money(b.stake * 0.9)}`, 'win'); award(room, p, 'fightWin'); } else toast(p, `Your fighter got flattened. -${money(b.stake)}`, 'err'); }
  }
}



function _unused() {}
// fix heat: every fix you buy raises your heat; each one can get flagged by the league. Bigger upsets and the final are riskier.
function fixRisk(room, p, ev, side) {
  const nat = ev.sa > ev.sb ? 'a' : 'b', ia = 1 / ev.mk.ml.a.dec, ib = 1 / ev.mk.ml.b.dec, pNat = (nat === 'a' ? ia : ib) / (ia + ib);
  let r = 0.1 + 0.1 * (p.heat || 0) + (side !== nat ? 0.7 * Math.max(0, pNat - 0.5) : 0); if (ev.final) r *= 1.5;
  return Math.max(0.05, Math.min(0.85, r));
}
const fixPrice = (room, ev) => 1500 + 300 * ev.idx + (ev.final ? 2000 : 0);

// ---------- settlement (mob collects, hitmen arrive) ----------
function settle(room) {
  let total = 0;
  for (const p of room.players.values()) {
    const won = p.finalCorrect === true; let owe = p.debt;
    if (p.mobTied && won) owe += Math.round(MOB_CUT * Math.max(0, p.money - (p.startCash || START_MONEY)));
    const pay = Math.min(p.money, owe);
    if (owe > 0) { p.money -= pay; feed(room, `💼 The mob collected ${money(pay)} from ${p.name}.`); }
    p.remaining = owe - pay; p.debt = p.remaining; total += p.remaining;
  }
  const hunted = plist(room).filter((p) => p.remaining > 0);
  if (!hunted.length) return finish(room);
  room.phase = 'hunt'; bum.scram(room);
  // the way out is bottles: each hitman takes HUNT_HITS clean bottle hits (they dodge, and get back up unless all are down at once)
  const crew = room.players.size, n = crew <= 3 ? 3 : crew <= 5 ? 4 : 5, hits = room.finale ? 4 : 3; /* bigger crews face more hitmen; on the last night each takes one more hit */
  const fightAt = goons.spawn(room, 'hunt', n, n * hits, { names: hunted.map((p) => p.name), amount: Math.round(total), hp: hits });
  room.huntEnd = fightAt + dur(HUNT_MS);
  feed(room, `🔫 ${n} hitmen are here for ${hunted.map((p) => p.name).join(', ')}. Pay up - or drop them all with bottles and get out.`);
  broadcast(room);
}
function endHunt(room, beaten) {
  if (room.phase !== 'hunt') return;
  for (const p of room.players.values()) {
    if (p.remaining > 0) {
      const camp = room.format === 'campaign' && room.camp;
      if (beaten && camp) { p.rollover = Math.round(p.remaining * ROLL_VIG); p.fate = room.finale ? 'escaped (still owes Sal)' : `escaped (${money(p.rollover)} rolls to next night)`; } /* escaping isn't paying: Sal adds it to tomorrow's tab */
      else p.fate = beaten ? 'survived (beat the hitmen)' : 'dead';
      if (!beaten) { p.dead = true; feed(room, `💀 ${p.name} was taken to the back room.`); }
      p.remaining = 0;
    }
    else if (p.mobTied) p.fate = 'paid up';
  }
  finish(room);
}
function finish(room) {
  const ps = plist(room), camp = room.format === 'campaign' && room.camp;
  if (!room.deposited) { // closing time: everyone's winnings above tonight's bankroll go into the Save the Bar fund (the back room keeps a dead man's)
    room.deposited = true; let dep = 0;
    for (const p of ps) { const prof = p.dead ? 0 : Math.floor(p.money - p.startCash - (p.atm || 0)); /* ATM cash goes back first */ p.gave = Math.max(0, prof); if (prof > 0) { p.money -= prof; dep += prof; } }
    room.fund.banked += dep; room.deposit = dep;
    feed(room, dep > 0 ? `🏦 The crew put ${money(dep)} in the Save the Bar fund: ${money(room.fund.banked)} of ${money(room.fund.buyout)}.` : `🏦 Nothing for the fund tonight. ${money(room.fund.banked)} of ${money(room.fund.buyout)}.`);
    const last = !camp || room.night >= camp.nights;
    if (last) { // the verdict scene plays first; tick() comes back here when it's done
      const saved = room.fund.banked >= room.fund.buyout, now = Date.now();
      clearInterval(room.tick); room.tick = setInterval(() => tick(room), 400); room.barEvent = null; room.shake = null; goons.stop(room); if (room.bum) bum.stop(room);
      room.cine = { kind: 'verdict', saved, start: now, until: now + 12000, banked: room.fund.banked, buyout: room.fund.buyout };
      room.verdictAt = now + 12000; broadcast(room); return;
    }
  }
  clearInterval(room.tick); room.barEvent = null; room.shake = null; room.cine = null; goons.stop(room); if (room.bum) bum.stop(room);
  const s = room.season;
  for (const p of ps) if (!p.fate) p.fate = 'paid up';
  const correct = ps.filter((p) => p.finalCorrect).length, fin = room.events[room.events.length - 1], fr = (fin && fin.result) || {};
  const crewWon = correct >= Math.ceil(ps.length / 2) && correct > 0, vacated = crewWon && !!fr.fixed, voidedFinal = !!fr.voided;
  // the night's result: called the champion AND made tonight's goal for the fund = legendary; one of the two = survived; neither = busted
  const lastQ = room.quota[room.quota.length - 1], quotaMet = !!(lastQ && lastQ.status === 'met');
  const tier = crewWon && quotaMet ? 'legendary' : crewWon || quotaMet ? 'survived' : 'busted';
  const crewBonus = Math.floor({ legendary: TICKETS.crewWin, survived: 6, busted: 0 }[tier] / (vacated ? 2 : 1));
  const mvp = [...ps].sort((a, b) => (b.bk || 0) - (a.bk || 0) || b.money - a.money)[0];
  room.summary = { t0: room.t0, fake: !!s.fake, sid: s.fake ? null : seasonId(room.sport, s), year: s.year, league: s.league, champion: s.champion, finalWinner: room.finalWinner, altered: room.altered, blurb: s.blurb,
    crewWon, vacated, voidedFinal, correct, total: ps.length, tier, quotaMet, mvp: mvp && (mvp.bk || 0) > 0 ? { id: mvp.id, name: mvp.name, bk: mvp.bk } : null,
    players: ps.map((p) => ({ id: p.id, name: p.name, finalCorrect: p.finalCorrect, fate: p.fate, money: Math.round(p.money), bk: p.bk || 0, tickets: Math.floor((TICKETS.base + p.tickets + (p.fate === 'dead' ? 0 : 3) + crewBonus) / (p.fate === 'dead' ? 2 : 1)), bounties: p.bounties.filter((b) => b.done).length })) };
  // the fund and the bar's fate
  const saved = room.fund.banked >= room.fund.buyout, last = !camp || room.night >= camp.nights;
  room.summary.fund = { banked: room.fund.banked, buyout: room.fund.buyout, deposit: room.deposit || 0, goal: room.goal, last, saved: last ? saved : null };
  for (const sp of room.summary.players) { const p = room.players.get(sp.id); sp.gave = p ? p.gave || 0 : 0; if (last && saved) sp.tickets += 25; }
  // campaign bookkeeping: cash carries into the next night (the back room keeps whatever the dead had on them)
  if (camp) {
    for (const p of ps) p.campCash = p.dead ? 0 : Math.round(p.money); /* the back room takes everything */
    const anyDead = ps.some((p) => p.dead);
    const result = last ? (saved ? (anyDead ? 'saved_cost' : 'saved') : 'sold') : null;
    camp.log.push({ night: room.night, tier, sport: room.sport, season: s.fake ? s.league : `${s.year} ${s.league}` });
    room.summary.camp = { night: room.night, nights: camp.nights, last, result, log: camp.log,
      players: ps.map((p) => { const carried = p.campCash, front = Math.max(0, FLOOR_CASH - carried); return { id: p.id, name: p.name, cash: carried, rollover: p.rollover || 0, dead: !!p.dead, nextTab: last ? null : p.rollover || 0, fronted: front }; }) };
  }
  room.phase = 'ended'; broadcast(room);
}

// ---------- hints (drunk confidence) ----------
// Everyone has a hidden sweet spot (meter 55-70, shifted +/-10 per player per season). Below it the gut feeling is vague
// and barely better than a coin; inside it, right 60% of the time; past it, just as confident but usually wrong; wasted is
// nonsense. Coming back down from past the spot = a hangover with no gut feelings for a minute. A confident tip locks
// for that game (no re-rolling by drinking more).
const HINT_ACC = { warm: 0.52, sweet: 0.6, over: 0.35, wasted: 0.3 };
function drinkZone(p) {
  const d = drunkNow(p), tol = p.tol || 0, lo = 55 + tol, hi = 70 + tol, now = Date.now();
  if (d > hi) p.over = true;
  if (p.over && d <= hi) { p.over = false; p.hangUntil = now + dur(60000); }
  if (p.hangUntil > now && d > 15) return 'hangover';
  if (d < 20) return 'sober';
  if (d < lo) return 'warm';
  if (d <= hi) return 'sweet';
  return d >= 92 ? 'wasted' : 'over';
}
function hintFor(room, p, ev) {
  p.tips = p.tips || {}; if (p.tips[ev.idx]) return p.tips[ev.idx];
  const zone = drinkZone(p); if (zone === 'sober' || zone === 'hangover') return null;
  const season = room.season, rng = seeded(p.id + ':' + ev.idx + ':' + zone), acc = HINT_ACC[zone];
  const nat = ev.sa > ev.sb ? 'a' : 'b', other = (s) => (s === 'a' ? 'b' : 'a');
  const mlSide = rng() < acc ? nat : other(nat);
  const tot = ev.sa + ev.sb, truthTot = tot > ev.mk.total.line ? 'over' : 'under';
  const totPick = rng() < acc ? truthTot : truthTot === 'over' ? 'under' : 'over';
  const margin = Math.abs(ev.sa - ev.sb);
  const cover = (() => { const sa = ev.mk.spread.a.line; return ev.sa + sa > ev.sb ? 'a' : 'b'; })();
  const spSide = rng() < acc ? cover : other(cover);
  const nm = (s) => ev[s], sh = (s) => season.teams[ev[s]].short;
  const starOf = (s) => { const st = season.teams[ev[s]].stars; return st.length ? st[Math.floor(rng() * st.length)][0] : null; };
  const T = (arr) => arr[Math.floor(rng() * arr.length)];
  // the label never says which zone you're in: warm = "gut feeling", sweet and over look identical ("drunk confidence")
  const hint = { level: zone === 'warm' ? 'gut' : zone === 'wasted' ? 'wasted' : 'confident' };
  if (zone === 'warm') {
    hint.ml = { side: mlSide, conf: 1, text: T([`Mmm... something about ${sh(mlSide)} just feels right tonight.`, `I've got a weird good feeling about ${sh(mlSide)}.`, `Don't ask me why, but ${sh(mlSide)}.`]) };
    hint.total = { pick: totPick, conf: 1, text: totPick === 'over' ? 'This one feels like it gets loud.' : 'Feels like a grind. Low scoring, maybe.' };
  } else if (zone === 'sweet' || zone === 'over') {
    const s = starOf(mlSide), slur = zone === 'over' && rng() < 0.5; // past the spot you only sometimes notice the words getting loose
    const w = (t) => (slur ? t.replace(/s\b/, 'sh').replace('!', '!!') : t);
    hint.ml = { side: mlSide, conf: rng() < 0.5 ? 2 : 3, text: w(T([s ? `${s} is gonna EAT tonight. I can feel it.` : `${nm(mlSide)} are locked in. Trust the buzz.`, `I would bet the HOUSE on ${nm(mlSide)}. Put that on a napkin.`])) };
    hint.total = { pick: totPick, conf: 2, text: w(totPick === 'over' ? `Both offenses are cooking - over ${ev.mk.total.line}, easy.` : `Defenses win this one. Under ${ev.mk.total.line}.`) };
    hint.spread = { side: spSide, conf: 2, text: w(margin >= Math.abs(ev.mk.spread[spSide].line) ? `${sh(spSide)} cover without sweating.` : `Tight game - take the points.`) };
    p.tips[ev.idx] = hint; // confident tips lock for this game
  } else {
    const rs = rng() < 0.5 ? 'a' : 'b';
    hint.ml = { side: rs, conf: 3, text: T([`hic... ${sh(rs)}... or the other guy... definitely the first one`, `bro... bro... ${nm(rs)}. i'm SO sure. what were we talking about`, `*burp* trust me... ${sh(rs)}!`]) };
    hint.total = { pick: rng() < 0.5 ? 'over' : 'under', conf: 3, text: 'the number is... a number. go big.' };
    p.tips[ev.idx] = hint;
  }
  return hint;
}

// ---------- side jobs from the bartender ----------
// One job at a time, 3 minutes to finish it. Targets are named regulars at fixed spots (they match bar.js); the server
// checks you are standing next to them. Collecting for Sal pays in a smaller tab instead of cash.
const SPOTS = { 'Gina': [5.4, 3.4], 'Celtics Ray': [8.3, 4.6], 'Sloppy Steve': [7.6, 6.2], 'Dealer': [21.5, 43.15] /* the gas-station casino (public/outside.js OUT.dealer) */, 'Clerk': [-8.6, 6.4], bar: [8.3, 2.5] };
const JOB_MS = 180000, JOB_GAP_MS = 20000;
function makeJob(p) {
  const kind = pick(['deliver', 'deliver', 'collect', 'bounce', 'hustle']);
  if (kind === 'deliver') { const t = pick(['Gina', 'Celtics Ray', 'Dealer', 'Clerk']); return { kind, target: t, stage: 'go', reward: 90 + rnd(5) * 15, text: `Take this round over to ${t}.`, step: `Bring the drinks to ${t}` }; }
  if (kind === 'collect') { const t = pick(['Sloppy Steve', 'Celtics Ray']); return { kind, target: t, stage: 'go', tabCut: 150, text: `${t} owes Sal and keeps "forgetting". Get the envelope and bring it back to me - Sal pays $150 (off your tab, if you owe him).`, step: `Collect from ${t}` }; }
  if (kind === 'bounce') { const t = pick(['Sloppy Steve', 'Celtics Ray']); return { kind, target: t, stage: 'go', reward: 120, text: `${t} is getting rowdy. Calm him down - a bottle usually works.`, step: `Bottle ${t}` }; }
  return { kind, target: null, stage: 'go', reward: 150, text: 'The Shark has been hustling my customers. Beat him (or the Regular) at darts, bowling, cornhole - or win a game of pool.', step: 'Win a pool game or beat the Regular / Shark' };
}
function finishJob(room, p, why) {
  const j = p.job; if (!j) return; p.job = null; p.jobNext = Date.now() + dur(JOB_GAP_MS); p.jobsDone = (p.jobsDone || 0) + 1;
  if (j.tabCut && p.debt > 0) { const cut = Math.min(j.tabCut, p.debt); p.debt -= cut; p.tab = Math.max(0, (p.tab || 0) - cut); toast(p, `🍸 ${why} Sal knocked ${money(cut)} off your tab.`, 'win'); }
  else if (j.tabCut) { p.money += j.tabCut; toast(p, `🍸 ${why} Sal paid you ${money(j.tabCut)}.`, 'win'); }
  else { p.money += j.reward; toast(p, `🍸 ${why} +${money(j.reward)} from the bartender.`, 'win'); }
  feed(room, `🍸 ${p.name} did a job for the bartender.`);
}
function jobEvent(room, p, type, data = {}) { // hooks: wins at the arcade / pool, bottles on regulars
  const j = p.job; if (!j || Date.now() > j.until) return;
  if (j.kind === 'hustle' && (type === 'poolWin' || (type === 'challengeWin' && data.opp !== 'rookie'))) finishJob(room, p, 'Nice hustle.');
  if (j.kind === 'bounce' && type === 'npcBottled' && data.name === j.target) finishJob(room, p, `${j.target} is quiet now.`);
}

// ---------- Old Vinnie, the bar's tipster ----------
// Forty years on the same stool. Buy him a drink and he'll tell you what he thinks of the open game: right ~70% of the
// time, and the whole crew hears the same story (it's seeded per game). Once per game per player.
const VINNIE_PRICE = 100, VINNIE_ACC = 0.7;
function vinnieTip(room, ev) {
  const rng = seeded(room.code + ':vinnie:' + ev.idx + ':' + room.t0), nat = ev.sa > ev.sb ? 'a' : 'b', side = rng() < VINNIE_ACC ? nat : nat === 'a' ? 'b' : 'a';
  const tot = ev.sa + ev.sb, truth = tot > ev.mk.total.line ? 'over' : 'under', total = rng() < 0.6 ? truth : truth === 'over' ? 'under' : 'over';
  const team = ev[side], sh = room.season.teams[team].short, T = (a) => a[Math.floor(rng() * a.length)];
  const text = T([`Listen. I seen a hundred of these. ${team} - they got the look. Mark it down.`, `My knees say rain and my gut says ${sh}. My gut's been right since '79.`, `Everybody's talking about the other guys. That's exactly why I like ${team}.`, `Kid, I'll tell you one thing for free - well, not free. ${sh}. Bet the house. Don't bet the house.`]);
  const tt = total === 'over' ? `And the number's too low. Points'll come.` : `And it'll be ugly. Low score. Take the under.`;
  return { side, total, text, totalText: tt };
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
  // games that haven't opened stay secret: who plays (and how far a series runs) would give the season away
  if (ev.status === 'upcoming') return { idx: ev.idx, label: `Game ${ev.idx + 1}`, a: null, b: null, status: ev.status, openAt: ev.openAt, closeAt: ev.closeAt, resolveAt: ev.resolveAt, final: !!ev.final, hidden: true };
  const done = ev.status === 'final'; // overtime / extra innings are part of the result
  const o = { idx: ev.idx, label: ev.label, a: ev.a, b: ev.b, status: ev.status, openAt: ev.openAt, closeAt: ev.closeAt, resolveAt: ev.resolveAt, final: !!ev.final, n: !!ev.n, ot: done && !!ev.ot, ex: done ? ev.ex || 0 : 0 };
  if (ev.status === 'final') o.result = ev.result;
  if (ev.status === 'airing') o.plays = ev.air.plays;
  return o;
}
function view(room, p) {
  const d = Math.round(drunkNow(p));
  const v = { type: 'state', now: Date.now(), code: room.code, you: p.id, host: room.hostId === p.id, phase: room.phase, sport: room.sport, pace: room.pace, mode: room.mode, seasonCount: SEASONS[room.sport].length, league: room.season && room.season.fake ? room.season.league : null,
    sports: Object.entries(SPORTS).map(([id, s]) => ({ id, label: s.label, emoji: s.emoji })), paces: Object.entries(PACES).map(([id, x]) => ({ id, label: x.label })), format: room.format, formats: Object.entries(FORMATS).map(([id, x]) => ({ id, label: x.label, blurb: x.blurb })),
    guided: !!room.guided, guide: room.guide || 'auto', newbies: plist(room).filter((q) => !q.tutDone).length,
    camp: room.camp ? { night: room.night && room.phase !== 'lobby' ? room.night : room.camp.night, nights: room.camp.nights, log: room.camp.log } : null, story: STORY, fund: room.fund && room.phase !== 'lobby' ? { banked: room.fund.banked, buyout: room.fund.buyout, goal: room.goal || 0, start: room.crewStart || 0 } : room.camp && room.camp.fund ? { banked: room.camp.fund.banked, buyout: room.camp.fund.buyout } : null, modes: Object.entries(MODES).map(([id, x]) => ({ id, label: x.label, blurb: x.blurb })),
    feed: room.feed.slice(-25), drinks: DRINKS, btaken: room.btaken, drops: (room.drops || []).map((d) => ({ id: d.id, x: d.x, z: d.z, amt: d.amt })), // bottle spots on tables: index -> respawn time

    players: plist(room).map((q) => ({ id: q.id, name: q.name, color: q.color, cos: q.cos || {}, money: Math.round(q.money), connected: q.connected, fate: q.fate, smoking: (q.cigUntil || 0) > Date.now() ? q.cigUntil : 0, drunk: Math.round(drunkNow(q)), campCash: q.campCash ?? null, rollover: q.rollover || 0,
      hunted: room.phase === 'hunt' && q.remaining > 0, finalCorrect: room.phase === 'ended' ? q.finalCorrect : null })),
    me: { money: Math.round(p.money), debt: Math.round(p.debt), tab: p.tab || 0, loans: p.loans, mobTied: p.mobTied, remaining: Math.round(p.remaining), drunk: d, decay: dur(DRUNK_DECAY_MS), band: band(d), bets: p.bets, fix: p.fix, results: p.results, tickets: p.tickets || 0, streak: p.streak || {}, challenge: p.challenge, pool: p.pool ? { opp: p.pool.opp, stake: p.pool.stake } : null,
      bounties: (p.bounties || []).map((b) => ({ id: b.id, text: b.text, reward: b.reward, done: b.done })),
      job: p.job && Date.now() < p.job.until ? { kind: p.job.kind, text: p.job.text, step: p.job.step, target: p.job.kind === 'collect' && p.job.stage === 'back' ? 'bar' : p.job.target, stage: p.job.stage, reward: p.job.reward || 0, tabCut: p.job.tabCut || 0, until: p.job.until } : null,
      jobNext: p.jobNext || 0, jobsDone: p.jobsDone || 0, vinniePrice: VINNIE_PRICE,
      inv: { cigs: p.cigs || 0, cans: p.cans || 0 }, cigUntil: p.cigUntil || 0, wiredUntil: p.wiredUntil || 0, zynUntil: p.zynUntil || 0, atm: p.atm || 0, bumPass: !!p.bumPass } };
  v.gas = { beer: GAS.beer.price, cig: GAS.cig, pack: GAS.pack, energy: GAS.energy, tiers: SCRATCH.tiers, atmMax: ATM_MAX, atmFee: ATM_FEE }; v.zynAt = room.zynAt || 0; v.zynSpot = room.zynSpot || 0;
  if (room.season && room.phase !== 'lobby') {
    v.events = room.events.map((e) => evSummary(e));
    v.teams = Object.fromEntries(Object.entries(room.season.teams).map(([n, t]) => [n, { short: t.short, color: t.color }]));
    v.quota = room.quota.map((q) => ({ kind: q.kind, idx: q.idx, target: q.target, status: q.status, crew: q.crew }));
    v.crewNow = Math.round(plist(room).reduce((a, q) => a + networth(room, q), 0));
    v.barEvent = room.barEvent ? { kind: room.barEvent.kind, until: room.barEvent.until, betUntil: room.barEvent.betUntil, red: room.barEvent.red, blue: room.barEvent.blue, hits: room.barEvent.hits || null, title: room.barEvent.title, text: room.barEvent.text, mine: room.barEvent.bets ? room.barEvent.bets[p.id] || null : null } : null;
    v.shake = room.shake ? { training: !!room.shake.training, tax: room.shake.tax, paid: room.shake.paid, hp: goons.hpLeft(room), maxHp: goons.hpMax(room), until: room.shake.until } : null;
    v.fightOver = room.fightOver && Date.now() < room.fightOver.until ? room.fightOver : null;
    v.bum = room.bum ? { training: !!room.bum.training, target: room.bum.target, state: room.bum.state, loot: room.bum.loot } : null;
    v.spinning = room.spin ? { by: room.spin.name, until: room.spin.until } : null;
    const cur = room.events.find((e) => e.status === 'open');
    if (cur && room.phase === 'play') {
      v.cur = { idx: cur.idx, mk: cur.mk, series: seriesText(room, cur), fixPrice: fixPrice(room, cur), fixRisk: { a: Math.round(fixRisk(room, p, cur, 'a') * 100), b: Math.round(fixRisk(room, p, cur, 'b') * 100) }, intel: { a: intel(room, cur, 'a'), b: intel(room, cur, 'b') },
        hint: room.barEvent && room.barEvent.kind === 'blackout' ? null : hintFor(room, p, cur), vinnie: (p.vinnie || {})[cur.idx] || null, tip: room.barEvent && room.barEvent.tip && room.barEvent.tip.idx === cur.idx ? room.barEvent.tip : null, crew: plist(room).reduce((acc, q) => { const b = (q.bets[cur.idx] || {}).ml; if (b) acc[b.pick]++; return acc; }, { a: 0, b: 0 }) };
    }
  }
  if (room.phase === 'hunt') v.hunt = { hp: goons.hpLeft(room), maxHp: goons.hpMax(room), until: room.huntEnd, goons: room.goons ? room.goons.list.map((g) => ({ hp: g.hp, max: g.maxHp, down: g.state === 'down' })) : [] };
  v.cine = room.cine || null; v.me.held = p.heldBy || null; v.me.dead = !!p.dead; v.me.heat = p.heat || 0; v.me.banUntil = p.banUntil ?? null; v.me.hangover = (room.phase === 'play' || room.phase === 'hunt') && drinkZone(p) === 'hangover';
  if (room.phase === 'ended') v.summary = room.summary;
  if (inPlay(room)) v.paper = room.paper || null;
  return v;
}
const bum = createBum({ feed, toast: (p, t, k) => toast(p, t, k), broadcast: (r) => broadcast(r), plist, money, send: (p, m) => send(p, m), STORY });
const goons = createGoons({ feed, toast: (p, t, k) => toast(p, t, k), broadcast: (r) => broadcast(r), plist, money, send: (p, m) => send(p, m),
  onDone: (room, kind, how) => { // an ending sequence finished
    if (kind === 'hunt') { if (how === 'kill') endHunt(room, false); else if (how === 'beaten') endHunt(room, true); else finish(room); }
    else if (room.shake) endShake(room, how === 'beaten');
  } });
function broadcast(room) { for (const p of room.players.values()) send(p, view(room, p)); }

// ---------- message handling ----------
const inPlay = (room) => room.phase === 'play' || room.phase === 'hunt';

function handle(room, p, m) {
  switch (m.type) {
    case 'setSport': if (room.hostId === p.id && room.phase === 'lobby' && SPORTS[m.sport]) { room.sport = m.sport; broadcast(room); } break;
    case 'setMode': if (room.hostId === p.id && room.phase === 'lobby' && MODES[m.mode]) { room.mode = m.mode; broadcast(room); } break;
    case 'seen': p.seen = new Set((Array.isArray(m.ids) ? m.ids : []).slice(-200).map(String)); if (typeof m.tut === 'boolean') { p.tutDone = m.tut; if (room.phase === 'lobby') broadcast(room); } break;
    case 'setGuide': if (room.hostId === p.id && room.phase === 'lobby' && ['auto', 'on', 'off'].includes(m.guide)) { room.guide = m.guide; broadcast(room); } break;
    case 'setFormat': if (room.hostId === p.id && room.phase === 'lobby' && FORMATS[m.format] && !(room.camp && room.camp.night > 1)) { room.format = m.format; room.camp = null; broadcast(room); } break;
    case 'endCampaign': if (room.hostId === p.id && room.phase === 'lobby' && room.camp) { room.camp = null; for (const q of room.players.values()) { q.campCash = null; q.rollover = 0; } feed(room, '📖 The crew walked away from the campaign.'); broadcast(room); } break;
    case 'jobTake': {
      const now = Date.now(); if (room.phase !== 'play') break;
      if (p.job && now < p.job.until) { toast(p, 'Finish the job you have first.', 'err'); break; }
      if (now < (p.jobNext || 0)) { toast(p, 'Bartender: "Give me a minute. I\'ll have something for you."', 'info'); break; }
      p.job = { ...makeJob(p), until: now + dur(JOB_MS) }; toast(p, `🍸 Job: ${p.job.text}`, 'info'); broadcast(room); break;
    }
    case 'jobDrop': if (p.job) { p.job = null; p.jobNext = Date.now() + dur(JOB_GAP_MS); broadcast(room); } break;
    case 'jobAct': { // pressed E next to a job target (or back at the bar)
      const j = p.job; if (!j || !inPlay(room) || Date.now() > j.until) break;
      const at = (n, r = 2.2) => SPOTS[n] && Math.hypot(p.x - SPOTS[n][0], p.z - SPOTS[n][1]) < r;
      if (j.kind === 'deliver' && at(j.target)) finishJob(room, p, `${j.target} got the round.`);
      else if (j.kind === 'collect' && j.stage === 'go' && at(j.target)) { j.stage = 'back'; j.step = 'Bring Sal\'s envelope back to the bar'; toast(p, `${j.target} grumbles and hands over an envelope. Don't drop it.`, 'info'); }
      else if (j.kind === 'collect' && j.stage === 'back' && at('bar', 3.2)) finishJob(room, p, 'Envelope delivered.');
      broadcast(room); break;
    }
    case 'vinnie': {
      const ev = room.events.find((e) => e.status === 'open'); if (room.phase !== 'play' || !ev) { toast(p, 'Vinnie: "No game open, kid. Come back when there\'s action."', 'info'); break; }
      p.vinnie = p.vinnie || {}; if (p.vinnie[ev.idx]) break;
      if (p.money < VINNIE_PRICE) { toast(p, 'Vinnie: "No drink, no tip."', 'err'); break; }
      p.money -= VINNIE_PRICE; p.vinnie[ev.idx] = vinnieTip(room, ev); feed(room, `🍷 ${p.name} bought Old Vinnie a drink.`); broadcast(room); break;
    }
    case 'setPace': if (room.hostId === p.id && room.phase === 'lobby' && PACES[m.pace]) { room.pace = m.pace; broadcast(room); } break;
    case 'start': if (room.hostId === p.id && room.phase === 'lobby') startGame(room); break;
    case 'rematch': if (room.hostId === p.id && room.phase === 'ended') {
      const camp = room.format === 'campaign' && room.camp;
      if (camp && m.next && room.night < camp.nights) camp.night = room.night + 1; // on to the next night: cash and rollovers carry
      else { room.camp = null; for (const q of room.players.values()) { q.campCash = null; q.rollover = 0; } }
      Object.assign(room, { phase: 'lobby', season: null, events: [], feed: [], altered: false, summary: null, spin: null, shake: null, barEvent: null, quota: [] });
      for (const q of room.players.values()) Object.assign(q, { bets: {}, fix: {}, results: {} });
      broadcast(room);
    } break;
    case 'bet': {
      const ev = room.events[m.ev]; if (room.phase !== 'play' || !ev || ev.status !== 'open') { toast(p, 'Betting is closed on that game.', 'err'); break; }
      if (p.banUntil != null && ev.idx <= p.banUntil) { toast(p, `You're barred from the sportsbook until after game ${p.banUntil + 1}.`, 'err'); break; }
      const mk = m.market, pk = m.pick, stake = Math.floor(Number(m.stake));
      const okPick = (mk === 'ml' || mk === 'spread') ? ['a', 'b'].includes(pk) : mk === 'total' ? ['over', 'under'].includes(pk) : false;
      if (!okPick) break;
      const bets = (p.bets[ev.idx] = p.bets[ev.idx] || {});
      if (bets[mk]) { p.money += bets[mk].stake; delete bets[mk]; }
      if (!(stake >= 10) || stake > p.money) { toast(p, 'Invalid stake.', 'err'); broadcast(room); break; }
      const mkt = ev.mk, d = mk === 'ml' ? mkt.ml[pk].dec : mk === 'spread' ? mkt.spread[pk].dec : mkt.total[pk].dec;
      const line = mk === 'spread' ? mkt.spread[pk].line : mk === 'total' ? mkt.total.line : null;
      p.money -= stake; bets[mk] = { pick: pk, stake, dec: d, line, band: band(drunkNow(p)), allIn: p.money < 1 && stake >= 50 /* the MAX button: everything you have */ }; broadcast(room); break;
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
      const g = MG[m.game], opp = OPPS[m.opp]; if (!inPlay(room) || !g || !opp) break;
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
      if (!inPlay(room) || !POOL_MULT[m.opp]) break;
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
      p.money -= amt; sh.paid += amt; p.debt = Math.max(0, p.debt - amt); if (sh.paid >= sh.tax) endShake(room, false); broadcast(room); break; // paid in full: the collectors walk out. It all counts against what you owe Sal
    }
    case 'fightBet': {
      const be = room.barEvent; if (!be || be.kind !== 'fight' || Date.now() > be.betUntil || !['red', 'blue'].includes(m.side)) break;
      const stake = Math.floor(Number(m.stake)); if (be.bets[p.id] || !(stake >= 10 && stake <= Math.min(300, p.money))) break;
      p.money -= stake; be.bets[p.id] = { side: m.side, stake }; broadcast(room); break;
    }
    case 'cosmetics': {
      const cos = {}; for (const k of ['head', 'face', 'body', 'hand', 'back', 'tag']) { const v = m.cos && m.cos[k]; if (typeof v === 'string' && /^[a-z0-9_]{1,24}$/.test(v)) cos[k] = v; }
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
      let n = rnd(37); const payAt = (k) => bets.reduce((a, b) => a + (rouletteWins(b.pick, k) ? b.stake * rouletteMult(b.pick) : 0), 0);
      if (lucky(p) && payAt(n) <= total) { const good = [...Array(37).keys()].filter((k) => payAt(k) > total); if (good.length && Math.random() < luckQ(good.length / 37)) n = pick(good); } // the cigarette
      const color = colorOf(n); p.money -= total;
      const ms = dur(SPIN_MS); room.spin = { pid: p.id, name: p.name, until: Date.now() + ms, n, color, bets, total };
      for (const q of room.players.values()) send(q, { type: 'spin', n, color, by: p.name, mine: q === p, ms, bets });
      broadcast(room); // resolved by tick() -> resolveSpin once the ball has landed
      break;
    }
    case 'pay': {
      if (room.phase !== 'hunt' || p.remaining <= 0) break;
      const amt = Math.min(p.money, p.remaining, Math.floor(Number(m.amount) || p.remaining));
      if (amt > 0) { p.money -= amt; p.remaining -= amt; p.debt = p.remaining; if (p.remaining <= 0) { p.fate = 'paid up'; feed(room, `✅ ${p.name} paid off the mob.`); } }
      broadcast(room); break;
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
    case 'slot': { // gas-station slot machine: 3 reels, weighted symbols, ~91% back (see SLOT_*). Stake now, winnings when the reels stop
      const t = Date.now(), i = Math.floor(Number(m.m)), bet = Math.floor(Number(m.bet));
      if (room.phase !== 'play' || !(i >= 0 && i < SLOT_N) || !SLOT_BETS.includes(bet) || t - (p.lastSlot || 0) < 1800) break;
      if (p.money < bet) { toast(p, "Not enough cash for that bet.", 'err'); break; }
      p.lastSlot = t; p.money -= bet; let reels = [0, 1, 2].map(() => slotSym());
      if (lucky(p) && slotPay(reels) <= 1 && Math.random() < luckQ(SLOT_PW)) for (let k = 0; k < 200 && slotPay(reels) <= 1; k++) reels = [0, 1, 2].map(() => slotSym()); // the cigarette: a losing pull turns
      const win = Math.round(bet * slotPay(reels));
      for (const q of room.players.values()) send(q, { type: 'slot', m: i, reels, bet, win, by: p.id });
      broadcast(room);
      if (win > 0) setTimeout(() => { p.money += win; if (win >= bet * 20) feed(room, `🎰 ${p.name} hit ${reels.join(' · ').toUpperCase()} on the slots for ${money(win)}!`); broadcast(room); }, 1650);
      break;
    }
    case 'splash': { // restroom sink: cold water knocks the buzz down a notch
      const t = Date.now(); if (!inPlay(room)) break; if (t - (p.lastSplash || 0) < 20000) { toast(p, 'Give it a minute. Your face is still wet.', 'info'); break; }
      p.lastSplash = t; drunkNow(p); p.drunk = Math.max(0, p.drunk - 15); toast(p, '💦 Cold water. Things come back into focus a little.', 'info'); broadcast(room); break;
    }
    case 'atm': { // the gas station ATM: $20 / $50 / $100 a night, $5 a pop, and it all comes back out of your fund deposit at closing
      const amt = Math.floor(Number(m.amount)); if (room.phase !== 'play' || ![20, 50, 100].includes(amt)) break;
      if ((p.atm || 0) + amt > ATM_MAX) { toast(p, `DAILY LIMIT REACHED. ${money(ATM_MAX - (p.atm || 0))} left tonight.`, 'err'); break; }
      p.atm = (p.atm || 0) + amt; p.money += amt - ATM_FEE; p.atmMark = true; // somebody on the street saw you flash it
      toast(p, `🏧 ${money(amt)} out (${money(ATM_FEE)} fee). It comes back out of your fund money at closing - and ${STORY.bum ? STORY.bum.name : 'Dusty'} saw you count it.`, 'mob');
      room.nextBum = Math.min(room.nextBum || Infinity, Date.now() + dur(20000)); send(p, { type: 'fx', kind: 'atm' }); broadcast(room); break;
    }
    case 'gas': { // the counter: m.item = beer | cig | pack | energy | scratch (m.tier 5 / 20)
      if (!inPlay(room) || Date.now() - (p.lastGas || 0) < 600) break; p.lastGas = Date.now();
      const it = String(m.item), price = it === 'beer' ? GAS.beer.price : it === 'cig' ? GAS.cig : it === 'pack' ? GAS.pack : it === 'energy' ? GAS.energy : it === 'scratch' && SCRATCH.tiers.includes(Number(m.tier)) ? Number(m.tier) : 0;
      if (!price) break; if (p.money < price) { toast(p, 'Clerk: "Card\'s declined, chief. Cash only anyway."', 'err'); break; }
      if (it === 'beer') { if (drunkNow(p) >= 100) { toast(p, 'Clerk: "I\'m not selling you anything else tonight."', 'err'); break; } p.drunk = Math.min(100, drunkNow(p) + GAS.beer.add); award(room, p, 'drunk', { level: p.drunk }); }
      if (it === 'cig') p.cigs = (p.cigs || 0) + 1; if (it === 'pack') p.cigs = (p.cigs || 0) + 5; if (it === 'energy') p.cans = (p.cans || 0) + 1;
      p.money -= price;
      if (it === 'scratch') { // decided now; the panel lets you scratch it off. A lit cigarette helps here too
        const tier = price; let prize = 0, r = Math.random(); for (const [x, w] of SCRATCH.prizes) { if ((r -= w) < 0) { prize = x; break; } }
        if (!prize && lucky(p) && Math.random() < luckQ(SCRATCH_PW)) { let q = Math.random() * SCRATCH_PW; for (const [x, w] of SCRATCH.prizes) { if ((q -= w) < 0) { prize = x; break; } } prize = prize || 1; }
        const cells = []; if (prize) cells.push(prize, prize, prize); const left = SCRATCH.decoys.filter((x) => x !== prize).flatMap((x) => [x, x]).sort(() => Math.random() - 0.5);
        while (cells.length < 9) cells.push(left.pop()); cells.sort(() => Math.random() - 0.5);
        p.scratch = { id: crypto.randomBytes(4).toString('hex'), tier, prize: prize * tier, cells: cells.map((x) => x * tier) };
        send(p, { type: 'scratch', t: { id: p.scratch.id, tier, cells: p.scratch.cells } });
      }
      send(p, { type: 'fx', kind: 'buy', item: it }); broadcast(room); break;
    }
    case 'scratchDone': { // scratched enough to read: pay it
      const sc = p.scratch; if (!sc || sc.id !== m.id) break; p.scratch = null;
      if (sc.prize > 0) { p.money += sc.prize; toast(p, `🎟️ Three of a kind! +${money(sc.prize)}`, 'win'); if (sc.prize >= sc.tier * 10) feed(room, `🎟️ ${p.name} scratched a ${money(sc.prize)} winner at the gas station!`); } else toast(p, '🎟️ Nothing. The clerk has seen that face a thousand times.', 'info');
      broadcast(room); break;
    }
    case 'cigLight': {
      if (!inPlay(room) || !(p.cigs > 0) || lucky(p) || p.koUntil > Date.now()) break;
      p.cigs--; p.cigUntil = Date.now() + CIG_MS; toast(p, '🚬 Lit. Lady Luck likes a smoker: +15% on roulette, slots and scratchers for 2 minutes. F takes a drag.', 'info'); broadcast(room); break;
    }
    case 'cigDrag': if (lucky(p) && Date.now() - (p.lastDrag || 0) > 1500) { p.lastDrag = Date.now(); for (const q of room.players.values()) if (q !== p) send(q, { type: 'drag', id: p.id }); } break;
    case 'energy': {
      if (!inPlay(room) || !(p.cans > 0) || (p.wiredUntil || 0) > Date.now() + 5000) break;
      p.cans--; p.wiredUntil = Date.now() + ENERGY_MS; toast(p, '⚡ WIRED. Your punches hit like a truck for 60 seconds - go throw Sal\'s collectors out.', 'win'); broadcast(room); break;
    }
    case 'zyn': { // the men's room urinals: somebody keeps spitting them in there (room.zynSpot: which one)
      const t = Date.now(); if (!inPlay(room) || room.shake) break;
      if ((room.zynAt || 0) > t) { toast(p, 'Nothing in there but... no. Somebody already fished it out. Check the urinals later.', 'info'); break; }
      room.zynAt = t + ZYN_RESPAWN_MS; room.zynSpot = rnd(2); /* the next one turns up in either urinal */ p.zynUntil = t + ZYN_MS; send(p, { type: 'fx', kind: 'zyn' });
      toast(p, '🟢 You fished a pouch out of the urinal and put it in. Disgusting. Your hands are rock steady: darts, bowling and cornhole for 90 seconds.', 'win');
      feed(room, `🤢 ${p.name} took a nicotine pouch out of a urinal. And used it.`); broadcast(room); break;
    }
    case 'bumCig': { // hand Dusty a smoke: he leaves you alone the next time he'd have come for your wallet
      if (!inPlay(room) || !(p.cigs > 0)) break; const r = bum.giveCig(room, p); if (!r) break; p.cigs--;
      if (r === 'now') toast(p, `${STORY.bum ? STORY.bum.name : 'Dusty'}: "...Alright. Alright. We're good." He wanders off, smoking.`, 'win');
      else { p.bumPass = true; toast(p, `${STORY.bum ? STORY.bum.name : 'Dusty'} tucks it behind his ear. "I'll remember you." He'll skip you next time.`, 'win'); }
      feed(room, `🚬 ${p.name} gave ${STORY.bum ? STORY.bum.name : 'Dusty'} a cigarette.`); broadcast(room); break;
    }
    case 'ginaDrink': { // she takes the drink. She has a boyfriend.
      const t = Date.now(); if (!inPlay(room) || t - (p.lastGina || 0) < 8000) break;
      if (p.money < GINA_PRICE) { toast(p, `A drink for Gina is ${money(GINA_PRICE)}. You don't have it.`, 'err'); break; }
      p.lastGina = t; p.money -= GINA_PRICE;
      for (const q of room.players.values()) send(q, { type: 'npcSay', who: 'Gina', text: 'I have a boyfriend.', secs: 4, vo: 'gina_bf', by: p.id });
      feed(room, `🍸 ${p.name} bought Gina a drink. She has a boyfriend.`); broadcast(room); break;
    }
    case 'pickup': { // knocked-out players drop chips; walk over them to grab
      const d = (room.drops || []).find((x) => x.id === m.id); if (!d || !inPlay(room) || Math.hypot(p.x - d.x, p.z - d.z) > 1.4) break;
      room.drops = room.drops.filter((x) => x !== d); p.money += d.amt; toast(p, `+${money(d.amt)} in loose chips`, 'win'); broadcast(room); break;
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
      if (m.kind === 'brawler') { const be = room.barEvent; if (!be || be.kind !== 'fight' || t > be.until || !['red', 'blue'].includes(m.side)) break; be.hits = be.hits || { red: 0, blue: 0 }; be.hits[m.side]++; feed(room, `🍾 ${p.name} beaned ${m.side === 'red' ? be.red : be.blue} with a bottle!`); broadcast(room); break; }
      if (m.kind === 'goon' && m.target === 'bum') { bum.hit(room, p, true); break; }
      if (m.kind === 'goon') { if (goons.hit(room, p, String(m.target), 8, true)) { feed(room, `🍾 ${p.name} broke a bottle over a ${room.goons && room.goons.kind === 'hunt' ? 'hitman' : 'collector'}!`); broadcast(room); } break; }
      if (m.kind === 'npc') { const i = Math.floor(Number(m.npc)); if (!(i >= 0 && i < 80) || t < (room.npcKo[i] || 0)) break; room.npcKo[i] = t + 5000 + 2000;
        for (const q of room.players.values()) send(q, { type: 'ko', npc: i, until: t + 5000, by: p.id }); feed(room, `🍾 ${p.name} bottled ${m.name && /^[\w .'-]{1,24}$/.test(m.name) ? m.name : 'a bar regular'}.`); jobEvent(room, p, 'npcBottled', { name: String(m.name || '') }); broadcast(room); break; }
      const v = room.players.get(m.target); if (!v || v === p || t < v.koImmune) break;
      v.koUntil = t + 5000; v.koImmune = t + 5000 + 3000;
      if (v.job && v.job.kind === 'collect' && v.job.stage === 'back') { v.job = null; v.jobNext = t + dur(JOB_GAP_MS); toast(v, 'You dropped Sal\'s envelope. The job is blown.', 'err'); }
      { const amt = Math.min(Math.floor(v.money), 25 + rnd(26)); if (amt > 0) { v.money -= amt; room.drops = room.drops || []; room.drops.push({ id: crypto.randomBytes(4).toString('hex'), x: v.x + (Math.random() - 0.5) * 0.6, z: v.z + (Math.random() - 0.5) * 0.6, amt, until: t + 30000 }); toast(v, `You dropped ${money(amt)} in chips. Someone's going to grab them...`, 'err'); } }
      for (const q of room.players.values()) send(q, { type: 'ko', id: v.id, until: v.koUntil, by: p.id }); feed(room, `🍾 ${p.name} knocked out ${v.name} with a bottle!`); broadcast(room); break;
    }
    case 'pos': {
      const x = Number(m.x), z = Number(m.z), ry = Number(m.ry);
      if (![x, z, ry].every(Number.isFinite)) break;
      p.x = clamp(x, -60, 60); p.z = clamp(z, -60, 60); /* the street and the gas station are out past the bar walls */ p.ry = ry; const sit = Number.isFinite(Number(m.sit)) && Number(m.sit) > 0 ? clamp(Number(m.sit), 0.2, 1.2) : 0; const jy = Number.isFinite(Number(m.jy)) ? clamp(Number(m.jy), 0, 1.2) : 0; const lp = Number.isFinite(Number(m.p)) ? clamp(Number(m.p), -1.6, 1.6) : 0;
      for (const q of room.players.values()) if (q !== p) send(q, { type: 'pos', id: p.id, x: p.x, z: p.z, ry, sit, jy, p: lp });
      break;
    }
    case 'struggle': if (goons.struggle(room, p)) broadcast(room); break;
    case 'attack': { // a punch at a named goon; the server checks reach
      if (m.g === 'bum') { if (room.bum && Date.now() - p.lastHit >= 140) { p.lastHit = Date.now(); bum.hit(room, p, false); } break; }
      if (!room.goons || Date.now() - p.lastHit < 140) break; p.lastHit = Date.now();
      const wired = (p.wiredUntil || 0) > Date.now(); if (goons.hit(room, p, String(m.g || ''), wired ? 6 : 1, false, wired)) broadcast(room); break; // the energy drink: a collector goes down in a few punches
    }
  }
}

// ---------- transport ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav' };
const ICE = () => { const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]; if (process.env.TURN_URL) ice.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' }); return ice; };
// static files: ETag revalidation (repeat visits get a 304 instead of ~8 MB of models) + gzip, both cached in memory per file version
const FILES = new Map(), GZIP = new Set(['.html', '.js', '.css', '.json', '.glb', '.svg', '.wav']);
function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const send = (c) => {
      const h = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: c.etag, Vary: 'Accept-Encoding' };
      if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, h); return res.end(); }
      const gz = c.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      res.writeHead(200, { ...h, 'Content-Length': (gz ? c.gz : c.raw).length, ...(gz ? { 'Content-Encoding': 'gzip' } : {}) }); res.end(gz ? c.gz : c.raw);
    };
    const c = FILES.get(file); if (c && c.mtime === st.mtimeMs && c.size === st.size) return send(c);
    fs.readFile(file, (err2, raw) => {
      if (err2) { res.writeHead(404); return res.end('Not found'); }
      const etag = '"' + crypto.createHash('sha1').update(raw).digest('base64').slice(0, 20) + '"';
      let gz = null; if (GZIP.has(path.extname(file)) && raw.length > 1024) { const z = zlib.gzipSync(raw, { level: 9 }); if (z.length < raw.length * 0.92) gz = z; }
      const entry = { mtime: st.mtimeMs, size: st.size, etag, raw, gz }; FILES.set(file, entry); send(entry);
    });
  });
}
const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/ice.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(ICE())); }
  const path0 = req.url.split('?')[0], f = path0 === '/' ? '/index.html' : path0;
  const file = path.join(__dirname, 'public', path.normalize(f).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  serveFile(req, res, file);
});

const wss = new WebSocketServer({ server });
const ROOM_GRACE_MS = 10 * 60 * 1000; // an empty room waits this long for its players to come back before it is deleted
function reapLater(room) { clearTimeout(room.reap); room.reap = setTimeout(() => { if (![...room.players.values()].some((q) => q.connected)) { clearInterval(room.tick); clearInterval(room.goonTimer); clearInterval(room.bumTimer); rooms.delete(room.code); } }, ROOM_GRACE_MS); }
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
    if (![...room.players.values()].some((q) => q.connected)) { if (!room.players.size) { clearInterval(room.tick); clearInterval(room.goonTimer); clearInterval(room.bumTimer); rooms.delete(room.code); } else reapLater(room); return; }
    if (room.hostId === player.id || !room.players.has(room.hostId)) room.hostId = [...room.players.values()].find((q) => q.connected).id;
    broadcast(room);
  });
});

// ---------- snapshots: rooms survive a server restart/redeploy when BK_STATE_DIR points at persistent storage (e.g. a Railway volume) ----------
const STATE_DIR = process.env.BK_STATE_DIR || '', STATE_FILE = STATE_DIR && path.join(STATE_DIR, 'rooms.json');
const SKIP = new Set(['ws', 'tick', 'reap', 'sportDef', 'goonTimer', 'bumTimer', 'seen']);
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
      rooms.set(r.code, r); if (r.phase === 'play' || r.phase === 'hunt') r.tick = setInterval(() => tick(r), 400); goons.resume(r); bum.resume(r); reapLater(r);
    }
    console.log(`restored ${list.length} room(s) from snapshot`);
  } catch (e) { console.error('restore failed', e.message); }
}
if (STATE_FILE) { restore(); setInterval(snapshot, 4000); }
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { snapshot(); process.exit(0); });

if (require.main === module) server.listen(PORT, () => console.log(`Ball Knowledge running on http://localhost:${PORT}`));
module.exports = { genHighlights, buildMarkets, splitFootball, splitBasket, hintFor, drinkZone };
