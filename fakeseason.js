// Made-up seasons: a fictional league, teams, players and a full playoff run, generated fresh every night.
// The output has the same shape as a real season in seasons.js. Every result is rolled from the same win
// probability the sportsbook prices (odds.js), so upsets happen at their true rate and nothing can be remembered.
const { winProb } = require('./odds');

const CITIES = ['Harbor City', 'Port Ellis', 'Cedar Falls', 'New Avalon', 'Kingsport', 'Redwater', 'Iron Valley', 'Silver Lake', 'Fort Calder',
  'Bay Ridge', 'Granite Peak', 'Marlow', 'Lakeshore', 'Ashford', 'Copper Hill', 'Westbrook', 'Riverton', 'Stonegate', 'Pine Bluff', 'Eastport',
  'Hollow Creek', 'Sunset Bay', 'Northfield', 'Crescent City', 'Ironwood', 'Blue Mesa', 'Old Harbor', 'Summit', 'Cobalt City', 'Twin Rivers',
  'Dunmore', 'Saltmarsh', 'Highland', 'Bellport', 'Ravenna', 'Clearwater Bay', 'Oakhurst', 'Glenview', 'Kestrel Point', 'Brightwater'];
const NICKS = ['Comets', 'Foxes', 'Barons', 'Owls', 'Marauders', 'Gulls', 'Pilots', 'Rattlers', 'Blizzard', 'Monarchs', 'Stingers', 'Lumberjacks',
  'Thunder Hawks', 'Badgers', 'Mariners', 'Coyotes', 'Ironmen', 'Kodiaks', 'Hornets', 'Mustangs', 'Phantoms', 'Rockets', 'Sentinels', 'Vipers',
  'Wolves', 'Herons', 'Bulldogs', 'Outlaws', 'Admirals', 'Grizzlies', 'Firebirds', 'Bison', 'Copperheads', 'Knights', 'Stallions', 'Tritons'];
const FIRST = ['Marcus', 'Dante', 'Tyrell', 'Jalen', 'Cole', 'Brody', 'Andre', 'Malik', 'Wes', 'Luca', 'Ezra', 'Trey', 'Desmond', 'Rocco', 'Nico',
  'Damian', 'Kofi', 'Mateo', 'Dmitri', 'Reggie', 'Caleb', 'Javon', 'Theo', 'Isaiah', 'Viktor', 'Owen', 'Darnell', 'Sami', 'Hank', 'Bo'];
const LAST = ['Okafor', 'Brennan', 'Vance', 'Castellano', 'Pruitt', 'Mbeki', 'Larkin', 'Holloway', 'Szabo', 'Whitfield', 'Ruiz', 'Draper',
  'Kowalski', 'Ashby', 'Fontaine', 'Greer', 'Lindqvist', 'Mayfield', 'Okonkwo', 'Petrov', 'Quintero', 'Rourke', 'Sallis', 'Toussaint', 'Ueda',
  'Varga', 'Wexler', 'Yates', 'Zamora', 'Bishop'];
const COLORS = ['#c8102e', '#0033a0', '#00843d', '#ff6a13', '#5f259f', '#ffb81c', '#00a3ad', '#1d1d1d', '#a6192e', '#003b5c', '#6cace4',
  '#e4002b', '#007a33', '#862633', '#f4aa00', '#2c5234', '#d50032', '#4b2e83'];

const LEAGUE = {
  nfl: { league: 'American Gridiron Association', final: 'The Gridiron Cup', conf: ['North', 'South'] },
  cfb: { league: 'College Football Invitational', final: 'National Championship', bowls: ['Orchard Bowl', 'Lighthouse Bowl', 'Prairie Bowl', 'Sun Valley Bowl'] },
  nba: { league: 'Continental Basketball Union', series: 'Conference Finals', final: 'Union Finals' },
  ncaab: { league: 'Collegiate Hoops Classic', final: 'National Championship' },
  nhl: { league: 'Northern Hockey Federation', series: 'Conference Final', final: 'Federation Cup Final' },
  mlb: { league: 'Grand Baseball League', series: 'League Championship', final: 'Grand Series' },
};
// regular-season length per sport (college = games before the postseason)
const GAMES = { nfl: 17, cfb: 12, nba: 82, ncaab: 33, nhl: 82, mlb: 162 };
// how far records spread from .500 (baseball's best teams win ~65%, football's go 14-3)
const SPREAD = { nfl: 1, cfb: 1.1, nba: 0.9, ncaab: 1, nhl: 0.6, mlb: 0.45 };

