import * as THREE from 'three';

// Procedural canvas textures - no image assets needed.
export function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return { c, g, t };
}
const rnd = (a, b) => a + Math.random() * (b - a);
function grain(g, w, h, n, alpha, light = false) {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${Math.random() * alpha})`; g.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(1, 3)); }
}

export const woodFloor = (repeat) => canvasTex(512, 512, (g, w, h) => {
  const plank = 64;
  for (let y = 0; y < h; y += plank) {
    for (let x = -rnd(0, 200); x < w; x += rnd(180, 330)) {
      const base = 52 + Math.random() * 22; g.fillStyle = `rgb(${base + 22},${base + 8},${base - 6})`; g.fillRect(x, y, 400, plank - 2);
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(20,10,0,${Math.random() * 0.25})`; g.beginPath(); const yy = y + Math.random() * plank; g.moveTo(x, yy); g.lineTo(x + 400, yy + rnd(-3, 3)); g.stroke(); }
      g.fillStyle = '#0006'; g.fillRect(x, y, 2, plank);
    }
    g.fillStyle = '#0008'; g.fillRect(0, y + plank - 2, w, 2);
  }
  grain(g, w, h, 900, 0.18); grain(g, w, h, 200, 0.08, true);
  for (let i = 0; i < 8; i++) { const gr = g.createRadialGradient(0, 0, 2, 0, 0, rnd(20, 60)); g.save(); g.translate(Math.random() * w, Math.random() * h); gr.addColorStop(0, 'rgba(10,5,0,0.35)'); gr.addColorStop(1, 'rgba(10,5,0,0)'); g.fillStyle = gr; g.fillRect(-80, -80, 160, 160); g.restore(); } // spills
}, { repeat });

