const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $$ = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const amer = (d) => (d >= 2 ? '+' + Math.round((d - 1) * 100) : String(-Math.round(100 / (d - 1))));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let ws, S = null, err = '', skew = 0, stateAt = 0;
const ui = { shop: false, shopTab: 'all', reveal: null, tab: 'book', open: false, sel: null, stake: 100, giveTo: '', giveAmt: 100, rChip: 25, rBets: {}, rHist: [], fightStake: 50, intelTab: 'stats' };
const now = () => Date.now() + skew;

// ---------- player settings (Esc menu): saved in this browser ----------
const SET_KEY = 'bk_settings_v1';
const settings = Object.assign({ sens: 1, invert: false, fov: 72, quality: 'auto', compact: true, bubbles: true }, (() => { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch { return {}; } })());
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch {} }

// ---------- local save: tickets + inventory (browser only) ----------
const SAVE_KEY = 'bk_save_v1';
function loadSave() { try { const o = JSON.parse(localStorage.getItem(SAVE_KEY)); if (o && Array.isArray(o.inv)) return o; } catch {} return { tix: 60, inv: [], eq: {} }; }
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }

// ---------- session: the server hands out a rejoin token; we keep it so a refresh, dropped wifi or server restart puts you back in your seat ----------
const SESS_KEY = 'bk_session_v1', SESS_MAX_AGE = 3 * 3600 * 1000;
let sess = (() => { try { const o = JSON.parse(localStorage.getItem(SESS_KEY)); return o && o.token && Date.now() - o.at < SESS_MAX_AGE ? o : null; } catch { return null; } })();
const saveSess = () => { try { if (sess) localStorage.setItem(SESS_KEY, JSON.stringify(sess)); else localStorage.removeItem(SESS_KEY); } catch {} };
function connect(msg) {
  const sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host); ws = sock;
  sock.onopen = () => { sock.send(JSON.stringify(msg)); sock.send(JSON.stringify({ type: 'cosmetics', cos: save.eq })); };
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'state') { S = m; skew = m.now - Date.now(); stateAt = Date.now(); err = ''; if (sess && Date.now() - sess.at > 60000) { sess.at = Date.now(); saveSess(); } render(); }
    else if (m.type === 'session') { const back = ui.reconnecting; sess = { code: m.code, token: m.token, at: Date.now() }; saveSess(); ui.reconnecting = false; ui.retryN = 0; if (back) toast('Reconnected.', 'win'); window.BK.onSession && window.BK.onSession(); }
    else if (m.type === 'toast') toast(m.text, m.kind);
    else if (m.type === 'pos') window.BK.onPos && window.BK.onPos(m);
    else if (m.type === 'rtc') window.BK.onRtc && window.BK.onRtc(m);
    else if (m.type === 'bottle') window.BK.onBottle && window.BK.onBottle(m);
    else if (m.type === 'bottleGot') window.BK.onBottleGot && window.BK.onBottleGot(m);
    else if (m.type === 'goons') window.BK.onGoons && window.BK.onGoons(m);
    else if (m.type === 'ko') window.BK.onKo && window.BK.onKo(m);
    else if (m.type === 'spin') window.BK.onSpin && window.BK.onSpin(m);
    else if (m.type === 'error') {
      if (m.stale) { sess = null; saveSess(); }
      err = m.stale && (S || ui.rejoining) ? 'That game ended while you were away.' : m.text; ui.reconnecting = ui.rejoining = false;
      sock.dead = true; sock.close(); S = null; render();
    }
  };
  sock.onclose = () => {
    if (ws !== sock || sock.dead) return;
    if ((S || ui.rejoining) && sess) { ui.reconnecting = true; render(); retryLater(); } // keep the world on screen and keep trying
    else if (S) { S = null; err = 'Disconnected.'; render(); }
  };
}
function retryLater() {
  const n = (ui.retryN = (ui.retryN || 0) + 1);
  if (n > 45) { ui.reconnecting = ui.rejoining = false; S = null; err = 'Could not reconnect. Check your connection and rejoin with the room code.'; render(); return; }
  setTimeout(() => { if (sess && (ui.reconnecting || ui.rejoining)) connect({ type: 'join', code: sess.code, token: sess.token }); }, Math.min(8000, 400 * 2 ** Math.min(n, 5)));
}
const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));
function toast(text, kind = 'info') {
  const B = window.BK; if (B && B.sfx) B.sfx(kind === 'win' ? 'win' : kind === 'err' ? 'buzz' : kind === 'mob' ? 'knock' : 'tick');
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text;
  $('#toasts').appendChild(d); setTimeout(() => d.remove(), 5000);
}

