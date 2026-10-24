// Season database. Each season is the champion's real path through the postseason.
// `odds` is the champion's stylized moneyline for that round (NOT historical betting lines -
// tuned so favorites don't give the game away). Verify/extend this data before shipping.
// kind: 'game' = single game, 'series' = best-of series (score is series score).

const SPORTS = {
  nfl: {
    label: 'Pro Football', emoji: '🏈', kind: 'game', seasons: [
      { year: 2007, league: 'NFL', champion: 'New York Giants', rounds: [
        { label: 'Wild Card', opp: 'Tampa Bay Buccaneers', score: '24-14', odds: 100 },
        { label: 'Divisional', opp: 'Dallas Cowboys', score: '21-17', odds: 300 },
        { label: 'NFC Championship', opp: 'Green Bay Packers', score: '23-20 (OT)', odds: 250 },
        { label: 'Super Bowl XLII', opp: 'New England Patriots', score: '17-14', odds: 420 },
      ] },
      { year: 2015, league: 'NFL', champion: 'Denver Broncos', rounds: [
        { label: 'Divisional', opp: 'Pittsburgh Steelers', score: '23-16', odds: -200 },
        { label: 'AFC Championship', opp: 'New England Patriots', score: '20-18', odds: 130 },
        { label: 'Super Bowl 50', opp: 'Carolina Panthers', score: '24-10', odds: 200 },
      ] },
      { year: 2016, league: 'NFL', champion: 'New England Patriots', rounds: [
        { label: 'Divisional', opp: 'Houston Texans', score: '34-16', odds: -1100 },
        { label: 'AFC Championship', opp: 'Pittsburgh Steelers', score: '36-17', odds: -400 },
        { label: 'Super Bowl LI', opp: 'Atlanta Falcons', score: '34-28 (OT)', odds: -150 },
      ] },
    ],
  },
  cfb: {
    label: 'College Football', emoji: '🏟️', kind: 'game', seasons: [
      { year: 2018, league: 'NCAA FBS', champion: 'Clemson Tigers', rounds: [
        { label: 'CFP Semifinal', opp: 'Notre Dame Fighting Irish', score: '30-3', odds: -250 },
        { label: 'National Championship', opp: 'Alabama Crimson Tide', score: '44-16', odds: 600 },
      ] },
    ],
  },
  nba: {
    label: 'Pro Basketball', emoji: '🏀', kind: 'series', seasons: [
      { year: 2016, league: 'NBA', champion: 'Cleveland Cavaliers', rounds: [
        { label: 'First Round', opp: 'Detroit Pistons', score: '4-0', odds: -2000 },
        { label: 'Conference Semis', opp: 'Atlanta Hawks', score: '4-0', odds: -800 },
        { label: 'Conference Finals', opp: 'Toronto Raptors', score: '4-2', odds: -300 },
        { label: 'NBA Finals', opp: 'Golden State Warriors', score: '4-3', odds: 190 },
      ] },
      { year: 2011, league: 'NBA', champion: 'Dallas Mavericks', rounds: [
        { label: 'First Round', opp: 'Portland Trail Blazers', score: '4-2', odds: -150 },
        { label: 'Conference Semis', opp: 'Los Angeles Lakers', score: '4-0', odds: 200 },
        { label: 'Conference Finals', opp: 'Oklahoma City Thunder', score: '4-1', odds: 125 },
        { label: 'NBA Finals', opp: 'Miami Heat', score: '4-2', odds: 260 },
      ] },
    ],
  },
  ncaab: {
    label: 'College Basketball', emoji: '🎓', kind: 'game', seasons: [
      { year: 2018, league: 'NCAA Tournament', champion: 'Villanova Wildcats', rounds: [
        { label: 'Round of 64', opp: 'Radford Highlanders', score: '87-61', odds: -5000 },
        { label: 'Round of 32', opp: 'Alabama Crimson Tide', score: '81-58', odds: -1000 },
        { label: 'Sweet 16', opp: 'West Virginia Mountaineers', score: '90-78', odds: -400 },
        { label: 'Elite Eight', opp: 'Texas Tech Red Raiders', score: '71-59', odds: -300 },
        { label: 'Final Four', opp: 'Kansas Jayhawks', score: '95-79', odds: -250 },
        { label: 'National Championship', opp: 'Michigan Wolverines', score: '79-62', odds: -150 },
      ] },
    ],
  },
  nhl: {
    label: 'Hockey', emoji: '🏒', kind: 'series', seasons: [
      { year: 2019, league: 'NHL', champion: 'St. Louis Blues', rounds: [
        { label: 'First Round', opp: 'Winnipeg Jets', score: '4-2', odds: 105 },
        { label: 'Second Round', opp: 'Dallas Stars', score: '4-3', odds: -120 },
        { label: 'Conference Finals', opp: 'San Jose Sharks', score: '4-2', odds: 110 },
        { label: 'Stanley Cup Final', opp: 'Boston Bruins', score: '4-3', odds: 160 },
      ] },
    ],
  },
  mlb: {
    label: 'Baseball', emoji: '⚾', kind: 'series', seasons: [
      { year: 2016, league: 'MLB', champion: 'Chicago Cubs', rounds: [
        { label: 'NLDS', opp: 'San Francisco Giants', score: '3-1', odds: -220 },
        { label: 'NLCS', opp: 'Los Angeles Dodgers', score: '4-2', odds: -150 },
        { label: 'World Series', opp: 'Cleveland Indians', score: '4-3', odds: 105 },
      ] },
      { year: 2004, league: 'MLB', champion: 'Boston Red Sox', rounds: [
        { label: 'ALDS', opp: 'Anaheim Angels', score: '3-0', odds: -105 },
        { label: 'ALCS', opp: 'New York Yankees', score: '4-3', odds: 250 },
        { label: 'World Series', opp: 'St. Louis Cardinals', score: '4-0', odds: -105 },
      ] },
    ],
  },
};

module.exports = { SPORTS };
