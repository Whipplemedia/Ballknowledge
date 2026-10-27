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
// what we wear: equipped cosmetics, plus a toe tag for the season after you got taken to the back room
const wearing = () => (save.toeTag === 'wearing' ? { ...save.eq, tag: 'toe_tag' } : save.eq);

// ---------- session: the server hands out a rejoin token; we keep it so a refresh, dropped wifi or server restart puts you back in your seat ----------
const SESS_KEY = 'bk_session_v1', SESS_MAX_AGE = 3 * 3600 * 1000;
let sess = (() => { try { const o = JSON.parse(localStorage.getItem(SESS_KEY)); return o && o.token && Date.now() - o.at < SESS_MAX_AGE ? o : null; } catch { return null; } })();
const saveSess = () => { try { if (sess) localStorage.setItem(SESS_KEY, JSON.stringify(sess)); else localStorage.removeItem(SESS_KEY); } catch {} };
function connect(msg) {
  const sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host); ws = sock;
  sock.onopen = () => { sock.send(JSON.stringify(msg)); sock.send(JSON.stringify({ type: 'cosmetics', cos: wearing() })); sock.send(JSON.stringify({ type: 'seen', ids: save.seen || [], tut: !!save.tutDone })); };
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'state') { S = m; skew = m.now - Date.now(); stateAt = Date.now(); err = ''; if (sess && Date.now() - sess.at > 60000) { sess.at = Date.now(); saveSess(); } render(); }
    else if (m.type === 'session') { const back = ui.reconnecting; sess = { code: m.code, token: m.token, at: Date.now() }; saveSess(); ui.reconnecting = false; ui.retryN = 0; if (back) toast('Reconnected.', 'win'); window.BK.onSession && window.BK.onSession(); }
    else if (m.type === 'toast') { toast(m.text, m.kind); if (/^🍸 .*(from the bartender|off your tab)/.test(m.text)) window.BK.vo && window.BK.vo.play('bt_thanks'); }
    else if (m.type === 'pos') window.BK.onPos && window.BK.onPos(m);
    else if (m.type === 'rtc') window.BK.onRtc && window.BK.onRtc(m);
    else if (m.type === 'bottle') window.BK.onBottle && window.BK.onBottle(m);
    else if (m.type === 'bottleGot') window.BK.onBottleGot && window.BK.onBottleGot(m);
    else if (m.type === 'goons') window.BK.onGoons && window.BK.onGoons(m);
    else if (m.type === 'goonDodge') window.BK.onGoonDodge && window.BK.onGoonDodge(m);
    else if (m.type === 'ko') window.BK.onKo && window.BK.onKo(m);
    else if (m.type === 'spin') window.BK.onSpin && window.BK.onSpin(m);
    else if (m.type === 'pelt') window.BK.onPelt && window.BK.onPelt(m);
    else if (m.type === 'kiss') window.BK.onKiss && window.BK.onKiss(m);
    else if (m.type === 'npcSay') window.BK.onNpcSay && window.BK.onNpcSay(m);
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
    ${ui.menuKeys ? `<div class="keys">${[['WASD', 'Move'], ['Shift', 'Run'], ['Space', 'Jump'], ['Mouse', 'Look'], ['E', 'Interact / sit / stand'], ['Click (or F)', 'Throw a bottle (when holding one)'], ['Space (mashed)', 'Break free when grabbed'], ['1-9', 'Pop-up buttons'], ['Tab', 'Free the mouse'], ['P', 'Phone: check your bets'], ['C', 'Crew & wire money'], ['H', 'Compact / full HUD'], ['V', 'Push-to-talk'], ['M', 'Mute mic'], ['O', 'Sound & voice'], ['Esc', 'This menu']].map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</div>` : ''}
    <div class="row"><span class="muted">Room <b>${S.code}</b></span>${save.tutDone ? `<button class="ghost" onclick="napkinReset()">↺ Guide me again next first night</button>` : ''}<button class="ghost red-t" style="margin-left:auto" onclick="leaveGame()">Leave game</button></div>
  </div></div>`;
}
function openPanel(tab) { window.BK.leaveGames && window.BK.leaveGames(); ui.open = true; if (tab) ui.tab = tab; if (tab === 'paper' || tab === 'mob') napkinMark(tab === 'paper' ? 'paper' : 'sal');
  const vo = { bar: 'bt_hello', mob: 'sal_greet', vinnie: 'vin_hello' }[tab]; if (vo && Date.now() - (ui.voAt || 0) > 20000) { ui.voAt = Date.now(); window.BK.vo && window.BK.vo.play(vo); } document.exitPointerLock && document.exitPointerLock(); render(); }
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
    if (b.disabled || !b.offsetParent || k >= 9 || b.classList.contains('nk-x')) { b.removeAttribute('data-hk'); continue; }
    k++; b.dataset.hk = k; b.insertAdjacentHTML('afterbegin', `<kbd class="hk">${k}</kbd>`);
  }
  // first time a pop-up with buttons shows up, say how to use it
  const sig = [...document.querySelectorAll('#app .hud button[data-hk]')].map((b) => b.closest('.hud-event,.hunt')?.className || '').join('|');
  if (k && sig && sig !== ui.hkSig && document.pointerLockElement) toast(`Press 1${k > 1 ? '-' + k : ''} to choose, or Tab to use the mouse`, 'info');
  ui.hkSig = k ? sig : '';
  const help = document.querySelector('#app .hud-help'); if (help) help.textContent = `WASD move · Space jump · Mouse look · E interact · C crew/wire · P phone${k ? ' · 1-' + k + ' pop-up buttons · Tab free the mouse' : ''} · H ${settings.compact ? 'full' : 'compact'} HUD · Esc menu`;
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
    if (S.phase === 'play' && save.toeTag === 'pending') { save.toeTag = 'wearing'; persist(); send({ type: 'cosmetics', cos: wearing() }); setTimeout(() => toast('You died last night. Everyone can see the toe tag.', 'mob'), 9000); }
    lastPhase = S.phase;
  }
  if (S && S.cur && ui.sel && ui.selIdx !== S.cur.idx) ui.sel = null;
  if (S && ui.pendingPool) { if (S.me.pool) { ui.pendingPool = null; window.BK.startGame && window.BK.startGame('pool', S.me.pool); } else if (Date.now() - ui.pendingPool.at > 4000) ui.pendingPool = null; }
  if (S && ui.pending) { if (S.me.challenge && S.me.challenge.game === ui.pending.game) { const g = ui.pending.game; ui.pending = null; window.BK.startGame && window.BK.startGame(g, S.me.challenge); } else if (Date.now() - ui.pending.at > 4000) ui.pending = null; }
  document.body.classList.toggle('ingame', !!S && ['play', 'hunt'].includes(S.phase));
  if (S && S.phase === 'ended' && S.summary) { const mine = S.summary.players.find((p) => p.id === S.you), key = S.code + ':' + (S.summary.t0 || S.summary.year); if (mine && ui.paid !== key) { ui.paid = key; save.tix += mine.tickets; if (S.summary.sid) { save.seen = [...(save.seen || []).filter((x) => x !== S.summary.sid), S.summary.sid].slice(-200); send({ type: 'seen', ids: save.seen }); } save.toeTag = mine.fate === 'dead' ? 'pending' : save.toeTag === 'wearing' ? null : save.toeTag; persist(); toast(`+${mine.tickets} 🎟 tickets earned!`, 'win'); } }
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
  tick(); hudHotkeys(); hudCompact(); napkinCheck(); phoneSync();
  { const v = S && S.cur && S.cur.vinnie ? S.cur.idx : -1; if (v >= 0 && ui.vinSaid !== v) { ui.vinSaid = v; window.BK.vo && window.BK.vo.play('vin_tip'); } }
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
    <img class="logo-img" src="logo.webp" alt="Ball Knowledge">
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

// between nights of a campaign: what carries over
function campLobby() {
  const c = S.camp; if (!c || S.format !== 'campaign' || c.night < 2) return '';
  return `<div class="card camp col"><div class="big">📖 Night ${c.night} of ${c.nights}${c.night === c.nights ? ' - the last night' : ''}</div>
    <div class="muted">${c.night === c.nights ? 'Clear the books tonight and you walk out free. Come up short and you don\'t walk out.' : 'Sal\'s marker went up. Whatever you didn\'t pay last night is on top of it, with interest.'}</div>
    ${S.players.map((p) => `<div class="pl"><span>${esc(p.name)}</span><span>${p.campCash != null ? `brings ${$$(p.campCash)}` : 'new in town · $2,000'} · owes ${$$(S.nextTab + (p.rollover || 0) + (p.campCash != null && p.campCash < 1000 ? Math.round((1000 - p.campCash) * 1.25) : 0))}</span></div>`).join('')}
    ${c.log && c.log.length ? `<div class="muted">So far: ${c.log.map((l) => `night ${l.night} ${esc(l.tier)}`).join(' · ')}</div>` : ''}
    ${S.host ? `<button class="ghost" onclick="if(confirm('Walk away from this campaign and start over?'))send({type:'endCampaign'})">Walk away (start a new campaign)</button>` : ''}</div>`;
}
function lobbyView() {
  return `<div class="wrap"><div class="card col">
    <div class="top"><img class="logo-img sm" src="logo.webp" alt="Ball Knowledge"><div class="pill">Room <b>${S.code}</b></div></div>
    <div class="muted">Share the room code. Up to 6 players, co-op. ${S.camp && S.camp.night > 1 ? 'Your cash carries over from last night' : 'You each start with $2,000'} - and you each owe Uncle Sal <b>${$$(S.nextTab)}</b>${S.camp && S.camp.night > 1 ? ' plus whatever is left over' : ''}, due at closing time. A full playoff run of <b>about 10 games</b> is waiting - one new game opens for betting every couple of minutes.</div>
    ${loadBar()}
    ${campLobby()}
    <div class="title">Crew</div>${playerList()}
    ${!(S.camp && S.camp.night > 1) ? `<div class="title">Guided first night</div>
    <div class="row">${[['auto', 'Auto'], ['on', 'Always'], ['off', 'Off']].map(([id, l]) => `<button class="sport ${S.guide === id ? 'sel' : ''}" ${S.host ? '' : 'disabled'} onclick="send({type:'setGuide',guide:'${id}'})">${l}</button>`).join('')}</div>
    <div class="muted">${S.guide === 'off' ? 'No guide - straight into the deep end.' : S.guide === 'on' ? 'Night 1 walks everyone through the bar.' : S.newbies ? `${S.newbies} new player${S.newbies > 1 ? 's' : ''} - night 1 will walk the crew through the bar.` : 'Everyone here has played before - no guide.'}</div>` : ''}
    <div class="title">Story</div>
    <div class="row">${S.formats.map((x) => `<button class="sport ${S.format === x.id ? 'sel' : ''}" ${S.host && !(S.camp && S.camp.night > 1) ? '' : 'disabled'} onclick="send({type:'setFormat',format:'${x.id}'})">${esc(x.label)}</button>`).join('')}</div>
    <div class="muted">${esc((S.formats.find((x) => x.id === S.format) || {}).blurb || '')}</div>
    <div class="title">${S.host ? 'Choose your sport' : 'The host is choosing a sport...'}</div>
    <div class="sports">${S.sports.map((s) => `<button class="sport ${S.sport === s.id ? 'sel' : ''}" ${S.host ? '' : 'disabled'} onclick="send({type:'setSport',sport:'${s.id}'})"><span class="e">${s.emoji}</span>${esc(s.label)}</button>`).join('')}</div>
    <div class="title">Season</div>
    <div class="row">${S.modes.map((x) => `<button class="sport ${S.mode === x.id ? 'sel' : ''}" ${S.host ? '' : 'disabled'} onclick="send({type:'setMode',mode:'${x.id}'})">${esc(x.label)}</button>`).join('')}</div>
    <div class="muted">${esc((S.modes.find((x) => x.id === S.mode) || {}).blurb || '')}${S.mode === 'real' ? ` ${S.seasonCount} real seasons in this sport; you won't get one you've played until you've seen them all.` : ''}</div>
    <div class="title">Pace</div>
    <div class="row">${S.paces.map((p) => `<button class="sport ${S.pace === p.id ? 'sel' : ''}" ${S.host ? '' : 'disabled'} onclick="send({type:'setPace',pace:'${p.id}'})">${esc(p.label)}</button>`).join('')}</div>
    <button class="ghost" onclick="openShop()">🛍️ Pro Shop · 🎟 ${save.tix} tickets</button>
    ${S.host ? `<button onclick="send({type:'start'})">${S.camp && S.camp.night > 1 ? `Start night ${S.camp.night}` : S.mode === 'fake' ? 'Start - generate a made-up season' : 'Start - assign a mystery season'}</button>` : ''}
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
setInterval(() => { if (S) { tick(); hudCompact(); napkinCheck(); } phoneTick(); }, 250);