// ---------- panels / pointer lock ----------
// ---------- Esc menu: opens when the mouse is released (Esc / clicking away) during play. The bar keeps running - it's multiplayer.
function openMenu() { if (!S || !['play', 'hunt'].includes(S.phase) || ui.open || ui.shop) return; ui.menu = true; render(); }
function closeMenu(relock = true) { ui.menu = false; render(); if (relock) { try { document.getElementById('world').requestPointerLock(); } catch {} } }
function setOpt(k, v) { settings[k] = v; saveSettings(); if (k === 'quality') window.BK.setQuality && window.BK.setQuality(v); render(); }
function leaveGame() { if (!confirm('Leave this game? Your crew keeps playing; you can rejoin with the room code only while it is in the lobby.')) return; sess = null; saveSess(); if (ws) { ws.dead = true; try { ws.close(); } catch {} } location.reload(); }
function menuView() {
  const q = settings.quality, r = (k, v, l) => `<button class="${settings[k] === v ? 'on' : ''}" onclick="setOpt('${k}','${v}')">${l}</button>`;
  const tog = (k, l) => `<label class="mrow"><span>${l}</span><input type="checkbox" ${settings[k] ? 'checked' : ''} onchange="setOpt('${k}',this.checked)"></label>`;
  return `<div class="overlay"><div class="panel menu"><div class="mhead"><div class="big">⏸ Menu</div><div class="muted">The bar keeps going while you're in here.</div></div>
    <button class="green resume" onclick="closeMenu()">▶ Resume</button>
    <div class="msec"><div class="title">Controls</div>
      <label class="mrow"><span>Mouse sensitivity</span><input type="range" min="0.3" max="3" step="0.05" value="${settings.sens}" oninput="settings.sens=+this.value;this.nextElementSibling.textContent=(+this.value).toFixed(2)+'x'" onchange="saveSettings()"><b>${(+settings.sens).toFixed(2)}x</b></label>
      ${tog('invert', 'Invert mouse Y')}
      <label class="mrow"><span>Field of view</span><input type="range" min="60" max="100" step="1" value="${settings.fov}" oninput="settings.fov=+this.value;this.nextElementSibling.textContent=this.value+'°'" onchange="saveSettings()"><b>${settings.fov}°</b></label></div>
    <div class="msec"><div class="title">Graphics</div><div class="row mseg">${r('quality', 'auto', 'Auto')}${r('quality', 'high', 'High')}${r('quality', 'low', 'Low (faster)')}</div>
      <div class="muted" style="font-size:12px">${q === 'auto' ? 'Drops to Low by itself if the first seconds run slowly.' : q === 'low' ? 'No shadows or glow, lower resolution.' : 'Shadows, glow and full resolution.'}</div></div>
    <div class="msec"><div class="title">Screen</div>${tog('compact', 'Compact HUD (H)')}${tog('bubbles', 'NPC speech bubbles')}</div>
    <div class="row"><button onclick="closeMenu(false);window.BK.audioUI&&window.BK.audioUI.open()">🔊 Sound &amp; voice</button><button onclick="ui.menuKeys=!ui.menuKeys;render()">⌨ ${ui.menuKeys ? 'Hide' : 'Show'} all controls</button></div>
    ${ui.menuKeys ? `<div class="keys">${[['WASD', 'Move'], ['Shift', 'Run'], ['Space', 'Jump'], ['Mouse', 'Look'], ['E', 'Interact / sit / stand'], ['F or right-click', 'Throw a bottle'], ['1-9', 'Pop-up buttons'], ['Tab', 'Free the mouse'], ['C', 'Crew & wire money'], ['H', 'Compact / full HUD'], ['V', 'Push-to-talk'], ['M', 'Mute mic'], ['O', 'Sound & voice'], ['Esc', 'This menu']].map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</div>` : ''}
    <div class="row"><span class="muted">Room <b>${S.code}</b></span><button class="ghost red-t" style="margin-left:auto" onclick="leaveGame()">Leave game</button></div>
  </div></div>`;
}
function openPanel(tab) { window.BK.leaveGames && window.BK.leaveGames(); ui.open = true; if (tab) ui.tab = tab; document.exitPointerLock && document.exitPointerLock(); render(); }
function closePanel() { ui.open = false; render(); try { document.getElementById('world').requestPointerLock(); } catch {} }
window.BK = { get S() { return S; }, ui, send, openPanel, closePanel, now, toast, settings, openMenu, get drunk() { return drunkLevel(); } };
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (ui.menu) closeMenu(); else if (ui.shop) closeShop(); else if (ui.open) closePanel(); } });
function drunkLevel() { if (!S) return 0; return Math.max(0, S.me.drunk - (Date.now() - stateAt) / (S.me.decay || 6000)); }

// ---------- render ----------
let lastPhase = null;
// ---------- HUD hotkeys: pop-ups (bar fight, collectors, hitmen) appear while the mouse is captured for looking around,
// so every visible HUD button gets a number key (1-9) and Tab frees the cursor to click instead
// compact HUD: things that just changed show in full, then step back after a few seconds
function hudCompact() {
  document.body.classList.toggle('compact', !!settings.compact);
  if (!S || !S.me || !['play', 'hunt'].includes(S.phase) || !S.events) return;
  const g = goalText(); if (g !== ui.goalText) { ui.goalText = g; ui.goalAt = Date.now(); }
  const bs = JSON.stringify((S.me.bounties || []).map((b) => b.done)); if (bs !== ui.bSig) { ui.bSig = bs; ui.bAt = Date.now(); }
  const t = Date.now(), c = settings.compact;
  const ge = $('#goal'); if (ge) ge.classList.toggle('mini', c && t - ui.goalAt > 9000);
  const be = $('#bounty'); if (be) be.classList.toggle('mini', c && t - ui.bAt > 12000);
  for (const d of document.querySelectorAll('#app .hud-feed div[data-t]')) d.classList.toggle('gone', c && now() - Number(d.dataset.t) > 12000);
}
function hudHotkeys() {
  let k = 0;
  for (const b of document.querySelectorAll('#app .hud button')) {
    const old = b.querySelector('kbd.hk'); if (old) old.remove();
    if (b.disabled || !b.offsetParent || k >= 9) { b.removeAttribute('data-hk'); continue; }
    k++; b.dataset.hk = k; b.insertAdjacentHTML('afterbegin', `<kbd class="hk">${k}</kbd>`);
  }
  // first time a pop-up with buttons shows up, say how to use it
  const sig = [...document.querySelectorAll('#app .hud button[data-hk]')].map((b) => b.closest('.hud-event,.hunt')?.className || '').join('|');
  if (k && sig && sig !== ui.hkSig && document.pointerLockElement) toast(`Press 1${k > 1 ? '-' + k : ''} to choose, or Tab to use the mouse`, 'info');
  ui.hkSig = k ? sig : '';
  const help = document.querySelector('#app .hud-help'); if (help) help.textContent = `WASD move · Space jump · Mouse look · E interact · C crew/wire${k ? ' · 1-' + k + ' pop-up buttons · Tab free the mouse' : ''} · H ${settings.compact ? 'full' : 'compact'} HUD · Esc menu`;
}
addEventListener('keydown', (e) => {
  if (!S || !['play', 'hunt'].includes(S.phase) || ui.open || ui.shop || ui.menu || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
  if (e.code === 'KeyH' && !e.repeat) { settings.compact = !settings.compact; saveSettings(); toast(settings.compact ? 'Compact HUD on (H)' : 'Full HUD (H)', 'info'); render(); return; }
  if (e.code === 'Tab') { e.preventDefault(); if (document.pointerLockElement) { window.BK.freeMouse = true; document.exitPointerLock(); } else { try { document.getElementById('world').requestPointerLock(); } catch {} } return; }
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code); if (!m || e.repeat) return;
  const b = document.querySelector(`#app .hud button[data-hk="${m[1]}"]`); if (!b || b.disabled) return;
  e.preventDefault(); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.click(); window.BK.sfx && window.BK.sfx('click');
});
function render() {
  if (S && S.phase !== lastPhase) {
    if (S.phase !== 'play') ui.open = false;
    if (S.phase === 'play') ui.tab = 'book';
    lastPhase = S.phase;
  }
  if (S && S.cur && ui.sel && ui.selIdx !== S.cur.idx) ui.sel = null;
  if (S && ui.pendingPool) { if (S.me.pool) { ui.pendingPool = null; window.BK.startGame && window.BK.startGame('pool', S.me.pool); } else if (Date.now() - ui.pendingPool.at > 4000) ui.pendingPool = null; }
  if (S && ui.pending) { if (S.me.challenge && S.me.challenge.game === ui.pending.game) { const g = ui.pending.game; ui.pending = null; window.BK.startGame && window.BK.startGame(g, S.me.challenge); } else if (Date.now() - ui.pending.at > 4000) ui.pending = null; }
  document.body.classList.toggle('ingame', !!S && ['play', 'hunt'].includes(S.phase));
  if (S && S.phase === 'ended' && S.summary) { const mine = S.summary.players.find((p) => p.id === S.you), key = S.code + ':' + S.summary.year; if (mine && ui.paid !== key) { ui.paid = key; save.tix += mine.tickets; persist(); toast(`+${mine.tickets} 🎟 tickets earned!`, 'win'); } }
  if (window.BKC) window.BKC.preview.setHost(ui.shop && !ui.reveal ? '#shopPrev' : null);
  const a = document.activeElement, keep = a && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  const app = $('#app');
  if (!S) app.innerHTML = joinView();
  else if (S.phase === 'lobby') app.innerHTML = lobbyView();
  else if (S.phase === 'ended') app.innerHTML = endView();
  else app.innerHTML = gameView();
  if (ui.shop) app.insertAdjacentHTML('beforeend', shopView());
  if (ui.menu && S && ['play', 'hunt'].includes(S.phase) && !ui.open && !ui.shop) app.insertAdjacentHTML('beforeend', menuView()); else ui.menu = false;
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch {} } }
  tick(); hudHotkeys(); hudCompact();
  window.BK.onRender && window.BK.onRender();
}

