const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $$ = (n) => '$' + Math.round(n).toLocaleString('en-US');

let ws, S = null, err = '';
const ui = { tab: 'book', stake: 100, sideStake: {}, giveTo: '', giveAmt: 100, roulette: 100 };

function connect(msg) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => ws.send(JSON.stringify(msg));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'state') { S = m; err = ''; render(); }
    else if (m.type === 'toast') toast(m.text, m.kind);
    else if (m.type === 'pos') window.BK.onPos && window.BK.onPos(m);
    else if (m.type === 'error') { err = m.text; ws.close(); S = null; render(); }
  };
  ws.onclose = () => { if (S) { S = null; err = 'Disconnected.'; render(); } };
}
const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

function toast(text, kind = 'info') {
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text;
  $('#toasts').appendChild(d); setTimeout(() => d.remove(), 4500);
}

// ---------- rendering ----------
let lastPhase = null;
function render() {
  if (S && S.phase !== lastPhase) {
    if (S.phase === 'result') { window.BK.leaveGames && window.BK.leaveGames(); ui.open = true; ui.tab = 'book'; document.exitPointerLock && document.exitPointerLock(); }
    else if (S.phase === 'betting' && lastPhase === 'result') { ui.open = false; toast('Betting is open for the next round.'); }
    else if (['lobby', 'ended'].includes(S.phase)) ui.open = false;
    lastPhase = S.phase;
  }
  document.body.classList.toggle('ingame', !!S && ['betting', 'result', 'hunt'].includes(S.phase));
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

const playerList = () => S.players.map((p) => `<div class="pl"><span>${esc(p.name)}${p.id === S.you ? ' (you)' : ''}${!p.connected ? ' 📴' : ''}</span>
  <span>${S.phase === 'lobby' ? '' : `<span class="ok">${$$(p.money)}</span> ${p.ready ? '✅' : ''}${p.hunted ? ' 🎯' : ''}`}</span></div>`).join('');

function lobbyView() {
  return `<div class="wrap"><div class="card col">
    <div class="top"><div class="logo" style="text-align:left;font-size:30px">BALL <span>KNOWLEDGE</span></div><div class="pill">Room <b>${S.code}</b></div></div>
    <div class="muted">Share the room code. Up to 6 players, co-op. Everyone starts with $1,000.</div>
    <div class="title">Crew</div>${playerList()}
    <div class="title">${S.host ? 'Choose your sport' : 'The host is choosing a sport...'}</div>
    <div class="sports">${S.sports.map((s) => `<button class="sport ${S.sport === s.id ? 'sel' : ''}" ${S.host ? '' : 'disabled'} onclick="send({type:'setSport',sport:'${s.id}'})"><span class="e">${s.emoji}</span>${esc(s.label)}</button>`).join('')}</div>
    ${S.host ? `<button onclick="send({type:'start'})">Start - assign a mystery season</button>` : ''}
  </div></div>`;
}

function openPanel(tab) { window.BK.leaveGames && window.BK.leaveGames(); ui.open = true; if (tab) ui.tab = tab; document.exitPointerLock && document.exitPointerLock(); render(); }
function closePanel() { ui.open = false; render(); try { document.getElementById('world').requestPointerLock(); } catch {} }
window.BK = { get S() { return S; }, ui, send, openPanel, closePanel };
addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.open) closePanel(); });

function goalText() {
  const me = S.me;
  if (S.phase === 'hunt') return me.remaining > 0 ? '🎯 The mob wants ' + $$(me.remaining) + ' from YOU - pay, win cash, or ambush them!' : '🎯 Help your crew - click the hitmen!';
  if (S.phase === 'result') return '📺 Round over';
  if (me.ready) return '✅ Locked in. Waiting on the crew - go win cash at the arcade (left side)';
  if (!me.bet) return '📍 Walk to the SPORTSBOOK terminal under the TVs and place your bet';
  return '📍 Bet placed - lock in at the terminal when you are ready (or see Uncle Sal to rig it)';
}

