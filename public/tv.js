import * as THREE from 'three';
import { canvasTex } from './textures.js';

// Wall TVs: highlights broadcast (center), up-next board (left), season board (right), ambient TVs, and the kiosk screen.
const KIND = { nfl: 'football', cfb: 'football', nba: 'basketball', ncaab: 'basketball', nhl: 'hockey', mlb: 'baseball' };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fit = (g, text, x, y, maxW, font, color = '#fff', align = 'center') => { g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(text, x, y, maxW); };
const fract = (x) => x - Math.floor(x);

// ---- stylized game scene (no real footage): field / court / rink / diamond with moving players ----
function drawScene(g, W, H, kind, t, cA = '#2a5aa8', cB = '#b02a2a', seed = 0) {
  const horizon = H * 0.3;
  // crowd band
  const sky = g.createLinearGradient(0, 0, 0, horizon); sky.addColorStop(0, '#1a1f3a'); sky.addColorStop(1, '#3a3556'); g.fillStyle = sky; g.fillRect(0, 0, W, horizon);
  for (let i = 0; i < 90; i++) { g.fillStyle = ['#c84a3a', '#e8c06a', '#4a6ac8', '#d8d8e8', '#7a4ac8'][i % 5] + '99'; const x = (i * 47.3 + seed * 13) % W, y = 6 + ((i * 29) % (horizon - 14)); g.beginPath(); g.arc(x, y + Math.sin(t * 2 + i) * 1.5, 3.2, 0, 7); g.fill(); }
  if (kind === 'football') {
    const gr = g.createLinearGradient(0, horizon, 0, H); gr.addColorStop(0, '#2a7a3a'); gr.addColorStop(1, '#1d5a2a'); g.fillStyle = gr; g.fillRect(0, horizon, W, H - horizon);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff0a' : '#00000010'; g.fillRect(0, horizon + (H - horizon) * (i / 8) ** 1.6, W, (H - horizon) * (((i + 1) / 8) ** 1.6 - (i / 8) ** 1.6)); }
    g.strokeStyle = '#ffffffaa'; g.lineWidth = 2; for (let i = 1; i < 8; i++) { const y = horizon + (H - horizon) * (i / 8) ** 1.6; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  } else if (kind === 'basketball') {
    const gr = g.createLinearGradient(0, horizon, 0, H); gr.addColorStop(0, '#c9954a'); gr.addColorStop(1, '#9a6a2a'); g.fillStyle = gr; g.fillRect(0, horizon, W, H - horizon);
    g.strokeStyle = '#fff9'; g.lineWidth = 3; g.beginPath(); g.ellipse(W / 2, H * 0.78, W * 0.16, H * 0.1, 0, 0, 7); g.stroke(); g.strokeRect(W * 0.38, horizon + 6, W * 0.24, H * 0.3);
    g.fillStyle = '#ddd'; g.fillRect(W / 2 - 28, horizon - 14, 56, 36); g.strokeStyle = '#d33'; g.strokeRect(W / 2 - 28, horizon - 14, 56, 36); g.beginPath(); g.arc(W / 2, horizon + 24, 12, 0, Math.PI); g.stroke();
  } else if (kind === 'hockey') {
    const gr = g.createLinearGradient(0, horizon, 0, H); gr.addColorStop(0, '#d8eaf6'); gr.addColorStop(1, '#a8c8e0'); g.fillStyle = gr; g.fillRect(0, horizon, W, H - horizon);
    g.strokeStyle = '#d33'; g.lineWidth = 4; g.beginPath(); g.moveTo(W / 2, horizon); g.lineTo(W / 2, H); g.stroke(); g.strokeStyle = '#37c'; g.beginPath(); g.moveTo(W * 0.3, horizon); g.lineTo(W * 0.24, H); g.moveTo(W * 0.7, horizon); g.lineTo(W * 0.76, H); g.stroke();
    g.beginPath(); g.arc(W / 2, H * 0.65, H * 0.12, 0, 7); g.stroke();
  } else {
    const gr = g.createLinearGradient(0, horizon, 0, H); gr.addColorStop(0, '#2e8a3e'); gr.addColorStop(1, '#216a30'); g.fillStyle = gr; g.fillRect(0, horizon, W, H - horizon);
    g.fillStyle = '#b0753a'; g.beginPath(); g.moveTo(W / 2, H * 0.4); g.lineTo(W * 0.72, H * 0.62); g.lineTo(W / 2, H * 0.86); g.lineTo(W * 0.28, H * 0.62); g.closePath(); g.fill();
    g.fillStyle = '#2a8a3a'; g.beginPath(); g.moveTo(W / 2, H * 0.48); g.lineTo(W * 0.64, H * 0.62); g.lineTo(W / 2, H * 0.78); g.lineTo(W * 0.36, H * 0.62); g.closePath(); g.fill();
    g.fillStyle = '#fff'; for (const [x, y] of [[0.5, 0.4], [0.72, 0.62], [0.5, 0.86], [0.28, 0.62]]) g.fillRect(W * x - 5, H * y - 5, 10, 10);
  }
  // players
  const n = kind === 'baseball' ? 9 : 10;
  for (let i = 0; i < n; i++) {
    const side = i % 2, ph = t * (0.45 + 0.1 * (i % 3)) + i * 1.9 + seed;
    let x = W * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(ph))), y = H * (0.45 + 0.4 * (0.5 + 0.5 * Math.cos(ph * 0.7 + i)));
    if (kind === 'baseball') { x = W * [0.5, 0.72, 0.5, 0.28, 0.38, 0.62, 0.3, 0.5, 0.7][i]; y = H * [0.47, 0.62, 0.84, 0.62, 0.55, 0.55, 0.38, 0.35, 0.4][i] + Math.sin(ph) * 3; }
    const s = 0.55 + (y / H) * 0.85, col = side ? cB : cA;
    g.fillStyle = '#00000033'; g.beginPath(); g.ellipse(x, y + 16 * s, 11 * s, 4 * s, 0, 0, 7); g.fill();
    g.fillStyle = col; g.fillRect(x - 7 * s, y - 8 * s, 14 * s, 20 * s); g.fillStyle = '#e8c09a'; g.beginPath(); g.arc(x, y - 13 * s, 6 * s, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, y - 15 * s, 6.2 * s, Math.PI, 0); g.fill();
    g.fillStyle = '#222'; g.fillRect(x - 6 * s, y + 12 * s, 5 * s, 9 * s); g.fillRect(x + 1 * s, y + 12 * s, 5 * s, 9 * s);
  }
  const bx = W * (0.5 + 0.3 * Math.sin(t * 0.9 + seed)), by = H * (0.55 + 0.2 * Math.cos(t * 1.3 + seed));
  g.fillStyle = kind === 'basketball' ? '#e0702a' : kind === 'hockey' ? '#111' : '#f2f2f2'; g.beginPath(); g.arc(bx, by - Math.abs(Math.sin(t * 5)) * 12, kind === 'hockey' ? 4 : 6, 0, 7); g.fill();
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); v.addColorStop(0, '#0000'); v.addColorStop(1, '#0008'); g.fillStyle = v; g.fillRect(0, 0, W, H);
}
function scorebug(g, x, y, w, h, A, B, sa, sb, info, info2) {
  g.fillStyle = '#0b1430f0'; g.fillRect(x, y, w, h);
  const seg = w * 0.7 / 2;
  [[A, sa, x + 6], [B, sb, x + 6 + seg]].forEach(([T, s, px]) => {
    g.fillStyle = T.color; g.fillRect(px, y + 6, 10, h - 12); fit(g, T.short, px + 24, y + h * 0.66, seg * 0.45, `900 ${h * 0.5}px system-ui`, '#fff', 'left'); fit(g, String(s), px + seg - 18, y + h * 0.7, seg * 0.4, `900 ${h * 0.62}px system-ui`, '#ffc83d', 'right');
  });
  g.fillStyle = '#1b2f6a'; g.fillRect(x + w * 0.7, y, w * 0.3, h); fit(g, info, x + w * 0.85, y + h * 0.44, w * 0.28, `800 ${h * 0.34}px system-ui`, '#fff'); fit(g, info2, x + w * 0.85, y + h * 0.82, w * 0.28, `700 ${h * 0.3}px system-ui`, '#ffc83d');
}

