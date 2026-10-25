// Proximity voice chat. Peer-to-peer WebRTC audio mesh (max 6 players -> at most 5 connections each).
// Signaling goes through the game server ({type:'rtc', to|'*', data}); media never touches the server.
// Remote voices are routed through a PannerNode at the speaker's avatar so you hear them where they stand.
import { audio } from './audio.js';

export function createVoice(BK) {
  const V = { enabled: false, muted: false, talking: false, peers: new Map(), error: '', level: 0, constraints: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
  let stream = null, track = null, ice = null, localAnalyser = null, localBuf = null;
  const S = () => BK.S, me = () => BK.S && BK.S.you;
  const sig = (to, data) => BK.send({ type: 'rtc', to, data });

  // ---- HUD pill
  const hud = document.createElement('div'); hud.id = 'voicehud'; hud.className = 'hidden'; document.body.appendChild(hud);
  const paintHud = () => {
    if (!V.enabled) { hud.classList.add('hidden'); return; }
    hud.classList.remove('hidden'); const ptt = audio.settings.voiceMode === 'ptt';
    hud.className = V.muted ? 'muted' : V.talking ? 'live' : '';
    hud.textContent = V.muted ? '🎙 Muted (M)' : V.talking ? '🎙 Talking' : ptt ? '🎙 Hold V to talk' : '🎙 Open mic (M mutes)';
  };
  const applyTrack = (pttHeld) => {
    if (!track) return; const open = audio.settings.voiceMode === 'open';
    V.talking = !V.muted && (open || pttHeld); track.enabled = V.talking; paintHud();
  };
  let held = false;
  addEventListener('keydown', (e) => {
    if (!V.enabled || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
    if (e.code === 'KeyV' && !e.repeat) { held = true; applyTrack(true); }
    if (e.code === 'KeyM' && !e.repeat) { V.muted = !V.muted; applyTrack(held); BK.toast && BK.toast(V.muted ? 'Mic muted' : 'Mic live', 'info'); }
  });
  addEventListener('keyup', (e) => { if (e.code === 'KeyV') { held = false; applyTrack(false); } });
  addEventListener('blur', () => { held = false; applyTrack(false); });

  async function iceServers() {
    if (ice) return ice;
    try { ice = await (await fetch('/ice.json', { cache: 'no-store' })).json(); } catch { ice = [{ urls: 'stun:stun.l.google.com:19302' }]; }
    return ice;
  }

  // ---- peers
  function makePeer(id, initiator) {
    if (V.peers.has(id)) return V.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: ice || [{ urls: 'stun:stun.l.google.com:19302' }] });
    const P = { id, pc, initiator, speaking: false, level: 0, gain: null, panner: null, analyser: null, buf: null, el: null, state: 'new', born: Date.now() };
    V.peers.set(id, P);
    if (track) pc.addTrack(track, stream);
    pc.onicecandidate = (e) => { if (e.candidate) sig(id, { k: 'ice', c: e.candidate }); };
    pc.onconnectionstatechange = () => { P.state = pc.connectionState; if (['failed', 'closed'].includes(pc.connectionState)) drop(id); };
    pc.ontrack = (e) => {
      const c = audio.ctx; if (!c || P.src) return; P.src = c.createMediaStreamSource(e.streams[0]);
      // Chrome only pulls WebRTC audio when the stream is also attached to a media element (kept muted; playback is via WebAudio)
      P.el = new Audio(); P.el.muted = true; P.el.srcObject = e.streams[0]; P.el.play().catch(() => {});
      P.gain = c.createGain(); P.gain.gain.value = 1;
      P.panner = c.createPanner(); P.panner.panningModel = 'HRTF'; P.panner.distanceModel = 'inverse'; P.panner.refDistance = 3; P.panner.maxDistance = 60; P.panner.rolloffFactor = audio.settings.voiceRange === 'all' ? 0 : 0.85;
      P.analyser = c.createAnalyser(); P.analyser.fftSize = 512; P.buf = new Float32Array(P.analyser.fftSize);
      P.src.connect(P.analyser); P.src.connect(P.gain); P.gain.connect(P.panner); P.panner.connect(audio.buses.voice);
    };
    if (initiator) pc.onnegotiationneeded = async () => {
      try { const o = await pc.createOffer(); await pc.setLocalDescription(o); sig(id, { k: 'offer', sdp: pc.localDescription }); } catch (err) { V.error = String(err); }
    };
    return P;
  }
  function drop(id, retry = true) {
    const P = V.peers.get(id); if (!P) return; V.peers.delete(id);
    try { P.pc.close(); } catch {} try { P.src && P.src.disconnect(); P.gain && P.gain.disconnect(); P.panner && P.panner.disconnect(); if (P.el) { P.el.srcObject = null; } } catch {}
    // if we're still voice-enabled and the player is still here, try again shortly
    if (retry) setTimeout(() => { if (V.enabled && (S().players || []).some((p) => p.id === id) && !V.peers.has(id)) sig(id, { k: 'hello' }); }, 2500);
  }

  V.onSignal = async (m) => {
    const id = m.from, d = m.data || {}; if (!V.enabled) return;
    try {
      if (d.k === 'bye') { drop(id, false); return; }
      if (d.k === 'hello') { // lower id offers; the other side answers our hello so both know voice is on
        if (V.peers.has(id)) { const P0 = V.peers.get(id); if (P0.state === 'connected' || Date.now() - P0.born < 4000) return; drop(id, false); }
        if (String(me()) < String(id)) makePeer(id, true); else sig(id, { k: 'hello' });
      } else if (d.k === 'offer') {
        const P = V.peers.get(id) || makePeer(id, false); await P.pc.setRemoteDescription(d.sdp); const a = await P.pc.createAnswer(); await P.pc.setLocalDescription(a); sig(id, { k: 'answer', sdp: P.pc.localDescription });
        (P.pending || []).splice(0).forEach((c) => P.pc.addIceCandidate(c).catch(() => {}));
      } else if (d.k === 'answer') { const P = V.peers.get(id); if (P) { await P.pc.setRemoteDescription(d.sdp); (P.pending || []).splice(0).forEach((c) => P.pc.addIceCandidate(c).catch(() => {})); } }
      else if (d.k === 'ice') { const P = V.peers.get(id); if (!P) return; if (P.pc.remoteDescription) P.pc.addIceCandidate(d.c).catch(() => {}); else (P.pending = P.pending || []).push(d.c); }
    } catch (err) { V.error = String(err); }
  };

  V.enable = async () => {
    if (V.enabled) return true; V.error = '';
    const c = audio.unlock(); if (!c) { V.error = 'Audio is not available in this browser.'; return false; }
    if (!V.testStream && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) { V.error = 'Voice chat needs a secure (https) page and a microphone.'; return false; }
    try { stream = V.testStream ? V.testStream() : await navigator.mediaDevices.getUserMedia({ audio: V.constraints, video: false }); }
    catch (err) { V.error = err && err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not open the microphone.'; return false; }
    track = stream.getAudioTracks()[0]; track.enabled = audio.settings.voiceMode === 'open';
    const src = c.createMediaStreamSource(stream); localAnalyser = c.createAnalyser(); localAnalyser.fftSize = 512; localBuf = new Float32Array(512); src.connect(localAnalyser);
    await iceServers(); V.enabled = true; V.muted = false; applyTrack(false);
    BK.send({ type: 'rtc', to: '*', data: { k: 'hello' } }); return true;
  };
  V.disable = () => {
    if (!V.enabled) return; BK.send({ type: 'rtc', to: '*', data: { k: 'bye' } }); V.enabled = false; for (const id of [...V.peers.keys()]) drop(id);
    if (stream) stream.getTracks().forEach((t) => t.stop()); stream = track = localAnalyser = null; V.talking = false; paintHud();
  };
  V.setRange = (mode) => { audio.settings.voiceRange = mode; audio.save(); for (const P of V.peers.values()) if (P.panner) P.panner.rolloffFactor = mode === 'all' ? 0 : 0.85; };
  V.setMode = (mode) => { audio.settings.voiceMode = mode; audio.save(); applyTrack(held); };

  const rms = (an, buf) => { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };
  // per-frame: place remote voices at their avatars, measure who is speaking, drop peers who left the room
  V.update = (dt, avatars) => {
    if (!V.enabled) return;
    if (localAnalyser) { const l = rms(localAnalyser, localBuf); V.level += (l - V.level) * Math.min(1, dt * 12); }
    const here = new Set((S().players || []).map((p) => p.id));
    for (const [id, P] of V.peers) {
      if (!here.has(id)) { drop(id); continue; }
      const a = avatars.get(id), g = a && a.P.group.position;
      if (P.panner && g) { const t = audio.ctx.currentTime; P.panner.positionX.setTargetAtTime(g.x, t, 0.05); P.panner.positionY.setTargetAtTime((g.y || 0) + 1.6, t, 0.05); P.panner.positionZ.setTargetAtTime(g.z, t, 0.05); }
      if (P.analyser) { const l = rms(P.analyser, P.buf); P.level += (l - P.level) * Math.min(1, dt * 14); P.speaking = P.level > 0.012; } else P.speaking = false;
    }
  };
  V.speaking = (id) => { const P = V.peers.get(id); return !!(P && P.speaking); };
  V.reset = () => { V.disable(); };
  return V;
}
