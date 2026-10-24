const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $$ = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const amer = (d) => (d >= 2 ? '+' + Math.round((d - 1) * 100) : String(-Math.round(100 / (d - 1))));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let ws, S = null, err = '', skew = 0, stateAt = 0;
const ui = { tab: 'book', open: false, sel: null, stake: 100, giveTo: '', giveAmt: 100, rStake: 100, rPick: 'red', rNum: '', intelTab: 'stats' };
const now = () => Date.now() + skew;

function connect(msg) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => ws.send(JSON.stringify(msg));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'state') { S = m; skew = m.now - Date.now(); stateAt = Date.now(); err = ''; render(); }
    else if (m.type === 'toast') toast(m.text, m.kind);
    else if (m.type === 'pos') window.BK.onPos && window.BK.onPos(m);
    else if (m.type === 'spin') window.BK.onSpin && window.BK.onSpin(m);
    else if (m.type === 'error') { err = m.text; ws.close(); S = null; render(); }
  };
  ws.onclose = () => { if (S) { S = null; err = 'Disconnected.'; render(); } };
}
const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));
function toast(text, kind = 'info') {
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text;
  $('#toasts').appendChild(d); setTimeout(() => d.remove(), 5000);
}

// ---------- panels / pointer lock ----------
function openPanel(tab) { window.BK.leaveGames && window.BK.leaveGames(); ui.open = true; if (tab) ui.tab = tab; document.exitPointerLock && document.exitPointerLock(); render(); }
function closePanel() { ui.open = false; render(); try { document.getElementById('world').requestPointerLock(); } catch {} }
window.BK = { get S() { return S; }, ui, send, openPanel, closePanel, now, get drunk() { return drunkLevel(); } };
addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.open) closePanel(); });
function drunkLevel() { if (!S) return 0; return Math.max(0, S.me.drunk - (Date.now() - stateAt) / (S.me.decay || 6000)); }

// ---------- render ----------
let lastPhase = null;
function render() {
  if (S && S.phase !== lastPhase) {
    if (S.phase !== 'play') ui.open = false;
    if (S.phase === 'play') ui.tab = 'book';
    lastPhase = S.phase;
  }
  if (S && S.cur && ui.sel && ui.selIdx !== S.cur.idx) ui.sel = null;
  document.body.classList.toggle('ingame', !!S && ['play', 'hunt'].includes(S.phase));
  const a = document.activeElement, keep = a && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  const app = $('#app');
  if (!S) app.innerHTML = joinView();
  else if (S.phase === 'lobby') app.innerHTML = lobbyView();
  else if (S.phase === 'ended') app.innerHTML = endView();
  else app.innerHTML = gameView();
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch {} } }
  tick();
  window.BK.onRender && window.BK.onRender();
}

function joinView() {
  return `<div class="center"><div class="card col" style="width:min(420px,100%)">
    <div class="logo">BALL <span>KNOWLEDGE</span></div>
    <div class="tag">Pick a sport. We pick the season. Know your ball - or find another way to win.</div>
    ${err ? `<div class="bad">${esc(err)}</div>` : ''}
    <input id="name" placeholder="Your name" maxlength="16">
    <button onclick="doJoin()">Create a crew</button>
    <div class="row"><input id="code" placeholder="Room code" maxlength="4" style="text-transform:uppercase"><button class="ghost fit" onclick="doJoin(true)">Join</button></div>
  </div></div>`;
}
function doJoin(withCode) {
  const name = $('#name').value, code = withCode ? $('#code').value : undefined;
  if (withCode && !code) return;
  connect({ type: 'join', name, code });
}

const playerList = () => S.players.map((p) => `<div class="pl"><span>${esc(p.name)}${p.id === S.you ? ' (you)' : ''}${!p.connected ? ' 📴' : ''}${p.drunk >= 15 ? ' 🍺' : ''}</span>
  <span>${S.phase === 'lobby' ? '' : `<span class="ok">${$$(p.money)}</span>${p.hunted ? ' 🎯' : ''}`}</span></div>`).join('');