// loading bar for the 3D bar (models stream in while you type your name; world.js flips __worldReady when done)
function loadBar(cls = '') {
  if (window.__worldReady) return '';
  const L = window.__load || { done: 0, total: 0 }, pct = L.total ? Math.round((L.done / L.total) * 100) : 0;
  return `<div id="loadbar" class="${cls}"><span>Loading the bar... ${pct}%</span><b><i style="width:${pct}%"></i></b></div>`;
}
function joinView() {
  return `<div class="center"><div class="card col" style="width:min(420px,100%)">
    <div class="logo">BALL<br><span>KNOWLEDGE</span><i class="ball"></i></div>
    <div class="tag">Pick a sport. We pick the season. Know your ball - or find another way to win.</div>
    ${ui.rejoining ? `<div class="muted">Rejoining room <b>${esc(sess.code)}</b>...</div>` : ''}${err ? `<div class="bad">${esc(err)}</div>` : ''}
    <input id="name" placeholder="Your name" maxlength="16">
    ${loadBar()}
    <button onclick="doJoin()">Create a crew</button>
    <div class="row"><input id="code" placeholder="Room code" maxlength="4" style="text-transform:uppercase"><button class="ghost fit" onclick="doJoin(true)">Join</button></div>
  </div></div>`;
}
function doJoin(withCode) {
  const name = $('#name').value, code = withCode ? $('#code').value : undefined;
  if (withCode && !code) return;
  ui.rejoining = ui.reconnecting = false; connect({ type: 'join', name, code });
}

const playerList = () => S.players.map((p) => `<div class="pl"><span>${esc(p.name)}${p.id === S.you ? ' (you)' : ''}${!p.connected ? ' 📴' : ''}${p.drunk >= 15 ? ' 🍺' : ''}</span>
  <span>${S.phase === 'lobby' ? '' : `<span class="ok">${$$(p.money)}</span>${p.hunted ? ' 🎯' : ''}`}</span></div>`).join('');

