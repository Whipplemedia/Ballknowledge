const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { SPORTS } = require('./seasons');

const PORT = process.env.PORT || 3000;
const START_MONEY = 1000;
const BET_MS = 75000, RESULT_MS = 14000, HUNT_MS = 100000;
const LOAN = 1000, LOAN_DEBT = 1250, MAX_LOANS = 3, MOB_CUT = 0.2;
const MG = { // cap on raw points reported by client, $ per point
  darts: { max: 150, rate: 3 }, bowling: { max: 20, rate: 25 }, cornhole: { max: 12, rate: 35 },
};

const rooms = new Map();
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---------- odds ----------
const impliedProb = (am) => (am > 0 ? 100 / (am + 100) : -am / (-am + 100));
const decimal = (p) => Math.max(1.02, Math.round((1 / (p * 1.05)) * 100) / 100);
const american = (d) => (d >= 2 ? '+' + Math.round((d - 1) * 100) : String(-Math.round(100 / (d - 1))));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

// ---------- side-bet flavor ----------
const FIRST = ['Diego', 'Tomasz', 'Kenji', 'Marcus', 'Viktor', 'Luca', 'Dre', 'Hamza', 'Bo', 'Rico', 'Sven', 'Terrence'];
const LAST = ['Ruiz', 'Kowal', 'Tanaka', 'Boyd', 'Petrov', 'Rossi', 'Whitfield', 'Aziz', 'Lund', 'Okafor', 'Brandt', 'Vega'];
const NICK = ['The Hammer', 'Ice', 'Lights Out', 'The Closer', 'Big Money', 'No Mercy', 'The Wall', 'Fireball'];
const SIDE_KINDS = ['UFC', 'Darts', 'Bowling', 'Boxing', 'Arm Wrestling', 'Pro Cornhole', 'Ping Pong', 'Sumo'];
const fighter = () => `${pick(FIRST)} "${pick(NICK)}" ${pick(LAST)}`;

function makeSideBets(round) {
  const kinds = [...SIDE_KINDS].sort(() => Math.random() - 0.5).slice(0, 2);
  return kinds.map((kind, i) => {
    const p = 0.28 + Math.random() * 0.44;
    return { id: `s${round}_${i}`, kind, a: fighter(), b: fighter(), pa: p, da: decimal(p), db: decimal(1 - p) };
  });
}

// ---------- rooms ----------
function newCode() {
  let c;
  do c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[rnd(24)]).join('');
  while (rooms.has(c));
  return c;
}

function newPlayer(id, name, ws) {
  return { id, name, ws, connected: true, money: START_MONEY, debt: 0, loans: 0, mobTied: false,
    bet: null, side: {}, fixPick: null, ready: false, finalCorrect: null, fate: null, lastMg: 0, lastHit: 0, remaining: 0 };
}

function createRoom() {
  const room = { code: newCode(), hostId: null, players: new Map(), phase: 'lobby', sport: 'nfl', season: null,
    round: -1, entrants: null, sides: [], flip: false, feed: [], timer: null, deadline: 0, lastResult: null,
    hp: 0, maxHp: 0, finalWinner: null, altered: false, summary: null };
  rooms.set(room.code, room);
  return room;
}

const feed = (room, text) => { room.feed.push({ t: Date.now(), text }); if (room.feed.length > 40) room.feed.shift(); };
const alive = (room) => [...room.players.values()];
const send = (p, msg) => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
const toast = (p, text, kind = 'info') => send(p, { type: 'toast', text, kind });

function setTimer(room, ms, fn) {
  clearTimeout(room.timer);
  room.deadline = Date.now() + ms;
  room.timer = setTimeout(fn, ms);
}

function market(room) {
  const r = room.season.rounds[room.round];
  const { a, b } = room.entrants;
  const pa = a === room.season.champion && room.entrants.real ? impliedProb(r.odds) : 0.5;
  const teams = [{ team: a, dec: decimal(pa) }, { team: b, dec: decimal(1 - pa) }];
  if (room.flip) teams.reverse();
  teams.forEach((t) => (t.am = american(t.dec)));
  return teams;
}