export function createTV(BK) {
  const mk = (w, h) => canvasTex(w, h, (g) => { g.fillStyle = '#071024'; g.fillRect(0, 0, w, h); });
  const C = mk(1024, 576), L = mk(640, 360), R = mk(640, 360), K = mk(512, 610), AMB = [mk(512, 288), mk(512, 288), mk(512, 288)];
  const bg = (g, w, h, c1 = '#0a1a3a', c2 = '#04060f') => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
  const upd = (o) => { o.t.needsUpdate = true; };
  const team = (S, name) => (S.teams && S.teams[name]) || { short: '?', color: '#555555' };

  function center(S, now, ts) {
    const { g, c } = C, W = c.width, H = c.height, kind = KIND[S.sport] || 'football';
    const air = S.events.filter((e) => e.status === 'airing').sort((a, b) => a.closeAt - b.closeAt);
    if (!air.length) {
      drawScene(g, W, H, kind, ts / 1000, '#2a5aa8', '#b02a2a', 3); g.fillStyle = '#000b'; g.fillRect(0, 0, W, H);
      fit(g, 'BALL KNOWLEDGE NETWORK', W / 2, 200, W - 60, '900 58px system-ui', '#27e08a');
      const open = S.events.find((e) => e.status === 'open'), up = S.events.find((e) => e.status === 'upcoming');
      if (open) { fit(g, 'NOW TAKING BETS', W / 2, 290, W - 60, '800 38px system-ui', '#ffc83d'); fit(g, `${open.a}  vs  ${open.b}`, W / 2, 350, W - 60, '700 36px system-ui'); fit(g, `Betting closes in ${mmss(open.closeAt - now)}`, W / 2, 425, W - 60, '800 42px system-ui', '#ff7a88'); }
      else if (up) fit(g, `Next game opens in ${mmss(up.openAt - now)}`, W / 2, 340, W - 60, '800 42px system-ui', '#ffc83d');
      else fit(g, 'All games are final', W / 2, 340, W - 60, '800 42px system-ui', '#ffc83d');
      fit(g, 'Highlights air here after betting closes.', W / 2, 520, W - 60, '600 26px system-ui', '#8f9bc7'); upd(C); return;
    }
    const ev = air[0], A = team(S, ev.a), B = team(S, ev.b), f = clamp((now - ev.closeAt) / (ev.resolveAt - ev.closeAt), 0, 1);
    let i = 0; const P = ev.plays; while (i + 1 < P.length && P[i + 1].f <= f) i++;
    const cur = P[i], recent = []; for (let k = i; k >= 0 && recent.length < 2; k--) if (P[k].txt) recent.push(P[k].txt);
    drawScene(g, W, H, kind, ts / 1000, A.color, B.color, ev.idx * 7);
    g.fillStyle = '#c4111a'; g.fillRect(0, 0, 330, 44); fit(g, `HIGHLIGHTS · ${ev.label.toUpperCase()}`.slice(0, 26), 14, 31, 310, '900 23px system-ui', '#fff', 'left');
    g.fillStyle = '#0b1430dd'; g.fillRect(W - 210, 0, 210, 44); fit(g, 'BKN SPORTS', W - 105, 31, 190, '900 24px system-ui', '#ffc83d');
    // lower third
    g.fillStyle = '#000c'; g.fillRect(0, H - 220, W, 90); recent.forEach((t, k) => fit(g, t, W / 2, H - 172 + k * 36, W - 60, k === 0 ? '800 34px system-ui' : '600 24px system-ui', k === 0 ? '#fff' : '#9aa6d0'));
    scorebug(g, 40, H - 118, W - 80, 78, A, B, cur.sa, cur.sb, f >= 0.985 ? 'FINAL' : (cur.per || 'LIVE'), f >= 0.985 ? ' ' : ev.label.split('·')[0].trim().slice(0, 14));
    g.fillStyle = '#1b2442'; g.fillRect(40, H - 26, W - 80, 8); g.fillStyle = '#27e08a'; g.fillRect(40, H - 26, (W - 80) * f, 8);
    fit(g, `FINAL IN ${mmss(ev.resolveAt - now)}`, W - 44, H - 38, 300, '700 18px system-ui', '#8f9bc7', 'right');
    if (air.length > 1) fit(g, `+${air.length - 1} more queued`, 44, H - 38, 300, '700 18px system-ui', '#ffc83d', 'left');
    upd(C);
  }
  function ambient(S, now, ts) {
    const kind = KIND[S.sport] || 'football', n = S.events.length;
    AMB.forEach((o, k) => {
      const ev = S.events[(k * 3 + 1) % n], A = team(S, ev.a), B = team(S, ev.b), { g, c } = o, W = c.width, H = c.height, t = ts / 1000 + k * 17;
      drawScene(g, W, H, kind, t, A.color, B.color, k * 5 + 1);
      const sa = Math.floor(((t * 0.13 + k) % 1) * (kind === 'basketball' ? 90 : kind === 'football' ? 24 : 5)), sb = Math.floor(((t * 0.11 + k * 0.3) % 1) * (kind === 'basketball' ? 88 : kind === 'football' ? 20 : 4));
      scorebug(g, 24, H - 60, W - 48, 44, A, B, sa, sb, 'LIVE', ' '); upd(o);
    });
  }
  function left(S, now) {
    const { g, c } = L, W = c.width, H = c.height; bg(g, W, H, '#0e2a22', '#04100c');
    const cur = S.events.find((e) => e.status === 'open'), up = S.events.find((e) => e.status === 'upcoming');
    fit(g, cur ? 'NOW OPEN' : up ? 'UP NEXT' : 'BETS CLOSED', W / 2, 52, W, '900 40px system-ui', '#27e08a');
    const ev = cur || up;
    if (!ev) { fit(g, 'Watch the highlights', W / 2, 200, W - 40, '700 32px system-ui', '#8f9bc7'); upd(L); return; }
    fit(g, ev.label, W / 2, 96, W - 40, '700 26px system-ui', '#ffc83d');
    const badge = (name, x) => { const T = team(S, name); g.fillStyle = T.color; g.beginPath(); g.arc(x, 190, 48, 0, 7); g.fill(); g.strokeStyle = '#fff6'; g.lineWidth = 3; g.stroke(); fit(g, T.short, x, 190 + 10, 80, '900 30px system-ui'); };
    badge(ev.a, 130); badge(ev.b, W - 130); fit(g, 'VS', W / 2, 202, 100, '900 36px system-ui', '#8f9bc7');
    fit(g, ev.a, 130, 262, 240, '700 22px system-ui'); fit(g, ev.b, W - 130, 262, 240, '700 22px system-ui');
    const ms = (cur ? ev.closeAt : ev.openAt) - now; fit(g, (cur ? 'BETS CLOSE ' : 'OPENS ') + mmss(ms), W / 2, 330, W - 40, '900 38px system-ui', ms < 20000 && cur ? '#ff4d5e' : '#fff');
    upd(L);
  }
  function right(S, now) {
    const { g, c } = R, W = c.width, H = c.height; bg(g, W, H, '#1a1030', '#07040f');
    fit(g, 'SEASON BOARD', W / 2, 40, W, '900 34px system-ui', '#ff60e0');
    const n = S.events.length, rh = Math.min(30, (H - 60) / n);
    S.events.forEach((e, i) => {
      const y = 62 + i * rh + rh * 0.75; const sh = (nm) => team(S, nm).short;
      const col = e.status === 'final' ? '#e8ecff' : e.status === 'airing' ? '#ffc83d' : e.status === 'open' ? '#27e08a' : '#566';
      const txt = e.status === 'final' ? `${sh(e.a)} ${e.result.sa} - ${e.result.sb} ${sh(e.b)}` : `${sh(e.a)} vs ${sh(e.b)}`;
      fit(g, `${i + 1}`, 28, y, 30, `800 ${Math.round(rh * 0.75)}px system-ui`, col, 'left'); fit(g, txt, 70, y, 300, `700 ${Math.round(rh * 0.75)}px system-ui`, col, 'left');
      fit(g, e.status === 'final' ? 'FINAL' : e.status === 'airing' ? 'ON AIR' : e.status === 'open' ? 'OPEN' : '', W - 24, y, 140, `800 ${Math.round(rh * 0.65)}px system-ui`, col, 'right');
    });
    upd(R);
  }
  function kiosk(S, now) {
    const { g, c } = K, W = c.width; bg(g, W, c.height, '#0b2a55', '#03101f');
    fit(g, 'BALL KNOWLEDGE', W / 2, 70, W - 30, '900 48px system-ui', '#4da3ff'); fit(g, 'SPORTSBOOK', W / 2, 135, W - 30, '900 54px system-ui', '#fff');
    const cur = S.events.find((e) => e.status === 'open');
    if (cur) { fit(g, cur.label, W / 2, 215, W - 40, '700 32px system-ui', '#ffc83d'); fit(g, cur.a, W / 2, 285, W - 40, '700 40px system-ui'); fit(g, 'vs', W / 2, 330, W - 40, '600 28px system-ui', '#8f9bc7'); fit(g, cur.b, W / 2, 380, W - 40, '700 40px system-ui'); fit(g, mmss(cur.closeAt - now), W / 2, 500, W - 40, '900 96px system-ui', cur.closeAt - now < 20000 ? '#ff5a5a' : '#2ee09a'); }
    else fit(g, 'No game open', W / 2, 330, W - 40, '700 44px system-ui', '#8f9bc7');
    fit(g, 'PRESS E', W / 2, 580, W, '800 32px system-ui', '#ffc83d'); upd(K);
  }
  let last = 0;
  return { center: C.t, left: L.t, right: R.t, kiosk: K.t, amb: AMB.map((o) => o.t),
    blackout: false,
    draw(S, ts) {
      if (this.blackout) { if (ts - last < 120) return; last = ts; const nz = (o, label) => { const { g, c } = o, W = c.width, H = c.height; g.fillStyle = '#0c0c10'; g.fillRect(0, 0, W, H); for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.45})`; g.fillRect(Math.random() * W, Math.random() * H, 8 + Math.random() * 70, 2 + Math.random() * 3); } if (label) fit(g, 'NO SIGNAL', W / 2, H / 2, W - 40, '900 56px system-ui', '#8f9bc7'); upd(o); }; nz(C, true); nz(L, false); nz(R, false); AMB.forEach((o) => nz(o, false)); return; }
      if (!S || !S.events) { // title / lobby: idle splash
        if (ts - last < 190) return; last = ts; const sec = ts / 1000, { g, c } = C; drawScene(g, c.width, c.height, 'football', sec, '#2a5aa8', '#b02a2a', 3); g.fillStyle = '#000a'; g.fillRect(0, 0, c.width, c.height);
        fit(g, 'BALL KNOWLEDGE', c.width / 2, 240, c.width - 60, '900 76px system-ui', '#27e08a'); fit(g, 'Waiting for kickoff...', c.width / 2, 320, c.width - 60, '700 36px system-ui', '#ffc83d'); upd(C);
        AMB.forEach((o, k) => { drawScene(o.g, o.c.width, o.c.height, ['football', 'basketball', 'hockey'][k % 3], sec + k * 11, '#2a5aa8', '#b02a2a', k); upd(o); });
        { const l = L; bg(l.g, l.c.width, l.c.height, '#0e2a22', '#04100c'); fit(l.g, 'TONIGHT', l.c.width / 2, 120, l.c.width, '900 56px system-ui', '#27e08a'); fit(l.g, 'A mystery season', l.c.width / 2, 200, l.c.width - 30, '700 34px system-ui', '#ffc83d'); fit(l.g, '10 real games', l.c.width / 2, 250, l.c.width - 30, '700 30px system-ui', '#e8ecff'); upd(l); }
        { const r = R; bg(r.g, r.c.width, r.c.height, '#1a1030', '#07040f'); fit(r.g, 'SEASON BOARD', r.c.width / 2, 40, r.c.width, '900 34px system-ui', '#ff60e0'); for (let i = 0; i < 10; i++) fit(r.g, `${i + 1}   ??? vs ???`, 90, 90 + i * 24, 400, '700 20px system-ui', '#566', 'left'); upd(r); }
        return;
      } if (ts - last < 190) return; last = ts; const now = BK.now(); center(S, now, ts); ambient(S, now, ts); left(S, now); right(S, now); kiosk(S, now); } };
}
