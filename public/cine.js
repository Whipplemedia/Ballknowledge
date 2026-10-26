import * as THREE from 'three';

// Cutscenes for Sal's muscle, timed by the server (state.cine = {kind, start, until, names?, amount?, victims?}) so every
// player sees the same beats. Returns true while it owns the camera; world.js then skips input and its own camera.
// Shots are short, letterboxed, with a caption; doors swing on cue.
const FRONT_IN = new THREE.Vector3(5, 1.3, 7.9), BACK_IN = new THREE.Vector3(11.7, 1.2, -6.6);
export function createCine({ camera, BK, doors, goons, audio }) {
  const top = document.createElement('div'), bot = document.createElement('div'), cap = document.createElement('div'), fade = document.createElement('div');
  top.className = 'lbox top'; bot.className = 'lbox bot'; cap.id = 'cinecap'; fade.id = 'cinefade'; document.body.append(top, bot, cap, fade);
  const v = new THREE.Vector3(), look = new THREE.Vector3(); let shown = null, cues = {};
  const money = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
  const lead = () => goons.get('g0') || goons.list()[0];
  const goonPos = (o, y = 1.3) => (o ? v.set(o.P.group.position.x, y, o.P.group.position.z) : v.set(5, y, 5));
  const caption = (h, sub) => { const html = h ? `<b>${h}</b>${sub ? `<span>${sub}</span>` : ''}` : ''; if (cap.innerHTML !== html) cap.innerHTML = html; cap.classList.toggle('on', !!h); };
  const cue = (key, fn) => { if (!cues[key]) { cues[key] = true; fn(); } };
  const door = (d, open, dt, ang = 1.35) => { if (!d) return; const tgt = open ? ang : 0; /* swings into the room */ d.rotation.y += ((d.userData.base ?? (d.userData.base = d.rotation.y)) + tgt - d.rotation.y) * Math.min(1, dt * 7); };
  const shot = (px, py, pz, lx, ly, lz) => { camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); };

  return {
    // me: the local player's id; returns 'camera' (cutscene owns the camera), or null
    update(dt, myId) {
      const c = BK.S && BK.S.cine, now = BK.now();
      const on = !!(c && now < c.until + 200);
      document.body.classList.toggle('cine', on);
      if (!on) { if (shown) { shown = null; cues = {}; caption(''); fade.style.opacity = 0; } door(doors.front, false, dt); door(doors.back, false, dt, -1.35); return null; }
      if (shown !== c.start) { shown = c.start; cues = {}; }
      const t = (now - c.start) / 1000, L = lead();
      fade.style.opacity = 0;
      if (c.kind === 'huntIntro' || c.kind === 'shakeIntro') {
        const hunt = c.kind === 'huntIntro', tB = hunt ? 2.6 : 99, tC = hunt ? 4.8 : 2.3;
        door(doors.front, t > 0.45 && t < tC + 0.6, dt);
        if (t > 0.45) cue('bang', () => { audio.sfx('bonk', { v: 1 }); audio.sfx('sting'); });
        if (t < tB && t < tC) { shot(5, 1.65, 3.4 - t * 0.12, 5, 1.35, 7.9); caption(''); }
        else if (t < tC) { const p = goonPos(L, 1.35); shot(7.0 - (t - tB) * 0.2, 0.7, 3.4, p.x, p.y, p.z); caption(''); } /* low angle from the pool-table side */
        else {
          const g = L && L.P.group, ry = g ? g.rotation.y : 0, fx = -Math.sin(ry), fz = -Math.cos(ry), p = goonPos(L, 1.7), d = 1.55 - (t - tC) * 0.08;
          shot(p.x + fx * d + 0.25, 1.62, p.z + fz * d, p.x, 1.62, p.z);
          if (hunt) caption('SAL SENDS HIS REGARDS', `${(c.names || []).join(', ')} - ${money(c.amount)}. Tonight.`);
          else caption("SAL'S COLLECTORS", `The crew came up ${money(c.amount)} short. Pay up - or throw them out.`);
        }
        return 'camera';
      }
      if (c.kind === 'opening') { // the night opens on Sal in his booth: who he is, what the crew owes, what tonight's number is
        if (t < 6.4) { const k = Math.min(1, t / 6.4); shot(9.5 + Math.sin(t * 0.3) * 0.15, 1.42, -4.9 - k * 0.55, 9.5, 1.36, -7.0); }
        else { const k = (t - 6.4) / 3.1; shot(8.6 - k * 0.8, 2.5 + k * 0.3, -4.6 + k * 0.6, 0, 1.2, 3); }
        const n = c.night || 1, last = n > 1 && n === c.nights; /* Sal's pitch changes night to night */
        if (t < 3.2) caption(n === 1 ? 'UNCLE SAL' : last ? `LAST NIGHT` : `NIGHT ${n} OF ${c.nights}`, n === 1 ? `You each owe me ${money(c.tab)}. From last time. You remember last time.` : last ? 'Clear my books tonight and you walk out of here free.' : `Back again. The marker's ${money(c.tab)} now - plus what you still owe.`);
        else if (t < 6.4) caption('TONIGHT YOU WORK IT OFF', `${money(c.quota)} by game ${c.at}. Then more. Then more.`);
        else caption('AND REMEMBER', last ? 'Come up short... and you don\'t walk out.' : 'I always collect.');
        if (t > 0.2) cue('sting', () => audio.sfx('knock', { pos: { x: 9.5, y: 1.2, z: -6.6 } }));
        return 'camera';
      }
      if (c.kind === 'huntBeaten' || c.kind === 'shakeBeaten') {
        door(doors.front, t > 2.2, dt); if (t > 2.2) cue('door', () => audio.sfx('knock'));
        shot(5, 2.2, 1.6, 5, 1.0, 6.2); caption(t > 0.6 ? 'AND STAY OUT!' : '', t > 0.6 ? "Sal's men limp back out the front door." : '');
        return 'camera';
      }
      if (c.kind === 'kill') {
        const mine = (c.victims || []).includes(myId), gid = goons.drag[myId], o = gid && goons.get(gid);
        door(doors.back, t > 1.6 && t < (c.until - c.start) / 1000 - 0.9, dt, -1.35);
        if (t > 1.6) cue('open', () => audio.sfx('knock', { pos: { x: 11.6, y: 1.2, z: -6.6 } }));
        if (t > (c.until - c.start) / 1000 - 0.9) cue('slam', () => { audio.sfx('bonk', { v: 1 }); audio.sfx('groan', { delay: 0.5 }); });
        if (mine && o) { // first person: dragged backwards out of the bar by the collar
          const g = o.P.group, ry = g.rotation.y, fx = -Math.sin(ry), fz = -Math.cos(ry);
          camera.position.set(g.position.x - fx * 0.75, 0.95 + Math.sin(t * 7) * 0.03, g.position.z - fz * 0.75); camera.lookAt(camera.position.x - fx * 4, 1.25, camera.position.z - fz * 4);
          camera.rotation.z += Math.sin(t * 3) * 0.06;
          caption(t > 1 ? 'SAL WANTS A WORD' : '', t > 1 ? 'in the back room...' : '');
          fade.style.opacity = Math.max(0, Math.min(1, (t - ((c.until - c.start) / 1000 - 2.2)) / 1.6));
        } else {
          shot(8.4, 1.85, -3.0, BACK_IN.x - 0.4, 1.1, BACK_IN.z); caption(t > 0.8 ? `${(c.names || []).join(' and ')} couldn't pay` : '', t > 0.8 ? 'Sal wants a word in the back room.' : '');
        }
        return 'camera';
      }
      return null;
    },
  };
}