function lobbyView() {
  return `<div class="wrap"><div class="card col">
    <div class="top"><div class="logo sm">BALL <span>KNOWLEDGE</span><i class="ball"></i></div><div class="pill">Room <b>${S.code}</b></div></div>
    <div class="muted">Share the room code. Up to 6 players, co-op. Everyone starts with $2,000. A full season of <b>10 real games</b> is waiting - one new game opens for betting every couple of minutes.</div>
    ${loadBar()}
    <div class="title">Crew</div>${playerList()}
    <div class="title">${S.host ? 'Choose your sport' : 'The host is choosing a sport...'}</div>
    <div class="sports">${S.sports.map((s) => `<button class="sport ${S.sport === s.id ? 'sel' : ''}" ${S.host ? '' : 'disabled'} onclick="send({type:'setSport',sport:'${s.id}'})"><span class="e">${s.emoji}</span>${esc(s.label)}</button>`).join('')}</div>
    <div class="title">Pace</div>
    <div class="row">${S.paces.map((p) => `<button class="sport ${S.pace === p.id ? 'sel' : ''}" ${S.host ? '' : 'disabled'} onclick="send({type:'setPace',pace:'${p.id}'})">${esc(p.label)}</button>`).join('')}</div>
    <button class="ghost" onclick="openShop()">🛍️ Pro Shop · 🎟 ${save.tix} tickets</button>
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
  const st = $('#shaket'); if (st && S.shake) st.textContent = mmss(S.shake.until - now());
  const dm = $('#drunkfill'); if (dm) { const d = drunkLevel(); dm.style.width = Math.round(d) + '%'; dm.parentElement.style.filter = `blur(${Math.max(0, (d - 20) / 22).toFixed(1)}px)`; }
}
setInterval(() => { if (S) { tick(); hudCompact(); } }, 250);

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
  if (S.shake) return '💼 Sal\'s collectors are in the bar! Chip in together - or punch and bottle them out.';
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
  const extra = ui.tab === 'bar' ? [['bar', '🍺 Bar']] : ui.tab === 'wheel' ? [['wheel', '🎰 Roulette']] : ui.tab === 'challenge' ? [['challenge', '🎯 Challenge']] : ui.tab === 'pool' ? [['pool', '🎱 Pool']] : [];
  const tabs = [['book', '📱 Sportsbook'], ['bets', '🧾 My Bets'], ['mob', '🕴️ The Mob'], ['crew', '👥 Crew'], ...extra];
  const body = { book: bookView, bets: betsView, mob: mobView, crew: crewView, bar: barView, wheel: wheelView, challenge: challengeView, pool: typeof poolView === 'function' ? poolView : () => '' }[ui.tab]();
  if (!window.__worldReady) return `<div class="center"><div class="card col" style="width:min(420px,100%)"><div class="big">Getting the bar ready...</div>${loadBar()}<div class="muted">Your crew can already see you. The game has started - you'll be dropped in as soon as the bar finishes loading.</div></div></div>`;
  return `<div class="hud">
    <div class="hud-top">
      <div class="row" style="gap:8px;justify-content:flex-start"><span class="pill">Room ${S.code}</span></div>
      <div class="strip">${strip()}</div>
      <div class="row" style="gap:8px;justify-content:flex-end"><span class="pill money">${$$(me.money)}</span>${me.mobTied ? `<span class="pill debt">Owe ${$$(me.debt)}</span>` : ''}
      <span class="pill drunkp" title="Drunk confidence">🍺<span class="dm"><span id="drunkfill" style="width:${me.drunk}%"></span></span></span></div>
    </div>
    ${ui.reconnecting ? '<div class="reconn">📶 Connection lost - reconnecting...</div>' : ''}
    <div class="hud-clock"><span class="pill time" id="timer"></span></div>
    <div class="hud-goal" id="goal">${goalText()}</div>
    ${quotaHud()}${eventBanner()}${bountyHud()}${shakeBanner()}
    ${hunt ? huntBanner() : ''}
    <div class="hud-crew">${playerList()}</div>
    <div class="hud-feed">${[...S.feed].slice(-4).reverse().map((f) => `<div data-t="${f.t}">${esc(f.text)}</div>`).join('')}</div>
    <div class="hud-help">WASD move · Mouse look · E interact · C crew/wire · Esc menu</div>
  </div>
  ${ui.open ? `<div class="overlay"><div class="panel">
    <div class="tabs">${tabs.map(([id, l]) => `<button class="${id === 'mob' ? 'mob ' : ''}${ui.tab === id ? 'on' : ''}" onclick="ui.tab='${id}';render()">${l}</button>`).join('')}
    <button class="ghost" style="flex:0 0 auto" onclick="closePanel()">✕</button></div>${body}</div></div>` : ''}`;
}
const grabbed = () => !!(window.BK.goons && window.BK.goons.held[S.you]);
function huntBanner() {
  const me = S.me, pct = Math.max(0, (S.hunt.hp / Math.max(1, S.hunt.maxHp)) * 100), held = grabbed();
  return `<div class="card hunt col ${held ? 'held' : ''}" style="margin-bottom:12px">
    <div class="big">${held ? '🫱 A hitman has you!' : '🔫 The hitmen are here'} <span class="pill time" id="huntt"></span></div>
    <div class="muted">${held ? `<b class="bad">He's shaking the money out of you.</b> Your crew can punch him or bottle him to break you free - or pay what you owe.` : me.remaining > 0 ? `<b class="bad">They want ${$$(me.remaining)} from YOU.</b> Pay, win it back (arcade, pool, roulette), get a crewmate to wire you cash, or beat them down together. Bottles stun them.` : 'You are clear - help your crew: punch the hitmen (click when close) or throw bottles.'}</div>
    <div class="hp"><div style="width:${pct}%"></div></div><div class="muted">Hitmen health: ${S.hunt.hp} / ${S.hunt.maxHp}</div>
    ${me.remaining > 0 ? `<div class="row"><button class="gold" onclick="send({type:'pay'})" ${me.money <= 0 ? 'disabled' : ''}>Pay what I can (${$$(Math.min(me.money, me.remaining))})</button></div>` : ''}</div>`;
}

// ---------- sportsbook ----------
const badge = (t) => `<span class="crest" style="--c:${t.color}"><b>${esc(t.short)}</b></span>`;
function teamCard(t, side, cur, ev) {
  return `<div class="tc">${badge(t)}<div class="tn">${esc(t.name)}</div><div class="tr">${esc(t.rec)}${t.home ? ' · <span class="ok">HOME</span>' : ev.n ? ' · neutral' : ' · away'}</div></div>`;
}

function oddBtn(market, pick, top, main, hinted) {
  const cur = S.cur, mine = (S.me.bets[cur.idx] || {})[market], placed = mine && mine.pick === pick, sel = ui.sel && ui.sel.market === market && ui.sel.pick === pick;
  return `<button class="odd ${sel ? 'sel' : ''} ${placed ? 'placed' : ''} ${hinted ? 'hinted' : ''}" onclick="selectOdd('${market}','${pick}')"><span class="ot">${esc(top)}</span><b>${main}</b>${placed ? `<i>✓ ${$$(mine.stake)}</i>` : ''}${hinted ? '<em>💡</em>' : ''}</button>`;
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
function placeSel() { if (!ui.sel) return; window.BK.sfx && window.BK.sfx('bet'); send({ type: 'bet', ev: S.cur.idx, market: ui.sel.market, pick: ui.sel.pick, stake: ui.stake }); ui.sel = null; }

function bookView() {
  if (!S.cur) {
    const next = S.events.find((e) => e.status === 'upcoming');
    return `<div class="card col"><div class="big">No game is open right now</div>
      <div class="muted">${next ? `Next up: <b>${esc(next.label)}</b> - ${esc(next.a)} vs ${esc(next.b)}. Opens in <b>${mmss(next.openAt - now())}</b>.` : 'All games have closed. Watch the highlights on the TV and wait for the finals.'}</div>
      <div class="muted">Tip: grab a drink at the bar. Drunk confidence is real... until you have one too many.</div></div>`;
  }
  const cur = S.cur, ev = S.events[cur.idx], mk = cur.mk, h = cur.hint, A = cur.intel.a, B = cur.intel.b;
  if (S.me.banUntil != null && cur.idx <= S.me.banUntil) return `<div class="card col"><div class="big">🚨 You're barred from the sportsbook</div><div class="muted">The league caught your fix. No bets until after game ${S.me.banUntil + 1}. You can still drink, hustle the arcade, play pool and roulette - and your crew can still bet.</div></div>`;
  const hs = (m, v) => !!(h && h[m] && (h[m].side === v || h[m].pick === v));
  const crew = cur.crew, ctot = crew.a + crew.b, sport = (S.sports.find((s) => s.id === S.sport) || {}).label || '';
  const sp = (s) => `${s.short} ${mk.spread[s === A ? 'a' : 'b'].line > 0 ? '+' : ''}${mk.spread[s === A ? 'a' : 'b'].line}`;
  return `<div class="sb">
    <div class="sb-head"><div><div class="title">${esc(sport.toUpperCase())} · MYSTERY SEASON</div><div class="big">${esc(ev.label)}</div><div class="muted">Game ${ev.idx + 1} of ${S.events.length}${cur.series ? ' · ' + esc(cur.series) : ''}${ev.final ? ' · 🏆 CHAMPIONSHIP' : ''}</div></div>
      <div class="clock"><div class="muted">BETTING CLOSES IN</div><div id="tl2" class="tl2"></div></div></div>
    <div class="tlbar"><div id="tlbar"></div></div>
    <div class="matchup">${teamCard(A, 'a', cur, ev)}<div class="vs">VS</div>${teamCard(B, 'b', cur, ev)}</div>
    ${ev.final ? '<div class="champ-note">To win the game you need a <b>Moneyline</b> bet on the champion of this game.</div>' : ''}
    ${cur.tip ? `<div class="tipcard">🗒️ <b>${esc(cur.tip.from)}</b> slid a napkin across the bar: "I like <b>${esc(cur.intel[cur.tip.side].name)}</b> tonight." <span class="muted">(unverified)</span></div>` : ''}
    ${h ? hintView(h) : ''}
    <div class="mgrid">
      <div class="mcol"><div class="mh ${(ui.sel ? ui.sel.market : 'ml') === 'ml' ? 'on' : ''}">Moneyline</div>${oddBtn('ml', 'a', A.short, mk.ml.a.am, hs('ml', 'a'))}${oddBtn('ml', 'b', B.short, mk.ml.b.am, hs('ml', 'b'))}</div>
      <div class="mcol"><div class="mh ${ui.sel && ui.sel.market === 'spread' ? 'on' : ''}">Spread</div>${oddBtn('spread', 'a', sp(A), amer(mk.spread.a.dec), hs('spread', 'a'))}${oddBtn('spread', 'b', sp(B), amer(mk.spread.b.dec), hs('spread', 'b'))}</div>
      <div class="mcol"><div class="mh ${ui.sel && ui.sel.market === 'total' ? 'on' : ''}">Total</div>${oddBtn('total', 'over', `O ${mk.total.line}`, '-110', hs('total', 'over'))}${oddBtn('total', 'under', `U ${mk.total.line}`, '-110', hs('total', 'under'))}</div>
    </div>
    ${ui.sel ? slipView() : `<div class="muted" style="margin:2px 4px">Tap any price to build your bet slip.</div>`}
    ${betList(cur.idx)}
    <div class="intel"><div class="itabs">${[['stats', 'Team Stats'], ['players', 'Player Stats'], ['form', 'Form'], ['crew', 'Crew Picks']].map(([id, l]) => `<button class="${ui.intelTab === id ? 'on' : ''}" onclick="ui.intelTab='${id}';render()">${l}</button>`).join('')}</div>
      ${ui.intelTab === 'stats' ? `<div class="ig">${[A, B].map(teamStats).join('')}</div>` : ui.intelTab === 'players' ? `<div class="ig">${[A, B].map(playerStats).join('')}</div>` : ui.intelTab === 'form' ? `<div class="ig">${[A, B].map(teamForm).join('')}</div>`
        : `<div class="crewp"><div class="muted">Moneyline picks from your crew</div><div class="cbar"><div style="width:${ctot ? crew.a / ctot * 100 : 50}%;background:${A.color}"></div><div style="flex:1;background:${B.color}"></div></div><div class="row"><span>${esc(A.short)}: ${crew.a}</span><span style="text-align:right">${esc(B.short)}: ${crew.b}</span></div></div>`}</div>
  </div>`;
}