export const brick = (repeat) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#2a1914'; g.fillRect(0, 0, w, h);
  const bh = 32, bw = 96;
  for (let y = 0, r = 0; y < h; y += bh, r++) for (let x = -(r % 2) * bw / 2; x < w; x += bw) {
    const v = rnd(-14, 14); g.fillStyle = `rgb(${128 + v},${60 + v / 2},${44 + v / 2})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
  }
  grain(g, w, h, 1500, 0.25); grain(g, w, h, 300, 0.1, true);
}, { repeat });

export const paintedWall = (color = '#4f6b4a', repeat) => canvasTex(512, 512, (g, w, h) => { // tiles seamlessly: blotches wrap around the edges, no per-tile shading band
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const r = rnd(30, 110), cx = Math.random() * w, cy = Math.random() * h, c = `rgba(${Math.random() < 0.5 ? '30,20,0' : '0,0,0'},${rnd(0.08, 0.2)})`;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { // the copies across each edge are what make it seamless
      const x = cx + ox, y = cy + oy; if (x + r < 0 || x - r > w || y + r < 0 || y - r > h) continue;
      const gr = g.createRadialGradient(x, y, 4, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }
  grain(g, w, h, 1200, 0.12);
}, { repeat });

export const paneling = (repeat) => canvasTex(256, 256, (g, w, h) => {
  const pw = 32;
  for (let x = 0; x < w; x += pw) { const b = 60 + Math.random() * 18; g.fillStyle = `rgb(${b + 30},${b + 14},${b - 2})`; g.fillRect(x, 0, pw - 2, h); g.fillStyle = '#0008'; g.fillRect(x + pw - 2, 0, 2, h);
    for (let k = 0; k < 10; k++) { g.strokeStyle = `rgba(25,12,0,${Math.random() * 0.3})`; g.beginPath(); const xx = x + Math.random() * pw; g.moveTo(xx, 0); g.lineTo(xx + rnd(-2, 2), h); g.stroke(); } }
  grain(g, w, h, 500, 0.2);
}, { repeat });

export const ceilingTiles = (repeat) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#9a9684'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(60,50,30,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, rnd(1, 2), rnd(1, 2)); }
  g.strokeStyle = '#4a4636'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) { const gr = g.createRadialGradient(0, 0, 2, 0, 0, 60); g.save(); g.translate(Math.random() * w, Math.random() * h); gr.addColorStop(0, 'rgba(110,70,20,0.45)'); gr.addColorStop(1, 'rgba(110,70,20,0)'); g.fillStyle = gr; g.fillRect(-80, -80, 160, 160); g.restore(); }
}, { repeat });

export const vinyl = (hex = '#8b1d24') => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = hex; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#0005'; g.lineWidth = 2; for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32) { g.beginPath(); g.arc(x + 16, y + 16, 3, 0, 7); g.stroke(); }
  g.fillStyle = '#0003'; g.fillRect(0, 0, w, 3); grain(g, w, h, 200, 0.2);
});

export const felt = (hex = '#0d6b35') => canvasTex(256, 256, (g, w, h) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); grain(g, w, h, 1500, 0.18); grain(g, w, h, 600, 0.06, true); });

// posters / signs ----------------------------------------------------------------
export function poster(lines, { bg = '#e9d9a8', fg = '#2a1a10', accent = '#b3262e', w = 256, h = 340 } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = accent; g.fillRect(24, 24, w - 48, 8);
    g.textAlign = 'center'; g.fillStyle = fg;
    lines.forEach(([txt, size, col], i) => { g.font = `900 ${size}px "Arial Black", system-ui, sans-serif`; g.fillStyle = col || fg; g.fillText(txt, w / 2, 90 + i * (size + 14), w - 40); });
    grain(g, w, h, 500, 0.15);
  });
}
export function neon(text, color = '#27e08a', { w = 512, h = 128, size = 72 } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${size}px "Arial Black", system-ui, sans-serif`;
    g.shadowColor = color; g.shadowBlur = 28; g.strokeStyle = color; g.lineWidth = 6; g.strokeText(text, w / 2, h / 2 + 4, w - 30);
    g.shadowBlur = 8; g.fillStyle = '#fff'; g.fillText(text, w / 2, h / 2 + 4, w - 30);
  });
}
// Bar neon signs as bent glass tubes (no plain lettering): a shape per kind, a little script on some. Drawn twice per stroke:
// a wide blurred pass in the tube's colour (the glow), then a thin near-white core.
export function neonSign(kind, { w = 512, h = 512 } = {}) {
  return canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h); g.lineCap = 'round'; g.lineJoin = 'round';
    const tube = (col, draw, lw = 9) => { g.save(); g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 26; g.lineWidth = lw; g.beginPath(); draw(); g.stroke(); g.shadowBlur = 6; g.strokeStyle = '#fff8'; g.lineWidth = lw * 0.32; g.beginPath(); draw(); g.stroke(); g.restore(); };
    const script = (txt, col, x, y, size) => { g.save(); g.font = `italic 700 ${size}px "Brush Script MT", "Segoe Script", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = col; g.shadowBlur = 22; g.strokeStyle = col; g.lineWidth = 5; g.strokeText(txt, x, y); g.shadowBlur = 4; g.fillStyle = '#fffbe8'; g.fillText(txt, x, y); g.restore(); };
    const block = (txt, col, x, y, size) => { g.save(); g.font = `400 ${size}px Bungee, "Arial Black", system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = col; g.shadowBlur = 22; g.strokeStyle = col; g.lineWidth = 4; g.strokeText(txt, x, y); g.restore(); };
    const cx = w / 2;
    if (kind === 'football') {
      tube('#ff8a2a', () => { g.moveTo(cx - 190, 230); g.quadraticCurveTo(cx, 60, cx + 190, 230); g.quadraticCurveTo(cx, 400, cx - 190, 230); });
      tube('#fff2d8', () => { g.moveTo(cx - 70, 230); g.lineTo(cx + 70, 230); for (let i = -2; i <= 2; i++) { g.moveTo(cx + i * 28, 210); g.lineTo(cx + i * 28, 250); } }, 7);
      script('Game Day', '#ff3a6a', cx, 420, 84);
    } else if (kind === 'martini') {
      tube('#38e8ff', () => { g.moveTo(cx - 150, 90); g.lineTo(cx, 260); g.lineTo(cx + 150, 90); g.closePath(); g.moveTo(cx, 260); g.lineTo(cx, 380); g.moveTo(cx - 70, 390); g.lineTo(cx + 70, 390); });
      tube('#7dff6a', () => { g.arc(cx + 40, 150, 26, 0, Math.PI * 2); }, 8); tube('#ff4fd0', () => { g.moveTo(cx + 40, 150); g.lineTo(cx + 120, 60); }, 6);
      script('Cocktails', '#ff4fd0', cx, 460, 76);
    } else if (kind === 'mug') {
      tube('#ffb22a', () => { g.moveTo(cx - 110, 130); g.lineTo(cx - 100, 360); g.lineTo(cx + 80, 360); g.lineTo(cx + 90, 130); g.moveTo(cx + 88, 180); g.quadraticCurveTo(cx + 190, 190, cx + 160, 270); g.quadraticCurveTo(cx + 140, 320, cx + 84, 310); });
      tube('#fffbe0', () => { g.moveTo(cx - 120, 130); for (let i = 0; i < 4; i++) g.arc(cx - 92 + i * 56, 122, 28, Math.PI, 0); });
      tube('#ffd860', () => { for (const x of [-50, 0, 40]) { g.moveTo(cx + x, 190); g.lineTo(cx + x, 320); } }, 5);
      block('BUDGET LITE', '#ff3040', cx, 440, 54);
    } else if (kind === 'eightball') {
      tube('#4aa8ff', () => { g.arc(cx, 230, 170, 0, Math.PI * 2); }); tube('#fffbe8', () => { g.arc(cx - 40, 190, 64, 0, Math.PI * 2); }, 8);
      tube('#fffbe8', () => { g.arc(cx - 40, 168, 18, 0, Math.PI * 2); g.moveTo(cx - 18, 212); g.arc(cx - 40, 212, 22, 0, Math.PI * 2); }, 6);
      script('Rack \'em', '#ffcc33', cx, 450, 70);
    } else if (kind === 'hockey') {
      tube('#ff4040', () => { g.moveTo(cx - 170, 80); g.lineTo(cx + 60, 330); g.quadraticCurveTo(cx + 80, 352, cx + 140, 350); });
      tube('#4aa8ff', () => { g.moveTo(cx + 170, 80); g.lineTo(cx - 60, 330); g.quadraticCurveTo(cx - 80, 352, cx - 140, 350); });
      tube('#fffbe8', () => { g.ellipse(cx, 420, 60, 20, 0, 0, Math.PI * 2); }, 8);
    } else if (kind === 'pint') {
      tube('#ffb22a', () => { g.moveTo(cx - 150, 100); g.lineTo(cx - 120, 380); g.lineTo(cx - 10, 380); g.lineTo(cx + 20, 100); });
      tube('#fffbe0', () => { g.moveTo(cx - 150, 120); g.lineTo(cx + 20, 120); }, 6);
      tube('#5dff7a', () => { g.moveTo(cx + 120, 150); g.quadraticCurveTo(cx + 200, 220, cx + 120, 330); g.quadraticCurveTo(cx + 40, 220, cx + 120, 150); g.moveTo(cx + 120, 170); g.lineTo(cx + 120, 320); g.moveTo(cx + 120, 110); g.lineTo(cx + 120, 150); });
      script('On Tap', '#5dff7a', cx, 455, 80);
    } else if (kind === 'open') {
      tube('#4aa8ff', () => { g.roundRect(40, 150, w - 80, 210, 40); });
      block('OPEN', '#ff3040', cx, 258, 120);
    } else if (kind === 'bottle') {
      tube('#4aa8ff', () => { g.moveTo(cx - 20, 60); g.lineTo(cx - 20, 150); g.quadraticCurveTo(cx - 80, 190, cx - 80, 250); g.lineTo(cx - 80, 400); g.lineTo(cx + 80, 400); g.lineTo(cx + 80, 250); g.quadraticCurveTo(cx + 80, 190, cx + 20, 150); g.lineTo(cx + 20, 60); g.closePath(); });
      tube('#fffbe8', () => { g.roundRect(cx - 56, 270, 112, 80, 10); }, 6);
      script('Ice Cold', '#38e8ff', cx, 462, 74);
    }
  });
}
// Illustrated bar posters (beer deals, wing night, Uncle Sal's garage): a drawn picture, not just lines of type.
export function adPoster(kind, { w = 384, h = 512 } = {}) {
  return canvasTex(w, h, (g) => {
    const head = (txt, col, y, size, font = '400 {s}px Bungee, "Arial Black", system-ui') => { g.font = font.replace('{s}', size); g.fillStyle = col; g.textAlign = 'center'; g.fillText(txt, w / 2, y, w - 40); };
    if (kind === 'beer') {
      g.fillStyle = '#1d3f8a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd23a'; g.fillRect(0, 0, w, 96);
      head('BUCKET', '#1d3f8a', 70, 56); head('DEAL', '#ffffff', 150, 64);
      g.fillStyle = '#8a8f98'; g.beginPath(); g.moveTo(80, 240); g.lineTo(304, 240); g.lineTo(284, 400); g.lineTo(100, 400); g.closePath(); g.fill(); g.fillStyle = '#b8bec8'; g.fillRect(74, 232, 236, 16);
      for (let i = 0; i < 5; i++) { const x = 104 + i * 44; g.fillStyle = '#e8eef4'; g.fillRect(x, 186, 26, 70); g.fillRect(x + 8, 160, 10, 30); g.fillStyle = '#d0242c'; g.fillRect(x, 206, 26, 22); }
      head('5 BUDGET LITE', '#ffd23a', 440, 30); head('$15', '#ffffff', 492, 48);
    } else if (kind === 'wings') {
      g.fillStyle = '#2a0e08'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) { g.fillStyle = ['#ff3a1a', '#ff8a1a', '#ffd23a'][i % 3]; g.beginPath(); const x = i * 48; g.moveTo(x - 10, 300); g.quadraticCurveTo(x + 20, 190 - (i % 2) * 60, x + 30, 120 + (i % 3) * 40); g.quadraticCurveTo(x + 50, 220, x + 60, 300); g.fill(); }
      head('WING', '#ffd23a', 86, 76); head('NIGHT', '#ffffff', 160, 70);
      g.fillStyle = '#b4501c'; for (const [x, y, r] of [[120, 340, 0.4], [210, 330, -0.3], [290, 350, 0.2]]) { g.save(); g.translate(x, y); g.rotate(r); g.beginPath(); g.ellipse(0, 0, 46, 30, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f2e6d0'; g.fillRect(36, -7, 34, 14); g.beginPath(); g.arc(72, -8, 8, 0, Math.PI * 2); g.arc(72, 8, 8, 0, Math.PI * 2); g.fill(); g.restore(); g.fillStyle = '#b4501c'; }
      head('50¢ WINGS', '#ffd23a', 436, 44); head('EVERY THURSDAY · HOT AS HELL', '#ffffff', 480, 20, '700 {s}px system-ui');
    } else if (kind === 'sal') {
      g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#8c1a1a'; g.fillRect(0, 0, w, 120); g.fillRect(0, h - 56, w, 56);
      head('UNCLE SAL', '#ffffff', 58, 46); head('AUTOMOTIVE', '#ffd23a', 100, 32);
      g.fillStyle = '#2a2a30'; g.beginPath(); g.moveTo(60, 280); g.lineTo(100, 220); g.lineTo(270, 220); g.lineTo(320, 280); g.lineTo(330, 320); g.lineTo(50, 320); g.closePath(); g.fill();
      g.fillStyle = '#9fc4e0'; g.fillRect(118, 232, 66, 40); g.fillRect(192, 232, 66, 40); g.fillStyle = '#111'; for (const x of [110, 270]) { g.beginPath(); g.arc(x, 322, 28, 0, Math.PI * 2); g.fill(); }
      g.save(); g.translate(300, 180); g.rotate(-0.6); g.fillStyle = '#8a8f98'; g.fillRect(-8, -60, 16, 110); g.beginPath(); g.arc(0, -64, 22, 0, Math.PI * 2); g.fill(); g.fillStyle = '#efe6d2'; g.fillRect(-7, -90, 14, 26); g.restore();
      head('COLLISION · TOWING · CASH ONLY', '#2a1a10', 380, 19, '800 {s}px system-ui'); head('"We fix anything."', '#8c1a1a', 420, 28, 'italic 700 {s}px Georgia, serif'); head('No questions asked.', '#2a1a10', 452, 20, 'italic {s}px Georgia, serif'); head('ASK FOR SAL', '#ffffff', 494, 26);
    }
    grain(g, w, h, 900, 0.1);
  });
}
export function label(text, color = '#fff', scale = 1, w = 256) {
  const { t } = canvasTex(w, 64, (g) => { g.fillStyle = '#000b'; g.roundRect(0, 0, w, 64, 16); g.fill(); g.fillStyle = color; g.font = 'bold 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 34, w - 16); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false, fog: false })); s.scale.set(1.6 * scale * (w / 256), 0.4 * scale, 1); s.renderOrder = 10; return s;
}
export function bubble() {
  const { c, g, t } = canvasTex(512, 160, () => {});
  const mat = new THREE.SpriteMaterial({ map: t, depthTest: true, depthWrite: false, transparent: true, toneMapped: false, fog: false }); const s = new THREE.Sprite(mat); s.scale.set(1.2, 0.375, 1); s.renderOrder = 11; s.visible = false; // hidden behind walls; bar.js scales it with distance
  return { sprite: s, set(text) {
    if (!text) { s.visible = false; return; }
    g.clearRect(0, 0, 512, 160); g.fillStyle = '#fff'; g.strokeStyle = '#222'; g.lineWidth = 6; g.beginPath(); g.roundRect(8, 8, 496, 110, 24); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(230, 116); g.lineTo(256, 152); g.lineTo(280, 116); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = '#111'; g.font = 'bold 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = text.split(' '); let line = '', lines = []; for (const w of words) { if ((line + w).length > 28) { lines.push(line); line = ''; } line += w + ' '; } lines.push(line);
    lines.slice(0, 2).forEach((l, i, a) => g.fillText(l.trim(), 256, 62 + (i - (a.length - 1) / 2) * 36, 470));
    t.needsUpdate = true; s.visible = true;
  } };
}

// ---------- clothing textures ----------
export function jerseyTex(color = '#1b2a5a', trim = '#ffffff', number = '12', numColor = '#ffffff') {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = trim; g.fillRect(0, 0, w, 10); g.fillRect(0, 22, w, 4);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 78px "Arial Black", system-ui'; g.lineWidth = 8; g.strokeStyle = trim === numColor ? '#00000055' : trim; g.strokeText(number, w / 2, 78); g.fillStyle = numColor; g.fillText(number, w / 2, 78);
    grain(g, w, h, 160, 0.12);
  });
}
export function floralTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#16231c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { const x = Math.random() * w, y = Math.random() * h, c = ['#d9382b', '#f08a24', '#e8c13a', '#c42a56'][i % 4]; g.fillStyle = c; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.26) * 6, y + Math.sin(k * 1.26) * 6, 5, 0, 7); g.fill(); } g.fillStyle = '#f5d96a'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.fillStyle = '#2d7a3a'; g.fillRect(x + 8, y + 6, 10, 4); }
  });
}
export function buttonShirtTex(hex = '#aab0b8') {
  return canvasTex(64, 128, (g, w, h) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); g.fillStyle = '#0003'; g.fillRect(w / 2 - 1, 0, 2, h); for (let y = 12; y < h; y += 22) { g.fillStyle = '#0005'; g.beginPath(); g.arc(w / 2 + 6, y, 2.5, 0, 7); g.fill(); } g.fillStyle = '#0002'; g.fillRect(10, 24, 14, 16); grain(g, w, h, 100, 0.1); });
}
