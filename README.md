# Ball Knowledge
Co-op online sports-betting game set in a dive bar. Pick a sport, get a hidden real season, and bet your way through its last 10 games to the title. Cheat with the mob if you dare.

Run: `npm install && npm start` -> http://localhost:3000 (share the 4-letter room code; 1-6 players).
Dev: `BK_SPEED=10 npm start` divides every timer by 10 (full game in about a minute).

## How a game works
- **10-ish real games per season**, ending in the title game. A new game opens for betting every 2 minutes (or 50s on Quick pace); the betting window is a visible countdown.
- When the window closes the game goes **on the TV** for ~3 minutes (70s on Quick): a simulated highlights recap that always lands on the true final score. Bets pay out when it ends.
- **Markets**: moneyline, spread, total points. Lines are generated from team records (not historical lines). Team stats, form this season, series status and your crew's picks are in the betting UI.
- **Win condition**: put a moneyline bet on the champion of the title game. Crew wins if at least half the players do.
- **Bar**: buy drinks. Drunk confidence = gut-feeling hints on each game (more accurate as you get drunker, until you are wasted and they turn to nonsense). It wears off.
- **Mob (Uncle Sal)**: loans and game fixes (flips the real result, adds to your tab). Conflicting fixes cancel. At the end the mob collects; shortfalls bring the hitmen - pay, wire money, win cash, or fight them in the room.
- **Arcade (no more farming)**: darts, bowling and cornhole pay only when you beat an NPC's posted score in a **challenge** (stake from the bar's board; win streaks raise the stakes, caps apply). Practice mode pays nothing. Plus a 3D roulette wheel whose ball lands on the server's number.
- **Pool**: full 2D-physics pool table (your 4 solids vs an NPC's 4 stripes + the 8-ball). Pick Rookie or Shark, stake cash, win to double up.
- **Quota**: Uncle Sal sets crew net-worth checkpoints through the season. Miss one and his collectors shake you down (pay, fight, or forfeit cash). Hit the final quota for bonus tickets.
- **Chaos**: random bar events (happy hour, bar fight you can bet on, blackout, big tipper) and per-player bounties keep things moving.
- **Pro Shop**: earn tickets (finishing games, crew wins, quotas, bounties) and open crates for ~50 wearable items (helmets, jerseys, golf clubs, and more) in four rarities. Cosmetics are visible to the whole crew. Saved in browser localStorage.

## Controls
WASD move, mouse look, E interact, C crew/wire money, Esc releases the mouse / closes menus.

## Bottles
Grab 3 bottles at the bar (station near the stools, `E - Grab bottles`), throw with **F** or **right-click**. Bottles arc, spin and shatter on anything (glass-break sound + shards). A bottle that hits another player or an NPC knocks them out for 5 seconds (flat on their back / slumped if seated, stars overhead); the victim's controls lock and the camera drops to the floor. After waking there is 3 s of immunity. Flight is simulated on every client from the thrower's origin/velocity; only the thrower reports hits and the server accepts a hit only if the thrower really threw a bottle in the last 4 s (rate limited, one hit per throw).

## Sound & voice
- **Sound is fully synthesized in the browser** (`public/audio.js`, no audio files): ~55 effects, a spatial crowd/room ambience, and four procedural jukebox songs (E at the jukebox cycles them). Impacts exist for pool (cue, balls, cushions, pockets, break), darts (throw, board, bull), bowling (release, rolling rumble, pin hits, strikes, gutters), cornhole (throw, thud, hole), roulette (wheel whir, pocket ticks, drop), plus UI, drinks, footsteps, sitting, bar events (happy hour horn, blackout, fights), mob knocks/stings and crowd reactions to scoring plays on the TV. Sounds with a world position are 3D (HRTF) and follow the camera.
- **Voice chat** (`public/voice.js`): peer-to-peer WebRTC mesh (max 6 players); the server only relays signaling (`type:'rtc'`). Remote voices come out of their avatar's position, so you hear people where they stand (or "Whole bar" in settings). Join with the speaker button (bottom-right) or **O**; **hold V** to talk (or Open mic), **M** mutes. A green mic floats over whoever is speaking.
- Settings (volumes, mic mode, range, song) persist in `localStorage` (`bk_audio_v1`).
- **Deployment note:** browsers only allow the microphone on https (Railway is) or localhost. STUN is Google's public server; players behind strict NATs/corporate networks may need a TURN relay: set `TURN_URL` (comma-separated), `TURN_USER`, `TURN_PASS` on the server and `/ice.json` will hand it to clients.

## Files
- `seasons.js` - season data (real results). `server.js` - authoritative game state over WebSocket.
- **Look**: chunky faceted cartoon cast (Bub, the bartender, six regulars, Uncle Sal, hitmen, a crowd), dive-bar set with beams, windows, neon, chalkboard menu, ambient stylized sports broadcasts on the TVs, a live bar behind the title screen, bloom + color grade, and a four-stage drunk look.
- `public/` - client: `client.js` (2D UI), `world.js` (3D loop), `bar.js` (environment + NPCs), `tv.js`, `roulette.js`, `games.js`, `pool.js`, `cosmetics.js`, `people.js` (characters + hands), `textures.js`, `fx.js` (bloom + drunk shader). Three.js is vendored in `public/vendor/`.

## Characters (Blender pipeline)
The ten cast members are authored in Blender from the reference pack and exported as `public/models/*.glb`; the game loads them at startup (`public/people.js`) and falls back to the old procedural people for any custom variant a model cannot express (`?models=0` forces the fallback).
- Source: `blender/lib.py` (primitives, export, render), `blender/chars.py` (generic person builder), `blender/specs.py` (the 10 characters), `blender/textures.py` (jersey/floral/pinstripe prints).
- Rebuild: `pip install bpy` (Blender as a Python module), then `python3 blender/build.py [names]`. Output: GLBs in `public/models/`, editable `.blend` files in `blender/out/`, preview renders in `/tmp/bk_prev/`.
- Rig contract (same as the procedural people so animation and cosmetics keep working): nodes `legL legR armL armR head torso` at the same pivots. Material names start with a role (`skin shirt pants hair hat shoe`) so the game can recolor them per player; parts prefixed `hat_ hair_ hairtop_ pack_ glasses_ stache_` can be toggled.

### AI-generated characters (Meshy)
`public/models/<name>_ai.glb` (Mixamo-style skinned rig from Meshy: multi-image-to-3D from the reference sheets, then auto-rig) takes priority over the Blender-built `<name>.glb`. `people.js` drives the skeleton from the same invisible pivots the procedural rig uses, so all `animate()` modes and cosmetics work unchanged. All ten cast members are converted (task ids in `blender/meshy_tasks.json`; `blender/shrink_glb.py` re-encodes the textures to keep each GLB ~1.1-1.6 MB). The older Blender-built boxy characters are no longer shipped (rebuild with `blender/build.py` if wanted). Player Bub is recolored per player at runtime (`recolorTexture` in `people.js`: skin / hair / shirt regions found by color, shirt limited to non-leg triangles via the skin weights so socks and soles keep their color). The other nine keep their art with only a faint crowd tint; Meshy retexture is the upgrade path for NPC variants. Meshy is wired in via `.mcp.json` with `MESHY_API_KEY` from the environment.

### AI props (Meshy)
`public/models/props/*.glb` (loaded by `public/props.js`, each optional with a procedural fallback; `?props=0` disables): bar stools, red booths, wall TVs (bezel/mount only - the live screens are still canvas planes), the sportsbook terminal (screen overlay aligned to its tilted glass), bowling pins/ball/ball return, cornhole bag and the green pendant lamps. The pool table is AI-made too (felt top aligned to the 0.92 m physics plane; the playable balls/cue stay procedural). The cornhole boards are AI-made too (scaled so the ramp matches the physics slope; the hole is still the procedural disc at the exact physics position). Also AI-made: the bar counter (4 tiled segments), the back-bar shelving units (3 tiled, bottles/taps/register baked in), jukebox, couch and framed jerseys (`jerseyframe`). Patrons (`randomPatron`) get hue-rotated clothing and varied skin via `recolorNpc` (bone-masked, cached). Deliberately kept procedural: neon signs (lettering must be exact), darts board, roulette and the bowling lane (their markings/physics need exact geometry and numbers). Task ids are in `blender/meshy_tasks.json`; `blender/shrink_glb.py` re-encodes textures.

## Data notes (please double-check before shipping)
Game results were verified against web sources where possible (2016 NBA Finals + ECF, 2011 NBA Finals + most of the WCF, 2016 NLCS, 2019 Stanley Cup Final, 2018 NCAA Elite Eight/Final Four, most 2018 conference title games). Less verified: 2019 NHL West Final scores (one secondary source), 2016 World Series games 3-4, 2004 ALCS games 1-2/5-6 and World Series games 2-4, 2011 WCF Game 5, NFL playoff brackets (from memory), 2018 CFP/Rose Bowl scores. Team **records and star stat lines are from memory** - college records are approximate.

## Known gaps / next
- Highlights are a generated recap, not real play-by-play. Player props, parlays, and cascading alt-history after a fix are not built.
- Tickets/cosmetics live in the browser and are trusted. Mini-game and pool results are client-reported (server caps them) - move physics server-side before real stakes.
- Art is procedural low-poly; no sound or voice chat yet.

## Performance
The scene has ~1,400 meshes and ~12 lights. If the first couple of seconds average under ~30 fps the game switches itself to performance mode (no shadows/bloom, 1x resolution). Force it with `?quality=low` or disable the check with `?quality=high`.

## Character motion & NPC wandering
- `public/models/clips.json` holds Meshy's free walk/run clips (extracted from the rigged Bub GLB) retargeted onto every AI character at runtime via rest-relative deltas. `people.js` blends them over the procedural pose (`P.clipW`); `?clips=0` disables them. Remote players blend walk/run from their measured speed (`P.moveSpeed`).
- `bar.js` makes the Spectator/Patron/Watcher NPCs wander a deterministic 24-stop route (16 s per leg, ~6.4 min loop) driven by the synced clock, so every player sees them in the same place. Routes are planned lazily around obstacles; a knocked-out wanderer rejoins its route afterward.
- Known limits: seated NPCs keep a frozen sit pose; held items/cosmetics don't follow clip arms while walking.
- Jump with Space (cosmetic hop, synced to other players). Standing up from a seat drops you at the nearest clear floor spot (booths exit into the aisle). Pool cushions match the AI table's rails; during a game NPCs within ~1 m of the camera are hidden so they can't block the view.
- Seated NPCs (`public/seated.js`): booth, stool, couch and Sal's booth patrons run a layered seated pose — breathing, sway, a gaze that drifts between the TVs, neighbours and the player, and actions (sip from a held pint/bottle/tumbler, talk gestures while their bubble shows, laugh, phone, stretch, lean, point, drum, hands-behind-head on the couch, the sleeper jolting awake). Arm angles come from a small 2-bone IK per character (shoulder height vs. table, arm lengths, face position measured from the head-skinned vertices), so tall and short models both rest their forearms on the table. TV scores (`BK.onScore`, fired from tv.js) make most of them cheer or groan.
- Seated players use the same layer (no autonomous actions): their body faces the seat while the head follows their real look direction (pitch is sent in `pos` as `p` while seated), they gesture while talking on voice chat, and take a sip with a pint whenever they order a drink.
- Bottles on tables: 16 grabbable bottles stand on four new high-top tables, the booth tables, the bar counter, Sal's table and the Pro Shop counter (`bar.bottleSpots`). E takes one (aiming at a bottle wins over nearby prompts, e.g. the booth seat); carry up to 5. The server tracks taken spots (`takeBottle` → `bottleGot`, `state.btaken` = respawn times) so a bottle vanishes for everyone and pops back after 45 s. The crate by the couch still tops you up to 3.
- Roulette: the rotor has flush colored pocket floors with low metal frets (the ball rests on top of its color, never inside it) and a flat number ring. The Roulette panel is a clickable felt layout: choose a chip (10–500), click spots to stack bets, right-click to remove, Undo/Clear, then spin. Bets: straight numbers 0–36 (35:1), dozens and columns (2:1), red/black/odd/even/1–18/19–36 (1:1); zero beats outside bets. The server takes `{type:'roulette', bets:[{pick, stake}]}` (up to 40 bets); the spinner's chips appear on the 3D felt for everyone during the spin.
- Pop-up hotkeys: every visible HUD pop-up button (bar fight bets + stake, Sal's collectors fight/pay, hitmen ambush/pay) gets a number key 1–9 shown as a badge on the button, and Tab frees/recaptures the mouse so pop-ups can be clicked. A one-time toast explains it when a pop-up appears. `BK_FORCE_EVENT=fight` (dev only) forces that bar event for testing.
- Knockouts show cartoon "seeing stars" (`public/dizzy.js`): a ring of spinning, bobbing gold stars orbits above the head (world space, so it follows the head when the body is flat on the floor) and springs in/out. Your own KO shows stars circling across your view with a small countdown.

## Reconnecting & surviving restarts
- Each player gets a rejoin token (`{type:'session'}` → stored in `localStorage` as `bk_session_v1`). A refresh, dropped connection or second tab reclaims the same seat, money and bets in any phase; the client retries automatically with a "reconnecting" banner and keeps the bar on screen. Empty rooms wait 10 minutes for their players before being deleted.
- Timers are tick-driven (game windows, hitmen deadline, roulette resolution), so a room can be snapshotted. Set `BK_STATE_DIR` to persistent storage (on Railway: add a Volume to the service, e.g. mounted at `/data`, and set `BK_STATE_DIR=/data`). The server writes `rooms.json` every 4 s and on SIGTERM and restores it on boot, so redeploys no longer end running games. Without it, rejoin still covers drops and refreshes but a redeploy ends live games.

## Rendering budget
- One shadow-casting light: a wide downward SpotLight over the room centre (one shadow render) instead of a shadow-casting PointLight (six cube-face renders per frame), plus a weak non-shadow fill so the ceiling/walls keep their light. The shadow map refreshes every other frame (`renderer.shadowMap.autoUpdate = false`), and small or transparent static meshes (bottles, chips, glasses) don't cast shadows. Measured in the bar: ~570 → ~180 draw calls and ~1.7M → ~0.41M triangles per frame.

## Load time
- All character and prop GLBs are compressed with glTF-Transform (`gltf-transform webp --quality 88` then `gltf-transform meshopt --level medium`): ~18 MB → ~7.9 MB. They need the meshopt decoder (`public/vendor/addons/libs/meshopt_decoder.module.js`), wired up by `public/loading.js` (`gltfLoader()`); use it for any new GLB. Re-run the same two commands on new Meshy downloads before committing them.
- `loading.js` also drives the loading bar (join screen, lobby, and an in-game "getting the bar ready" card if a game starts before the models finish).
- The server serves static files with ETags (repeat visits get 304s) and caches gzip copies in memory (three.module.js 1.27 MB → 257 KB). First visit ≈ 7.8 MB on the wire instead of ≈ 20 MB.

## HUD, speech bubbles & Esc menu
- Compact HUD (default; H toggles, also in the menu): the objective banner shrinks to one line 9 s after it changes, feed lines fade after 12 s, and the bounties card collapses to a "0/3 done" line 12 s after a bounty changes.
- NPC speech bubbles are smaller, scaled with distance (never screen-filling up close), hidden behind walls (depth tested), only from NPCs within 6 m in front of you, and at most two at once. They can be turned off in the menu.
- Esc menu (`menuView` in client.js): opens whenever the mouse is released during play (Esc or clicking away), except when a panel, the shop, the sound panel or Tab released it. Resume, mouse sensitivity, invert Y, field of view, graphics Auto/High/Low (`BK.setQuality`), compact HUD, speech bubbles, sound & voice, full controls list, leave game. Settings are saved in `localStorage` (`bk_settings_v1`) and read by world.js each frame.

## Sal's muscle (hitmen & collectors)
- Simulated on the server (`goons.js`, 10 Hz) so everyone sees the same thing: an arrival cutscene (`state.cine`), then each goon paths around the furniture (BFS over a 0.4 m grid built from `data/obstacles.json`, regenerate it from `__dbg.bar.obstacles` if the bar layout changes) to an assigned target.
- Hitmen (end-of-night hunt): grab a debtor and shake a quarter of the debt out of them every 2 s until it's paid; the crew frees them by punching (the server checks the goon named in `{type:'attack', g}` is within 2.6 m) or bottling (8 damage + 2.5 s stun). All down → "AND STAY OUT!" ending; timer out → whoever still owes is dragged out the back-room door behind Sal's corner (first-person for the victim) and marked dead.
- Collectors (missed quota): walk in, pat each player down for their share of the tax, can be paid off, punched or bottled out.
- Client: `goonsview.js` (positions, clip animations, health bars, dizzy stars), `cine.js` (letterboxed shots, captions, door swings, fade), grabbed players are locked facing their attacker. Animations come from Meshy (`models/clips.json`: stance, punch, hitReact, knockdown, taunt, help, push, scheme; each clip keeps its own rig rest pose). `animate(P, 'clip:<name>')` loops a clip, `'once:<name>'` plays it once and holds.
- Arcade challenges and pool can be played during the hunt to win money back.

## Drunk confidence (hints)
- Each player gets a hidden sweet spot every season: meter 55–70, shifted ±10 (`p.tol`). Gut feelings by zone (`drinkZone`): under 20 none; warm 52% right (winner + total, vague); sweet spot 60% (all three markets, confident); past it just as confident but 35%; wasted (92+) obvious nonsense, a coin flip. Coming back down from past the spot = a 60 s hangover with no tips. A confident tip locks for that game.
- The client never shows the zone: hint labels are "gut feeling" / "drunk confidence" (sweet and over look the same) / "wasted wisdom", the exact meter number only shows while sober, and the meters blur as you drink.

## Fix heat
- `fixRisk`: 10% + 10% per fix you've already bought + up to +35% for forcing a big upset, ×1.5 on the final, capped 5–85%; shown per side in Sal's tab. Each fix raises your heat.
- Caught (rolled when betting closes): the game is void and every bet on it refunded, Sal still charges the fee, the fixers are barred from betting for the next 2 games. A caught championship = nobody gets the title.
- A fixed championship that isn't caught still counts, but the end screen says TITLE VACATED* and the crew-win ticket bonus is halved.