function teamStats(t) {
  return `<div class="ts"><div class="tsh">${badge(t)} <b>${esc(t.name)}</b></div><div class="muted">Record <b>${esc(t.rec)}</b>${t.home ? ' · home team' : ''}</div>
    ${t.note ? `<div class="note">${esc(t.note)}</div>` : '<div class="muted">No scouting notes.</div>'}</div>`;
}
function playerStats(t) {
  return `<div class="ts"><div class="tsh">${badge(t)} <b>${esc(t.name)}</b></div>${t.stars.map(([n, l]) => `<div class="star"><span>${esc(n)}</span><b>${esc(l)}</b></div>`).join('') || '<div class="muted">No star data.</div>'}</div>`;
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
  const lines = ['ml', 'spread', 'total'].filter((m) => h[m]).map((m) => `<div class="hl"><b>${{ ml: 'Winner', spread: 'Spread', total: 'Total' }[m]}:</b> ${esc(h[m].text)} <span class="fire">${'🔥'.repeat(h[m].conf)}</span></div>`).join('');
  const head = { gut: 'GUT FEELING', confident: 'DRUNK CONFIDENCE', wasted: 'WASTED WISDOM' }[h.level] || 'HINT', foot = { gut: '(Faint. Barely better than a coin flip.)', confident: '(Feels like a lock. Is it? Only if you got the buzz just right.)', wasted: '(You are way too drunk. Do not trust any of this.)' }[h.level] || '';
  return `<div class="hint ${h.level}"><div class="hbulb">💡</div><div class="hbody"><div class="htitle">${head}</div>${lines}<div class="hfoot">${foot}</div></div></div>`;
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
      <div class="muted">If someone fixes it the other way, the mob keeps both fees and nothing changes. <b>The league is watching:</b> every fix you buy raises your heat, bigger upsets draw more attention, and the final is the riskiest. If they catch it, the game is voided, Sal still wants his fee, and you're barred from betting for 2 games. A fixed title goes in the books as VACATED.</div>
      <div class="heat">Your heat: ${'🔥'.repeat(Math.min(5, me.heat || 0)) || 'cool'}${me.banUntil != null && cur && cur.idx <= me.banUntil ? ` · <b class="bad">barred until after game ${me.banUntil + 1}</b>` : ''}</div>
      ${cur ? `<div class="match2">${['a', 'b'].map((s) => `<button class="team ${fixed === s ? 'fix' : ''}" onclick="send({type:'fix',ev:${cur.idx},side:'${s}'})">${esc(cur.intel[s].name)} wins<span class="risk ${cur.fixRisk[s] >= 40 ? 'hi' : ''}">${cur.fixRisk[s]}% chance the league catches it</span></button>`).join('')}</div>
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
  const d = Math.round(drunkLevel()), b = d < 20 ? 'sober' : d < 45 ? 'warm' : d < 65 ? 'loose' : d < 82 ? 'hammered' : 'wrecked', blur = Math.max(0, (d - 20) / 14);
  return `<div class="chalk"><div class="chalk-h">DRINKS</div>
    <div class="chalk-say">Bartender: "What'll it be? First one's always full price."</div>
    ${S.drinks.map((x) => `<div class="chalk-row"><span class="cn">${x.emoji} ${esc(x.name)}</span><span class="cd"></span><span class="cp">${$$(x.price)}</span><button class="chalkbtn" ${S.me.money < x.price || d >= 100 ? 'disabled' : ''} onclick="BK.sfx&&(BK.sfx('pour'),BK.sfx('gulp',{delay:1.1}),BK.sfx('glass',{delay:0.95}));send({type:'drink',id:'${x.id}'})">Order</button></div><div class="chalk-sub">${esc(x.blurb)} (+${x.add} buzz)</div>`).join('')}
    <div class="dmeter" style="margin-top:14px;filter:blur(${blur.toFixed(1)}px)"><div style="width:${d}%"></div></div>
    <div class="chalk-sub">You feel <b>${b}</b>${d < 20 ? ` (${d}%)` : ''}. ${S.me.hangover ? '<b>Your head is pounding</b> - no gut feelings until it passes. ' : ''}Somewhere in the buzz your gut gets good: right more often than not. Go past it and it lies to you just as confidently - then the hangover hits. Everyone's sweet spot is different, and it wears off over time.</div></div>`;
}

// roulette: a clickable felt layout. Click a spot to drop the selected chip on it (again to stack), right-click to take one off.
const RREDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const RPAY = (pk) => (/^\d+$/.test(pk) ? '35:1' : /^[dc]/.test(pk) ? '2:1' : '1:1');
function rCell(pk, label, cls, style = '') {
  const amt = ui.rBets[pk] || 0;
  return `<div class="rc ${cls}" style="${style}" title="${esc(label)} pays ${RPAY(pk)}" onclick="rBet('${pk}')" oncontextmenu="event.preventDefault();rBet('${pk}',-1)"><span>${label}</span>${amt ? `<i class="rchip">${amt >= 1000 ? (amt / 1000).toFixed(amt % 1000 ? 1 : 0) + 'k' : amt}</i>` : ''}</div>`;
}
function wheelView() {
  const busy = S.spinning, total = Object.values(ui.rBets).reduce((a, b) => a + b, 0);
  let grid = rCell('0', '0', 'g', 'grid-row:1/4;grid-column:1');
  for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) { const n = col * 3 + (3 - row); grid += rCell(String(n), String(n), RREDS.has(n) ? 'r' : 'k', `grid-row:${row + 1};grid-column:${col + 2}`); }
  ['c3', 'c2', 'c1'].forEach((c, row) => (grid += rCell(c, '2:1', 'o', `grid-row:${row + 1};grid-column:14`)));
  ['1st 12', '2nd 12', '3rd 12'].forEach((l, i) => (grid += rCell('d' + (i + 1), l, 'o', `grid-row:4;grid-column:${2 + i * 4}/span 4`)));
  [['low', '1-18', 'o'], ['even', 'EVEN', 'o'], ['red', '◆ RED', 'r'], ['black', '◆ BLACK', 'k'], ['odd', 'ODD', 'o'], ['high', '19-36', 'o']].forEach(([pk, l, c], i) => (grid += rCell(pk, l, c, `grid-row:5;grid-column:${2 + i * 2}/span 2`)));
  return `<div class="card col rtable"><div class="big">🎰 Roulette</div>
    <div class="muted">${busy ? `The wheel is spinning for ${esc(busy.by)}...` : 'Pick a chip, click the felt to place bets (right-click removes), then spin. Numbers pay 35:1, dozens/columns 2:1, red/black/odd/even/high/low 1:1. Zero beats every outside bet.'}</div>
    <div class="row rchips">${[10, 25, 50, 100, 250, 500].map((v) => `<button class="chipb c${v} ${ui.rChip === v ? 'on' : ''}" onclick="ui.rChip=${v};render()">${v}</button>`).join('')}</div>
    <div class="rgrid">${grid}</div>
    <div class="row" style="align-items:center"><div class="big" style="font-size:20px">Total bet <b class="${total > S.me.money ? 'bad' : ''}">${$$(total)}</b></div>
      <button onclick="rUndo()" ${ui.rHist.length ? '' : 'disabled'}>Undo</button><button onclick="ui.rBets={};ui.rHist=[];render()" ${total ? '' : 'disabled'}>Clear</button>
      <button class="red" style="margin-left:auto" ${busy || !total || total > S.me.money ? 'disabled' : ''} onclick="spinNow()">SPIN THE WHEEL</button></div></div>`;
}
function rBet(pk, dir = 1) {
  const cur = ui.rBets[pk] || 0;
  if (dir > 0) { ui.rBets[pk] = cur + ui.rChip; ui.rHist.push([pk, ui.rChip]); window.BK.sfx && window.BK.sfx('chip'); }
  else if (cur) { const d = Math.min(cur, ui.rChip); if (cur - d) ui.rBets[pk] = cur - d; else delete ui.rBets[pk]; ui.rHist.push([pk, -d]); }
  render();
}
function rUndo() { const h = ui.rHist.pop(); if (!h) return; const [pk, d] = h, v = (ui.rBets[pk] || 0) - d; if (v > 0) ui.rBets[pk] = v; else delete ui.rBets[pk]; render(); }
function spinNow() {
  const bets = Object.entries(ui.rBets).map(([pick, stake]) => ({ pick, stake }));
  if (!bets.length) return toast('Put some chips on the table first.', 'err');
  window.BK.sfx && window.BK.sfx('chip'); send({ type: 'roulette', bets }); ui.lastRBets = ui.rBets; ui.rBets = {}; ui.rHist = []; closePanel();
}

