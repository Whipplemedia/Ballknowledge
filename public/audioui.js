// Sound & voice settings panel (button bottom-right, or press O).
import { audio, SONG_NAMES } from './audio.js';

export function createAudioUI(voice, BK) {
  const btn = document.createElement('button'); btn.id = 'audiobtn'; btn.className = 'hidden'; btn.title = 'Sound & voice (O)'; btn.textContent = '🔊'; document.body.appendChild(btn);
  const box = document.createElement('div'); box.id = 'audiopanel'; box.className = 'hidden'; document.body.appendChild(box);
  const slider = (label, bus) => `<label class="arow"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(audio.settings[bus] * 100)}" data-bus="${bus}"><b>${Math.round(audio.settings[bus] * 100)}</b></label>`;
  const paint = () => {
    const vs = voice.enabled, peers = [...voice.peers.values()].filter((p) => p.state === 'connected').length;
    const names = {}; ((BK.S && BK.S.players) || []).forEach((p) => { names[p.id] = p.name; });
    box.innerHTML = `<h3>Sound &amp; voice <button class="x" data-a="close">✕</button></h3>
      ${slider('Master', 'master')}${slider('Effects', 'sfx')}${slider('Music', 'music')}${slider('Crowd', 'ambience')}${slider('Voices', 'voice')}
      <div class="arow"><span>Jukebox</span><button data-a="song">⏭ ${audio.music.on ? audio.music.name : 'off'}</button><button data-a="mtoggle">${audio.music.on ? 'Turn off' : 'Turn on'}</button></div>
      <hr><div class="arow"><span>Voice chat</span><button data-a="voice" class="${vs ? 'on' : ''}">${vs ? 'Leave voice' : 'Join voice'}</button></div>
      ${voice.error ? `<p class="aerr">${voice.error}</p>` : ''}
      ${vs ? `<div class="arow"><span>Mic</span><select data-a="mode"><option value="ptt" ${audio.settings.voiceMode === 'ptt' ? 'selected' : ''}>Push-to-talk (hold V)</option><option value="open" ${audio.settings.voiceMode === 'open' ? 'selected' : ''}>Open mic</option></select></div>
      <div class="arow"><span>Hear</span><select data-a="range"><option value="near" ${audio.settings.voiceRange === 'near' ? 'selected' : ''}>Nearby (3D)</option><option value="all" ${audio.settings.voiceRange === 'all' ? 'selected' : ''}>Whole bar</option></select></div>
      <div class="arow"><span>Mic level</span><i class="meter"><u id="micmeter"></u></i></div>
      <p class="ahint">${peers} connected: ${[...voice.peers.values()].map((p) => `<span class="${p.speaking ? 'sp' : ''}">${names[p.id] || p.id} (${p.state})</span>`).join(', ') || 'nobody else on voice yet'}. M mutes.</p>` : '<p class="ahint">Voice is peer-to-peer. Your browser will ask for microphone access. Use headphones to avoid echo.</p>'}`;
  };
  const open = () => { BK.freeMouse = true; document.exitPointerLock && document.exitPointerLock(); paint(); box.classList.remove('hidden'); };
  const close = () => box.classList.add('hidden');
  btn.onclick = () => (box.classList.contains('hidden') ? open() : close());
  addEventListener('keydown', (e) => { if (e.code === 'KeyO' && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) (box.classList.contains('hidden') ? open() : close()); });
  box.addEventListener('input', (e) => { const b = e.target.dataset.bus; if (b) { audio.setVolume(b, e.target.value / 100); e.target.nextElementSibling.textContent = e.target.value; } });
  box.addEventListener('change', (e) => { const a = e.target.dataset.a; if (a === 'mode') voice.setMode(e.target.value); if (a === 'range') voice.setRange(e.target.value); });
  box.addEventListener('click', async (e) => {
    const a = e.target.dataset.a; if (!a) return; audio.unlock();
    if (a === 'close') close(); else if (a === 'song') { audio.music.next(); audio.sfx('click'); paint(); } else if (a === 'mtoggle') { audio.music.toggle(); paint(); }
    else if (a === 'voice') { if (voice.enabled) voice.disable(); else await voice.enable(); paint(); }
  });
  setInterval(() => { if (box.classList.contains('hidden')) return; const m = document.getElementById('micmeter'); if (m) m.style.width = Math.min(100, voice.level * 600) + '%'; if (voice.enabled) { const h = box.querySelector('.ahint'); if (h && !h.dataset.freeze) { /* refresh peer list cheaply */ } } }, 100);
  setInterval(() => { if (!box.classList.contains('hidden') && voice.enabled && !box.contains(document.activeElement)) paint(); }, 1500);
  return { show(on) { btn.classList.toggle('hidden', !on); if (!on) close(); }, open, close };
}