function lobbyView() {
  return `<div class="wrap"><div class="card col">
    <div class="top"><div class="logo" style="text-align:left;font-size:30px">BALL <span>KNOWLEDGE</span></div><div class="pill">Room <b>${S.code}</b></div></div>
    <div class="muted">Share the room code. Up to 6 players, co-op. Everyone starts with $2,000. A full season of <b>10 real games</b> is waiting - one new game opens for betting every couple of minutes.</div>
    <div class="title">Crew</div>${playerList()}
    <div class="title">${S.host ? 'Choose your sport' : 'The host is choosing a sport...'}</div>
    <div class="sports">${S.sports.map((s) => `<button class="sport ${S.sport === s.id ? 'sel' : ''}" ${S.host ? '' : 'disabled'} onclick="send({type:'setSport',sport:'${s.id}'})"><span class="e">${s.emoji}</span>${esc(s.label)}</button>`).join('')}</div>
    <div class="title">Pace</div>
    <div class="row">${S.paces.map((p) => `<button class="sport ${S.pace === p.id ? 'sel' : ''}" ${S.host ? '' : 'disabled'} onclick="send({type:'setPace',pace:'${p.id}'})">${esc(p.label)}</button>`).join('')}</div>
    ${S.host ? `<button onclick="send({type:'start'})">Start - assign a mystery season</button>` : ''}
  </div></div>`;
}

// ---------- timers ----------
function phaseInfo() {
  const t = now(), ev = S.events;
  const open = ev.find((e) => e.status === 'open');
  if (open) return { text: `GAME ${open.idx + 1}/${ev.length} · BETS CLOSE IN`, ms: open.closeAt - t, urgent: open.closeAt - t < 20000 };
  const up = ev.find((e) => e.status === 'upcoming');
  if (up) return { text: 'NEXT GAME OPENS IN', ms: up.openAt - t };
  const air = ev.filter((e) => e.status === 'airing');
  if (air.length) return { text: 'LAST GAME ON TV · FINAL IN', ms: Math.max(...air.map((e) => e.resolveAt)) - t };
  return { text: '', ms: 0 };
}
function tick() {
  if (!S) return;
  const el = $('#timer'); if (el && S.events) { const p = phaseInfo(); el.innerHTML = `${p.text} <b>${mmss(p.ms)}</b>`; el.classList.toggle('urgent', !!p.urgent); }
  const t2 = $('#tl2'); if (t2 && S.cur) { const e = S.events[S.cur.idx]; t2.textContent = mmss(e.closeAt - now()); t2.classList.toggle('urgent', e.closeAt - now() < 20000); const bar = $('#tlbar'); if (bar) bar.style.width = Math.max(0, Math.min(100, (e.closeAt - now()) / (e.closeAt - e.openAt) * 100)) + '%'; }
  const h = $('#huntt'); if (h && S.hunt) h.textContent = mmss(S.hunt.until - now());
  const dm = $('#drunkfill'); if (dm) dm.style.width = Math.round(drunkLevel()) + '%';
}
setInterval(() => S && tick(), 250);