function endView() {
  const s = S.summary, host = S.host;
  return `<div class="center"><div class="card col" style="width:min(560px,100%)">
    <div class="logo" style="font-size:34px">${s.crewWon ? (s.vacated ? '<span>TITLE VACATED*</span>' : '<span>YOU WIN</span>') : 'GAME OVER'}</div>
    ${s.vacated ? '<div class="bad">* The championship was fixed. The league struck your title from the books (half the crew bonus).</div>' : ''}${s.voidedFinal ? '<div class="bad">🚨 The league caught a fix on the championship and voided it. Nobody gets the title.</div>' : ''}
    <div class="tag">${s.correct}/${s.total} called the title</div>
    <div class="title">The season was</div>
    <div class="big">${s.year} ${esc(s.league)}</div>
    <div class="muted">${esc(s.blurb || '')}</div>
    <div>Real champion: <b>${esc(s.champion)}</b></div>
    <div>${s.altered ? `History was rewritten - your champion was <b>${esc(s.finalWinner)}</b>.` : 'History played out as it happened.'}</div>
    ${s.players.map((p) => `<div class="pl"><span>${esc(p.name)} ${p.finalCorrect ? '✅' : '❌'}</span><span>${p.fate === 'dead' ? '💀 dead' : esc(p.fate)} · ${$$(p.money)} · +${p.tickets}🎟</span></div>`).join('')}
    <button class="ghost" onclick="openShop()">🛍️ Spend tickets · 🎟 ${save.tix}</button>
    ${host ? `<button onclick="send({type:'rematch'})">Back to lobby</button>` : '<div class="muted">Waiting for host...</div>'}</div></div>`;
}

