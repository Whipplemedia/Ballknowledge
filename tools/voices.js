#!/usr/bin/env node
// Generate the game's voice lines with ElevenLabs: node tools/voices.js [--force] [id ...]
// Reads ELEVENLABS_API_KEY from the environment (never from a file or the command line), picks a voice per speaker by name
// from your ElevenLabs library (or VOICE_<SPEAKER>=<voice id>), writes public/audio/vo/<id>.mp3 and a manifest.json the
// game reads to know which clips exist. Existing clips are skipped unless --force (or listed by id).
const fs = require('fs');
const path = require('path');

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error('ELEVENLABS_API_KEY is not set. Add it as an environment secret, then run this again.'); process.exit(1); }
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'public', 'audio', 'vo');
const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'voice-script.json'), 'utf8'));
const args = process.argv.slice(2), force = args.includes('--force'), only = args.filter((a) => !a.startsWith('--'));
const api = (p, o = {}) => fetch('https://api.elevenlabs.io' + p, { ...o, headers: { 'xi-api-key': KEY, ...(o.headers || {}) } });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const r = await api('/v1/voices'); if (!r.ok) { console.error('Could not list voices:', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const library = (await r.json()).voices || [];
  const voiceFor = {};
  for (const [sp, cfg] of Object.entries(script.speakers)) {
    const forced = process.env['VOICE_' + sp.toUpperCase()];
    const byName = cfg.voices.map((n) => library.find((v) => v.name.toLowerCase().startsWith(n.toLowerCase()))).find(Boolean);
    voiceFor[sp] = forced || (byName && byName.voice_id) || (library[0] && library[0].voice_id);
    console.log(`${sp}: ${forced ? 'VOICE_' + sp.toUpperCase() : byName ? byName.name : 'fallback ' + (library[0] && library[0].name)}`);
  }
  let made = 0, failed = 0;
  for (const line of script.lines) {
    const file = path.join(OUT, line.id + '.mp3');
    if (only.length && !only.includes(line.id)) continue;
    if (fs.existsSync(file) && !force && !only.includes(line.id)) continue;
    const sp = script.speakers[line.speaker];
    const res = await api(`/v1/text-to-speech/${voiceFor[line.speaker]}?output_format=mp3_44100_64`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: line.text, model_id: script.model, voice_settings: sp.settings }) });
    if (!res.ok) { failed++; console.error(`✗ ${line.id}: ${res.status} ${(await res.text()).slice(0, 160)}`); continue; }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer())); made++; console.log(`✓ ${line.id} (${line.speaker})`);
  }
  const have = script.lines.map((l) => l.id).filter((id) => fs.existsSync(path.join(OUT, id + '.mp3')));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ lines: have }, null, 1));
  console.log(`\n${made} generated, ${failed} failed, ${have.length}/${script.lines.length} lines available. Manifest written.`);
  process.exit(failed ? 1 : 0);
})();