function fixPrice(room) {
  const last = room.round === room.season.rounds.length - 1;
  return 1500 + 1000 * room.round + (last ? 1500 : 0);
}

// ---------- state views ----------
function view(room, p) {
  const v = { type: 'state', code: room.code, you: p.id, host: room.hostId === p.id, phase: room.phase, sport: room.sport,
    sports: Object.entries(SPORTS).map(([id, s]) => ({ id, label: s.label, emoji: s.emoji })),
    deadline: room.deadline, feed: room.feed.slice(-25),
    players: alive(room).map((q) => ({ id: q.id, name: q.name, money: Math.round(q.money), ready: q.ready, connected: q.connected,
      fate: q.fate, hunted: room.phase === 'hunt' && q.remaining > 0, finalCorrect: room.phase === 'ended' ? q.finalCorrect : null })),
    me: { money: Math.round(p.money), debt: Math.round(p.debt), loans: p.loans, mobTied: p.mobTied, bet: p.bet, side: p.side,
      fixPick: p.fixPick, ready: p.ready, remaining: Math.round(p.remaining) } };
  if (room.season && room.phase !== 'lobby') {
    v.round = { index: room.round, total: room.season.rounds.length, label: room.season.rounds[room.round]?.label };
    if (room.phase === 'betting') {
      v.market = market(room);
      v.sides = room.sides.map((s) => ({ id: s.id, kind: s.kind, a: s.a, b: s.b, da: s.da, db: s.db }));
      v.fixPrice = fixPrice(room);
    }
    if (room.phase === 'result') v.result = room.lastResult && { ...room.lastResult, mine: room.lastResult.per[p.id] };
  }
  if (room.phase === 'hunt') v.hunt = { hp: Math.ceil(room.hp), maxHp: Math.ceil(room.maxHp) };
  if (room.phase === 'ended') v.summary = room.summary;
  return v;
}

function broadcast(room) {
  for (const p of room.players.values()) send(p, view(room, p));
}

// ---------- game flow ----------
function startGame(room) {
  const sport = SPORTS[room.sport];
  room.season = pick(sport.seasons);
  room.round = -1;
  for (const p of room.players.values()) Object.assign(p, { money: START_MONEY, debt: 0, loans: 0, mobTied: false, fate: null, finalCorrect: null, remaining: 0 });
  feed(room, `${sport.emoji} A season has been assigned. Nobody will tell you which one. Good luck.`);
  nextRound(room);
}

function nextRound(room) {
  room.round++;
  const s = room.season;
  const prevWinner = room.lastResult ? room.lastResult.winner : s.champion;
  const real = room.round === 0 ? true : room.entrants.real && prevWinner === s.champion;
  room.entrants = { a: room.round === 0 ? s.champion : prevWinner, b: s.rounds[room.round].opp, real };
  room.flip = Math.random() < 0.5;
  room.sides = makeSideBets(room.round);
  room.phase = 'betting';
  for (const p of room.players.values()) Object.assign(p, { bet: null, side: {}, fixPick: null, ready: false });
  setTimer(room, BET_MS, () => resolveRound(room));
  broadcast(room);
}

function genScore(room, winnerIsA) {
  const kind = SPORTS[room.sport].kind;
  if (kind === 'series') { const w = Number(room.season.rounds[room.round].score[0]); return `${w}-${rnd(w)}`; }
  const hi = room.sport === 'ncaab' ? 60 : 13;
  const w = hi + 6 + rnd(room.sport === 'ncaab' ? 25 : 22);
  const l = Math.max(room.sport === 'ncaab' ? 45 : 3, w - 1 - rnd(room.sport === 'ncaab' ? 18 : 14));
  return `${w}-${l}`;
}