function gameView() {
  const me = S.me, hunt = S.phase === 'hunt';
  const tabs = [['book', '📱 Sportsbook'], ['mob', '🕴️ The Mob'], ['arcade', '🎯 Arcade'], ['crew', '👥 Crew']];
  const body = ui.tab === 'book' ? bookView() : ui.tab === 'mob' ? mobView() : ui.tab === 'arcade' ? arcadeView() : crewView();
  return `<div class="hud">
    <div class="hud-top">
      <div class="row" style="gap:8px;justify-content:flex-start"><span class="pill">Room ${S.code}</span>
      <span class="pill">${hunt ? '🔫 HUNT' : esc(S.round?.label || '')} ${S.round && !hunt ? `(${S.round.index + 1}/${S.round.total})` : ''}</span></div>
      <div class="row" style="gap:8px;justify-content:flex-end"><span class="pill time" id="timer"></span>
      <span class="pill money">${$$(me.money)}</span>${me.mobTied ? `<span class="pill debt">Owe ${$$(me.debt)}</span>` : ''}</div>
    </div>
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
    <div class="big">🔫 The hitmen have arrived</div>
    <div class="muted">${me.remaining > 0 ? `<b class="bad">They want ${$$(me.remaining)} from YOU.</b>` : 'You are clear - help your crew.'} Pay the debt, win the cash in the arcade, have a friend wire you money, or <b>beat them down together</b> before time runs out.</div>
    <div class="hp"><div style="width:${pct}%"></div></div><div class="muted">Hitmen health: ${S.hunt.hp} / ${S.hunt.maxHp}</div>
    <div class="row"><button class="red" onmousedown="send({type:'attack'})" ontouchstart="send({type:'attack'})">👊 AMBUSH!</button>
    ${me.remaining > 0 ? `<button class="gold" onclick="send({type:'pay'})" ${me.money <= 0 ? 'disabled' : ''}>Pay what I can (${$$(Math.min(me.money, me.remaining))})</button>` : ''}</div></div>`;
}

function stakeChips(key, getVal) {
  const m = S.me.money;
  return `<div class="chips">${[50, 100, 250, 500].map((v) => `<button onclick="${key}=${v};render()">${$$(v)}</button>`).join('')}<button onclick="${key}=${Math.floor(m)};render()">All in</button></div>`;
}

function bookView() {
  const me = S.me;
  if (S.phase === 'result') return resultView();
  if (S.phase !== 'betting') return `<div class="card">Waiting...</div>`;
  const locked = me.ready;
  const teams = S.market.map((t) => {
    const sel = me.bet && me.bet.team === t.team, fix = me.fixPick === t.team;
    return `<button class="team ${sel ? 'sel' : ''} ${fix ? 'fix' : ''}" ${locked ? 'disabled' : ''} onclick="pickTeam(${JSON.stringify(t.team).replace(/"/g, '&quot;')})">${esc(t.team)}<span class="o">${t.am}</span>${sel ? `<span class="muted">Bet ${$$(me.bet.stake)}</span>` : ''}${fix ? '<span class="bad">🕴️ FIXED</span>' : ''}</button>`;
  }).join('');
  return `<div class="card col">
    <div class="title">${esc(S.round.label)} - who wins?</div>
    <div class="match">${teams}</div>
    <div class="row"><input id="stake" type="number" min="10" value="${ui.stake}" oninput="ui.stake=+this.value" ${locked ? 'disabled' : ''}>
    <button class="fit" ${locked ? 'disabled' : ''} onclick="placeBet()">Place / change bet</button>
    ${me.bet ? `<button class="fit ghost" ${locked ? 'disabled' : ''} onclick="send({type:'clearBet'})">Clear</button>` : ''}</div>
    ${stakeChips('ui.stake')}
    <div class="muted">${me.bet ? `Your bet: ${$$(me.bet.stake)} on ${esc(me.bet.team)}.` : 'Tap a team, set a stake, then place your bet.'}</div>
    <div class="title" style="margin-top:8px">Side action</div>
    ${S.sides.map((s) => sideView(s, locked)).join('')}
    <button class="blue" ${locked ? 'disabled' : ''} onclick="send({type:'ready'});closePanel()">${locked ? 'Locked in - waiting for crew' : 'Lock in & start the game'}</button>
  </div>`;
}
let pendingTeam = null;
function pickTeam(t) { pendingTeam = t; const el = document.querySelectorAll('.panel .team'); el.forEach((e) => e.classList.toggle('sel', e.firstChild.textContent === t)); }
function placeBet() {
  const t = pendingTeam || (S.me.bet && S.me.bet.team);
  if (!t) return toast('Pick a team first.', 'err');
  send({ type: 'bet', team: t, stake: ui.stake });
}
function sideView(s, locked) {
  const mine = S.me.side[s.id], v = ui.sideStake[s.id] || 50;
  return `<div class="side"><b>${esc(s.kind)}</b>: ${esc(s.a)} vs ${esc(s.b)}
    <div class="m"><button class="${mine?.pick === 'a' ? 'sel' : ''}" ${locked ? 'disabled' : ''} onclick="sideBet('${s.id}','a')">${esc(s.a)} · ${s.da}x</button>
    <button class="${mine?.pick === 'b' ? 'sel' : ''}" ${locked ? 'disabled' : ''} onclick="sideBet('${s.id}','b')">${esc(s.b)} · ${s.db}x</button></div>
    <div class="row" style="margin-top:6px"><input id="ss_${s.id}" type="number" min="10" value="${v}" oninput="ui.sideStake['${s.id}']=+this.value">
    ${mine ? `<span class="fit muted">Bet ${$$(mine.stake)}</span>` : ''}</div></div>`;
}
const sideBet = (id, pick) => send({ type: 'side', id, pick, stake: ui.sideStake[id] || 50 });