// ---------- game HUD ----------
function resultOf(e) { const r = S.me.results[e.idx]; return r ? r.delta : null; }
function strip() {
  return S.events.map((e) => {
    const r = resultOf(e), c = e.status === 'final' ? (r === null || r === 0 ? 'fin' : r > 0 ? 'win' : 'loss') : e.status;
    const icon = e.status === 'final' ? (r > 0 ? '✓' : r < 0 ? '✗' : '·') : e.status === 'airing' ? '📺' : e.status === 'open' ? '●' : '';
    return `<span class="chip ${c} ${e.final ? 'champ' : ''}" title="${esc(e.label)}">${e.idx + 1}${icon}</span>`;
  }).join('');
}
function goalText() {
  const me = S.me;
  if (S.phase === 'hunt') return me.remaining > 0 ? `🎯 The mob wants ${$$(me.remaining)} from YOU - pay, win cash, or ambush them!` : '🎯 Help your crew - click the hitmen!';
  const cur = S.cur;
  if (cur) {
    const mine = me.bets[cur.idx] || {}, ev = S.events[cur.idx];
    if (!mine.ml) return ev.final ? '🏆 CHAMPIONSHIP GAME - you need a MONEYLINE bet on the winner to win the game. Hit the terminal!' : '📍 A game is open - walk to the SPORTSBOOK terminal under the TVs and place your bet';
    return '✅ Bet in. Watch the highlights on the big TV, hit the bar for a drink, or win some cash at the arcade.';
  }
  return S.events.some((e) => e.status === 'airing') ? '📺 All bets are in. Watch the highlights on the TV...' : '⏳ Waiting for the next game to open';
}
function gameView() {
  const me = S.me, hunt = S.phase === 'hunt';
  const extra = ui.tab === 'bar' ? [['bar', '🍺 Bar']] : ui.tab === 'wheel' ? [['wheel', '🎰 Roulette']] : [];
  const tabs = [['book', '📱 Sportsbook'], ['bets', '🧾 My Bets'], ['mob', '🕴️ The Mob'], ['crew', '👥 Crew'], ...extra];
  const body = { book: bookView, bets: betsView, mob: mobView, crew: crewView, bar: barView, wheel: wheelView }[ui.tab]();
  return `<div class="hud">
    <div class="hud-top">
      <div class="row" style="gap:8px;justify-content:flex-start"><span class="pill">Room ${S.code}</span></div>
      <div class="strip">${strip()}</div>
      <div class="row" style="gap:8px;justify-content:flex-end"><span class="pill money">${$$(me.money)}</span>${me.mobTied ? `<span class="pill debt">Owe ${$$(me.debt)}</span>` : ''}
      <span class="pill drunkp" title="Drunk confidence">🍺<span class="dm"><span id="drunkfill" style="width:${me.drunk}%"></span></span></span></div>
    </div>
    <div class="hud-clock"><span class="pill time" id="timer"></span></div>
    <div class="hud-goal">${goalText()}</div>
    ${hunt ? huntBanner() : ''}
    <div class="hud-crew">${playerList()}</div>
    <div class="hud-feed">${[...S.feed].slice(-4).reverse().map((f) => `<div>${esc(f.text)}</div>`).join('')}</div>
    <div class="hud-help">WASD move · Mouse look · E interact · C crew/wire · Esc menu</div>
  </div>
  ${ui.open ? `<div class="overlay"><div class="panel">
    <div class="tabs">${tabs.map(([id, l]) => `<button class="${id === 'mob' ? 'mob ' : ''}${ui.tab === id ? 'on' : ''}" onclick="ui.tab='${id}';render()">${l}</button>`).join('')}
    <button class="ghost" style="flex:0 0 auto" onclick="closePanel()">✕</button></div>${body}</div></div>` : ''}`;
}
function huntBanner() {
  const me = S.me, pct = Math.max(0, (S.hunt.hp / S.hunt.maxHp) * 100);
  return `<div class="card hunt col" style="margin-bottom:12px">
    <div class="big">🔫 The hitmen have arrived <span class="pill time" id="huntt"></span></div>
    <div class="muted">${me.remaining > 0 ? `<b class="bad">They want ${$$(me.remaining)} from YOU.</b>` : 'You are clear - help your crew.'} Pay the debt, win cash in the arcade, have a friend wire you money, or <b>beat them down together</b>.</div>
    <div class="hp"><div style="width:${pct}%"></div></div><div class="muted">Hitmen health: ${S.hunt.hp} / ${S.hunt.maxHp}</div>
    <div class="row"><button class="red" onmousedown="send({type:'attack'})">👊 AMBUSH!</button>
    ${me.remaining > 0 ? `<button class="gold" onclick="send({type:'pay'})" ${me.money <= 0 ? 'disabled' : ''}>Pay what I can (${$$(Math.min(me.money, me.remaining))})</button>` : ''}</div></div>`;
}

