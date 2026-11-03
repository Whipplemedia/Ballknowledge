// The clue hunt. Every game hides a story the server writes from its (already decided) result, broken into pieces and scattered
// around town. No piece names a winner: they point at a player (name, number, "the guy everybody calls ..."), a coach, a team's
// colours or its hotel, and the decoder - who wears what, who coaches whom - is public (the case file's scouting sheet; hotels are
// only in the newspaper). Put the pieces together and you get to about 80%:
//   - the story favours the real winner 80% of the time (the other 20% it's a real story about a team that wins anyway: an upset)
//   - one BIG piece (a star hurt, sick, out till dawn, a team bus stuck overnight...) sits with one random source: find it and decode it
//     and you have the story's side. SMALL pieces (moods, superstitions, agents): two lean the story's way, one leans the other way
//   - the bartender's free word on the line is right 60% of the time, against the real winner - the casual player's edge
//   - red herrings: big claims about a player who isn't in this game (check the roster)
//   - liars: Sloppy Steve's "locks" always go against the story (a feature - do the opposite and you're at the story's 80%), plus one
//     random regular per night who lies (big claims about the story side's own players). An honest source lets slip who it is.
// Which source holds which piece is shuffled every game, so knowing the town helps but knowing last game's answer doesn't.
// Clues for a game can be found from the moment the game before it opens until its own betting closes.
const crypto = require('crypto');
const seeded = (s) => { let h = crypto.createHash('md5').update(String(s)).digest().readUInt32LE(0); return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// who can tell you things, where they are, and how they say it (q = the text, already a full sentence)
const lc = (t) => (/^(The|A|Some|Number|Their|Half)\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t); // "...: the guy who wears 23" but never "...: reggie Bishop"
const SOURCES = {
  bartender: { name: 'The bartender', icon: '🍸', where: 'bar', say: (q) => `"${q}"` },
  vinnie: { name: 'Old Vinnie', icon: '🍷', where: 'bar', say: (q) => `"Kid, listen. ${q}"` },
  gina: { name: 'Gina', icon: '💅', where: 'bar', say: (q) => `"Don't tell my boyfriend I told you, but ${lc(q)}"` },
  ray: { name: 'Celtics Ray', icon: '☘️', where: 'bar', say: (q) => `"You didn't hear it from me: ${lc(q)}"` },
  steve: { name: 'Sloppy Steve', icon: '🛋️', where: 'bar', say: (q) => q },
  stall: { name: 'The stall wall', icon: '🚽', where: 'bar', written: true, say: (q) => `Scrawled on the stall wall: "${q}"` },
  napkin: { name: 'A napkin', icon: '🧻', where: 'bar', written: true, say: (q) => `Written on a napkin: "${q}"` },
  clerk: { name: 'The gas-station clerk', icon: '⛽', where: 'out', say: (q) => `"Saw it with my own eyes: ${lc(q)}"` },
  dusty: { name: 'Dusty', icon: '🧥', where: 'out', say: (q) => `"Heh. Dusty sees everything. ${q}"` },
  dancer: { name: 'The dancer', icon: '💋', where: 'club', say: (q) => `"Babe. ${q}"` },
  athlete: { name: 'Primetime', icon: '🏈', where: 'club', say: (q) => `"Off the record? ${q}"` },
  bouncer: { name: 'The bouncer', icon: '🚪', where: 'club', say: (q) => `"I don't miss much at the door. ${q}"` },
  dj: { name: 'DJ Fumble', icon: '🎧', where: 'club', say: (q) => `"Funny thing from the booth last night: ${lc(q)}"` },
};
const LIAR_POOL = ['gina', 'ray', 'vinnie', 'clerk', 'bouncer', 'dj'];
const PAID = { vinnie: 100, bouncer: 20, dj: 20 }; // charged only when they have something new for you
const NAPKIN_SPOTS = 7; // public/bar.js: the four high-tops and three booth tables

const COLOR_NAMES = [['red', '#c8102e'], ['navy', '#0033a0'], ['green', '#00843d'], ['orange', '#ff6a13'], ['purple', '#5f259f'], ['gold', '#ffb81c'], ['teal', '#00a3ad'],
  ['black', '#1d1d1d'], ['maroon', '#862633'], ['powder blue', '#6cace4'], ['forest green', '#2c5234'], ['royal blue', '#1d428a'], ['silver', '#a5acaf'], ['yellow', '#fdb927'], ['crimson', '#a6192e'], ['white', '#f4f4f4']];
const colorName = (hex) => { const v = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16) || 0), c = v(hex); let best = COLOR_NAMES[0], bd = 1e9; for (const n of COLOR_NAMES) { const d = v(n[1]).reduce((s, x, i) => s + (x - c[i]) ** 2, 0); if (d < bd) { bd = d; best = n; } } return best[0]; };
const HOTELS = ['the Marlow Grand', 'the Harborview Inn', 'the Crown Regency', 'the Sleep Rite Motor Lodge', 'the Lakeshore Hilton', 'the Ambassador', 'the Copper Kettle Inn', 'the Bellport Arms',
  'the Riverside Suites', 'the Stonegate Plaza', 'the Royal Palms', 'the Union Station Hotel', 'the Ironwood Lodge', 'the Westbrook Towers', 'the Starlite Motel', 'the Kingsport Grand', 'the Blue Mesa Resort', 'the Cobalt Tower'];