// ---------- the phone: buzzes the moment a bet settles, P pulls it out to check every bet ----------
// lives outside #app so render() never wipes it; settled results are diffed against what we've already buzzed for
const phone = { mode: 'away', el: null, seen: null, game: null, note: null, peekUntil: 0, unread: 0, html: '' };
const sfx = (n, o) => window.BK.sfx && window.BK.sfx(n, o);
function phoneEl() {
  if (phone.el) return phone.el;
  const d = document.createElement('div'); d.id = 'phone';
  d.innerHTML = '<button id="phonepill" title="Your phone (P)" onclick="phoneToggle()">📱 <kbd>P</kbd><i></i></button><div class="ph-body"><div class="ph-notch"></div><div class="ph-scr"></div></div>';
  d.querySelector('.ph-body').addEventListener('click', () => { if (phone.mode !== 'open') phoneToggle(true); });
  document.body.appendChild(d); phone.el = d; return d;
}
const phoneOn = () => !!S && ['play', 'hunt'].includes(S.phase) && !!window.__worldReady && !!S.events;
function phoneToggle(open = phone.mode !== 'open') {
  phone.mode = open ? 'open' : 'away'; if (open) phone.unread = 0;
  sfx('click'); phoneDraw();
}
function phoneSync() {
  const el = phoneEl(), on = phoneOn(); el.style.display = on ? '' : 'none';
  if (!on) { phone.mode = 'away'; return; }
  const game = S.code + ':' + (S.events[0] ? S.events[0].openAt : 0), keys = Object.keys(S.me.results || {});
  if (phone.game !== game) { phone.game = game; phone.seen = new Set(keys); phone.note = null; phone.unread = 0; } // new night or a page refresh: no replays
  for (const k of keys) if (!phone.seen.has(k)) { phone.seen.add(k); phoneBuzz(+k); }
  phoneDraw();
}
function phoneTick() {
  if (!phone.el || !phoneOn()) return;
  if (phone.mode === 'peek' && Date.now() > phone.peekUntil) phone.mode = 'away';
  phoneDraw();
}
function phoneBuzz(idx) {
  const r = S.me.results[idx], ev = S.events[idx], lines = (r && r.lines) || []; if (!ev || !lines.length) return; // no bets on that one
  const won = lines.filter((l) => l.won);
  phone.note = { idx, at: Date.now() }; phone.unread++;
  if (phone.mode !== 'open') { phone.mode = 'peek'; phone.peekUntil = Date.now() + (won.length ? 7000 : 5000); }
  const el = phoneEl(); el.classList.remove('buzz'); void el.offsetWidth; el.classList.add('buzz');
  sfx('vibrate'); setTimeout(() => sfx('vibrate'), 700);
  // the whole bar reacts: a roar when your bet cashes, boos when it dies
  if (won.length) { betSplash(ev, won, r); sfx('cheer', { v: 1 }); window.BK.onScore && window.BK.onScore(true); }
  else if (!r.voided) setTimeout(() => sfx('boo', { v: 0.9 }), 300);
}
// the "you can't miss it" moment: giant BET HIT across the screen, green edge flash, cash raining down
function betSplash(ev, won, r) {
  const net = won.reduce((a, l) => a + l.net, 0);
  for (const old of document.querySelectorAll('#betsplash,#betflash,.cashrain')) old.remove();
  const picks = won.map((l) => esc(betLabel(ev, l.mk, (S.me.bets[ev.idx] || {})[l.mk], l.label))).join(' + ');
  document.body.insertAdjacentHTML('beforeend', `<div id="betflash"></div><div id="betsplash"><div class="bh">${won.length > 1 ? won.length + ' BETS HIT!' : 'BET HIT!'}</div><div class="bm">+${$$(net)}</div><div class="bl">✅ ${picks} · ${esc(ev.label)}</div>${r.delta < net ? `<div class="bs">Night net on this game: ${r.delta >= 0 ? '+' : ''}${$$(r.delta)}</div>` : ''}</div><div class="cashrain">${Array.from({ length: 26 }, () => `<span style="left:${(Math.random() * 100).toFixed(1)}vw;animation-duration:${(1.8 + Math.random() * 1.8).toFixed(2)}s;animation-delay:${(Math.random() * 0.9).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg">${Math.random() < 0.75 ? '💵' : '💰'}</span>`).join('')}</div>`);
  setTimeout(() => { for (const n of document.querySelectorAll('#betsplash,#betflash,.cashrain')) n.remove(); }, 4800);
  sfx('win'); setTimeout(() => sfx('cash'), 250); for (let i = 0; i < 5; i++) setTimeout(() => sfx('coin'), 500 + i * 140);
}
function betLabel(ev, mk, b, fallback = '') {
  if (!b) return fallback;
  const nm = (s) => { const n = s === 'a' ? ev.a : ev.b; return (S.teams && S.teams[n] && S.teams[n].short) || n; };
  return mk === 'ml' ? `${nm(b.pick)} ML` : mk === 'spread' ? `${nm(b.pick)} ${b.line > 0 ? '+' : ''}${b.line}` : `${b.pick === 'over' ? 'Over' : 'Under'} ${b.line}`;
}
function livePlay(ev) {
  if (ev.status !== 'airing' || !ev.plays || !ev.plays.length) return null;
  const f = Math.max(0, Math.min(1, (now() - ev.closeAt) / (ev.resolveAt - ev.closeAt))), P = ev.plays; let i = 0;
  while (i + 1 < P.length && P[i + 1].f <= f) i++; return P[i];
}
function liveState(mk, b, sa, sb) { // is this bet winning right now? (totals can't say until it's over, unless the over already cashed)
  if (mk === 'ml') return sa === sb ? 'tied' : (sa > sb) === (b.pick === 'a') ? 'up' : 'down';
  if (mk === 'spread') { const my = b.pick === 'a' ? sa : sb, o = b.pick === 'a' ? sb : sa; return my + b.line > o ? 'up' : 'down'; }
  const tot = sa + sb; return tot > b.line ? (b.pick === 'over' ? 'up' : 'down') : '';
}
function phoneDraw() {
  if (!phone.el || !phoneOn()) return;
  const el = phone.el; el.className = phone.mode; el.querySelector('#phonepill i').textContent = phone.unread ? phone.unread : '';
  if (phone.mode === 'away') return;
  const me = S.me, nm = (n) => (S.teams && S.teams[n] && S.teams[n].short) || n;
  const live = S.events.filter((e) => e.status !== 'final' && Object.keys(me.bets[e.idx] || {}).length);
  const done = S.events.filter((e) => e.status === 'final' && me.results[e.idx] && (me.results[e.idx].lines || []).length).reverse();
  const d = new Date(), clock = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  let note = '';
  if (phone.note && Date.now() - phone.note.at < 15000) {
    const ev = S.events[phone.note.idx], r = me.results[phone.note.idx], ls = r.lines || [], won = ls.filter((l) => l.won), net = ls.reduce((a, l) => a + l.net, 0);
    note = r.voided ? `<div class="pn void"><b>⚠️ VOID</b><span>${esc(ev.label)}: the league caught a fix. Stakes returned.</span></div>`
      : won.length ? `<div class="pn hit"><b>✅ BET HIT! +${$$(won.reduce((a, l) => a + l.net, 0))}</b><span>${esc(ev.label)} · ${ls.map((l) => (l.won ? '✅ ' : '❌ ') + esc(betLabel(ev, l.mk, (me.bets[ev.idx] || {})[l.mk], l.label))).join(' · ')}</span></div>`
      : `<div class="pn miss"><b>❌ Bet lost ${$$(net)}</b><span>${esc(ev.label)} · ${ls.map((l) => esc(betLabel(ev, l.mk, (me.bets[ev.idx] || {})[l.mk], l.label))).join(' · ')}</span></div>`;
  }
  const liveCard = (e) => {
    const bets = me.bets[e.idx] || {}, p = livePlay(e);
    const head = e.status === 'airing' ? `<span class="pc live">● LIVE</span>` : e.status === 'open' ? `<span class="pc open">Bets close ${mmss(e.closeAt - now())}</span>` : `<span class="pc">Opens ${mmss(e.openAt - now())}</span>`;
    const score = p ? `<div class="psc"><span>${esc(nm(e.a))} <b>${p.sa}</b></span><em>${esc(p.per || '')}</em><span><b>${p.sb}</b> ${esc(nm(e.b))}</span></div><div class="ptx">${esc(p.txt || '')}</div>` : `<div class="pvs">${esc(nm(e.a))} vs ${esc(nm(e.b))}</div>`;
    const rows = Object.entries(bets).map(([mk, b]) => { const st = p ? liveState(mk, b, p.sa, p.sb) : ''; return `<div class="pb ${st}"><span>${esc(betLabel(e, mk, b))}</span><span>${$$(b.stake)} → <b>${$$(b.stake * b.dec)}</b></span>${st ? `<i>${st === 'up' ? 'WINNING' : st === 'down' ? 'LOSING' : 'TIED'}</i>` : ''}</div>`; }).join('');
    return `<div class="pcard"><div class="ph">${esc(e.label)}${e.final ? ' 🏆' : ''}${head}</div>${score}${rows}</div>`;
  };
  const doneCard = (e) => {
    const r = me.results[e.idx], ls = r.lines, tot = ls.reduce((a, l) => a + l.net, 0), cls = r.voided ? 'void' : ls.some((l) => l.won) ? 'hit' : 'miss';
    return `<div class="pcard ${cls}"><div class="ph">${esc(e.label)}${e.final ? ' 🏆' : ''}<span class="pc">FINAL</span></div>
      <div class="psc"><span>${esc(nm(e.a))} <b>${e.result.sa}</b></span><em>${e.ot ? 'OT' : ''}</em><span><b>${e.result.sb}</b> ${esc(nm(e.b))}</span></div>
      ${ls.map((l) => `<div class="pb ${l.void ? '' : l.won ? 'up' : 'down'}"><span>${l.void ? '↩️' : l.won ? '✅' : '❌'} ${esc(betLabel(e, l.mk, (me.bets[e.idx] || {})[l.mk], l.label))}</span><b>${l.void ? 'void' : (l.net >= 0 ? '+' : '') + $$(l.net)}</b></div>`).join('')}
      <div class="ptot">${r.voided ? 'Stakes returned' : `${cls === 'hit' ? 'CASHED' : 'Lost'} <b>${tot >= 0 ? '+' : ''}${$$(tot)}</b>`}</div></div>`;
  };
  const html = `<div class="psb"><span>${clock}</span><span>BallBook</span><span>📶 🔋</span></div>${note}
    <div class="pbal"><div><small>Balance</small><b>${$$(me.money)}</b></div>${me.debt > 0 ? `<div class="r"><small>Sal's tab</small><b class="bad">${$$(me.debt)}</b></div>` : ''}</div>
    <div class="psec">Live &amp; open</div>${live.length ? live.map(liveCard).join('') : `<div class="pempty">${S.cur ? 'A game is open. Bet at the terminal under the TVs.' : 'No open bets.'}</div>`}
    <div class="psec">Settled</div>${done.length ? done.map(doneCard).join('') : '<div class="pempty">Nothing settled yet.</div>'}
    <div class="pfoot">${phone.mode === 'open' ? 'P or click 📱 to put it away · scroll to see more' : 'Press P to check your bets'}</div>`;
  if (html !== phone.html) { phone.html = html; el.querySelector('.ph-scr').innerHTML = html; }
}
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyP' || e.repeat || !phoneOn() || ui.menu || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
  phoneToggle();
});
addEventListener('wheel', (e) => { if (phone.mode === 'open' && document.pointerLockElement && phone.el) phone.el.querySelector('.ph-scr').scrollTop += e.deltaY; }, { passive: true });

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
  if (S.phase === 'hunt') return me.remaining > 0 ? `🎯 The hitmen want ${$$(me.remaining)} from YOU - pay up, or the crew drops them all with bottles!` : '🎯 Help your crew - grab bottles and drop every hitman at once!';
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
  const extra = ui.tab === 'bar' ? [['bar', '🍺 Bar']] : ui.tab === 'vinnie' ? [['vinnie', '🍷 Old Vinnie']] : ui.tab === 'paper' ? [['paper', '📰 Paper']] : ui.tab === 'wheel' ? [['wheel', '🎰 Roulette']] : ui.tab === 'challenge' ? [['challenge', '🎯 Challenge']] : ui.tab === 'pool' ? [['pool', '🎱 Pool']] : [];
  const tabs = [['book', '📱 Sportsbook'], ['bets', '🧾 My Bets'], ['mob', '🕴️ The Mob'], ['crew', '👥 Crew'], ...extra];
  const body = { book: bookView, bets: betsView, mob: mobView, crew: crewView, bar: barView, vinnie: vinnieView, paper: paperView, wheel: wheelView, challenge: challengeView, pool: typeof poolView === 'function' ? poolView : () => '' }[ui.tab]();
  if (!window.__worldReady) return `<div class="center"><div class="card col" style="width:min(420px,100%)"><div class="big">Getting the bar ready...</div>${loadBar()}<div class="muted">Your crew can already see you. The game has started - you'll be dropped in as soon as the bar finishes loading.</div></div></div>`;
  return `<div class="hud">
    <div class="hud-top">
      <div class="row" style="gap:8px;justify-content:flex-start"><span class="pill">Room ${S.code}</span>${S.camp ? `<span class="pill">📖 Night ${S.camp.night}/${S.camp.nights}</span>` : ''}</div>
      <div class="strip">${strip()}</div>
      <div class="row" style="gap:8px;justify-content:flex-end"><span class="pill money">${$$(me.money)}</span>${me.debt > 0 ? `<span class="pill debt" title="Sal collects this at closing time">Sal's tab ${$$(me.debt)}</span>` : ''}
      <span class="pill drunkp" title="Drunk confidence">🍺<span class="dm"><span id="drunkfill" style="width:${me.drunk}%"></span></span></span></div>
    </div>
    ${ui.reconnecting ? '<div class="reconn">📶 Connection lost - reconnecting...</div>' : ''}
    <div class="hud-clock"><span class="pill time" id="timer"></span></div>
    <div class="hud-goal" id="goal">${goalText()}</div>
    ${quotaHud()}${eventBanner()}${napkinOn() ? napkinHud() : bountyHud()}${jobHud()}${shakeBanner()}
    ${hunt ? huntBanner() : ''}
    <div class="hud-crew">${playerList()}</div>
    <div class="hud-feed">${[...S.feed].slice(-4).reverse().map((f) => `<div data-t="${f.t}">${esc(f.text)}</div>`).join('')}</div>
    <div class="hud-help">WASD move · Mouse look · E interact · C crew/wire · P phone · Esc menu</div>
  </div>
  ${ui.open ? `<div class="overlay"><div class="panel">
    <div class="tabs">${tabs.map(([id, l]) => `<button class="${id === 'mob' ? 'mob ' : ''}${ui.tab === id ? 'on' : ''}" onclick="ui.tab='${id}';render()">${l}</button>`).join('')}
    <button class="ghost" style="flex:0 0 auto" onclick="closePanel()">✕</button></div>${body}</div></div>` : ''}`;
}
const grabbed = () => !!(window.BK.goons && window.BK.goons.held[S.you]);
// mash-Space meter while a goon has you (the server decides when you're free; this just shows the effort)
function struggleMeter(need) {
  const live = performance.now() - (window.BK.struggleAt || 0) < 2500, n = live ? Math.min(need, window.BK.struggle || 0) : 0; if (!live) window.BK.struggle = 0;
  return `<div class="strug"><b>MASH SPACE</b><div class="sbar"><i style="width:${Math.round((n / need) * 100)}%"></i></div></div>`;
}
function huntBanner() {
  const me = S.me, held = grabbed(), gs = S.hunt.goons || [], up = gs.filter((g) => !g.down).length;
  const pips = gs.map((g) => `<span class="gpip ${g.down ? 'down' : ''}">${g.down ? '💫' : '🕴️'}${'<i></i>'.repeat(Math.max(0, g.hp))}${'<i class="x"></i>'.repeat(Math.max(0, g.max - g.hp))}</span>`).join('');
  return `<div class="card hunt col ${held ? 'held' : ''}" style="margin-bottom:12px">
    <div class="big">${held ? '🫱 A hitman has you!' : '🔫 The hitmen are here'} <span class="pill time" id="huntt"></span></div>
    ${held ? struggleMeter(10) : ''}
    <div class="muted">${held ? `<b class="bad">He's shaking the money out of you.</b> Mash <b>SPACE</b> to wrench free, then run - he's slower than you. Crew: bottle him now, he can't dodge while he's holding someone.` : me.remaining > 0 ? `<b class="bad">They want ${$$(me.remaining)} from YOU.</b> Pay it, get wired cash, or escape: the crew has to drop <b>every</b> hitman with bottles.` : 'You are clear - help your crew. Only bottles hurt them - grab some and click to throw.'}</div>
    <div class="gpips">${pips}</div>
    <div class="muted">${up} of ${gs.length} standing. Each needs ${gs[0] ? gs[0].max : 3} bottle hits. They sidestep throws when they're free, and a downed one gets back up after ~10s - drop them all at once.</div>
    ${me.remaining > 0 ? (me.money > 0 ? `<div class="row"><button class="gold" onclick="send({type:'pay'})">Pay what I can (${$$(Math.min(me.money, me.remaining))})</button></div>` : `<div class="muted"><b class="bad">You're broke - nothing to pay with.</b> Ask the crew to wire you cash (C), keep away from them, and let the crew bottle them down.</div>`) : ''}</div>`;
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
      <div class="muted">${next ? `Next up: <b>${esc(next.label)}</b> - the matchup is revealed when betting opens. Opens in <b>${mmss(next.openAt - now())}</b>.` : 'All games have closed. Watch the highlights on the TV and wait for the finals.'}</div>
      <div class="muted">Tip: grab a drink at the bar. Drunk confidence is real... until you have one too many.</div></div>`;
  }
  const cur = S.cur, ev = S.events[cur.idx], mk = cur.mk, h = cur.hint, A = cur.intel.a, B = cur.intel.b;
  if (S.me.banUntil != null && cur.idx <= S.me.banUntil) return `<div class="card col"><div class="big">🚨 You're barred from the sportsbook</div><div class="muted">The league caught your fix. No bets until after game ${S.me.banUntil + 1}. You can still drink, hustle the arcade, play pool and roulette - and your crew can still bet.</div></div>`;
  const hs = (m, v) => !!(h && h[m] && (h[m].side === v || h[m].pick === v));
  const crew = cur.crew, ctot = crew.a + crew.b, sport = (S.sports.find((s) => s.id === S.sport) || {}).label || '';
  const sp = (s) => `${s.short} ${mk.spread[s === A ? 'a' : 'b'].line > 0 ? '+' : ''}${mk.spread[s === A ? 'a' : 'b'].line}`;
  return `<div class="sb">
    <div class="sb-head"><div><div class="title">${esc(sport.toUpperCase())} · ${S.league ? esc(S.league.toUpperCase()) : 'MYSTERY SEASON'}</div><div class="big">${esc(ev.label)}</div><div class="muted">Game ${ev.idx + 1} of ${S.events.length}${cur.series ? ' · ' + esc(cur.series) : ''}${ev.final ? ' · 🏆 CHAMPIONSHIP' : ''}</div></div>
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
      <div class="muted">${e.hidden ? 'Matchup revealed when betting opens' : `${esc(e.a)} vs ${esc(e.b)}`}</div>
      ${Object.keys(bets).length ? `<div class="muted">${Object.entries(bets).map(([m, b]) => `${m === 'ml' ? 'ML' : m} ${$$(b.stake)}`).join(' · ')}</div>` : ''}
      ${r ? `<div class="${r.delta >= 0 ? 'ok' : 'bad'}">${r.delta >= 0 ? '+' : ''}${$$(r.delta)}</div>${r.notes.map((n) => `<div class="muted">${esc(n)}</div>`).join('')}` : ''}</div>`;
  }).join('')}</div>`;
}

function mobView() {
  const me = S.me, cur = S.cur, ev = cur && S.events[cur.idx], fixed = cur && me.fix[cur.idx];
  return `<div class="card col" style="border-color:#5a2230">
    <div class="big">🕴️ "Uncle Sal"</div>
    <div class="muted">"I can make things happen, kid. Money, refs, players that suddenly forget how to play defense. Of course, I take a cut. And if you lose the big bet... well. We'll come see you."</div>
    <div class="side"><b>Your tab: ${$$(me.debt)}</b> - my marker${me.tab > 0 ? ` (${$$(me.tab)})` : ''} plus any loans and fixes. I collect at closing time. Every dollar of it.</div>
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
    ${S.phase === 'hunt' ? '<div class="muted">🍾 Hitmen only go down to bottles. Grab them from the tables or the crate by the couch.</div>' : ''}</div>`;
}

function barView() {
  const d = Math.round(drunkLevel()), b = d < 20 ? 'sober' : d < 45 ? 'warm' : d < 65 ? 'loose' : d < 82 ? 'hammered' : 'wrecked', blur = Math.max(0, (d - 20) / 14);
  return `<div class="chalk"><div class="chalk-h">DRINKS</div>
    <div class="chalk-say">Bartender: "What'll it be? First one's always full price."</div>
    ${S.drinks.map((x) => `<div class="chalk-row"><span class="cn">${x.emoji} ${esc(x.name)}</span><span class="cd"></span><span class="cp">${$$(x.price)}</span><button class="chalkbtn" ${S.me.money < x.price || d >= 100 ? 'disabled' : ''} onclick="BK.sfx&&(BK.sfx('pour'),BK.sfx('gulp',{delay:1.1}),BK.sfx('glass',{delay:0.95}));send({type:'drink',id:'${x.id}'})">Order</button></div><div class="chalk-sub">${esc(x.blurb)} (+${x.add} buzz)</div>`).join('')}
    <div class="dmeter" style="margin-top:14px;filter:blur(${blur.toFixed(1)}px)"><div style="width:${d}%"></div></div>
    <div class="chalk-sub">You feel <b>${b}</b>${d < 20 ? ` (${d}%)` : ''}. ${S.me.hangover ? '<b>Your head is pounding</b> - no gut feelings until it passes. ' : ''}Somewhere in the buzz your gut gets good: right more often than not. Go past it and it lies to you just as confidently - then the hangover hits. Everyone's sweet spot is different, and it wears off over time.</div>
    ${jobBox()}</div>`;
}
// ---------- the guided first night: Sal's napkin ----------
// A checklist of the bar's systems in a sensible order. The current step gets a "where" hint and the right regular calls
// out to you (speech bubble, plus a voice line when one exists). Progress is saved in this browser; finishing pays tickets.
const NAPKIN = [
  { id: 'bet', text: 'Bet a winner on the open game', where: 'Sportsbook terminal, under the TVs', who: 'Bartender', line: 'First time? Bets go in at the terminal under the TVs. Pick a winner.', vo: 'bt_bet' },
  { id: 'paper', text: 'Read the paper', where: 'On the counter, by the stools', who: 'Bartender', line: 'Paper\'s on the counter. Sharp guys read it. It can tell you what year it is.', vo: 'bt_paper' },
  { id: 'vinnie', text: 'Buy Old Vinnie a drink for a tip', where: 'Old man on the stool by the taps', who: 'Old Vinnie', line: 'Psst. Kid. Buy an old man a drink and I\'ll tell you who wins.', vo: 'vin_hello' },
  { id: 'drink', text: 'Have a drink - find your buzz', where: 'Bartender, behind the counter', who: 'Bartender', line: 'A little buzz helps the gut. Too much and it lies to you.', vo: 'bt_drink' },
  { id: 'job', text: 'Ask the bartender for a side job', where: 'Bartender: "Ask for a job"', who: 'Bartender', line: 'Short on cash? I always have work. Come ask me.', vo: 'bt_job' },
  { id: 'bottle', text: 'Throw Sal\'s collector out with bottles', where: 'E grabs bottles off any table, click throws', who: 'Uncle Sal', line: 'Just a friendly reminder, kid. Let\'s see what you do.', vo: 'sal_reminder' },
  { id: 'sal', text: 'Check your tab with Uncle Sal', where: 'Red corner booth, back right', who: 'Uncle Sal', line: 'Come here. Let\'s talk about what you owe me.', vo: 'sal_tab' },
];
const tut = () => (save.tutProg = save.tutProg || {});
function napkinMark(id) { if (!save.tutDone && !tut()[id]) { tut()[id] = 1; persist(); } }
function napkinReset() { save.tutDone = false; save.tutProg = {}; persist(); send({ type: 'seen', ids: save.seen || [], tut: false }); toast('Your next first night will be guided again.', 'info'); render(); }
const napkinOn = () => !!(S && S.guided && !save.tutDone && S.phase === 'play' && S.events);
function napkinCheck() { // tick off steps from the game state
  if (!napkinOn()) return;
  const me = S.me, P = tut(), before = JSON.stringify(P);
  if (Object.values(me.bets || {}).some((b) => b.ml)) P.bet = 1;
  if (S.cur && S.cur.vinnie) P.vinnie = 1;
  if ((me.drunk || 0) >= 15) P.drink = 1;
  if (me.job || me.jobsDone > 0) P.job = 1;
  if (S.shake && S.shake.training) P.sawCollector = 1; else if (P.sawCollector) P.bottle = 1;
  const left = NAPKIN.filter((x) => !P[x.id]);
  if (!left.length) { save.tutDone = true; save.tix += 10; persist(); send({ type: 'seen', ids: save.seen || [], tut: true }); toast('🧻 Napkin done - you know your way around. +10 🎟 tickets', 'win'); window.BK.vo && window.BK.vo.play('sal_napkin_done'); return; }
  const cur = napkinCurrent(); const cineOn = !!(S.cine && now() < S.cine.until + 300);
  if (cur && ui.napkinSaid !== cur.id && !cineOn) { ui.napkinSaid = cur.id; setTimeout(() => { window.BK.guideSay && window.BK.guideSay(cur.who, cur.line, cur.vo); }, 1200); }
  if (JSON.stringify(P) !== before) persist();
}
function napkinCurrent() { const P = tut(); if (S.shake && S.shake.training && !P.bottle) return NAPKIN.find((x) => x.id === 'bottle'); return NAPKIN.find((x) => !P[x.id] && x.id !== 'bottle'); }
function napkinSkip() { if (!confirm('Skip the guide? You can turn it back on from the Esc menu.')) return; save.tutDone = true; persist(); send({ type: 'seen', ids: save.seen || [], tut: true }); render(); }
function napkinHud() {
  const P = tut(), cur = napkinCurrent(), n = NAPKIN.filter((x) => P[x.id]).length;
  return `<div class="hud-napkin"><div class="nk-h">Sal's napkin <span>${n}/${NAPKIN.length}</span><button class="nk-x" onclick="napkinSkip()" title="Skip the guide">✕</button></div>
    ${NAPKIN.filter((x) => x.id !== 'bottle' || P.bottle || P.sawCollector || (S.shake && S.shake.training)).map((x) => `<div class="nk-i ${P[x.id] ? 'done' : x === cur ? 'cur' : ''}">${P[x.id] ? '✔' : x === cur ? '➜' : '○'} ${esc(x.text)}${x === cur ? `<small>${esc(x.where)}</small>` : ''}</div>`).join('')}
    ${!P.sawCollector && !P.bottle ? '<div class="nk-i dim">○ ...Sal will send someone. Be ready.</div>' : ''}</div>`;
}
// ---------- side jobs from the bartender ----------
function jobBox() {
  if (S.phase !== 'play') return '';
  const j = S.me.job, t = now(), pay = (x) => (x.tabCut ? `${$$(x.tabCut)} off Sal's tab` : $$(x.reward));
  let body;
  if (j) body = `<div class="chalk-say">"${esc(j.text)}"</div><div class="chalk-sub">➜ <b>${esc(j.step)}</b> · ${mmss(j.until - t)} left · pays ${pay(j)}</div>
    <div class="row">${j.kind === 'collect' && j.stage === 'back' ? `<button class="chalkbtn" onclick="send({type:'jobAct'})">Hand over Sal's envelope</button>` : ''}<button class="chalkbtn" onclick="send({type:'jobDrop'})">Drop the job</button></div>`;
  else if (t < (S.me.jobNext || 0)) body = `<div class="chalk-say">Bartender: "Nothing right now. Check back in ${mmss(S.me.jobNext - t)}."</div>`;
  else body = `<div class="chalk-say">Bartender: "Want to make yourself useful? I always need a hand - and I know people who'll pay."</div><button class="chalkbtn" onclick="send({type:'jobTake'})">Ask for a job</button>`;
  return `<div class="chalk-h" style="margin-top:16px">SIDE JOBS</div>${body}${S.me.jobsDone ? `<div class="chalk-sub">Jobs done tonight: ${S.me.jobsDone}</div>` : ''}`;
}
function jobHud() {
  const j = S.me && S.me.job; if (!j || S.phase !== 'play') return '';
  return `<div class="hud-job">🍸 <b>${esc(j.step)}</b> <span class="muted">${mmss(j.until - now())} · ${j.tabCut ? `${$$(j.tabCut)} off your tab` : $$(j.reward)}</span></div>`;
}
// ---------- Old Vinnie ----------
function vinnieView() {
  const cur = S.cur, t = cur && cur.vinnie, ev = cur && S.events[cur.idx];
  let body;
  if (!cur) body = `<div class="muted">"No game open, kid. Come back when there's action."</div>`;
  else if (t) body = `<div class="side"><div class="muted">On ${esc(ev.label)}: ${esc(ev.a)} vs ${esc(ev.b)}</div><div class="big" style="font-size:18px">"${esc(t.text)}"</div><div class="muted">"${esc(t.totalText)}"</div><div>Vinnie likes <b>${esc(cur.intel[t.side].name)}</b> · ${t.total === 'over' ? 'Over' : 'Under'} ${cur.mk.total.line}</div></div>
    <div class="muted">He's been right more often than not. Not always. He'll tell the whole crew the same thing.</div>`;
  else body = `<div class="muted">"Buy an old man a drink and I'll tell you what I think about ${esc(ev.a)} and ${esc(ev.b)}."</div>
    <button class="gold" ${S.me.money < S.me.vinniePrice ? 'disabled' : ''} onclick="send({type:'vinnie'})">Buy Vinnie a drink (${$$(S.me.vinniePrice)})</button>`;
  return `<div class="card col" style="border-color:#2a6a62"><div class="big">🍷 Old Vinnie</div>
    <div class="muted">Forty years on the same stool. He's seen every game twice and remembers most of them.</div>${body}</div>`;
}
// ---------- the newspaper ----------
function paperView() {
  const P = S.paper; if (!P) return '<div class="muted">Somebody took the paper.</div>';
  return `<div class="paper"><div class="pp-top"><span>${esc(P.edition)}</span><span class="pp-torn">[date torn off]</span><span>25¢</span></div>
    <div class="pp-mast">${esc(P.name)}</div>
    <div class="pp-rule"><span>SPORTS</span><span>${esc(P.sport)}</span><span>FINAL</span></div>
    <div class="pp-cols"><div class="pp-main"><div class="pp-head">${esc(P.head)}</div><div class="pp-sub">${esc(P.sub)}</div>
      <div class="pp-box"><div class="pp-bh">STANDINGS</div>${P.standings.map((t) => `<div class="pp-st"><b>${esc(t.short)}</b><span>${esc(t.name)}</span><i>${esc(t.rec)}</i></div>`).join('')}</div>
      ${P.stars.length ? `<div class="pp-box"><div class="pp-bh">WHO'S HOT</div>${P.stars.map((x) => `<div class="pp-st"><b>${esc(x.team)}</b><span>${esc(x.line)}</span></div>`).join('')}</div>` : ''}</div>
    <div class="pp-side"><div class="pp-bh">IN OTHER NEWS</div>${P.briefs.map((b) => `<div class="pp-brief">${esc(b)}</div>`).join('')}<div class="pp-brief pp-small">${esc(P.filler)}</div>
      <div class="pp-ad">COLD BEER<br><small>ask the bartender</small></div></div></div></div>`;
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
    <div class="logo" style="font-size:34px">${{ legendary: '<span>LEGENDARY NIGHT</span>', survived: 'YOU SURVIVED', busted: 'BUSTED' }[s.tier] || (s.crewWon ? '<span>YOU WIN</span>' : 'GAME OVER')}${s.vacated ? '<span>*</span>' : ''}</div>
    <div class="tiers"><span class="${s.crewWon ? 'ok' : 'bad'}">${s.crewWon ? '✅' : '❌'} Called the champion (${s.correct}/${s.total})</span><span class="${s.quotaMet ? 'ok' : 'bad'}">${s.quotaMet ? '✅' : '❌'} Hit Sal's final number</span></div>
    ${s.mvp ? `<div class="mvp">🏅 MVP of the night: <b>${esc(s.mvp.name)}</b> · ${s.mvp.bk} Ball Knowledge</div>` : ''}
    ${s.vacated ? '<div class="bad">* The championship was fixed. The league struck your title from the books (half the crew bonus).</div>' : ''}${s.voidedFinal ? '<div class="bad">🚨 The league caught a fix on the championship and voided it. Nobody gets the title.</div>' : ''}
    <div class="title">${s.fake ? 'A made-up season' : 'The season was'}</div>
    <div class="big">${s.fake ? '' : s.year + ' '}${esc(s.league)}</div>
    <div class="muted">${esc(s.blurb || '')}</div>
    <div>${s.fake ? 'Champion by the dice' : 'Real champion'}: <b>${esc(s.champion)}</b></div>
    <div>${s.altered ? `${s.fake ? 'Your fix overruled the dice' : 'History was rewritten'} - your champion was <b>${esc(s.finalWinner)}</b>.` : s.fake ? 'The dice played it straight.' : 'History played out as it happened.'}</div>
    ${s.players.map((p) => `<div class="pl"><span>${esc(p.name)} ${p.finalCorrect ? '✅' : '❌'}</span><span>${p.fate === 'dead' ? '💀 dead (half tickets, wears a toe tag next season)' : esc(p.fate)} · ${$$(p.money)} · 🧠 ${p.bk || 0} · +${p.tickets}🎟</span></div>`).join('')}
    ${campEnd(s)}
    <button class="ghost" onclick="openShop()">🛍️ Spend tickets · 🎟 ${save.tix}</button>
    ${host ? (s.camp && !s.camp.last ? `<button onclick="send({type:'rematch',next:true})">On to night ${s.camp.night + 1} →</button><button class="ghost" onclick="if(confirm('Abandon the campaign?'))send({type:'rematch'})">Quit the campaign</button>` : `<button onclick="send({type:'rematch'})">${s.camp ? 'New campaign' : 'Back to lobby'}</button>`) : '<div class="muted">Waiting for host...</div>'}</div></div>`;
}

