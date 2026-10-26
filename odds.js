// Win probability from two regular-season records (log5) plus home advantage. The sportsbook prices every moneyline
// from this, and made-up seasons roll their results from it, so a fake season's odds are honest.
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const parsePct = (rec) => { const n = String(rec).split('-').map(Number); const g = n.reduce((a, b) => a + b, 0); return g ? n[0] / g : 0.5; };

// chance that `a` beats `b`; home = a is at home (false on a neutral site)
function winProb(sport, recA, recB, home) {
  const pa = clamp(parsePct(recA), 0.12, 0.88), pb = clamp(parsePct(recB), 0.12, 0.88);
  let p = (pa * (1 - pb)) / (pa * (1 - pb) + pb * (1 - pa));
  if (home) p += sport.home;
  return clamp(p, 0.1, 0.9);
}

module.exports = { parsePct, winProb };
