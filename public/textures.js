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

export const paintedWall = (color = '#4f6b4a', repeat) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { const gr = g.createRadialGradient(0, 0, 4, 0, 0, rnd(30, 110)); g.save(); g.translate(Math.random() * w, Math.random() * h); gr.addColorStop(0, `rgba(${Math.random() < 0.5 ? '30,20,0' : '0,0,0'},${rnd(0.08, 0.2)})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-120, -120, 240, 240); g.restore(); }
  const gr2 = g.createLinearGradient(0, 0, 0, h); gr2.addColorStop(0, 'rgba(0,0,0,0.35)'); gr2.addColorStop(0.25, 'rgba(0,0,0,0)'); g.fillStyle = gr2; g.fillRect(0, 0, w, h);
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
export function label(text, color = '#fff', scale = 1, w = 256) {
  const { t } = canvasTex(w, 64, (g) => { g.fillStyle = '#000b'; g.roundRect(0, 0, w, 64, 16); g.fill(); g.fillStyle = color; g.font = 'bold 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 34, w - 16); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.6 * scale * (w / 256), 0.4 * scale, 1); s.renderOrder = 10; return s;
}
export function bubble() {
  const { c, g, t } = canvasTex(512, 160, () => {});
  const mat = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }); const s = new THREE.Sprite(mat); s.scale.set(2.2, 0.69, 1); s.renderOrder = 11; s.visible = false;
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