function resolveRound(room) {
  if (room.phase !== 'betting') return;
  const s = room.season, r = s.rounds[room.round], { a, b, real } = room.entrants;
  const m = market(room);

  // fixes
  const fixers = alive(room).filter((p) => p.fixPick);
  const picks = new Set(fixers.map((p) => p.fixPick));
  const price = fixPrice(room);
  for (const p of fixers) { p.debt += price; p.mobTied = true; }
  let winner, fixed = false, contested = false;
  if (picks.size === 1) { winner = [...picks][0]; fixed = true; }
  else if (picks.size > 1) contested = true;
  if (!winner) winner = real ? s.champion : (Math.random() < 0.5 ? a : b);
  const historic = real && winner === s.champion && !fixed;
  const score = historic ? r.score : genScore(room, winner === a);
  if (fixed && winner !== s.champion) room.altered = true;
  if (!real) room.altered = true;

  const per = {};
  for (const p of room.players.values()) {
    let delta = 0, notes = [];
    if (p.bet) {
      const won = p.bet.team === winner;
      if (won) { const payout = p.bet.stake * m.find((t) => t.team === winner).dec; p.money += payout; delta += payout - p.bet.stake; notes.push(`Won ${money(payout - p.bet.stake)} on ${winner}`); }
      else { delta -= p.bet.stake; notes.push(`Lost ${money(p.bet.stake)} on ${p.bet.team}`); }
      if (room.round === s.rounds.length - 1) p.finalCorrect = won;
    } else if (room.round === s.rounds.length - 1) p.finalCorrect = false;
    // side bets
    for (const sb of room.sides) {
      const bet = p.side[sb.id]; if (!bet) continue;
      sb.winner = sb.winner || (Math.random() < sb.pa ? 'a' : 'b');
      if (bet.pick === sb.winner) { const pay = bet.stake * (bet.pick === 'a' ? sb.da : sb.db); p.money += pay; delta += pay - bet.stake; notes.push(`${sb.kind} bet hit +${money(pay - bet.stake)}`); }
      else { delta -= bet.stake; notes.push(`${sb.kind} bet lost -${money(bet.stake)}`); }
    }
    if (p.fixPick) notes.push(contested ? `The mob took ${money(price)} - and another crew fixed it the other way. Nothing happened.` : `The mob's fee: ${money(price)} added to your tab.`);
    per[p.id] = { delta: Math.round(delta), notes };
  }
  room.lastResult = { label: r.label, a, b, winner, score, per, fixed, contested, sideResults: room.sides.map((sb) => ({ kind: sb.kind, a: sb.a, b: sb.b, winner: sb.winner })) };
  feed(room, `${r.label}: ${winner} def. ${winner === a ? b : a}, ${score}.`);
  if (fixed) feed(room, `🕵️ Rumors swirl about the officiating in the ${r.label}...`);
  if (!real && !fixed) feed(room, `📖 History is no longer what it was.`);
  room.finalWinner = winner;
  room.phase = 'result';
  for (const p of room.players.values()) p.ready = false;
  setTimer(room, RESULT_MS, () => afterResult(room));
  broadcast(room);
}

function afterResult(room) {
  if (room.phase !== 'result') return;
  if (room.round < room.season.rounds.length - 1) return nextRound(room);
  settle(room);
}