// ---------- quota / bounties / events ----------
function quotaHud() {
  if (!S.quota) return '';
  const nxt = S.quota.find((q) => q.status === 'pending');
  const chips = S.quota.map((q) => `<span class="qc ${q.status}" title="After game ${q.idx + 1}: ${$$(q.target)}">${q.status === 'met' ? '✓' : q.status === 'missed' ? '✗' : q.idx + 1}</span>`).join('');
  if (!nxt) return `<div class="hud-quota"><div class="qt">SAL'S QUOTAS <span class="qchips">${chips}</span></div><div class="muted">All quotas settled.</div></div>`;
  const pct = Math.max(0, Math.min(100, (S.crewNow / nxt.target) * 100)), ok = S.crewNow >= nxt.target;
  return `<div class="hud-quota"><div class="qt">SAL'S QUOTA <span class="qchips">${chips}</span></div><div class="qbar ${ok ? 'ok' : ''}"><div style="width:${pct}%"></div></div><div class="muted">Crew net worth <b>${$$(S.crewNow)}</b> / ${$$(nxt.target)} by Game ${nxt.idx + 1}${nxt.kind === 'final' ? ' (final)' : ''}</div></div>`;
}
function bountyHud() {
  const b = S.me.bounties || []; if (!b.length) return '';
  const done = b.filter((x) => x.done).length;
  return `<div class="hud-bounty" id="bounty"><div class="bmini">🎯 BOUNTIES · ${done}/${b.length} done <span class="muted">(H shows all)</span></div><div class="qt">🎯 BOUNTIES</div>${b.map((x) => `<div class="bn ${x.done ? 'done' : ''}">${x.done ? '✅' : '☐'} ${esc(x.text)} <b>+${x.reward}🎟</b></div>`).join('')}</div>`;
}
// bar fight bets work from the keyboard: the banner pops up while the mouse is captured for looking around, so there is no cursor to click it
const FIGHT_STAKES = [50, 100, 300];
function fightOpen() { const be = S && S.barEvent; return !!(be && be.kind === 'fight' && !be.mine && now() < be.betUntil); }
function fightBet(side) { if (!fightOpen()) return; if (S.me.money < ui.fightStake) return toast(`You need ${$$(ui.fightStake)} to bet that.`, 'err'); window.BK.sfx && window.BK.sfx('chip'); send({ type: 'fightBet', side, stake: ui.fightStake }); }
function fightStakeNext() { ui.fightStake = FIGHT_STAKES[(FIGHT_STAKES.indexOf(ui.fightStake) + 1) % FIGHT_STAKES.length]; render(); }
function eventBanner() {
  const be = S.barEvent; if (!be) return '';
  const base = `<div class="hud-event ${be.kind}"><div class="et">${esc(be.title)} <span class="pill time">${mmss(be.until - now())}</span></div><div>${esc(be.text)}</div>`;
  if (be.kind === 'fight') {
    if (be.mine) return base + `<div class="muted">You bet ${$$(be.mine.stake)} on ${esc(be.mine.side === 'red' ? be.red : be.blue)}.</div></div>`;
    if (now() < be.betUntil) { const st = ui.fightStake; return base + `<div class="row"><button class="red" onclick="fightBet('red')">🔴 ${esc(be.red)} · ${$$(st)}</button><button class="blue" onclick="fightBet('blue')">🔵 ${esc(be.blue)} · ${$$(st)}</button><button class="ghost fit" onclick="fightStakeNext()">Stake ${$$(st)} ▸</button></div></div>`; }
  }
  return base + '</div>';
}
function shakeBanner() {
  const sh = S.shake; if (!sh) return '';
  const pct = Math.max(0, (sh.hp / Math.max(1, sh.maxHp)) * 100), held = grabbed();
  return `<div class="card hunt col ${held ? 'held' : ''}"><div class="big">${held ? '🫳 A collector is going through your pockets' : "💼 Sal's collectors"} <span class="pill time" id="shaket"></span></div>
    <div class="muted">The crew missed the quota. They want <b class="bad">${$$(sh.tax - sh.paid)}</b> more and they'll pat everyone down to get it. Chip in, or throw them out: punch them up close, or bottle them.</div>
    <div class="hp"><div style="width:${pct}%"></div></div>
    <div class="row"><button class="gold" onclick="send({type:'shakePay',amount:100})">Pay $100</button><button class="gold" onclick="send({type:'shakePay',amount:500})">Pay $500</button></div></div>`;
}

// ---------- arcade challenge board ----------
window.BK.openChallenge = (g) => { ui.chGame = g; openPanel('challenge'); };
function challengeView() {
  const g = ui.chGame || 'darts', title = { darts: '🎯 Darts', bowling: '🎳 Bowling', cornhole: '🌽 Cornhole' }[g];
  const open = S.me.challenge && S.me.challenge.game === g ? S.me.challenge : null, streak = (S.me.streak || {})[g] || 0;
  if (open) return `<div class="card col"><div class="big">${title} - open challenge</div>
    <div class="muted"><b>${esc({ rookie: 'The Rookie', regular: 'The Regular', shark: 'The Shark' }[open.opp])}</b> posted a score of <b class="gold">${open.target}</b>. Beat it to win <b class="ok">${$$(open.stake * open.mult)}</b> (stake ${$$(open.stake)}).</div>
    <div class="row"><button onclick="resumeChallenge()">Take my shot</button><button class="ghost" onclick="cancelChallenge()">Walk away (refund)</button></div></div>`;
  const opps = [['rookie', '🧒', 'The Rookie', 'Easy', 1.6], ['regular', '🧔', 'The Regular', 'A fair fight', 2.0], ['shark', '🦈', 'The Shark', 'Brutal', 2.8]];
  const sel = ui.chOpp || 'regular', stake = ui.chStake || 50;
  return `<div class="card col"><div class="big">${title} - challenge board</div>
    <div class="muted">Pick an opponent. They shoot first and post a score. <b>Beat it</b> and you win the payout; lose and the house keeps your stake. Win streaks make them harder (+7% per win, your streak: <b>${streak}</b>). Practice is free - but pays nothing.</div>
    <div class="opps">${opps.map(([id, ico, n, d, m]) => `<button class="opp ${sel === id ? 'sel' : ''}" onclick="ui.chOpp='${id}';render()"><span class="oi">${ico}</span><b>${n}</b><span class="muted">${d}</span><span class="gold">Pays ${m}x</span></button>`).join('')}</div>
    <div class="chips">${[25, 50, 100, 200, 300].map((v) => `<button class="${stake === v ? 'sel' : ''}" onclick="ui.chStake=${v};render()">${$$(v)}</button>`).join('')}</div>
    <div class="row"><button ${S.me.money < stake ? 'disabled' : ''} onclick="postChallenge()">Post challenge · ${$$(stake)} → win ${$$(stake * (opps.find((o) => o[0] === sel)[4]))}</button><button class="ghost" onclick="startPractice()">Practice (free)</button></div></div>`;
}
function postChallenge() { send({ type: 'challenge', game: ui.chGame, opp: ui.chOpp || 'regular', stake: ui.chStake || 50 }); ui.pending = { game: ui.chGame, at: Date.now() }; closePanel(); }
function startPractice() { closePanel(); window.BK.startGame && window.BK.startGame(ui.chGame, null); }
function resumeChallenge() { const ch = S.me.challenge; closePanel(); window.BK.startGame && window.BK.startGame(ch.game, ch); }
function cancelChallenge() { send({ type: 'challengeCancel' }); render(); }

