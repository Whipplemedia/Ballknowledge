import * as THREE from 'three';
import { canvasTex } from './textures.js';

// Wall TVs: highlights broadcast (center), up-next board (left), scoreboard (right), and the kiosk screen.
export function createTV(BK) {
  const mk = (w, h) => canvasTex(w, h, (g) => { g.fillStyle = '#071024'; g.fillRect(0, 0, w, h); });
  const C = mk(1024, 576), L = mk(640, 360), R = mk(640, 360), K = mk(512, 300);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fit = (g, text, x, y, maxW, font, color = '#fff', align = 'center') => { g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(text, x, y, maxW); };
  const badge = (g, S, name, x, y, r) => { const t = S.teams && S.teams[name]; g.fillStyle = t ? t.color : '#444'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.strokeStyle = '#fff6'; g.lineWidth = 3; g.stroke(); fit(g, t ? t.short : '?', x, y + r * 0.22, r * 1.7, `900 ${Math.round(r * 0.62)}px system-ui`); };
  const bg = (g, w, h, c1 = '#0a1a3a', c2 = '#04060f') => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
  const upd = (o) => { o.t.needsUpdate = true; };

  function center(S, now) {
    const { g, c } = C, W = c.width, H = c.height; bg(g, W, H);
    const air = S.events.filter((e) => e.status === 'airing').sort((a, b) => a.closeAt - b.closeAt);
    // top bar
    g.fillStyle = '#c4111a'; g.fillRect(0, 0, W, 54); fit(g, 'BKN  SPORTS', 24, 38, 300, '900 30px system-ui', '#fff', 'left');
    if (!air.length) {
      fit(g, 'BALL KNOWLEDGE NETWORK', W / 2, 220, W - 60, '900 62px system-ui', '#27e08a');
      const open = S.events.find((e) => e.status === 'open'), up = S.events.find((e) => e.status === 'upcoming');
      if (open) { fit(g, 'NOW TAKING BETS', W / 2, 310, W - 60, '800 40px system-ui', '#ffc83d'); fit(g, `${open.a}  vs  ${open.b}`, W / 2, 370, W - 60, '700 38px system-ui'); fit(g, `Closes in ${mmss(open.closeAt - now)}`, W / 2, 440, W - 60, '800 44px system-ui', '#ff7a88'); }
      else if (up) fit(g, `Next game opens in ${mmss(up.openAt - now)}`, W / 2, 340, W - 60, '800 44px system-ui', '#ffc83d');
      else fit(g, 'All games are final', W / 2, 340, W - 60, '800 44px system-ui', '#ffc83d');
      fit(g, 'Highlights air here after betting closes.', W / 2, 520, W - 60, '600 28px system-ui', '#8f9bc7'); upd(C); return;
    }
    const ev = air[0], f = clamp((now - ev.closeAt) / (ev.resolveAt - ev.closeAt), 0, 1);
    let i = 0; const P = ev.plays; while (i + 1 < P.length && P[i + 1].f <= f) i++;
    const cur = P[i], recent = []; for (let k = i; k >= 0 && recent.length < 3; k--) if (P[k].txt) recent.push(P[k].txt);
    fit(g, `HIGHLIGHTS · ${ev.label.toUpperCase()}`, W - 24, 38, 640, '800 26px system-ui', '#fff', 'right');
    // scoreboard
    g.fillStyle = '#0006'; g.fillRect(40, 80, W - 80, 170);
    badge(g, S, ev.a, 130, 165, 52); badge(g, S, ev.b, W - 130, 165, 52);
    fit(g, ev.a, 130, 245, 250, '700 22px system-ui'); fit(g, ev.b, W - 130, 245, 250, '700 22px system-ui');
    fit(g, String(cur.sa), 330, 195, 160, '900 110px system-ui', '#ffc83d'); fit(g, String(cur.sb), W - 330, 195, 160, '900 110px system-ui', '#ffc83d');
    fit(g, cur.per || '', W / 2, 150, 200, '900 44px system-ui', '#ff7a88'); fit(g, f >= 0.985 ? 'FINAL' : 'LIVE', W / 2, 205, 200, '800 30px system-ui', f >= 0.985 ? '#27e08a' : '#fff');
    // play text
    g.fillStyle = '#000a'; g.fillRect(40, 280, W - 80, 170);
    recent.forEach((t, k) => fit(g, t, W / 2, 335 + k * 48, W - 120, k === 0 ? '800 38px system-ui' : '600 28px system-ui', k === 0 ? '#fff' : '#8f9bc7'));
    // progress + queue
    g.fillStyle = '#1b2442'; g.fillRect(40, 480, W - 80, 14); g.fillStyle = '#27e08a'; g.fillRect(40, 480, (W - 80) * f, 14);
    fit(g, `${Math.round(f * 100)}% of broadcast  ·  FINAL in ${mmss(ev.resolveAt - now)}`, 40, 530, 560, '600 24px system-ui', '#8f9bc7', 'left');
    if (air.length > 1) fit(g, `+${air.length - 1} more game${air.length > 2 ? 's' : ''} queued`, W - 40, 530, 360, '700 24px system-ui', '#ffc83d', 'right');
    upd(C);
  }
  function left(S, now) {
    const { g, c } = L, W = c.width, H = c.height; bg(g, W, H, '#0e2a22', '#04100c');
    const cur = S.events.find((e) => e.status === 'open'), up = S.events.find((e) => e.status === 'upcoming');
    fit(g, cur ? 'NOW OPEN' : up ? 'UP NEXT' : 'BETS CLOSED', W / 2, 52, W, '900 40px system-ui', '#27e08a');
    const ev = cur || up;
    if (!ev) { fit(g, 'Watch the highlights', W / 2, 200, W - 40, '700 32px system-ui', '#8f9bc7'); upd(L); return; }
    fit(g, ev.label, W / 2, 96, W - 40, '700 26px system-ui', '#ffc83d');
    badge(g, S, ev.a, 130, 190, 48); badge(g, S, ev.b, W - 130, 190, 48); fit(g, 'VS', W / 2, 202, 100, '900 36px system-ui', '#8f9bc7');
    fit(g, ev.a, 130, 262, 240, '700 22px system-ui'); fit(g, ev.b, W - 130, 262, 240, '700 22px system-ui');
    const ms = (cur ? ev.closeAt : ev.openAt) - now; fit(g, (cur ? 'BETS CLOSE ' : 'OPENS ') + mmss(ms), W / 2, 330, W - 40, '900 38px system-ui', ms < 20000 && cur ? '#ff4d5e' : '#fff');
    upd(L);
  }
  function right(S, now) {
    const { g, c } = R, W = c.width, H = c.height; bg(g, W, H, '#1a1030', '#07040f');
    fit(g, 'SEASON BOARD', W / 2, 40, W, '900 34px system-ui', '#ff60e0');
    const n = S.events.length, rh = Math.min(30, (H - 60) / n);
    S.events.forEach((e, i) => {
      const y = 62 + i * rh + rh * 0.75; const sh = (nm) => (S.teams[nm] ? S.teams[nm].short : '?');
      const col = e.status === 'final' ? '#e8ecff' : e.status === 'airing' ? '#ffc83d' : e.status === 'open' ? '#27e08a' : '#566';
      const txt = e.status === 'final' ? `${sh(e.a)} ${e.result.sa} - ${e.result.sb} ${sh(e.b)}` : `${sh(e.a)} vs ${sh(e.b)}`;
      fit(g, `${i + 1}`, 28, y, 30, `800 ${Math.round(rh * 0.75)}px system-ui`, col, 'left'); fit(g, txt, 70, y, 300, `700 ${Math.round(rh * 0.75)}px system-ui`, col, 'left');
      fit(g, e.status === 'final' ? 'FINAL' : e.status === 'airing' ? 'ON AIR' : e.status === 'open' ? 'OPEN' : '', W - 24, y, 140, `800 ${Math.round(rh * 0.65)}px system-ui`, col, 'right');
    });
    upd(R);
  }
  function kiosk(S, now) {
    const { g, c } = K, W = c.width; bg(g, W, c.height, '#0b2a55', '#03101f');
    fit(g, '🏦 SPORTSBOOK', W / 2, 60, W - 20, '900 44px system-ui', '#fff');
    const cur = S.events.find((e) => e.status === 'open');
    if (cur) { fit(g, cur.label, W / 2, 120, W - 30, '700 28px system-ui', '#ffc83d'); fit(g, `${cur.a} vs ${cur.b}`, W / 2, 165, W - 30, '700 30px system-ui'); fit(g, mmss(cur.closeAt - now), W / 2, 250, W - 30, '900 70px system-ui', cur.closeAt - now < 20000 ? '#ff4d5e' : '#27e08a'); }
    else fit(g, 'No game open', W / 2, 170, W - 30, '700 36px system-ui', '#8f9bc7');
    fit(g, 'PRESS E', W / 2, 285, W, '800 24px system-ui', '#ffc83d'); upd(K);
  }
  let last = 0, lastKey = '';
  return { center: C.t, left: L.t, right: R.t, kiosk: K.t,
    draw(S, ts) { if (!S || !S.events) return; if (ts - last < 200) return; last = ts; const now = BK.now(); center(S, now); left(S, now); right(S, now); kiosk(S, now); } };
}