function settle(room) {
  const finalWinner = room.lastResult.winner;
  let total = 0;
  for (const p of room.players.values()) {
    const won = p.finalCorrect === true;
    let owe = p.debt;
    if (p.mobTied && won) owe += Math.round(MOB_CUT * Math.max(0, p.money - START_MONEY));
    const pay = Math.min(p.money, owe);
    if (owe > 0) { p.money -= pay; feed(room, `💼 The mob collected ${money(pay)} from ${p.name}.`); }
    p.remaining = owe - pay; p.debt = p.remaining; total += p.remaining;
  }
  const hunted = alive(room).filter((p) => p.remaining > 0);
  if (!hunted.length) return finish(room);
  room.maxHp = room.hp = clamp(60 + total / 40, 60, 600);
  room.phase = 'hunt';
  feed(room, `🔫 The hitmen are here for ${hunted.map((p) => p.name).join(', ')}. Pay up, win it back, or beat them down first!`);
  for (const p of room.players.values()) p.ready = false;
  setTimer(room, HUNT_MS, () => endHunt(room));
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
  clearTimeout(room.timer);
  const s = room.season;
  for (const p of room.players.values()) if (!p.fate) p.fate = p.mobTied ? 'paid up' : 'safe';
  const ps = alive(room);
  const correct = ps.filter((p) => p.finalCorrect).length;
  room.summary = { year: s.year, league: s.league, champion: s.champion, finalWinner: room.finalWinner, altered: room.altered,
    crewWon: correct >= Math.ceil(ps.length / 2) && correct > 0, correct, total: ps.length,
    players: ps.map((p) => ({ name: p.name, finalCorrect: p.finalCorrect, fate: p.fate, money: Math.round(p.money) })) };
  room.phase = 'ended';
  room.deadline = 0;
  broadcast(room);
}

// ---------- message handling ----------
const inPlay = (room) => ['betting', 'result', 'hunt'].includes(room.phase);

function handle(room, p, m) {
  switch (m.type) {
    case 'setSport': if (room.hostId === p.id && room.phase === 'lobby' && SPORTS[m.sport]) { room.sport = m.sport; broadcast(room); } break;
    case 'start': if (room.hostId === p.id && room.phase === 'lobby') startGame(room); break;
    case 'rematch': if (room.hostId === p.id && room.phase === 'ended') {
      Object.assign(room, { phase: 'lobby', season: null, lastResult: null, round: -1, feed: [], altered: false, summary: null, deadline: 0 });
      for (const q of room.players.values()) Object.assign(q, { bet: null, side: {}, fixPick: null, ready: false });
      broadcast(room);
    } break;
    case 'bet': {
      if (room.phase !== 'betting') break;
      if (p.bet) { p.money += p.bet.stake; p.bet = null; }
      const stake = Math.floor(Number(m.stake));
      if (!m.team || !(stake >= 10) || stake > p.money) { toast(p, 'Invalid bet.', 'err'); broadcast(room); break; }
      if (![room.entrants.a, room.entrants.b].includes(m.team)) break;
      p.money -= stake; p.bet = { team: m.team, stake }; broadcast(room); break;
    }
    case 'clearBet': if (room.phase === 'betting' && p.bet && !p.ready) { p.money += p.bet.stake; p.bet = null; broadcast(room); } break;
    case 'side': {
      if (room.phase !== 'betting') break;
      const sb = room.sides.find((s) => s.id === m.id); if (!sb) break;
      if (p.side[sb.id]) { p.money += p.side[sb.id].stake; delete p.side[sb.id]; }
      const stake = Math.floor(Number(m.stake));
      if (stake >= 10 && stake <= p.money && ['a', 'b'].includes(m.pick)) { p.money -= stake; p.side[sb.id] = { pick: m.pick, stake }; }
      broadcast(room); break;
    }
    case 'loan':
      if (!inPlay(room) || room.phase === 'hunt' || p.loans >= MAX_LOANS) { toast(p, 'The mob is not lending right now.', 'err'); break; }
      p.loans++; p.money += LOAN; p.debt += LOAN_DEBT; p.mobTied = true;
      toast(p, `The mob lent you ${money(LOAN)}. You owe ${money(LOAN_DEBT)}.`, 'mob'); broadcast(room); break;
    case 'fix':
      if (room.phase !== 'betting' || p.ready) break;
      if (m.team === null) p.fixPick = null;
      else if ([room.entrants.a, room.entrants.b].includes(m.team)) p.fixPick = m.team;
      broadcast(room); break;
    case 'ready':
      if (room.phase !== 'betting' && room.phase !== 'result') break;
      p.ready = true;
      if (alive(room).every((q) => q.ready || !q.connected)) room.phase === 'betting' ? resolveRound(room) : afterResult(room);
      else broadcast(room);
      break;
    case 'mg': {
      const g = MG[m.game];
      if (!inPlay(room) || !g || Date.now() - p.lastMg < 5000) break;
      const pts = Math.floor(Number(m.pts));
      if (!(pts >= 0 && pts <= g.max)) break;
      p.lastMg = Date.now();
      const win = pts * g.rate; p.money += win; toast(p, `${m.game}: ${pts} pts = ${money(win)}`, win ? 'win' : 'info');
      broadcast(room); break;
    }
    case 'roulette': {
      if (!inPlay(room)) break;
      const stake = Math.floor(Number(m.stake));
      if (!(stake >= 10 && stake <= p.money) || !['red', 'black', 'green'].includes(m.pick)) { toast(p, 'Invalid wager.', 'err'); break; }
      const n = rnd(37);
      const color = n === 0 ? 'green' : n % 2 === 1 ? 'red' : 'black';
      p.money -= stake;
      if (color === m.pick) { const pay = stake * (color === 'green' ? 36 : 2); p.money += pay; toast(p, `${n} ${color}! You win ${money(pay - stake)}`, 'win'); }
      else toast(p, `${n} ${color}. You lose ${money(stake)}.`, 'err');
      broadcast(room); break;
    }
    case 'pay': {
      if (room.phase !== 'hunt' || p.remaining <= 0) break;
      const amt = Math.min(p.money, p.remaining, Math.floor(Number(m.amount) || p.remaining));
      if (amt > 0) { p.money -= amt; p.remaining -= amt; p.debt = p.remaining; if (p.remaining <= 0) { p.fate = 'paid up'; feed(room, `✅ ${p.name} paid off the mob.`); } }
      huntCheck(room); break;
    }
    case 'give': {
      const to = room.players.get(m.to); const amt = Math.floor(Number(m.amount));
      if (!to || to === p || !inPlay(room) || !(amt > 0 && amt <= p.money)) break;
      p.money -= amt; to.money += amt; toast(to, `${p.name} sent you ${money(amt)}`, 'win'); broadcast(room); break;
    }
    case 'attack':
      if (room.phase !== 'hunt' || Date.now() - p.lastHit < 90) break;
      p.lastHit = Date.now(); room.hp -= 1;
      if (room.hp <= 0) { room.hp = 0; feed(room, `👊 The crew beat the hitmen senseless!`); endHunt(room); }
      else broadcast(room);
      break;
  }
}