// ---------- sportsbook ----------
const badge = (t) => `<span class="badge" style="background:${t.color}">${esc(t.short)}</span>`;
function teamCard(t, side, cur, ev) {
  return `<div class="tc">${badge(t)}<div class="tn">${esc(t.name)}</div><div class="tr">${esc(t.rec)}${t.home ? ' · <span class="ok">HOME</span>' : ev.n ? ' · neutral' : ' · away'}</div></div>`;
}
function oddBtn(market, pick, top, main, hinted) {
  const cur = S.cur, mine = (S.me.bets[cur.idx] || {})[market], placed = mine && mine.pick === pick, sel = ui.sel && ui.sel.market === market && ui.sel.pick === pick;
  return `<button class="odd ${sel ? 'sel' : ''} ${placed ? 'placed' : ''} ${hinted ? 'hinted' : ''}" onclick="selectOdd('${market}','${pick}')"><span class="ot">${esc(top)}</span><b>${main}</b>${placed ? `<i>✓ ${$$(mine.stake)}</i>` : ''}${hinted ? '<em>🍺</em>' : ''}</button>`;
}
function selectOdd(market, pick) { ui.sel = { market, pick }; ui.selIdx = S.cur.idx; render(); }
function slipInfo() {
  const cur = S.cur, ev = S.events[cur.idx], { market, pick } = ui.sel, mk = cur.mk;
  const name = (s) => cur.intel[s].name;
  if (market === 'ml') return { dec: mk.ml[pick].dec, text: `${name(pick)} to win (Moneyline)` };
  if (market === 'spread') return { dec: mk.spread[pick].dec, text: `${name(pick)} ${mk.spread[pick].line > 0 ? '+' : ''}${mk.spread[pick].line} (Spread)` };
  return { dec: 1.91, text: `${pick === 'over' ? 'Over' : 'Under'} ${mk.total.line} (Total points)` };
}
function updWin() { const el = $('#towin'); if (!el || !ui.sel) return; const i = slipInfo(); el.textContent = $$(ui.stake * (i.dec - 1)); }
function placeSel() { if (!ui.sel) return; send({ type: 'bet', ev: S.cur.idx, market: ui.sel.market, pick: ui.sel.pick, stake: ui.stake }); ui.sel = null; }