function resultView() {
  const r = S.result, mine = r.mine;
  return `<div class="card col"><div class="title">${esc(r.label)} - final</div>
    <div class="big">${esc(r.winner)}</div><div class="muted">won ${esc(r.score)} over ${esc(r.winner === r.a ? r.b : r.a)}</div>
    ${r.fixed ? '<div class="bad">🕴️ Something about that game felt off...</div>' : ''}
    ${mine.notes.map((n) => `<div class="side">${esc(n)}</div>`).join('') || '<div class="muted">You sat this one out.</div>'}
    <div class="${mine.delta >= 0 ? 'ok' : 'bad'} big">${mine.delta >= 0 ? '+' : ''}${$$(mine.delta)}</div>
    ${r.sideResults.map((s) => `<div class="muted">${esc(s.kind)}: ${esc(s.winner === 'a' ? s.a : s.b)} won</div>`).join('')}
    <button class="blue" ${S.me.ready ? 'disabled' : ''} onclick="send({type:'ready'});closePanel()">Continue</button></div>`;
}

function mobView() {
  const me = S.me, canFix = S.phase === 'betting' && !me.ready;
  return `<div class="card col" style="border-color:#5a2230">
    <div class="big">🕴️ "Uncle Sal"</div>
    <div class="muted">"I can make things happen, kid. Money, refs, players that suddenly forget how to play defense. Of course, I take a cut. And if you lose the big bet... well. We'll come see you."</div>
    <div class="side"><b>Loan: ${$$(1000)}</b> - you owe back ${$$(1250)}. (${me.loans}/3 taken)<br>
      <button class="gold" style="margin-top:6px" ${me.loans >= 3 || S.phase === 'hunt' ? 'disabled' : ''} onclick="send({type:'loan'})">Borrow</button></div>
    <div class="side"><b>Fix this game</b> - pay off the refs and players. Adds <b>${S.fixPrice ? $$(S.fixPrice) : '...'}</b> to your tab. This rewrites history.<br>
      <div class="muted">If someone fixes it the other way, the mob keeps both fees and nothing changes.</div>
      ${S.phase === 'betting' ? `<div class="match" style="margin-top:6px">${S.market.map((t) => `<button class="team ${me.fixPick === t.team ? 'fix' : ''}" ${canFix ? '' : 'disabled'} onclick="send({type:'fix',team:${JSON.stringify(t.team).replace(/"/g, '&quot;')}})">${esc(t.team)} wins</button>`).join('')}</div>
      ${me.fixPick ? `<button class="ghost" style="margin-top:6px" onclick="send({type:'fix',team:null})">Cancel the fix</button>` : ''}` : '<div class="muted">Only available while betting is open.</div>'}</div>
    <div class="muted">At the end, the mob collects your tab (+${Math.round(20)}% of your profit if you win). Can't cover it? They come for you. Beat them as a crew, or earn it back in the Arcade.</div></div>`;
}