// ---------- pool ----------
window.BK.openPool = () => openPanel('pool');
function poolView() {
  const open = S.me.pool, NAME = { rookie: 'The Rookie', shark: 'The Shark' };
  if (open) return `<div class="card col"><div class="big">🎱 Game in progress</div><div class="muted">${$$(open.stake)} on the table against <b>${NAME[open.opp]}</b>. Walking away forfeits the stake.</div>
    <div class="row"><button onclick="closePanel();BK.startGame('pool', S.me.pool)">Back to the table</button><button class="ghost" onclick="send({type:'poolEnd',won:false});render()">Forfeit</button></div></div>`;
  const sel = ui.poolOpp || 'rookie', stake = ui.poolStake || 50, mult = { rookie: 1.7, shark: 2.6 }[sel];
  return `<div class="card col"><div class="big">🎱 Pool - 8-ball showdown</div>
    <div class="muted">You shoot <b>solids</b>, they shoot <b>stripes</b>. Clear your four balls, then sink the 8. Mouse aims, hold click to charge, release to shoot. Sinking the 8 early - or scratching on it - loses. Winners take the pot.</div>
    <div class="opps" style="grid-template-columns:repeat(2,1fr)">${[['rookie', '🧒', 'The Rookie', 'Shaky aim', 1.7], ['shark', '🦈', 'The Shark', 'Runs the table', 2.6]].map(([id, ico, n, d, m]) => `<button class="opp ${sel === id ? 'sel' : ''}" onclick="ui.poolOpp='${id}';render()"><span class="oi">${ico}</span><b>${n}</b><span class="muted">${d}</span><span class="gold">Pays ${m}x</span></button>`).join('')}</div>
    <div class="chips">${[25, 50, 100, 250, 500].map((v) => `<button class="${stake === v ? 'sel' : ''}" onclick="ui.poolStake=${v};render()">${$$(v)}</button>`).join('')}</div>
    <div class="row"><button ${S.me.money < stake ? 'disabled' : ''} onclick="postPool()">Rack 'em · ${$$(stake)} → win ${$$(stake * mult)}</button><button class="ghost" onclick="closePanel();BK.startGame('pool',{opp:'${sel}',stake:0})">Practice (free)</button></div></div>`;
}
function postPool() { send({ type: 'poolStart', opp: ui.poolOpp || 'rookie', stake: ui.poolStake || 50 }); ui.pendingPool = { at: Date.now() }; closePanel(); }

// ---------- Pro Shop ----------
const SLOT_ICON = { head: '🧢', face: '🕶️', body: '👕', hand: '🏌️', back: '🦸' };
const CRATE = 25, DUP_REFUND = 6;
function openShop() { window.BK.leaveGames && window.BK.leaveGames(); ui.shop = true; ui.reveal = null; document.exitPointerLock && document.exitPointerLock(); render(); if (window.BKC) window.BKC.preview.set(save.eq); }
function closeShop() { ui.shop = false; ui.reveal = null; render(); if (S && ['play', 'hunt'].includes(S.phase) && !ui.open) { try { document.getElementById('world').requestPointerLock(); } catch {} } }
window.BK.openShop = openShop;
function equipItem(id) {
  const it = BKC.BY_ID[id]; if (!it || !save.inv.includes(id)) return;
  if (save.eq[it.slot] === id) delete save.eq[it.slot]; else save.eq[it.slot] = id;
  persist(); send({ type: 'cosmetics', cos: save.eq }); BKC.preview.set(save.eq); render();
}
function unequipSlot(slot) { delete save.eq[slot]; persist(); send({ type: 'cosmetics', cos: save.eq }); BKC.preview.set(save.eq); render(); }
function buyCrates(n) {
  const cost = n === 1 ? CRATE : CRATE * 5 - 15; if (save.tix < cost) return toast('Not enough tickets. Play a season to earn more.', 'err');
  save.tix -= cost; const got = [];
  for (let i = 0; i < n; i++) { const it = BKC.rollCrate(); const dup = save.inv.includes(it.id); if (dup) save.tix += DUP_REFUND; else save.inv.push(it.id); got.push({ id: it.id, dup }); }
  persist(); ui.reveal = got; if (window.BK.sfx) window.BK.sfx(got.some((g) => BKC.BY_ID[g.id].rarity === 'legendary' || BKC.BY_ID[g.id].rarity === 'epic') ? 'rare' : 'crate'); render();
}
function revealView() {
  return `<div class="reveal" onclick="ui.reveal=null;render()"><div class="rv-row">${ui.reveal.map(({ id, dup }) => { const it = BKC.BY_ID[id], R = BKC.RARITY[it.rarity]; return `<div class="rv-card" style="--rc:${R.color}"><div class="rv-r">${R.label.toUpperCase()}</div><div class="rv-i">${SLOT_ICON[it.slot]}</div><div class="rv-n">${esc(it.name)}</div><div class="muted">${dup ? 'Duplicate - scrapped for +6 🎟' : 'NEW! Added to your locker'}</div></div>`; }).join('')}</div><div class="muted" style="margin-top:12px">Click to continue</div></div>`;
}
function shopView() {
  if (!window.BKC) return '';
  const { CATALOG, RARITY, SLOTS } = window.BKC, own = new Set(save.inv), tab = ui.shopTab;
  const items = CATALOG.filter((c) => tab === 'all' || c.slot === tab).sort((a, b) => Object.keys(RARITY).indexOf(b.rarity) - Object.keys(RARITY).indexOf(a.rarity));
  return `<div class="overlay shop-ov"><div class="panel shop"><div class="row" style="justify-content:space-between;margin-bottom:8px"><div class="big">🛍️ Pro Shop</div><div class="row fit" style="gap:8px"><span class="pill gold">🎟 ${save.tix}</span><button class="ghost" onclick="closeShop()">✕</button></div></div>
    <div class="shop-grid"><div class="shop-left"><div id="shopPrev" class="prev"></div>
      <div class="eqs">${SLOTS.map(([s, l]) => { const id = save.eq[s], it = id && BKC.BY_ID[id]; return `<div class="eq" ${it ? `style="border-color:${RARITY[it.rarity].color}" onclick="unequipSlot('${s}')" title="Click to take off"` : ''}>${SLOT_ICON[s]} <span>${it ? esc(it.name) : l}</span></div>`; }).join('')}</div></div>
      <div class="shop-right"><div class="crates"><button class="gold" onclick="buyCrates(1)">📦 Mystery Crate · ${CRATE} 🎟</button><button class="gold" onclick="buyCrates(5)">📦×5 · ${CRATE * 5 - 15} 🎟</button></div>
        <div class="muted" style="margin:4px 2px 8px">Crates drop a random item. Rarer items are... rarer. Duplicates scrap for ${DUP_REFUND} 🎟. Collected ${own.size}/${CATALOG.length}. Earn tickets by finishing seasons and completing bounties.</div>
        <div class="itabs">${[['all', 'All'], ...SLOTS].map(([id, l]) => `<button class="${tab === id ? 'on' : ''}" onclick="ui.shopTab='${id}';render()">${l}</button>`).join('')}</div>
        <div class="items">${items.map((it) => { const R = RARITY[it.rarity], has = own.has(it.id), on = save.eq[it.slot] === it.id; return `<button class="item ${has ? '' : 'locked'} ${on ? 'on' : ''}" style="--rc:${R.color}" ${has ? `onclick="equipItem('${it.id}')"` : 'disabled'}><span class="ii">${has ? SLOT_ICON[it.slot] : '🔒'}</span><span class="in">${has ? esc(it.name) : '???'}</span><span class="ir">${R.label}</span>${on ? '<em>WEARING</em>' : ''}</button>`; }).join('')}</div></div></div>
    ${ui.reveal ? revealView() : ''}</div></div>`;
}
render();
if (sess) { ui.rejoining = true; render(); connect({ type: 'join', code: sess.code, token: sess.token }); }