function huntCheck(room) {
  if (alive(room).every((q) => q.remaining <= 0)) { finish(room); } else broadcast(room);
}

// ---------- transport ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(__dirname, 'public', path.normalize(f).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data);
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
      let r = m.code ? rooms.get(String(m.code).toUpperCase()) : createRoom();
      if (!r) return send({ ws }, { type: 'error', text: 'Room not found.' });
      if (r.phase !== 'lobby') return ws.send(JSON.stringify({ type: 'error', text: 'Game already in progress.' }));
      if (r.players.size >= 6) return ws.send(JSON.stringify({ type: 'error', text: 'Room is full.' }));
      room = r;
      player = newPlayer(Math.random().toString(36).slice(2, 9), name, ws);
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
    if (![...room.players.values()].some((q) => q.connected)) { clearTimeout(room.timer); rooms.delete(room.code); return; }
    if (room.hostId === player.id) room.hostId = [...room.players.values()].find((q) => q.connected).id;
    if (room.phase === 'betting' || room.phase === 'result') {
      if (alive(room).every((q) => q.ready || !q.connected)) return room.phase === 'betting' ? resolveRound(room) : afterResult(room);
    }
    broadcast(room);
  });
});

server.listen(PORT, () => console.log(`Ball Knowledge running on http://localhost:${PORT}`));
