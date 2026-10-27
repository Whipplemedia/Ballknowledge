import * as THREE from 'three';
import { animate } from './people.js';

// Cutscenes for Sal's muscle, timed by the server (state.cine = {kind, start, until, names?, amount?, victims?}) so every
// player sees the same beats. Returns true while it owns the camera; world.js then skips input and its own camera.
// Shots are short, letterboxed, with a caption; doors swing on cue.
const FRONT_IN = new THREE.Vector3(5, 1.3, 7.9), BACK_IN = new THREE.Vector3(11.7, 1.2, -6.6);
// the kill: dragged out (0 - DRAG s), then the restroom: Sal, a bat, lights out (BR = seconds after the cut)
const DRAG = 6.5, BR = { talk: 2.3, wind: 3.5, hit: 3.75, black: 4.4 };
export function createCine({ camera, BK, doors, goons, audio, backroom }) {
  const top = document.createElement('div'), bot = document.createElement('div'), cap = document.createElement('div'), fade = document.createElement('div'), flash = document.createElement('div');
  top.className = 'lbox top'; bot.className = 'lbox bot'; cap.id = 'cinecap'; fade.id = 'cinefade'; flash.id = 'cineflash'; document.body.append(top, bot, cap, fade, flash);
  const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k)), ease = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
  const v = new THREE.Vector3(), look = new THREE.Vector3(); let shown = null, cues = {};
  const money = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
  const lead = () => goons.get('g0') || goons.list()[0];
  const goonPos = (o, y = 1.3) => (o ? v.set(o.P.group.position.x, y, o.P.group.position.z) : v.set(5, y, 5));
  const caption = (h, sub) => { const html = h ? `<b>${h}</b>${sub ? `<span>${sub}</span>` : ''}` : ''; if (cap.innerHTML !== html) cap.innerHTML = html; cap.classList.toggle('on', !!h); };
  const cue = (key, fn) => { if (!cues[key]) { cues[key] = true; fn(); } };
  const door = (d, open, dt, ang = 1.35) => { if (!d) return; const tgt = open ? ang : 0; /* swings into the room */ d.rotation.y += ((d.userData.base ?? (d.userData.base = d.rotation.y)) + tgt - d.rotation.y) * Math.min(1, dt * 7); };
  const shot = (px, py, pz, lx, ly, lz) => { camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); };

  // first person on your knees on the restroom floor: Sal talks, winds up, swings. u = seconds since the cut
  function backroomPOV(u) {
    const B = backroom, P = B.sal, ch = B.chair; B.show(true);
    B.light.intensity = Math.random() < 0.06 ? 1.0 : 4.5; // the tube stutters
    // Sal: idle with the bat, bat overhead, then down at you
    animate(P, 'idle', u); const [aL, aR] = P.arms, wind = ease((u - BR.talk) / (BR.wind - BR.talk)), sw = ease((u - BR.wind) / (BR.hit - BR.wind));
    const x = -0.25 - 2.85 * wind + 1.9 * sw; /* arm forward-up is negative x: hanging, cocked over his shoulder, then a diagonal swipe across his body at your face */
    aR.rotation.x = u < BR.talk ? -0.25 + Math.sin(u * 3) * 0.08 : x; aL.rotation.x = u < BR.talk ? -0.9 : lerp(-0.9, x + 0.15, wind); aR.rotation.z = lerp(0, -0.55, wind) - 0.95 * sw; aL.rotation.z = lerp(0, 0.55, wind) - 0.3 * sw;
    P.torso.rotation.x = -0.15 * wind + 0.4 * sw; P.head.rotation.x = -0.1 * wind + 0.2 * sw;
    P.group.position.x = ch.x - 1.45 + 0.12 * wind + 0.12 * sw; if (P.skinUpdate) P.skinUpdate();
    // camera: kneeling, looking up at him; the hit knocks you sideways onto the tiles
    const hit = Math.max(0, u - BR.hit), fall = ease(hit / 0.45);
    camera.position.set(ch.x + 0.05, 0.98 - fall * 0.55 + Math.sin(u * 1.1) * 0.01, ch.z + fall * 0.3);
    camera.lookAt(P.group.position.x, 1.45 + wind * 0.3 - sw * 0.25 - fall * 0.8, ch.z - fall * 0.4);
    if (sw > 0 && sw < 1) camera.rotation.z += Math.sin(u * 60) * 0.01; /* flinch */
    camera.rotation.z += fall * 0.9 + (hit > 0 && hit < 0.3 ? (Math.random() - 0.5) * 0.12 : 0);
    if (u > BR.wind - 0.05) cue('br_whoosh', () => audio.sfx('whoosh', { v: 1 }));
    if (u > BR.hit) cue('br_hit', () => { audio.sfx('bonk', { v: 1.4 }); audio.sfx('punch', { v: 1 }); audio.sfx('groan', { delay: 0.35 }); });
    if (u > 0.5) cue('br_vo', () => BK.vo && BK.vo.play('sal_backroom'));
    flash.style.opacity = hit > 0 ? Math.max(0, 1 - hit / 0.35) : 0;
    fade.style.opacity = u < 0.8 ? 1 - u / 0.8 : u > BR.hit + 0.15 ? Math.min(1, (u - BR.hit - 0.15) / (BR.black - BR.hit - 0.15)) : 0;
    if (u > 0.6 && u < BR.talk) caption('THE MEN\'S ROOM', '"I told you, kid. I always collect."');
    else if (u > BR.black + 0.3) caption('LIGHTS OUT.', ''); else caption('', '');
  }

  return {
    // me: the local player's id; returns 'camera' (cutscene owns the camera), or null
    update(dt, myId) {
      const c = BK.S && BK.S.cine, now = BK.now();
      const on = !!(c && now < c.until + 200);
      document.body.classList.toggle('cine', on);
      if (!on) { if (shown) { shown = null; cues = {}; caption(''); fade.style.opacity = 0; flash.style.opacity = 0; if (backroom) backroom.show(false); } return null; } // outside a cutscene, both doors open for whoever walks up to them (bar.js)
      if (shown !== c.start) { shown = c.start; cues = {}; }
      const t = (now - c.start) / 1000, L = lead();
      fade.style.opacity = 0;
      if (c.kind === 'huntIntro' || c.kind === 'shakeIntro') {
        const hunt = c.kind === 'huntIntro', tB = hunt ? 2.6 : 99, tC = hunt ? 4.8 : 2.3;
        door(doors.front, t > 0.45 && t < tC + 0.6, dt);
        if (t > 0.45) cue('bang', () => { audio.sfx('bonk', { v: 1 }); audio.sfx('sting'); });
        if (t > tC + 0.3) cue('vo', () => BK.vo && BK.vo.play(hunt ? 'hm_hunt' : c.training ? 'col_reminder' : 'col_shake'));
        if (t < tB && t < tC) { shot(5, 1.65, 3.4 - t * 0.12, 5, 1.35, 7.9); caption(''); }
        else if (t < tC) { const p = goonPos(L, 1.35); shot(7.0 - (t - tB) * 0.2, 0.7, 3.4, p.x, p.y, p.z); caption(''); } /* low angle from the pool-table side */
        else {
          const g = L && L.P.group, ry = g ? g.rotation.y : 0, fx = -Math.sin(ry), fz = -Math.cos(ry), p = goonPos(L, 1.7), d = 1.55 - (t - tC) * 0.08;
          shot(p.x + fx * d + 0.25, 1.62, p.z + fz * d, p.x, 1.62, p.z);
          if (hunt) caption('SAL SENDS HIS REGARDS', `${(c.names || []).join(', ')} - ${money(c.amount)}. Tonight.`);
          else if (c.training) caption('A FRIENDLY REMINDER', `Sal wants ${money(c.amount)} - or show him what a bottle can do. Grab one and click to throw.`);
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
        if (t > 0.4) cue('vo1', () => BK.vo && BK.vo.play(n === 1 ? 'sal_open1a' : last ? 'sal_open3a' : 'sal_open2a'));
        if (t > 3.3) cue('vo2', () => BK.vo && BK.vo.play('sal_open_b'));
        if (t > 6.5) cue('vo3', () => BK.vo && BK.vo.play(last ? 'sal_open3c' : 'sal_open1c'));
        return 'camera';
      }
      if (c.kind === 'huntBeaten' || c.kind === 'shakeBeaten') {
        door(doors.front, t > 2.2, dt); if (t > 2.2) cue('door', () => audio.sfx('knock'));
        shot(5, 2.2, 1.6, 5, 1.0, 6.2); caption(t > 0.6 ? 'AND STAY OUT!' : '', t > 0.6 ? "Sal's men limp back out the front door." : '');
        return 'camera';
      }
      if (c.kind === 'kill') {
        const mine = (c.victims || []).includes(myId), gid = goons.drag[myId], o = gid && goons.get(gid);
        door(doors.back, t > 1.6 && t < DRAG - 0.6, dt, -1.35);
        if (t > 1.6) cue('open', () => audio.sfx('knock', { pos: { x: 11.6, y: 1.2, z: -6.6 } }));
        if (t > 1.0) cue('vo', () => BK.vo && BK.vo.play('hm_kill'));
        if (t > DRAG - 0.6) cue('slam', () => audio.sfx('bonk', { v: 1 }));
        if (mine && t >= DRAG && backroom) { backroomPOV(t - DRAG); return 'camera'; }
        if (!mine && t >= DRAG) { // the rest of the crew stares at the closed door - and hears it
          const hit = t - DRAG - BR.hit; shot(8.4, 1.85, -3.0, BACK_IN.x - 0.4, 1.1, BACK_IN.z);
          if (hit > 0 && hit < 0.4) camera.rotation.z += (Math.random() - 0.5) * 0.05;
          if (hit > 0) cue('thud', () => { audio.sfx('bonk', { v: 0.8, pos: { x: 14, y: 1.2, z: -6.6 } }); audio.sfx('groan', { delay: 0.4, pos: { x: 14, y: 1.2, z: -6.6 } }); });
          caption(hit > 0.3 ? 'THWACK.' : `${(c.names || []).join(' and ')}...`, hit > 0.3 ? 'Then nothing.' : 'behind that door with Sal.');
          return 'camera';
        }
        if (mine && o) { // first person: dragged backwards out of the bar by the collar
          const g = o.P.group, ry = g.rotation.y, fx = -Math.sin(ry), fz = -Math.cos(ry);
          camera.position.set(g.position.x - fx * 0.75, 0.95 + Math.sin(t * 7) * 0.03, g.position.z - fz * 0.75); camera.lookAt(camera.position.x - fx * 4, 1.25, camera.position.z - fz * 4);
          camera.rotation.z += Math.sin(t * 3) * 0.06;
          caption(t > 1 ? 'SAL WANTS A WORD' : '', t > 1 ? 'in the bathroom...' : '');
          fade.style.opacity = Math.max(0, Math.min(1, (t - (DRAG - 1.2)) / 1.1));
        } else {
          shot(8.4, 1.85, -3.0, BACK_IN.x - 0.4, 1.1, BACK_IN.z); caption(t > 0.8 ? `${(c.names || []).join(' and ')} couldn't pay` : '', t > 0.8 ? 'Sal wants a word in the bathroom.' : '');
        }
        return 'camera';
      }
      return null;
    },
  };
}