function bookView() {
  if (!S.cur) {
    const next = S.events.find((e) => e.status === 'upcoming');
    return `<div class="card col"><div class="big">No game is open right now</div>
      <div class="muted">${next ? `Next up: <b>${esc(next.label)}</b> - ${esc(next.a)} vs ${esc(next.b)}. Opens in <b>${mmss(next.openAt - now())}</b>.` : 'All games have closed. Watch the highlights on the TV and wait for the finals.'}</div>
      <div class="muted">Tip: grab a drink at the bar. Drunk confidence is real... until you have one too many.</div></div>`;
  }
  const cur = S.cur, ev = S.events[cur.idx], mk = cur.mk, mine = S.me.bets[cur.idx] || {}, h = cur.hint;
  const A = cur.intel.a, B = cur.intel.b;
  const hs = (m, v) => !!(h && h[m] && (h[m].side === v || h[m].pick === v));
  const crew = cur.crew, ctot = crew.a + crew.b;
  return `<div class="sb">
    <div class="sb-head"><div><div class="title">${ev.final ? '🏆 CHAMPIONSHIP' : 'GAME ' + (ev.idx + 1) + ' OF ' + S.events.length}</div><div class="big">${esc(ev.label)}</div>${cur.series ? `<div class="muted">${esc(cur.series)}${ev.ot ? '' : ''}</div>` : ''}</div>
      <div class="clock"><div class="muted">BETS CLOSE IN</div><div id="tl2" class="tl2"></div></div></div>
    <div class="tlbar"><div id="tlbar"></div></div>
    <div class="matchup">${teamCard(A, 'a', cur, ev)}<div class="vs">VS</div>${teamCard(B, 'b', cur, ev)}</div>
    ${ev.final ? '<div class="champ-note">To win the game you need a <b>Moneyline</b> bet on the champion of this game.</div>' : ''}
    ${h ? hintView(h) : ''}
    <div class="mkt"><div class="mh">Moneyline</div><div class="og">${oddBtn('ml', 'a', A.name, mk.ml.a.am, hs('ml', 'a'))}${oddBtn('ml', 'b', B.name, mk.ml.b.am, hs('ml', 'b'))}</div></div>
    <div class="mkt"><div class="mh">Spread</div><div class="og">${oddBtn('spread', 'a', `${A.short} ${mk.spread.a.line > 0 ? '+' : ''}${mk.spread.a.line}`, amer(mk.spread.a.dec), hs('spread', 'a'))}${oddBtn('spread', 'b', `${B.short} ${mk.spread.b.line > 0 ? '+' : ''}${mk.spread.b.line}`, amer(mk.spread.b.dec), hs('spread', 'b'))}</div></div>
    <div class="mkt"><div class="mh">Total points</div><div class="og">${oddBtn('total', 'over', `Over ${mk.total.line}`, '-110', hs('total', 'over'))}${oddBtn('total', 'under', `Under ${mk.total.line}`, '-110', hs('total', 'under'))}</div></div>
    ${ui.sel ? slipView() : `<div class="muted" style="margin:8px 0">Tap any price to build your bet slip.</div>`}
    ${betList(cur.idx)}
    <div class="intel"><div class="itabs">${[['stats', 'Team Stats'], ['form', 'Form'], ['crew', 'Crew Picks']].map(([id, l]) => `<button class="${ui.intelTab === id ? 'on' : ''}" onclick="ui.intelTab='${id}';render()">${l}</button>`).join('')}</div>
      ${ui.intelTab === 'stats' ? `<div class="ig">${[A, B].map(teamStats).join('')}</div>` : ui.intelTab === 'form' ? `<div class="ig">${[A, B].map(teamForm).join('')}</div>`
        : `<div class="crewp"><div class="muted">Moneyline picks from your crew</div><div class="cbar"><div style="width:${ctot ? crew.a / ctot * 100 : 50}%;background:${A.color}"></div><div style="flex:1;background:${B.color}"></div></div><div class="row"><span>${esc(A.short)}: ${crew.a}</span><span style="text-align:right">${esc(B.short)}: ${crew.b}</span></div></div>`}</div>
  </div>`;
}
function teamStats(t) {
  return `<div class="ts"><div class="tsh">${badge(t)} <b>${esc(t.name)}</b></div><div class="muted">Record ${esc(t.rec)}</div>
    ${t.note ? `<div class="note">${esc(t.note)}</div>` : ''}
    ${t.stars.map(([n, l]) => `<div class="star"><span>${esc(n)}</span><b>${esc(l)}</b></div>`).join('') || '<div class="muted">No star data.</div>'}</div>`;
}
function teamForm(t) {
  return `<div class="ts"><div class="tsh">${badge(t)} <b>${esc(t.name)}</b></div>${t.form.length ? t.form.map((f) => `<div class="fm ${f.res === 'W' ? 'ok' : 'bad'}"><b>${f.res}</b> ${esc(f.score)} vs ${esc(f.opp)}<span class="muted"> · ${esc(f.label)}</span></div>`).join('') : '<div class="muted">First appearance this season - no form yet.</div>'}</div>`;
}
function slipView() {
  const i = slipInfo();
  return `<div class="slip"><div class="title">Bet slip</div><div class="sl1"><b>${esc(i.text)}</b><span class="gold">${amer(i.dec)}</span></div>
    <div class="row"><input id="stake" type="number" min="10" value="${ui.stake}" oninput="ui.stake=+this.value;updWin()"><div class="fit muted">To win <b id="towin" class="ok">${$$(ui.stake * (i.dec - 1))}</b></div></div>
    <div class="chips">${[25, 50, 100, 250, 500].map((v) => `<button onclick="ui.stake=${v};render()">${$$(v)}</button>`).join('')}<button onclick="ui.stake=${Math.max(10, S.me.money)};render()">MAX</button></div>
    <div class="row"><button class="ghost" onclick="ui.sel=null;render()">Cancel</button><button onclick="placeSel()" ${S.me.money < 10 ? 'disabled' : ''}>Place bet</button></div></div>`;
}
function betList(idx) {
  const mine = S.me.bets[idx] || {}, ents = Object.entries(mine); if (!ents.length) return '';
  const cur = S.cur;
  return `<div class="mine"><div class="title">Your bets on this game</div>${ents.map(([mk, b]) => {
    const text = mk === 'ml' ? `${cur.intel[b.pick].name} ML` : mk === 'spread' ? `${cur.intel[b.pick].short} ${b.line > 0 ? '+' : ''}${b.line}` : `${b.pick === 'over' ? 'Over' : 'Under'} ${b.line}`;
    return `<div class="bt"><span>${esc(text)} <span class="muted">${$$(b.stake)} → ${$$(b.stake * b.dec)}</span></span><button class="ghost" onclick="send({type:'cancelBet',ev:${idx},market:'${mk}'})">Cancel</button></div>`;
  }).join('')}</div>`;
}
function hintView(h) {
  const lines = ['ml', 'spread', 'total'].filter((m) => h[m]).map((m) => `<div class="hl"><b>${{ ml: 'Winner', spread: 'Spread', total: 'Total' }[m]}:</b> "${esc(h[m].text)}" ${'🔥'.repeat(h[m].conf)}</div>`).join('');
  return `<div class="hint ${h.level}"><div class="title">🍺 Drunk confidence - ${esc(h.level)}</div>${lines}<div class="muted">${h.level === 'wasted' ? 'You are way too drunk. Do not trust any of this.' : 'Gut feelings glow gold on the odds above. Not guaranteed - and too many drinks ruins it.'}</div></div>`;
}