function arcadeView() {
  return `<div class="card col"><div class="title">The arcade</div>
    <div class="muted">Darts, bowling and cornhole are real games on the left side of the bar - walk up and press <b>E</b> to play. Better throws = more cash (5s cooldown, capped payouts).</div>
    <div class="title" style="margin-top:10px">Roulette</div>
    <input id="rstake" type="number" min="10" value="${ui.roulette}" oninput="ui.roulette=+this.value">
    <div class="row"><button class="red" onclick="send({type:'roulette',pick:'red',stake:ui.roulette})">Red 2x</button>
    <button style="background:#222;color:#fff" onclick="send({type:'roulette',pick:'black',stake:ui.roulette})">Black 2x</button>
    <button onclick="send({type:'roulette',pick:'green',stake:ui.roulette})">Green 36x</button></div></div>`;
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

function endView() {
  const s = S.summary, host = S.host;
  return `<div class="center"><div class="card col" style="width:min(560px,100%)">
    <div class="logo" style="font-size:34px">${s.crewWon ? '<span>YOU WIN</span>' : 'GAME OVER'}</div>
    <div class="tag">${s.correct}/${s.total} called the title</div>
    <div class="title">The season was</div>
    <div class="big">${s.year} ${esc(s.league)}</div>
    <div>Real champion: <b>${esc(s.champion)}</b></div>
    <div>${s.altered ? `History was rewritten - your champion was <b>${esc(s.finalWinner)}</b>.` : 'History played out as it happened.'}</div>
    ${s.players.map((p) => `<div class="pl"><span>${esc(p.name)} ${p.finalCorrect ? '✅' : '❌'}</span><span>${p.fate === 'dead' ? '💀 dead' : esc(p.fate)} · ${$$(p.money)}</span></div>`).join('')}
    ${host ? `<button onclick="send({type:'rematch'})">Back to lobby</button>` : '<div class="muted">Waiting for host...</div>'}</div></div>`;
}

function tick() {
  const el = $('#timer'); if (!el) return;
  const s = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
  el.textContent = S.deadline ? `⏱ ${s}s` : '';
}
setInterval(() => S && tick(), 500);

// ---------- mini-games ----------
const cv = $('#mg-canvas'), g = cv.getContext('2d');
let mgRaf = 0, mgOn = null;
function closeMG() { cancelAnimationFrame(mgRaf); mgOn = null; $('#mg').classList.add('hidden'); }
$('#mg-close').onclick = closeMG;

function playMG(name) {
  $('#mg').classList.remove('hidden');
  $('#mg-title').textContent = { darts: '🎯 Darts', bowling: '🎳 Bowling', cornhole: '🌽 Cornhole' }[name];
  $('#mg-hint').textContent = 'Click / tap the canvas to throw.';
  const game = { darts, bowling, cornhole }[name]();
  let total = 0, done = false;
  mgOn = game;
  const finish = (pts) => { done = true; total = pts; $('#mg-info').textContent = ''; $('#mg-hint').textContent = `Final: ${pts} pts - cashing out...`; send({ type: 'mg', game: name, pts }); setTimeout(closeMG, 1400); };
  const loop = (t) => { if (mgOn !== game) return; game.draw(t / 1000); $('#mg-info').textContent = game.info(); mgRaf = requestAnimationFrame(loop); };
  cv.onpointerdown = () => { if (!done && mgOn === game) { const r = game.click(); if (r !== undefined && r !== null) finish(r); } };
  mgRaf = requestAnimationFrame(loop);
}

function darts() {
  const C = 180, R = 150; let thrown = [], score = 0, t = 0;
  const pos = () => ({ x: C + Math.sin(t * 1.9) * R * 0.85 + Math.sin(t * 5.3) * 18, y: C + Math.cos(t * 2.4) * R * 0.85 + Math.cos(t * 4.1) * 18 });
  return {
    info: () => `Dart ${Math.min(3, thrown.length + 1)}/3 · ${score} pts`,
    click() {
      const p = pos(), d = Math.hypot(p.x - C, p.y - C) / R;
      const s = d < 0.06 ? 50 : d < 0.15 ? 30 : d < 0.45 ? 15 : d < 0.75 ? 8 : d <= 1 ? 3 : 0;
      thrown.push({ ...p, s }); score += s; if (thrown.length === 3) return score;
    },
    draw(time) {
      t = time; g.clearRect(0, 0, 360, 360);
      [[1, '#222'], [0.75, '#1d6b3a'], [0.45, '#8c1c2c'], [0.15, '#1d6b3a'], [0.06, '#ffc83d']].forEach(([r, c]) => { g.fillStyle = c; g.beginPath(); g.arc(C, C, R * r, 0, 7); g.fill(); });
      thrown.forEach((d) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(d.x, d.y, 5, 0, 7); g.fill(); });
      const p = pos(); g.strokeStyle = '#27e08a'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 12, 0, 7); g.moveTo(p.x - 18, p.y); g.lineTo(p.x + 18, p.y); g.moveTo(p.x, p.y - 18); g.lineTo(p.x, p.y + 18); g.stroke();
    },
  };
}