const COACH_F = ['Hank', 'Gus', 'Walt', 'Bobby', 'Lou', 'Mitch', 'Dale', 'Earl', 'Ron', 'Sal', 'Frank', 'Ted', 'Vic', 'Marty', 'Bud', 'Chuck'];
const COACH_L = ['Rourke', 'Kessler', 'Dunleavy', 'Marchetti', 'Pruitt', 'Haskins', 'Bellamy', 'Corrigan', 'Stroud', 'Novak', 'Abernathy', 'Fitzgerald', 'McGraw', 'Delgado', 'Brenner', 'Whitlock'];

// ---------- what can be said about a team ----------
// person pointers: someone on the team; team pointers: the team as a group
const PERSON = [
  (s) => s.name, (s) => s.name, (s) => `the guy who wears ${s.num}`, (s) => `a big guy with ${s.num} tattooed on his neck`, (s) => (s.lastOk ? `some guy everybody kept calling "${s.last}"` : `the guy who wears ${s.num}`), (s) => `number ${s.num}`,
];
const TEAM = [
  (t) => (t.colorOk ? `a bunch of guys in ${t.colorName} warm-ups` : `the team staying at ${t.hotel}`), (t) => (t.colorOk ? `the guys in the ${t.colorName} jackets` : `the team staying at ${t.hotel}`), (t) => `the team staying at ${t.hotel}`, (t) => `the team staying at ${t.hotel}`,
  (t) => (t.coach ? `Coach ${t.coach.split(' ')[1]}'s guys` : `the ${t.colorName} crew`),
];
const BIG_NEG = { // about a star on the side the story is AGAINST
  hurt: [(p) => `${p} was icing his knee all night. Couldn't put any weight on it.`, (p) => `${p} came in on crutches and tried to hide them under the table.`, (p) => `${p} kept grabbing his hamstring every time he stood up.`, (p) => `${p} had his whole wrist taped and couldn't hold a glass.`],
  sick: [(p) => `${p} looked green. Ran to the bathroom four times in an hour.`, (p) => `${p} was sweating through his shirt with a fever and ordered hot tea.`],
  party: [(p) => `${p} was still doing shots at 4 a.m. Could barely stand.`, (p) => `${p} closed the place down and fell asleep in a booth.`, (p) => `${p} left with two bridesmaids at three in the morning.`],
};
const BIG_NEG_TEAM = { // the side the story is AGAINST, as a group
  party: [(t) => `${t} - their bus broke down on the interstate. They didn't get in until 5 a.m.`, (t) => `${t} were partying in the lobby till sunrise. Somebody pulled a fire alarm.`],
  else: [(t) => `${t} got into a screaming match in the parking lot. Two of them had to be pulled apart.`, (t) => `${t} - half of them came down with food poisoning after the team dinner.`],
};
const SMALL_POS = [ // leans toward the side it's about
  (p) => `${p} said the trainer cleared him. A hundred percent.`, (p) => `${p} ordered a club soda and was in bed by ten.`, (p) => `${p} was showing everybody a new play on a napkin. Looked real confident.`,
  (p) => `${p} was doing sprints in the parking lot at midnight. Looked like a machine.`,
];
const SMALL_POS_TEAM = [(t) => `${t} were loose and laughing, buying rounds for the whole room.`, (t) => `${t} - the coach tipped everybody a hundred bucks and said it's in the bag.`];
const SMALL_NEG = [ // leans away from the side it's about
  (p) => `${p} was arguing with his agent on the phone about his contract all night.`, (p) => `${p} lost his lucky chain and was looking for it under every table.`, (p) => `${p} kept going on about his divorce lawyer.`,
  (p) => `${p} said his ankle's "fine". He said it about six times.`,
];
const SMALL_NEG_TEAM = [(t) => `${t} were complaining about the hotel beds all night. Nobody slept.`, (t) => `${t} - their coach looked like he hadn't slept in a week.`];
const ANCHOR = [(n) => `Sharp money's been coming in on ${n} all afternoon. The line moved.`, (n) => `The books downtown are scared of ${n}. Couldn't tell you why.`, (n) => `My cousin works the ${n} hotel. Says the mood over there is real good.`, (n) => `Every regular in here who knows anything is on ${n} tonight.`];
const STEVE = [(n) => `"Lock of the night: ${n}. I'd bet my couch on it."`, (n) => `"${n}. Write it down. Mortgage the house."`, (n) => `"Trust me on this one. ${n}. Can't lose."`, (n) => `"Everybody's sleeping on ${n}. Not me. Not Steve."`];
const NOTHING = { // a source with nothing new on the games in play
  bartender: '"Nothing new since you asked. I\'ll keep my ears open."', vinnie: '"Nothing on this one yet, kid. Keep your money."', gina: '"I don\'t know anything about that, sweetie."',
  ray: '"Got nothing for you. Ask me again later."', steve: '"Steve\'s thinking. Come back later."', stall: 'Nothing new on the stall wall. Just phone numbers.', napkin: 'Just a napkin.',
  clerk: '"Quiet night. Nobody said nothing."', dusty: '"Dusty didn\'t see nothin\'."', dancer: '"Honey, I don\'t know a thing about that one."', athlete: '"Nah, I got nothing on that one, bro."',
  bouncer: '"Nothing worth twenty bucks. Keep it."', dj: '"Nothing from the booth tonight. Keep your money."',
};