function betsView() {
  return `<div class="card col"><div class="title">Season schedule & my bets</div>${S.events.map((e) => {
    const r = S.me.results[e.idx], bets = S.me.bets[e.idx] || {};
    const st = e.status === 'final' ? `<span class="chip fin">FINAL ${e.result.sa}-${e.result.sb}</span>` : e.status === 'airing' ? `<span class="chip airing">📺 ON TV ${mmss(e.resolveAt - now())}</span>` : e.status === 'open' ? '<span class="chip open">● OPEN</span>' : `<span class="chip upcoming">opens ${mmss(e.openAt - now())}</span>`;
    return `<div class="side"><div class="row" style="justify-content:space-between"><b>${e.idx + 1}. ${esc(e.label)}${e.final ? ' 🏆' : ''}</b>${st}</div>
      <div class="muted">${esc(e.a)} vs ${esc(e.b)}</div>
      ${Object.keys(bets).length ? `<div class="muted">${Object.entries(bets).map(([m, b]) => `${m === 'ml' ? 'ML' : m} ${$$(b.stake)}`).join(' · ')}</div>` : ''}
      ${r ? `<div class="${r.delta >= 0 ? 'ok' : 'bad'}">${r.delta >= 0 ? '+' : ''}${$$(r.delta)}</div>${r.notes.map((n) => `<div class="muted">${esc(n)}</div>`).join('')}` : ''}</div>`;
  }).join('')}</div>`;
}

function mobView() {
  const me = S.me, cur = S.cur, ev = cur && S.events[cur.idx], fixed = cur && me.fix[cur.idx];
  return `<div class="card col" style="border-color:#5a2230">
    <div class="big">🕴️ "Uncle Sal"</div>
    <div class="muted">"I can make things happen, kid. Money, refs, players that suddenly forget how to play defense. Of course, I take a cut. And if you lose the big bet... well. We'll come see you."</div>
    <div class="side"><b>Loan: ${$$(1000)}</b> - you owe back ${$$(1250)}. (${me.loans}/3 taken)<br>
      <button class="gold" style="margin-top:6px" ${me.loans >= 3 || S.phase !== 'play' ? 'disabled' : ''} onclick="send({type:'loan'})">Borrow</button></div>
    <div class="side"><b>Fix the open game</b> - pay off the refs and players. Adds <b>${cur ? $$(cur.fixPrice) : '...'}</b> to your tab when betting closes. The result gets flipped on the TV.<br>
      <div class="muted">If someone fixes it the other way, the mob keeps both fees and nothing changes.</div>
      ${cur ? `<div class="match2">${['a', 'b'].map((s) => `<button class="team ${fixed === s ? 'fix' : ''}" onclick="send({type:'fix',ev:${cur.idx},side:'${s}'})">${esc(cur.intel[s].name)} wins</button>`).join('')}</div>
      ${fixed ? `<button class="ghost" style="margin-top:6px" onclick="send({type:'fix',ev:${cur.idx},side:null})">Cancel the fix</button>` : ''}` : '<div class="muted">Only while a game is open for betting.</div>'}</div>
    <div class="muted">At the end, the mob collects your tab (+20% of your profit if you win the title bet). Can't cover it? They come for you. Beat them as a crew, or earn it back at the arcade.</div></div>`;
}