function makeFakeSeason(sportId, sport, rng) {
  const r = (n) => Math.floor(rng() * n), pick = (a) => a[r(a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = r(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const poisson = (l) => { let k = 0, p = 1; const L = Math.exp(-l); for (;;) { p *= rng(); if (p <= L) return k; k++; } };
  const gauss = () => { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
  const L = LEAGUE[sportId], college = sportId === 'cfb' || sportId === 'ncaab';
  const cities = shuffle(CITIES), nicks = shuffle(NICKS), colors = shuffle(COLORS), usedShort = new Set();
  const person = () => `${pick(FIRST)} ${pick(LAST)}`;
  const ou = Math.round((sport.ou + (rng() - 0.5) * (sport.kind === 'basketball' ? 16 : sport.kind === 'football' ? 8 : 1.4)) * 2) / 2;

  // ---------- teams ----------
  const teams = {};
  function team(rating) { /* rating ~ 0.35..0.85 = true strength as a win share */
    const i = Object.keys(teams).length, city = cities[i % cities.length], nick = nicks[i % nicks.length];
    const name = college ? `${city} ${pick(['State ', 'Tech ', ''])}${nick}` : `${city} ${nick}`;
    const words = city.split(' '); let short = words.length > 1 ? (words.map((w) => w[0]).join('') + nick[0]).slice(0, 3) : city.slice(0, 3).toUpperCase();
    while (usedShort.has(short)) short = short.slice(0, 2) + String.fromCharCode(65 + r(26)); usedShort.add(short);
    const g = GAMES[sportId], share = Math.max(0.3, Math.min(0.92, 0.5 + (rating - 0.5 + gauss() * 0.04) * SPREAD[sportId]));
    let rec;
    if (sportId === 'nhl') { const w = Math.round(g * share * 0.88), otl = 4 + r(9); rec = `${w}-${Math.max(0, g - w - otl)}-${otl}`; }
    else { const w = Math.round(g * share); rec = `${w}-${g - w}`; }
    teams[name] = { short, color: colors[i % colors.length], rec, stars: stars(), note: note(rating) };
    return name;
  }
  function stars() {
    const n = 1 + r(2), out = [];
    for (let k = 0; k < n; k++) {
      const who = person();
      if (sport.kind === 'football') out.push([who, pick([`${(3000 + r(1700)).toLocaleString('en-US')} yds · ${22 + r(22)} TD`, `${(900 + r(800)).toLocaleString('en-US')} rush yds · ${8 + r(12)} TD`, `${70 + r(50)} rec · ${(900 + r(700)).toLocaleString('en-US')} yds`, `${9 + r(10)} sacks`])]);
      else if (sport.kind === 'basketball') out.push([who, college ? `${(14 + rng() * 9).toFixed(1)} PPG` : pick([`${(20 + rng() * 12).toFixed(1)} PPG`, `${(15 + rng() * 8).toFixed(1)} PPG · ${(8 + rng() * 5).toFixed(1)} RPG`, `${(16 + rng() * 8).toFixed(1)} PPG · ${(7 + rng() * 4).toFixed(1)} APG`])]);
      else if (sport.kind === 'hockey') out.push([who, pick([`${28 + r(25)} goals`, `${70 + r(40)} pts`, `.9${12 + r(16)} SV%`])]);
      else out.push([who, pick([`.${280 + r(60)} · ${22 + r(25)} HR`, `${14 + r(8)}-${4 + r(8)} · ${(2.2 + rng() * 1.6).toFixed(2)} ERA`, `${30 + r(20)} HR · ${95 + r(40)} RBI`])]);
    }
    return out;
  }
  function note(rating) {
    if (rng() < 0.45) return '';
    return rating > 0.68 ? pick(['Ran away with the regular season.', 'Best point differential in the league.', 'Lost only once after New Year\'s.'])
      : rating < 0.5 ? pick(['Snuck into the postseason on the final day.', 'Nobody picked them to get this far.', 'Lost their starter in the second half.'])
        : pick(['Won 9 straight to close the year.', 'Youngest roster in the league.', 'Coach is on the hot seat.', 'Healthy for the first time all season.']);
  }
  const strength = () => 0.48 + rng() * 0.32; // playoff teams: no 4-13 doormats
  const rec = (n) => teams[n].rec;

  // ---------- one game: winner rolled from the posted odds, score shaped by the sport ----------
  function game(label, a, b, o = {}) {
    const home = !o.n, p = winProb(sport, rec(a), rec(b), home), aWins = rng() < p;
    let w, l, ot = false, ex = 0;
    if (sport.kind === 'football') {
      const per = ou / 2, td = (per - 1.6 * 3) / 7, pts = () => 7 * poisson(Math.max(0.8, td)) + 3 * poisson(1.6);
      let x = pts(), y = pts();
      if (x === y) { ot = true; x += rng() < 0.6 ? 3 : 6; }
      [w, l] = x > y ? [x, y] : [y, x];
    } else if (sport.kind === 'basketball') {
      const sd = college ? 9 : 11, pts = () => Math.max(college ? 45 : 80, Math.round(ou / 2 + gauss() * sd));
      let x = pts(), y = pts();
      if (x === y) { ot = true; const add = 6 + r(8); x += add + 1 + r(7); y += add; }
      [w, l] = x > y ? [x, y] : [y, x];
    } else if (sport.kind === 'hockey') {
      let x = poisson(ou / 2), y = poisson(ou / 2);
      if (x === y) { ot = true; x += 1; }
      [w, l] = x > y ? [x, y] : [y, x];
    } else {
      const runs = () => poisson(Math.max(0.5, ou / 2 + gauss() * 1.6));
      let x = runs(), y = runs();
      if (x === y) { ex = 10 + Math.min(4, poisson(0.8)); x += 1; }
      [w, l] = x > y ? [x, y] : [y, x];
    }
    const e = { label, a, b, sa: aWins ? w : l, sb: aWins ? l : w, ...o };
    if (ot) e.ot = true; if (ex) e.ex = ex;
    return e;
  }
  const winner = (e) => (e.sa > e.sb ? e.a : e.b), loser = (e) => (e.sa > e.sb ? e.b : e.a);
  const better = (x, y) => (winProb(sport, rec(x), rec(y), false) >= 0.5 ? [x, y] : [y, x]);

  // best of 7; `homeGames` = the games the higher seed hosts
  function series(label, x, y, key, homeGames) {
    const [hi, lo] = better(x, y), out = [], wins = { [hi]: 0, [lo]: 0 };
    for (let g = 1; wins[hi] < 4 && wins[lo] < 4; g++) {
      const atHi = homeGames.includes(g), e = game(`${label} · Game ${g}`, atHi ? hi : lo, atHi ? lo : hi, { series: key });
      wins[winner(e)]++; out.push(e);
    }
    return out;
  }

  let events = [];
  if (sportId === 'nfl') {
    const conf = L.conf.map(() => Array.from({ length: 6 }, strength).sort((p, q) => q - p).map((s) => team(s)));
    const wc = [], div = [], cc = [];
    for (const c of conf) wc.push(game('Wild Card', c[2], c[5]), game('Wild Card', c[3], c[4]));
    conf.forEach((c, ci) => {
      const alive = [wc[ci * 2], wc[ci * 2 + 1]].map(winner).sort((p, q) => c.indexOf(p) - c.indexOf(q));
      div.push(game('Divisional', c[0], alive[1]), game('Divisional', c[1], alive[0]));
    });
    conf.forEach((c, ci) => {
      const [x, y] = [winner(div[ci * 2]), winner(div[ci * 2 + 1])].sort((p, q) => c.indexOf(p) - c.indexOf(q));
      cc.push(game(`${L.conf[ci]} Championship`, x, y));
    });
    events = [...wc, ...div, ...cc, game(L.final, winner(cc[0]), winner(cc[1]), { n: true, final: true })];
  } else if (sportId === 'cfb') {
    const confs = shuffle(['Atlantic', 'Pacific', 'Midlands', 'Southern', 'Great Plains']);
    const champ = confs.map((c) => { const x = team(strength() + 0.08), y = team(strength()); return game(`${c} Championship`, x, y, { n: true }); });
    const power = (n) => winProb(sport, rec(n), '6-6', false) + (champ.some((e) => winner(e) === n) ? 0.12 : 0) + rng() * 0.05;
    const ranked = champ.map(winner).sort((p, q) => power(q) - power(p)), losers = champ.map(loser).sort((p, q) => power(q) - power(p));
    const [b1, b2, s1, s2] = shuffle(L.bowls);
    const bowls = [game(b1, ranked[4], losers[0], { n: true }), game(b2, losers[1], losers[2], { n: true })];
    const semis = [game(`Playoff Semifinal (${s1})`, ranked[0], ranked[3], { n: true }), game(`Playoff Semifinal (${s2})`, ranked[1], ranked[2], { n: true })];
    events = [...champ, ...bowls, ...semis, game(L.final, winner(semis[0]), winner(semis[1]), { n: true, final: true })];
  } else if (sportId === 'ncaab') {
    const regions = ['East', 'West', 'South', 'Midwest'], e8 = [], s16 = [];
    for (const reg of regions) {
      const seeds = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).slice(0, 4).sort((p, q) => p - q);
      const sq = seeds.map((sd) => { const n = team(0.86 - sd * 0.025 + gauss() * 0.03); teams[n].note = `#${sd} seed, ${reg}.`; return n; });
      const g1 = game('Sweet 16', sq[0], sq[3], { n: true }), g2 = game('Sweet 16', sq[1], sq[2], { n: true });
      s16.push(g1, g2); e8.push(game('Elite Eight', winner(g1), winner(g2), { n: true }));
    }
    const shown = new Set(shuffle(s16).slice(0, 3));
    for (const [n] of Object.entries(teams)) if (!e8.some((e) => e.a === n || e.b === n) && ![...shown].some((e) => e.a === n || e.b === n)) delete teams[n];
    const ff = [game('Final Four', winner(e8[0]), winner(e8[1]), { n: true }), game('Final Four', winner(e8[2]), winner(e8[3]), { n: true })];
    events = [...s16.filter((e) => shown.has(e)), ...e8, ...ff, game(L.final, winner(ff[0]), winner(ff[1]), { n: true, final: true })];
  } else { /* nba / nhl / mlb: the end of one conference final, then the championship series */
    const homeGames = sportId === 'mlb' ? [1, 2, 6, 7] : [1, 2, 5, 7];
    const x = team(strength() + 0.06), y = team(strength()), z = team(strength() + 0.06);
    const cf = series(L.series, x, y, 'CF', homeGames), fin = series(L.final, winner(cf[cf.length - 1]), z, 'F', homeGames);
    fin[fin.length - 1].final = true;
    const start = Math.max(0, cf.length - (11 - fin.length)), shownCf = cf.slice(start);
    if (start) { const pre = { [x]: 0, [y]: 0 }; for (const e of cf.slice(0, start)) pre[winner(e)]++; shownCf[0].pre = pre; }
    events = [...shownCf, ...fin];
  }

  const final = events[events.length - 1], champion = winner(final);
  return {
    fake: true, year: '', league: L.league, champion, ou, events, teams,
    blurb: pick([`A season that never happened. ${champion} won it anyway.`, `Nobody will ever remember this one. ${champion} will.`, `Made up from scratch - and ${teams[champion].short} took the title.`]),
  };
}

module.exports = { makeFakeSeason };
