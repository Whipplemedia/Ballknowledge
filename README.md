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
- **Arcade**: physical first-person darts, bowling and cornhole (sway, hook, wind - all randomized, drunk makes it worse) and a 3D roulette wheel whose ball lands on the server's number.

## Controls
WASD move, mouse look, E interact, C crew/wire money, Esc releases the mouse / closes menus.

## Files
- `seasons.js` - season data (real results). `server.js` - authoritative game state over WebSocket.
- `public/` - client: `client.js` (2D UI), `world.js` (3D loop), `bar.js` (environment + NPCs), `tv.js`, `roulette.js`, `games.js`, `people.js`, `textures.js`, `fx.js` (bloom + drunk shader). Three.js is vendored in `public/vendor/`.

## Data notes (please double-check before shipping)
Game results were verified against web sources where possible (2016 NBA Finals + ECF, 2011 NBA Finals + most of the WCF, 2016 NLCS, 2019 Stanley Cup Final, 2018 NCAA Elite Eight/Final Four, most 2018 conference title games). Less verified: 2019 NHL West Final scores (one secondary source), 2016 World Series games 3-4, 2004 ALCS games 1-2/5-6 and World Series games 2-4, 2011 WCF Game 5, NFL playoff brackets (from memory), 2018 CFP/Rose Bowl scores. Team **records and star stat lines are from memory** - college records are approximate.

## Known gaps / next
- Highlights are a generated recap, not real play-by-play. Player props, parlays, and cascading alt-history after a fix are not built.
- Mini-game scores are client-reported (server caps them) - move physics server-side before real stakes.
- Art is procedural low-poly; no sound or voice chat yet.