function campEnd(s) {
  const c = s.camp; if (!c) return '';
  if (c.last) {
    const R = { free: ['🕊️ FREE AND CLEAR', 'The books are clean. Sal pours you a drink on the house - first time in years. +25 tickets each.'], hooked: ['🪝 STILL ON THE HOOK', 'You got out alive, but somebody still owes Sal. He\'ll be seeing you.'], owned: ['💀 SAL OWNS YOU', 'Not everyone walked out of the back room. The crew works for Sal now.'] }[c.result];
    return `<div class="card camp col"><div class="big">📖 Campaign over: ${R[0]}</div><div class="muted">${R[1]}</div><div class="muted">${c.log.map((l) => `Night ${l.night}: ${esc(l.season)} - ${esc(l.tier)}`).join('<br>')}</div></div>`;
  }
  return `<div class="card camp col"><div class="big">📖 Night ${c.night} of ${c.nights} done</div>
    <div class="muted">Cash carries over. Sal's marker goes up. Whatever you didn't pay rolls over at 50% interest. Under $1,000? Sal fronts you the rest - on the tab.</div>
    ${c.players.map((p) => `<div class="pl"><span>${esc(p.name)}${p.dead ? ' 💀' : ''}</span><span>brings ${$$(p.cash)}${p.fronted ? ` (+${$$(p.fronted)} fronted)` : ''} · owes ${$$(p.nextTab)} next night${p.rollover ? ` <b class="bad">(${$$(p.rollover)} rolled over)</b>` : ''}</span></div>`).join('')}</div>`;
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
    const hits = be.hits ? `<div class="muted">🍾 Bottles thrown: ${esc(be.red)} ${be.hits.red} · ${esc(be.blue)} ${be.hits.blue} - every hit tips the fight against him</div>` : '<div class="muted">Throw bottles at a fighter (click) to tip the fight against him.</div>';
    if (be.mine) return base + `<div class="muted">You bet ${$$(be.mine.stake)} on ${esc(be.mine.side === 'red' ? be.red : be.blue)}.</div>${hits}</div>`;
    if (now() < be.betUntil) { const st = ui.fightStake; return base + `<div class="row"><button class="red" onclick="fightBet('red')">🔴 ${esc(be.red)} · ${$$(st)}</button><button class="blue" onclick="fightBet('blue')">🔵 ${esc(be.blue)} · ${$$(st)}</button><button class="ghost fit" onclick="fightStakeNext()">Stake ${$$(st)} ▸</button></div>${hits}</div>`; }
  }
  return base + '</div>';
}
function shakeBanner() {
  const sh = S.shake; if (!sh) return '';
  const pct = Math.max(0, (sh.hp / Math.max(1, sh.maxHp)) * 100), held = grabbed();
  return `<div class="card hunt col ${held ? 'held' : ''}"><div class="big">${held ? '🫳 A collector is going through your pockets' : "💼 Sal's collectors"} <span class="pill time" id="shaket"></span></div>${held ? struggleMeter(6) : ''}
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
  persist(); send({ type: 'cosmetics', cos: wearing() }); BKC.preview.set(save.eq); render();
}
function unequipSlot(slot) { delete save.eq[slot]; persist(); send({ type: 'cosmetics', cos: wearing() }); BKC.preview.set(save.eq); render(); }
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