function create() {
  // team decoder: numbers for every star, a coach (made-up leagues), a colour name, a hotel. Seeded per night.
  function teamMeta(room) {
    const s = room.season, rng = seeded(room.code + ':teams:' + room.t0), used = new Set(), hotels = HOTELS.slice().sort(() => rng() - 0.5), out = {};
    Object.entries(s.teams).forEach(([name, t], i) => {
      const stars = (t.stars || []).map(([who, line]) => { let n; do { n = 6 + Math.floor(rng() * 93); } while (used.has(n)); /* (no 4 or 5: "4 a.m." is in the clues) */ used.add(n); return { name: who, last: who.split(' ').slice(-1)[0], num: n, line }; });
      const coach = s.fake ? `${COACH_F[Math.floor(rng() * COACH_F.length)]} ${COACH_L[Math.floor(rng() * COACH_L.length)]}` : null;
      out[name] = { name, short: t.short, color: t.color, colorName: colorName(t.color), coach, hotel: hotels[i % hotels.length], stars };
    });
    const lasts = {}; for (const t of Object.values(out)) for (const x of t.stars) lasts[x.last] = (lasts[x.last] || 0) + 1;
    for (const t of Object.values(out)) for (const x of t.stars) x.lastOk = lasts[x.last] === 1; // a nickname only when nobody else in the league shares it
    return out;
  }
  const avail = (room) => Object.keys(SOURCES).filter((k) => { const w = SOURCES[k].where; return w === 'bar' || (w === 'out' && room.outside !== false) || (w === 'club' && room.n3 && room.n3.club); });

  // ---------- the night's case: every game's pieces ----------
  function build(room) {
    const s = room.season, meta = teamMeta(room), here = avail(room), rngN = seeded(room.code + ':liars:' + room.t0);
    const pool = LIAR_POOL.filter((k) => here.includes(k)), liar = pool[Math.floor(rngN() * pool.length)] || null;
    const gossip = here.filter((k) => !['bartender', 'steve', liar].includes(k)), weight = (k) => (SOURCES[k].where === 'club' ? 3 : SOURCES[k].where === 'out' ? 1.6 : 1);
    const allStars = Object.values(meta).flatMap((t) => t.stars.map((x) => ({ ...x, team: t.name })));
    const games = room.events.map((ev) => {
      const rng = seeded(room.code + ':clue:' + ev.idx + ':' + room.t0), P = (a) => a[Math.floor(rng() * a.length)];
      const nat = ev.sa > ev.sb ? 'a' : 'b', S = rng() < 0.8 ? nat : nat === 'a' ? 'b' : 'a', W = S === 'a' ? 'b' : 'a';
      const colorOk = meta[ev.a].colorName !== meta[ev.b].colorName, team = (side) => ({ ...meta[ev[side]], colorOk }), person = (side) => { const t = team(side), st = t.stars.length ? P(t.stars) : null; return st ? P(PERSON)(st) : P(TEAM)(t); };
      const teamP = (side) => P(TEAM)(team(side));
      const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1), pieces = [];
      const add = (src, kind, text, cat, extra = {}) => pieces.push({ id: `${ev.idx}:${pieces.length}`, idx: ev.idx, src, kind, text: cap(text), cat, ...extra });
      // the big piece (one source), against W
      const bigCat = P(['hurt', 'hurt', 'sick', 'party', 'party', 'team']);
      const big = bigCat === 'team' ? (() => { const c = P(['party', 'else']); return { text: P(BIG_NEG_TEAM[c])(teamP(W)), cat: c === 'party' ? 'who' : 'else' }; })() : { text: P(BIG_NEG[bigCat])(person(W)), cat: bigCat === 'party' ? 'who' : 'hurt' };
      // small pieces: two lean S, one leans W
      const small = (side) => (rng() < 0.5 ? (rng() < 0.7 ? P(SMALL_POS)(person(side)) : P(SMALL_POS_TEAM)(teamP(side))) : (rng() < 0.7 ? P(SMALL_NEG)(person(side === 'a' ? 'b' : 'a')) : P(SMALL_NEG_TEAM)(teamP(side === 'a' ? 'b' : 'a'))));
      const smalls = [small(S), small(S), small(W)];
      // where they go: shuffled across tonight's sources, club and street weighted up (the club is the best place to be)
      const bag = []; for (const k of gossip) for (let i = 0; i < Math.round(weight(k) * 2); i++) bag.push(k);
      const draw = (avoid) => { const opts = bag.filter((k) => !avoid.includes(k)); return opts.length ? opts[Math.floor(rng() * opts.length)] : P(gossip); };
      const usedSrc = [];
      const bs = draw([]); usedSrc.push(bs); add(bs, 'big', big.text, big.cat);
      for (const t of smalls) { const k = draw(usedSrc); usedSrc.push(k); add(k, 'small', t, P(['who', 'else', 'hurt'])); }
      // the bartender's word on the line: the real winner 60% of the time
      add('bartender', 'anchor', P(ANCHOR)(ev[rng() < 0.6 ? nat : nat === 'a' ? 'b' : 'a']), 'else');
      // a red herring: a big claim about somebody who isn't in this game
      const here = new Set([...meta[ev.a].stars, ...meta[ev.b].stars].map((x) => x.last)), others = allStars.filter((x) => x.team !== ev.a && x.team !== ev.b && !here.has(x.last));
      if (others.length && rng() < 0.45) { const o = P(others), cat = P(['hurt', 'party']); add(draw([]), 'herring', P(BIG_NEG[cat])(P(PERSON)(o)), cat === 'party' ? 'who' : 'hurt'); }
      // Steve's lock: against the story
      if (rng() < 0.65) add('steve', 'steve', P(STEVE)(ev[W]), 'else');
      // tonight's liar: a big claim against the story's own side
      if (liar && rng() < 0.6) add(liar, 'lie', P(BIG_NEG[P(['hurt', 'sick', 'party'])])(person(S)), 'hurt');
      return { idx: ev.idx, S, pieces };
    });
    // the tell: an honest source lets slip who tonight's liar is (on the second game)
    if (liar && games[1]) { const who = SOURCES[liar].name.replace(/^The /, 'the '); games[1].pieces.push({ id: '1:tell', idx: 1, src: 'bartender', kind: 'tell', text: `Between you and me? I wouldn't trust a word ${who} says tonight. Been wrong about everything.`, cat: 'else' }); }
    room.clue = { meta, games, liar, napkinsTaken: {} };
  }
  // the games whose clues are out there right now: the open one and the next one
  function inPlay(room) {
    const ev = room.events || [], open = ev.find((e) => e.status === 'open'), next = ev.filter((e) => e.status === 'upcoming').sort((a, b) => a.idx - b.idx)[0];
    return [open, next].filter(Boolean).map((e) => e.idx);
  }
  function piecesFor(room, src, extra) { const C = room.clue; if (!C) return []; const live = inPlay(room); return C.games.filter((g) => live.includes(g.idx)).flatMap((g) => g.pieces).filter((x) => x.src === src && (!extra || extra(x))); }
  // what a source tells this player now (new pieces only). Napkins are physical: whoever picks one up has it.
  function reveal(room, p, src, opts = {}) {
    const C = room.clue; if (!C || !SOURCES[src]) return []; p.clues = p.clues || [];
    const have = new Set(p.clues.map((c) => c.id));
    let list = piecesFor(room, src, (x) => !have.has(x.id) && !(src === 'napkin' && (C.napkinsTaken[x.id] || (opts.spot !== undefined && napkinSpot(room, x) !== opts.spot))));
    if (opts.q && list.length > 1) list = [...list.filter((x) => x.cat === opts.q), ...list.filter((x) => x.cat !== opts.q)].slice(0, 1); // a question gets the matching piece first
    if (opts.peek) return list;
    for (const x of list) { if (src === 'napkin') C.napkinsTaken[x.id] = p.id; p.clues.push({ id: x.id, idx: x.idx, src, icon: SOURCES[src].icon, who: SOURCES[src].name, text: SOURCES[src].say(x.text), at: Date.now() }); }
    return list;
  }
  const napkinSpot = (room, x) => { const r = seeded(room.code + ':napkin:' + x.id); return Math.floor(r() * NAPKIN_SPOTS); };
  // for the state: my case file, the decoder for the games in it (and the ones in play), where the napkins are lying
  function view(room, p) {
    const C = room.clue; if (!C) return null; const live = inPlay(room), mine = p.clues || [], idxs = [...new Set([...live, ...mine.map((c) => c.idx)])];
    const games = idxs.sort((a, b) => a - b).map((i) => { const ev = room.events[i]; return { idx: i, label: ev.label, a: ev.a, b: ev.b, status: ev.status, live: live.includes(i) }; });
    const teams = {}; for (const g of games) for (const n of [g.a, g.b]) { const t = C.meta[n]; teams[n] = { short: t.short, color: t.color, colorName: t.colorName, coach: t.coach, stars: t.stars.map((x) => ({ name: x.name, num: x.num, line: x.line })) }; }
    const napkins = [...new Set(piecesFor(room, 'napkin', (x) => !C.napkinsTaken[x.id]).map((x) => napkinSpot(room, x)))];
    return { mine: mine.map(({ id, idx, icon, who, text }) => ({ id, idx, icon, who, text })), games, teams, napkins };
  }
  const hotels = (room) => (room.clue ? Object.values(room.clue.meta).map((t) => ({ team: t.name, hotel: t.hotel })) : []);
  return { build, reveal, view, hotels, SOURCES, PAID, NOTHING, inPlay };
}
module.exports = { createClues: create, NAPKIN_SPOTS };