function bowling() {
  let pins = Array(10).fill(true), ball = 0, total = 0, frameScore = 0, t = 0, rolled = null;
  const x = () => Math.sin(t * (2.2 + ball * 0.5));
  const rows = [[0], [-1, 1], [-2, 0, 2], [-3, -1, 1, 3]];
  return {
    info: () => `Frame ${Math.floor(ball / 2) + 1}/2 · ${total} pins`,
    click() {
      const left = pins.filter(Boolean).length, a = Math.abs(x());
      let hit = a < 0.08 ? left : Math.round(left * Math.max(0, 1.1 - a * 1.5) + Math.random() * 1.4);
      hit = Math.min(left, Math.max(0, hit));
      let n = hit; pins = pins.map((p) => { if (p && n > 0) { n--; return false; } return p; });
      total += hit; rolled = { x: x(), t: 0 }; ball++;
      if (ball % 2 === 0 || hit === left) { if (ball % 2 === 1) ball++; pins = Array(10).fill(true); }
      if (ball >= 4) return total;
    },
    draw(time) {
      t = time; g.clearRect(0, 0, 360, 360); g.fillStyle = '#6b4a2b'; g.fillRect(70, 0, 220, 360);
      let i = 0; rows.forEach((r, ri) => r.forEach((o) => { g.fillStyle = pins[i++] ? '#fff' : '#3a2a1a'; g.beginPath(); g.arc(180 + o * 22, 40 + ri * 30, 9, 0, 7); g.fill(); }));
      g.fillStyle = '#222'; g.fillRect(70, 300, 220, 8);
      const bx = 180 + x() * 100; g.fillStyle = '#4da3ff'; g.beginPath(); g.arc(bx, 330, 14, 0, 7); g.fill();
      g.fillStyle = '#27e08a'; g.fillRect(176, 296, 8, 16);
    },
  };
}

function cornhole() {
  let stage = 0, lx = 0, bags = [], pts = 0, t = 0;
  const cx = () => Math.sin(t * 2.3), cy = () => Math.sin(t * 1.7 + 1);
  return {
    info: () => `Bag ${Math.min(4, bags.length + 1)}/4 · ${pts} pts`,
    click() {
      if (stage === 0) { lx = cx(); stage = 1; return; }
      const x = lx, y = cy(); stage = 0;
      const d = Math.hypot(x, y + 0.5);
      const s = d < 0.17 ? 3 : Math.abs(x) < 0.8 && Math.abs(y) < 0.95 ? 1 : 0;
      bags.push({ x, y, s }); pts += s; if (bags.length === 4) return pts;
    },
    draw(time) {
      t = time; g.clearRect(0, 0, 360, 360);
      g.fillStyle = '#c9a15b'; g.fillRect(50, 20, 260, 320);
      g.fillStyle = '#000'; g.beginPath(); g.arc(180, 20 + 160 * 0.5, 22, 0, 7); g.fill();
      const px = (x) => 180 + x * 125, py = (y) => 180 + y * 150;
      bags.forEach((b) => { g.fillStyle = b.s === 3 ? '#27e08a' : b.s ? '#ffc83d' : '#ff4d5e'; g.fillRect(px(b.x) - 10, py(b.y) - 10, 20, 20); });
      g.strokeStyle = '#27e08a'; g.lineWidth = 2;
      if (stage === 0) { g.beginPath(); g.moveTo(px(cx()), 20); g.lineTo(px(cx()), 340); g.stroke(); }
      else { g.beginPath(); g.moveTo(px(lx), 20); g.lineTo(px(lx), 340); g.moveTo(50, py(cy())); g.lineTo(310, py(cy())); g.stroke(); }
    },
  };
}
render();
