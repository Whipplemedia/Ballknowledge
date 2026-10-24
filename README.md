# Ball Knowledge
Co-op online sports-betting game. Pick a sport, get a hidden real season, bet your way to the title. Cheat with the mob if you dare.

Run: `npm install && npm start` -> http://localhost:3000 (share the 4-letter room code; 1-6 players).

## Loop
1. Host picks a sport -> server assigns a random real season (hidden). Everyone starts with $1,000.
2. Each postseason round: bet the moneyline, take side bets (UFC/darts/etc.), then lock in.
3. Mob (Uncle Sal): loans ($1,000 -> owe $1,250) and game fixes (adds to your tab, flips the result, rewrites later rounds).
   Conflicting fixes cancel out and the mob keeps both fees.
4. Final: mob collects your tab (+20% of profit if you won) from your bankroll. Shortfall -> hitmen arrive (100s):
   pay, win cash in the arcade (darts/bowling/cornhole/roulette), wire money to crewmates, or ambush-mash together.
5. Reveal the real season. Crew wins if at least half the players called the champion.

## Files
- `seasons.js` - season data (the main content job: add more seasons, verify results/odds)
- `server.js` - authoritative room/game state over WebSocket
- `public/` - client (vanilla JS + canvas mini-games)

## Known prototype gaps
- Mini-game scores are client-reported (server only caps them) - move physics server-side before real stakes.
- Only champion's path is modelled; add full brackets + decoy games so the repeated team isn't a tell.
- Odds are stylized, not historical lines.
