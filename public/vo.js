// Voice lines (ElevenLabs clips in audio/vo/, listed in audio/vo/manifest.json by tools/voices.js).
// play(id, pos?) is a no-op for clips that don't exist yet, so the game works with any subset of lines.
// Positional when given a world position (a regular calling out), straight to the speakers otherwise (cutscenes, TV).
export function createVO(audio) {
  let have = new Set(); const bufs = new Map(); let last = { id: null, at: 0 };
  fetch('audio/vo/manifest.json').then((r) => (r.ok ? r.json() : { lines: [] })).then((m) => { have = new Set(m.lines || []); }).catch(() => {});
  const load = (id) => {
    if (!bufs.has(id)) bufs.set(id, fetch(`audio/vo/${id}.mp3`).then((r) => r.arrayBuffer()).then((b) => audio.ctx.decodeAudioData(b)).catch(() => null));
    return bufs.get(id);
  };
  return {
    has: (id) => have.has(id),
    async play(id, pos = null, o = {}) {
      if (!id || !have.has(id) || !audio.ready || !audio.ctx || audio.ctx.state !== 'running') return;
      const now = performance.now(); if (last.id === id && now - last.at < 4000) return; last = { id, at: now }; // no stutter on repeats
      const buf = await load(id); if (!buf) return;
      const c = audio.ctx, src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; g.gain.value = o.v ?? 1;
      if (pos) { const p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 3; p.rolloffFactor = 0.7; p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1.6; p.positionZ.value = pos.z; g.connect(p); p.connect(audio.buses.sfx); }
      else g.connect(audio.buses.sfx);
      src.connect(g); src.start(c.currentTime + (o.delay || 0));
    },
  };
}