function crewView() {
  const others = S.players.filter((p) => p.id !== S.you);
  if (!ui.giveTo || !others.find((p) => p.id === ui.giveTo)) ui.giveTo = others[0]?.id || '';
  return `<div class="card col"><div class="title">Teamwork</div>
    <div class="muted">Wire cash to a crewmate - the best way to save someone from the mob.</div>
    ${others.length ? `<div class="row"><select id="gto" onchange="ui.giveTo=this.value" style="padding:10px;border-radius:10px;background:var(--panel2);color:var(--text)">${others.map((p) => `<option value="${p.id}" ${p.id === ui.giveTo ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <input id="gamt" type="number" value="${ui.giveAmt}" oninput="ui.giveAmt=+this.value"><button class="fit" onclick="send({type:'give',to:ui.giveTo,amount:ui.giveAmt})">Send</button></div>` : '<div class="muted">No one else here yet.</div>'}
    ${S.phase === 'hunt' ? '<button class="red" onmousedown="send({type:\'attack\'})">👊 AMBUSH THE HITMEN</button>' : ''}</div>`;
}

function barView() {
  const d = Math.round(drunkLevel()), b = d < 15 ? 'sober' : d < 40 ? 'tipsy' : d < 65 ? 'buzzed' : d < 85 ? 'drunk' : 'wasted';
  return `<div class="card col"><div class="big">🍺 The Bar</div>
    <div class="muted">Bartender: "What'll it be? First one's always full price."</div>
    <div class="dmeter"><div style="width:${d}%"></div></div><div class="muted">You are: <b>${b}</b> (${d}%) - drunk confidence gives you gut feelings on the games. Too far gone and they turn into nonsense. It wears off over time.</div>
    ${S.drinks.map((x) => `<div class="side row"><div style="flex:1"><b>${x.emoji} ${esc(x.name)}</b> <span class="gold">${$$(x.price)}</span><div class="muted">${esc(x.blurb)} (+${x.add} buzz)</div></div><button class="fit" ${S.me.money < x.price || d >= 100 ? 'disabled' : ''} onclick="send({type:'drink',id:'${x.id}'})">Order</button></div>`).join('')}</div>`;
}

function wheelView() {
  const busy = S.spinning;
  const picks = [['red', 'Red 2x', 'red'], ['black', 'Black 2x', ''], ['green', 'Green 36x', 'gold']];
  return `<div class="card col"><div class="big">🎰 Roulette</div>
    <div class="muted">${busy ? `The wheel is spinning for ${esc(busy.by)}...` : 'Place a bet, then watch the wheel. 37 pockets, one ball.'}</div>
    <input id="rstake" type="number" min="10" value="${ui.rStake}" oninput="ui.rStake=+this.value">
    <div class="chips">${[50, 100, 250, 500].map((v) => `<button onclick="ui.rStake=${v};render()">${$$(v)}</button>`).join('')}</div>
    <div class="row">${picks.map(([id, l, c]) => `<button class="${c} ${ui.rPick === id ? 'selp' : ''}" style="${id === 'black' ? 'background:#222;color:#fff' : ''}" onclick="ui.rPick='${id}';render()">${l}</button>`).join('')}</div>
    <div class="row"><input id="rnum" type="number" min="0" max="36" placeholder="or a single number 0-36 (pays 36x)" value="${ui.rNum}" oninput="ui.rNum=this.value;ui.rPick=this.value===''?ui.rPick:'num'"></div>
    <button class="red" ${busy ? 'disabled' : ''} onclick="spinNow()">SPIN THE WHEEL</button></div>`;
}
function spinNow() {
  const pick = ui.rPick === 'num' ? ui.rNum : ui.rPick;
  if (pick === '' || pick === undefined) return toast('Pick red, black, green or a number.', 'err');
  send({ type: 'roulette', pick, stake: ui.rStake }); closePanel();
}

function endView() {
  const s = S.summary, host = S.host;
  return `<div class="center"><div class="card col" style="width:min(560px,100%)">
    <div class="logo" style="font-size:34px">${s.crewWon ? '<span>YOU WIN</span>' : 'GAME OVER'}</div>
    <div class="tag">${s.correct}/${s.total} called the title</div>
    <div class="title">The season was</div>
    <div class="big">${s.year} ${esc(s.league)}</div>
    <div class="muted">${esc(s.blurb || '')}</div>
    <div>Real champion: <b>${esc(s.champion)}</b></div>
    <div>${s.altered ? `History was rewritten - your champion was <b>${esc(s.finalWinner)}</b>.` : 'History played out as it happened.'}</div>
    ${s.players.map((p) => `<div class="pl"><span>${esc(p.name)} ${p.finalCorrect ? '✅' : '❌'}</span><span>${p.fate === 'dead' ? '💀 dead' : esc(p.fate)} · ${$$(p.money)}</span></div>`).join('')}
    ${host ? `<button onclick="send({type:'rematch'})">Back to lobby</button>` : '<div class="muted">Waiting for host...</div>'}</div></div>`;
}
render();
