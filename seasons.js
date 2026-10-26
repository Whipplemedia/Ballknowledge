// Season database. Each season = the 10-11 real games leading up to (and including) the title game.
// Events are listed chronologically. For every event `a` is the home team unless `n:true` (neutral site).
// Scores: sa = a's score, sb = b's score. `ot` = overtime, `ex` = innings played, `pre` = series wins BEFORE this event.
// Team `rec` is regular-season record (college: approximate, entering the tournament). `stars` are season stat lines.
//
// DATA CONFIDENCE: results were checked against web sources where noted in README ("Data notes"); records and
// star stat lines are from memory and should be double-checked before shipping. Lines/odds are generated, not historical.

const SPORTS = {
  nfl: { label: 'Pro Football', emoji: '🏈', kind: 'football', ou: 44.5, S: 6.5, home: 0.06, pace: ['Q1', 'Q2', 'Q3', 'Q4'] },
  cfb: { label: 'College Football', emoji: '🏟️', kind: 'football', ou: 56.5, S: 9, home: 0.05, pace: ['Q1', 'Q2', 'Q3', 'Q4'] },
  nba: { label: 'Pro Basketball', emoji: '🏀', kind: 'basketball', ou: 205.5, S: 7, home: 0.07, pace: ['Q1', 'Q2', 'Q3', 'Q4'] },
  ncaab: { label: 'College Basketball', emoji: '🎓', kind: 'basketball', ou: 139.5, S: 7, home: 0.04, pace: ['1H', '2H'] },
  nhl: { label: 'Hockey', emoji: '🏒', kind: 'hockey', ou: 5.5, S: 1.6, home: 0.04, pace: ['P1', 'P2', 'P3'], fixed: 1.5 },
  mlb: { label: 'Baseball', emoji: '⚾', kind: 'baseball', ou: 8.5, S: 1.6, home: 0.04, pace: [], fixed: 1.5 },
};

const t = (short, color, rec, stars = [], note = '') => ({ short, color, rec, stars, note });
const E = (label, a, b, sa, sb, o = {}) => ({ label, a, b, sa, sb, ...o });

const SEASONS = {
  nfl: [
    {
      year: 2007, league: 'NFL', champion: 'New York Giants', blurb: 'The perfect season that wasn\'t.',
      teams: {
        'New England Patriots': t('NE', '#002244', '16-0', [['Tom Brady', '4,806 yds · 50 TD'], ['Randy Moss', '98 rec · 23 TD']], 'Undefeated and an NFL-record 589 points.'),
        'New York Giants': t('NYG', '#0b2265', '10-6', [['Eli Manning', '3,336 yds · 23 TD'], ['Plaxico Burress', '1,025 yds · 12 TD']], 'Lost to NE in Week 17 - 35-38.'),
        'Dallas Cowboys': t('DAL', '#003594', '13-3', [['Tony Romo', '4,211 yds · 36 TD']], 'NFC top seed.'),
        'Green Bay Packers': t('GB', '#203731', '13-3', [['Brett Favre', '4,155 yds · 28 TD']]),
        'Tampa Bay Buccaneers': t('TB', '#d50a0a', '9-7'), 'Pittsburgh Steelers': t('PIT', '#ffb612', '10-6', [['Willie Parker', '1,316 rush yds']]),
        'Jacksonville Jaguars': t('JAX', '#006778', '11-5', [['David Garrard', '18 TD · 3 INT']]),
        'San Diego Chargers': t('SD', '#0080c6', '11-5', [['LaDainian Tomlinson', '1,474 rush yds · 18 TD']]),
        'Tennessee Titans': t('TEN', '#4b92db', '10-6'), 'Seattle Seahawks': t('SEA', '#002244', '10-6'),
        'Washington Redskins': t('WAS', '#773141', '9-7'), 'Indianapolis Colts': t('IND', '#002c5f', '13-3', [['Peyton Manning', '4,040 yds · 31 TD']]),
      },
      events: [
        E('Wild Card', 'Pittsburgh Steelers', 'Jacksonville Jaguars', 29, 31), E('Wild Card', 'San Diego Chargers', 'Tennessee Titans', 17, 6),
        E('Wild Card', 'Tampa Bay Buccaneers', 'New York Giants', 14, 24), E('Wild Card', 'Seattle Seahawks', 'Washington Redskins', 35, 14),
        E('Divisional', 'New England Patriots', 'Jacksonville Jaguars', 31, 20), E('Divisional', 'Indianapolis Colts', 'San Diego Chargers', 24, 28),
        E('Divisional', 'Green Bay Packers', 'Seattle Seahawks', 42, 20), E('Divisional', 'Dallas Cowboys', 'New York Giants', 17, 21),
        E('Conference Championship', 'New England Patriots', 'San Diego Chargers', 21, 12), E('Conference Championship', 'Green Bay Packers', 'New York Giants', 20, 23, { ot: true }),
        E('Super Bowl XLII', 'New England Patriots', 'New York Giants', 14, 17, { n: true, final: true }),
      ],
    },
    {
      year: 2015, league: 'NFL', champion: 'Denver Broncos', blurb: 'Defense wins championships.',
      teams: {
        'Carolina Panthers': t('CAR', '#0085ca', '15-1', [['Cam Newton', '35 pass TD · 10 rush TD']], 'League MVP quarterback.'),
        'Denver Broncos': t('DEN', '#fb4f14', '12-4', [['Von Miller', '11 sacks'], ['Peyton Manning', '9 TD · 17 INT']], '#1 ranked defense.'),
        'New England Patriots': t('NE', '#002244', '12-4', [['Tom Brady', '4,770 yds · 36 TD'], ['Rob Gronkowski', '72 rec · 11 TD']]),
        'Arizona Cardinals': t('ARI', '#97233f', '13-3', [['Carson Palmer', '4,671 yds · 35 TD']]),
        'Houston Texans': t('HOU', '#03202f', '9-7'), 'Kansas City Chiefs': t('KC', '#e31837', '11-5', [], 'Won 10 straight to close the year.'),
        'Cincinnati Bengals': t('CIN', '#fb4f14', '12-4'), 'Pittsburgh Steelers': t('PIT', '#ffb612', '10-6', [['Antonio Brown', '136 rec · 1,834 yds']]),
        'Minnesota Vikings': t('MIN', '#4f2683', '11-5'), 'Seattle Seahawks': t('SEA', '#002244', '10-6', [['Russell Wilson', '34 TD · 8 INT']]),
        'Washington Redskins': t('WAS', '#773141', '9-7'), 'Green Bay Packers': t('GB', '#203731', '10-6'),
      },
      events: [
        E('Wild Card', 'Houston Texans', 'Kansas City Chiefs', 0, 30), E('Wild Card', 'Cincinnati Bengals', 'Pittsburgh Steelers', 16, 18),
        E('Wild Card', 'Minnesota Vikings', 'Seattle Seahawks', 9, 10), E('Wild Card', 'Washington Redskins', 'Green Bay Packers', 18, 35),
        E('Divisional', 'Carolina Panthers', 'Seattle Seahawks', 31, 24), E('Divisional', 'Arizona Cardinals', 'Green Bay Packers', 26, 20, { ot: true }),
        E('Divisional', 'New England Patriots', 'Kansas City Chiefs', 27, 20), E('Divisional', 'Denver Broncos', 'Pittsburgh Steelers', 23, 16),
        E('Conference Championship', 'Carolina Panthers', 'Arizona Cardinals', 49, 15), E('Conference Championship', 'Denver Broncos', 'New England Patriots', 20, 18),
        E('Super Bowl 50', 'Denver Broncos', 'Carolina Panthers', 24, 10, { n: true, final: true }),
      ],
    },
    {
      year: 2016, league: 'NFL', champion: 'New England Patriots', blurb: 'A 28-3 deficit. You remember.',
      teams: {
        'New England Patriots': t('NE', '#002244', '14-2', [['Tom Brady', '28 TD · 2 INT (12 games)']], 'Brady served a 4-game suspension.'),
        'Atlanta Falcons': t('ATL', '#a71930', '11-5', [['Matt Ryan', '4,944 yds · 38 TD'], ['Julio Jones', '1,409 yds']], 'League MVP quarterback; #1 scoring offense.'),
        'Green Bay Packers': t('GB', '#203731', '10-6', [['Aaron Rodgers', '40 TD · 7 INT']], 'Won 6 straight to make the playoffs.'),
        'Dallas Cowboys': t('DAL', '#003594', '13-3', [['Dak Prescott', '23 TD · 4 INT'], ['Ezekiel Elliott', '1,631 rush yds']], 'Rookie QB and RB.'),
        'Pittsburgh Steelers': t('PIT', '#ffb612', '11-5', [['Le\'Veon Bell', '1,268 rush yds']]), 'Kansas City Chiefs': t('KC', '#e31837', '12-4'),
        'Houston Texans': t('HOU', '#03202f', '9-7'), 'Oakland Raiders': t('OAK', '#000000', '12-4', [], 'Starting a third-string QB.'),
        'Miami Dolphins': t('MIA', '#008e97', '10-6'), 'Seattle Seahawks': t('SEA', '#002244', '10-5-1', [['Russell Wilson', '21 TD · 11 INT']]),
        'Detroit Lions': t('DET', '#0076b6', '9-7'), 'New York Giants': t('NYG', '#0b2265', '11-5'),
      },
      events: [
        E('Wild Card', 'Houston Texans', 'Oakland Raiders', 27, 14), E('Wild Card', 'Seattle Seahawks', 'Detroit Lions', 26, 6),
        E('Wild Card', 'Pittsburgh Steelers', 'Miami Dolphins', 30, 12), E('Wild Card', 'New York Giants', 'Green Bay Packers', 13, 38),
        E('Divisional', 'Atlanta Falcons', 'Seattle Seahawks', 36, 20), E('Divisional', 'New England Patriots', 'Houston Texans', 34, 16),
        E('Divisional', 'Kansas City Chiefs', 'Pittsburgh Steelers', 16, 18), E('Divisional', 'Dallas Cowboys', 'Green Bay Packers', 31, 34),
        E('Conference Championship', 'Atlanta Falcons', 'Green Bay Packers', 44, 21), E('Conference Championship', 'New England Patriots', 'Pittsburgh Steelers', 36, 17),
        E('Super Bowl LI', 'New England Patriots', 'Atlanta Falcons', 34, 28, { n: true, ot: true, final: true }),
      ],
    },
  ],

  cfb: [
    {
      year: 2018, league: 'NCAA FBS', champion: 'Clemson Tigers', blurb: 'A freshman quarterback and a 44-16 statement.',
      teams: {
        'Clemson Tigers': t('CLE', '#f56600', '12-0', [['Trevor Lawrence', '3,280 yds · 30 TD']], 'Freshman QB.'),
        'Pittsburgh Panthers': t('PIT', '#003594', '7-5'), 'Alabama Crimson Tide': t('ALA', '#9e1b32', '12-0', [['Tua Tagovailoa', '3,966 yds · 43 TD']], 'Won every game by double digits until the SEC title game.'),
        'Georgia Bulldogs': t('UGA', '#ba0c2f', '11-1'), 'Oklahoma Sooners': t('OU', '#841617', '11-1', [['Kyler Murray', '4,361 yds · 42 TD']], 'Heisman winner.'),
        'Texas Longhorns': t('TEX', '#bf5700', '9-3'), 'Ohio State Buckeyes': t('OSU', '#bb0000', '11-1', [['Dwayne Haskins', '4,831 yds · 50 TD']]),
        'Northwestern Wildcats': t('NU', '#4e2a84', '8-4'), 'Washington Huskies': t('UW', '#4b2e83', '9-3'), 'Utah Utes': t('UTAH', '#cc0000', '9-3'),
        'UCF Knights': t('UCF', '#ba9b37', '12-0', [], 'Unbeaten, 25-game win streak.'), 'Memphis Tigers': t('MEM', '#003087', '8-4'),
        'Notre Dame Fighting Irish': t('ND', '#0c2340', '12-0', [], 'Unbeaten, first CFP appearance.'),
      },
      events: [
        E('ACC Championship', 'Clemson Tigers', 'Pittsburgh Panthers', 42, 10, { n: true }), E('SEC Championship', 'Alabama Crimson Tide', 'Georgia Bulldogs', 35, 28, { n: true }),
        E('Big 12 Championship', 'Oklahoma Sooners', 'Texas Longhorns', 39, 27, { n: true }), E('Big Ten Championship', 'Ohio State Buckeyes', 'Northwestern Wildcats', 45, 24, { n: true }),
        E('Pac-12 Championship', 'Washington Huskies', 'Utah Utes', 10, 3), E('American Championship', 'UCF Knights', 'Memphis Tigers', 56, 41),
        E('CFP Semifinal (Cotton Bowl)', 'Clemson Tigers', 'Notre Dame Fighting Irish', 30, 3, { n: true }), E('CFP Semifinal (Orange Bowl)', 'Alabama Crimson Tide', 'Oklahoma Sooners', 45, 34, { n: true }),
        E('Rose Bowl', 'Ohio State Buckeyes', 'Washington Huskies', 28, 23, { n: true }),
        E('National Championship', 'Clemson Tigers', 'Alabama Crimson Tide', 44, 16, { n: true, final: true }),
      ],
    },
  ],

  nba: [
    {
      year: 2016, league: 'NBA', champion: 'Cleveland Cavaliers', ou: 205.5, blurb: 'Down 3-1 against a 73-9 team.',
      teams: {
        'Cleveland Cavaliers': t('CLE', '#860038', '57-25', [['LeBron James', '25.3 PPG · 7.4 RPG · 6.8 APG'], ['Kyrie Irving', '19.6 PPG'], ['Kevin Love', '16.0 PPG · 9.9 RPG']]),
        'Toronto Raptors': t('TOR', '#ce1141', '56-26', [['DeMar DeRozan', '23.5 PPG'], ['Kyle Lowry', '21.2 PPG']], 'Franchise-record 56 wins.'),
        'Golden State Warriors': t('GSW', '#1d428a', '73-9', [['Stephen Curry', '30.1 PPG · 402 3PM'], ['Klay Thompson', '22.1 PPG'], ['Draymond Green', '14.0 PPG · 9.5 RPG · 7.4 APG']], 'Best regular season in NBA history.'),
      },
      events: [
        E('East Finals · Game 4', 'Toronto Raptors', 'Cleveland Cavaliers', 105, 99, { series: 'ECF', pre: { 'Toronto Raptors': 1, 'Cleveland Cavaliers': 2 } }),
        E('East Finals · Game 5', 'Cleveland Cavaliers', 'Toronto Raptors', 116, 78, { series: 'ECF' }),
        E('East Finals · Game 6', 'Toronto Raptors', 'Cleveland Cavaliers', 87, 113, { series: 'ECF' }),
        E('NBA Finals · Game 1', 'Golden State Warriors', 'Cleveland Cavaliers', 104, 89, { series: 'F' }), E('NBA Finals · Game 2', 'Golden State Warriors', 'Cleveland Cavaliers', 110, 77, { series: 'F' }),
        E('NBA Finals · Game 3', 'Cleveland Cavaliers', 'Golden State Warriors', 120, 90, { series: 'F' }), E('NBA Finals · Game 4', 'Cleveland Cavaliers', 'Golden State Warriors', 97, 108, { series: 'F' }),
        E('NBA Finals · Game 5', 'Golden State Warriors', 'Cleveland Cavaliers', 97, 112, { series: 'F' }), E('NBA Finals · Game 6', 'Cleveland Cavaliers', 'Golden State Warriors', 115, 101, { series: 'F' }),
        E('NBA Finals · Game 7', 'Golden State Warriors', 'Cleveland Cavaliers', 89, 93, { series: 'F', final: true }),
      ],
    },
    {
      year: 2011, league: 'NBA', champion: 'Dallas Mavericks', ou: 196.5, blurb: 'Dirk\'s title.',
      teams: {
        'Dallas Mavericks': t('DAL', '#00538c', '57-25', [['Dirk Nowitzki', '23.0 PPG · 7.0 RPG']]),
        'Oklahoma City Thunder': t('OKC', '#007ac1', '55-27', [['Kevin Durant', '27.7 PPG'], ['Russell Westbrook', '21.9 PPG'], ['James Harden', '12.2 PPG (6th man)']], 'Young core, scoring champion Durant.'),
        'Miami Heat': t('MIA', '#98002e', '58-24', [['LeBron James', '26.7 PPG'], ['Dwyane Wade', '25.5 PPG'], ['Chris Bosh', '18.7 PPG']], 'The new Big Three.'),
      },
      events: [
        E('West Finals · Game 2', 'Dallas Mavericks', 'Oklahoma City Thunder', 100, 106, { series: 'WCF', pre: { 'Dallas Mavericks': 1, 'Oklahoma City Thunder': 0 } }),
        E('West Finals · Game 3', 'Oklahoma City Thunder', 'Dallas Mavericks', 87, 93, { series: 'WCF' }),
        E('West Finals · Game 4', 'Oklahoma City Thunder', 'Dallas Mavericks', 105, 112, { series: 'WCF', ot: true }),
        E('West Finals · Game 5', 'Dallas Mavericks', 'Oklahoma City Thunder', 100, 96, { series: 'WCF' }),
        E('NBA Finals · Game 1', 'Miami Heat', 'Dallas Mavericks', 92, 84, { series: 'F' }), E('NBA Finals · Game 2', 'Miami Heat', 'Dallas Mavericks', 93, 95, { series: 'F' }),
        E('NBA Finals · Game 3', 'Dallas Mavericks', 'Miami Heat', 86, 88, { series: 'F' }), E('NBA Finals · Game 4', 'Dallas Mavericks', 'Miami Heat', 86, 83, { series: 'F' }),
        E('NBA Finals · Game 5', 'Dallas Mavericks', 'Miami Heat', 112, 103, { series: 'F' }), E('NBA Finals · Game 6', 'Miami Heat', 'Dallas Mavericks', 95, 105, { series: 'F', final: true }),
      ],
    },
  ],

  ncaab: [
    {
      year: 2018, league: 'NCAA Tournament', champion: 'Villanova Wildcats', blurb: 'Mikal Bridges, Jalen Brunson and a 79-62 coronation.',
      teams: {
        'Villanova Wildcats': t('NOVA', '#00205b', '30-4', [['Jalen Brunson', '18.9 PPG']], '#1 seed, East region.'),
        'Radford Highlanders': t('RAD', '#c8102e', '22-12', [], '#16 seed.'), 'Alabama Crimson Tide': t('ALA', '#9e1b32', '19-15', [], '#9 seed.'),
        'West Virginia Mountaineers': t('WVU', '#002855', '24-10', [], '#5 seed, "Press Virginia".'), 'Texas Tech Red Raiders': t('TTU', '#cc0000', '24-9', [], '#3 seed, elite defense.'),
        'Kansas Jayhawks': t('KU', '#0051ba', '27-7', [], '#1 seed, Midwest.'), 'Duke Blue Devils': t('DUKE', '#001a57', '26-7', [], '#2 seed.'),
        'Michigan Wolverines': t('MICH', '#00274c', '28-7', [], '#3 seed, West.'), 'Florida State Seminoles': t('FSU', '#782f40', '20-11', [], '#9 seed.'),
        'Loyola Chicago Ramblers': t('LUC', '#9d2235', '28-5', [], '#11 seed - Cinderella with Sister Jean.'), 'Kansas State Wildcats': t('KSU', '#512888', '22-11', [], '#9 seed.'),
      },
      events: [
        E('Round of 64', 'Villanova Wildcats', 'Radford Highlanders', 87, 61, { n: true }), E('Round of 32', 'Villanova Wildcats', 'Alabama Crimson Tide', 81, 58, { n: true }),
        E('Sweet 16', 'Villanova Wildcats', 'West Virginia Mountaineers', 90, 78, { n: true }),
        E('Elite Eight', 'Michigan Wolverines', 'Florida State Seminoles', 58, 54, { n: true }), E('Elite Eight', 'Loyola Chicago Ramblers', 'Kansas State Wildcats', 78, 62, { n: true }),
        E('Elite Eight', 'Kansas Jayhawks', 'Duke Blue Devils', 85, 81, { n: true, ot: true }), E('Elite Eight', 'Villanova Wildcats', 'Texas Tech Red Raiders', 71, 59, { n: true }),
        E('Final Four', 'Michigan Wolverines', 'Loyola Chicago Ramblers', 69, 57, { n: true }), E('Final Four', 'Villanova Wildcats', 'Kansas Jayhawks', 95, 79, { n: true }),
        E('National Championship', 'Villanova Wildcats', 'Michigan Wolverines', 79, 62, { n: true, final: true }),
      ],
    },
  ],

  nhl: [
    {
      year: 2019, league: 'NHL', champion: 'St. Louis Blues', blurb: 'Last place in January, Stanley Cup in June.',
      teams: {
        'St. Louis Blues': t('STL', '#002f87', '45-28-9', [['Jordan Binnington', '24-5-1 · 1.89 GAA'], ['Ryan O\'Reilly', '77 pts']], 'Last in the NHL on January 3rd.'),
        'San Jose Sharks': t('SJS', '#006d75', '46-27-9', [], 'Erik Karlsson, Logan Couture, Brent Burns.'),
        'Boston Bruins': t('BOS', '#fcb514', '49-24-9', [['Brad Marchand', '100 pts'], ['David Pastrnak', '81 pts']], '107 points; the top line was elite.'),
      },
      events: [
        E('West Finals · Game 4', 'St. Louis Blues', 'San Jose Sharks', 2, 1, { series: 'WCF', pre: { 'St. Louis Blues': 1, 'San Jose Sharks': 2 } }),
        E('West Finals · Game 5', 'San Jose Sharks', 'St. Louis Blues', 0, 5, { series: 'WCF' }), E('West Finals · Game 6', 'St. Louis Blues', 'San Jose Sharks', 5, 1, { series: 'WCF' }),
        E('Stanley Cup Final · Game 1', 'Boston Bruins', 'St. Louis Blues', 4, 2, { series: 'F' }), E('Stanley Cup Final · Game 2', 'Boston Bruins', 'St. Louis Blues', 2, 3, { series: 'F', ot: true }),
        E('Stanley Cup Final · Game 3', 'St. Louis Blues', 'Boston Bruins', 2, 7, { series: 'F' }), E('Stanley Cup Final · Game 4', 'St. Louis Blues', 'Boston Bruins', 4, 2, { series: 'F' }),
        E('Stanley Cup Final · Game 5', 'Boston Bruins', 'St. Louis Blues', 1, 2, { series: 'F' }), E('Stanley Cup Final · Game 6', 'St. Louis Blues', 'Boston Bruins', 1, 5, { series: 'F' }),
        E('Stanley Cup Final · Game 7', 'Boston Bruins', 'St. Louis Blues', 1, 4, { series: 'F', final: true }),
      ],
    },
  ],

  mlb: [
    {
      year: 2016, league: 'MLB', champion: 'Chicago Cubs', blurb: 'The 108-year drought.',
      teams: {
        'Chicago Cubs': t('CHC', '#0e3386', '103-58', [['Kris Bryant', '39 HR · 102 RBI'], ['Anthony Rizzo', '32 HR · 109 RBI'], ['Kyle Hendricks', '16-8 · 2.13 ERA']], 'Best record in baseball.'),
        'Los Angeles Dodgers': t('LAD', '#005a9c', '91-71', [['Clayton Kershaw', '12-4 · 1.69 ERA'], ['Corey Seager', '.308 · 26 HR']]),
        'Cleveland Indians': t('CLE', '#e31937', '94-67', [['Corey Kluber', '18-9 · 3.14 ERA'], ['Francisco Lindor', '.301 · 15 HR']], 'Missing two starting pitchers.'),
      },
      events: [
        E('NLCS · Game 4', 'Los Angeles Dodgers', 'Chicago Cubs', 2, 10, { series: 'NLCS', pre: { 'Los Angeles Dodgers': 2, 'Chicago Cubs': 1 } }),
        E('NLCS · Game 5', 'Los Angeles Dodgers', 'Chicago Cubs', 4, 8, { series: 'NLCS' }), E('NLCS · Game 6', 'Chicago Cubs', 'Los Angeles Dodgers', 5, 0, { series: 'NLCS' }),
        E('World Series · Game 1', 'Cleveland Indians', 'Chicago Cubs', 6, 0, { series: 'WS' }), E('World Series · Game 2', 'Cleveland Indians', 'Chicago Cubs', 1, 5, { series: 'WS' }),
        E('World Series · Game 3', 'Chicago Cubs', 'Cleveland Indians', 0, 1, { series: 'WS' }), E('World Series · Game 4', 'Chicago Cubs', 'Cleveland Indians', 2, 7, { series: 'WS' }),
        E('World Series · Game 5', 'Chicago Cubs', 'Cleveland Indians', 3, 2, { series: 'WS' }), E('World Series · Game 6', 'Cleveland Indians', 'Chicago Cubs', 3, 9, { series: 'WS' }),
        E('World Series · Game 7', 'Cleveland Indians', 'Chicago Cubs', 7, 8, { series: 'WS', ex: 10, final: true }),
      ],
    },
    {
      year: 2004, league: 'MLB', champion: 'Boston Red Sox', blurb: 'Down 0-3. Then the impossible.',
      teams: {
        'Boston Red Sox': t('BOS', '#bd3039', '98-64', [['David Ortiz', '.301 · 41 HR · 139 RBI'], ['Manny Ramirez', '43 HR · 130 RBI'], ['Curt Schilling', '21-6 · 3.26 ERA'], ['Pedro Martinez', '16-9 · 3.90 ERA']]),
        'New York Yankees': t('NYY', '#0c2340', '101-61', [['Alex Rodriguez', '36 HR · 106 RBI'], ['Derek Jeter', '.292 · 23 HR']], 'AL East champions.'),
        'St. Louis Cardinals': t('STL', '#c41e3a', '105-57', [['Albert Pujols', '.331 · 46 HR · 123 RBI'], ['Scott Rolen', '.314 · 34 HR · 124 RBI']], 'Best record in the majors.'),
      },
      events: [
        E('ALCS · Game 2', 'New York Yankees', 'Boston Red Sox', 3, 1, { series: 'ALCS', pre: { 'New York Yankees': 1, 'Boston Red Sox': 0 } }),
        E('ALCS · Game 3', 'Boston Red Sox', 'New York Yankees', 8, 19, { series: 'ALCS' }), E('ALCS · Game 4', 'Boston Red Sox', 'New York Yankees', 6, 4, { series: 'ALCS', ex: 12 }),
        E('ALCS · Game 5', 'Boston Red Sox', 'New York Yankees', 5, 4, { series: 'ALCS', ex: 14 }), E('ALCS · Game 6', 'New York Yankees', 'Boston Red Sox', 2, 4, { series: 'ALCS' }),
        E('ALCS · Game 7', 'New York Yankees', 'Boston Red Sox', 3, 10, { series: 'ALCS' }),
        E('World Series · Game 1', 'Boston Red Sox', 'St. Louis Cardinals', 11, 9, { series: 'WS' }), E('World Series · Game 2', 'Boston Red Sox', 'St. Louis Cardinals', 6, 2, { series: 'WS' }),
        E('World Series · Game 3', 'St. Louis Cardinals', 'Boston Red Sox', 1, 4, { series: 'WS' }), E('World Series · Game 4', 'St. Louis Cardinals', 'Boston Red Sox', 0, 3, { series: 'WS', final: true }),
      ],
    },
  ],
};

// ---------- second batch (Oct 2026): every score and home team below was checked against web sources; records/stars from memory ----------
SEASONS.nfl.push(
  {
    year: 2014, league: 'NFL', champion: 'New England Patriots', blurb: 'Second and goal from the 1. Malcolm Butler.',
    teams: {
      'New England Patriots': t('NE', '#002244', '12-4', [['Tom Brady', '33 TD · 9 INT'], ['Rob Gronkowski', '1,124 rec yds · 12 TD']], 'AFC top seed.'),
      'Seattle Seahawks': t('SEA', '#002244', '12-4', [['Russell Wilson', '20 pass TD · 849 rush yds'], ['Marshawn Lynch', '1,306 rush yds · 13 TD']], 'Defending champions, "Legion of Boom" defense.'),
      'Green Bay Packers': t('GB', '#203731', '12-4', [['Aaron Rodgers', '38 TD · 5 INT']], 'League MVP quarterback.'),
      'Dallas Cowboys': t('DAL', '#003594', '12-4', [['DeMarco Murray', '1,845 rush yds']], 'Led the league in rushing.'),
      'Denver Broncos': t('DEN', '#fb4f14', '12-4', [['Peyton Manning', '4,727 yds · 39 TD']]),
      'Indianapolis Colts': t('IND', '#002c5f', '11-5', [['Andrew Luck', '4,761 yds · 40 TD']]),
      'Pittsburgh Steelers': t('PIT', '#ffb612', '11-5', [['Antonio Brown', '129 rec · 1,698 yds']]), 'Baltimore Ravens': t('BAL', '#241773', '10-6'),
      'Carolina Panthers': t('CAR', '#0085ca', '7-8-1', [], 'Won the NFC South with a losing record.'), 'Arizona Cardinals': t('ARI', '#97233f', '11-5', [], 'Down to a third-string QB.'),
      'Cincinnati Bengals': t('CIN', '#fb4f14', '10-5-1'), 'Detroit Lions': t('DET', '#0076b6', '11-5'),
    },
    events: [
      E('Wild Card', 'Carolina Panthers', 'Arizona Cardinals', 27, 16), E('Wild Card', 'Pittsburgh Steelers', 'Baltimore Ravens', 17, 30),
      E('Wild Card', 'Indianapolis Colts', 'Cincinnati Bengals', 26, 10), E('Wild Card', 'Dallas Cowboys', 'Detroit Lions', 24, 20),
      E('Divisional', 'New England Patriots', 'Baltimore Ravens', 35, 31), E('Divisional', 'Seattle Seahawks', 'Carolina Panthers', 31, 17),
      E('Divisional', 'Denver Broncos', 'Indianapolis Colts', 13, 24), E('Divisional', 'Green Bay Packers', 'Dallas Cowboys', 26, 21),
      E('Conference Championship', 'Seattle Seahawks', 'Green Bay Packers', 28, 22, { ot: true }), E('Conference Championship', 'New England Patriots', 'Indianapolis Colts', 45, 7),
      E('Super Bowl XLIX', 'Seattle Seahawks', 'New England Patriots', 24, 28, { n: true, final: true }),
    ],
  },
  {
    year: 2019, league: 'NFL', champion: 'Kansas City Chiefs', blurb: 'Down 10 in the fourth. Then Mahomes.',
    teams: {
      'Kansas City Chiefs': t('KC', '#e31837', '12-4', [['Patrick Mahomes', '4,031 yds · 26 TD'], ['Travis Kelce', '1,229 rec yds']]),
      'San Francisco 49ers': t('SF', '#aa0000', '13-3', [['Jimmy Garoppolo', '27 TD · 13 INT'], ['George Kittle', '1,053 rec yds']], 'NFC top seed; started 8-0.'),
      'Baltimore Ravens': t('BAL', '#241773', '14-2', [['Lamar Jackson', '36 pass TD · 1,206 rush yds']], 'League MVP; best record in football.'),
      'Green Bay Packers': t('GB', '#203731', '13-3', [['Aaron Rodgers', '26 TD · 4 INT'], ['Aaron Jones', '19 total TD']]),
      'Tennessee Titans': t('TEN', '#4b92db', '9-7', [['Derrick Henry', '1,540 rush yds · 16 TD']], 'Rushing champion Derrick Henry.'),
      'Houston Texans': t('HOU', '#03202f', '10-6', [['Deshaun Watson', '26 TD · 12 INT']]), 'Buffalo Bills': t('BUF', '#00338d', '10-6'),
      'New England Patriots': t('NE', '#002244', '12-4', [['Tom Brady', '24 TD · 8 INT']], 'Defending champions.'),
      'New Orleans Saints': t('NO', '#d3bc8d', '13-3', [['Michael Thomas', '149 rec · 1,725 yds']], 'Record 149 catches for Michael Thomas.'),
      'Minnesota Vikings': t('MIN', '#4f2683', '10-6', [['Dalvin Cook', '1,135 rush yds']]),
      'Philadelphia Eagles': t('PHI', '#004c54', '9-7'), 'Seattle Seahawks': t('SEA', '#002244', '11-5', [['Russell Wilson', '31 TD · 5 INT']]),
    },
    events: [
      E('Wild Card', 'Houston Texans', 'Buffalo Bills', 22, 19, { ot: true }), E('Wild Card', 'New England Patriots', 'Tennessee Titans', 13, 20),
      E('Wild Card', 'New Orleans Saints', 'Minnesota Vikings', 20, 26, { ot: true }), E('Wild Card', 'Philadelphia Eagles', 'Seattle Seahawks', 9, 17),
      E('Divisional', 'San Francisco 49ers', 'Minnesota Vikings', 27, 10), E('Divisional', 'Baltimore Ravens', 'Tennessee Titans', 12, 28),
      E('Divisional', 'Kansas City Chiefs', 'Houston Texans', 51, 31), E('Divisional', 'Green Bay Packers', 'Seattle Seahawks', 28, 23),
      E('Conference Championship', 'Kansas City Chiefs', 'Tennessee Titans', 35, 24), E('Conference Championship', 'San Francisco 49ers', 'Green Bay Packers', 37, 20),
      E('Super Bowl LIV', 'Kansas City Chiefs', 'San Francisco 49ers', 31, 20, { n: true, final: true }),
    ],
  },
);

SEASONS.cfb.push(
  {
    year: 2014, league: 'NCAA FBS', champion: 'Ohio State Buckeyes', blurb: 'The first Playoff, won by a third-string quarterback.',
    teams: {
      'Ohio State Buckeyes': t('OSU', '#bb0000', '11-1', [['Cardale Jones', 'third-string QB'], ['Ezekiel Elliott', 'RB']], 'Lost two starting quarterbacks to injury.'),
      'Wisconsin Badgers': t('WIS', '#c5050c', '10-2', [['Melvin Gordon', 'Heisman runner-up']]),
      'Oregon Ducks': t('ORE', '#154733', '11-1', [['Marcus Mariota', 'Heisman winner']], 'Fastest offense in the country.'),
      'Arizona Wildcats': t('ARIZ', '#cc0033', '10-2'),
      'Alabama Crimson Tide': t('ALA', '#9e1b32', '11-1', [['Amari Cooper', 'Biletnikoff winner']], '#1 in the final CFP ranking.'),
      'Missouri Tigers': t('MIZ', '#f1b82d', '10-2'),
      'Florida State Seminoles': t('FSU', '#782f40', '12-0', [['Jameis Winston', 'defending Heisman winner']], 'Defending champions, 28-game win streak.'),
      'Georgia Tech Yellow Jackets': t('GT', '#b3a369', '10-2', [], 'Triple-option offense.'),
      'TCU Horned Frogs': t('TCU', '#4d1979', '11-1', [['Trevone Boykin', 'QB']], 'Dropped from #3 to #6 on the final weekend.'),
      'Ole Miss Rebels': t('MISS', '#ce1126', '9-3'), 'Boise State Broncos': t('BSU', '#0033a0', '11-2'),
      'Michigan State Spartans': t('MSU', '#18453b', '10-2'), 'Baylor Bears': t('BAY', '#154734', '11-1', [['Bryce Petty', 'QB']], 'Big 12 co-champion, left out of the Playoff.'),
    },
    events: [
      E('Pac-12 Championship', 'Oregon Ducks', 'Arizona Wildcats', 51, 13, { n: true }), E('SEC Championship', 'Alabama Crimson Tide', 'Missouri Tigers', 42, 13, { n: true }),
      E('ACC Championship', 'Florida State Seminoles', 'Georgia Tech Yellow Jackets', 37, 35, { n: true }), E('Big Ten Championship', 'Ohio State Buckeyes', 'Wisconsin Badgers', 59, 0, { n: true }),
      E('Peach Bowl', 'TCU Horned Frogs', 'Ole Miss Rebels', 42, 3, { n: true }), E('Fiesta Bowl', 'Boise State Broncos', 'Arizona Wildcats', 38, 30, { n: true }),
      E('Cotton Bowl', 'Michigan State Spartans', 'Baylor Bears', 42, 41, { n: true }),
      E('CFP Semifinal (Rose Bowl)', 'Oregon Ducks', 'Florida State Seminoles', 59, 20, { n: true }), E('CFP Semifinal (Sugar Bowl)', 'Ohio State Buckeyes', 'Alabama Crimson Tide', 42, 35, { n: true }),
      E('National Championship', 'Ohio State Buckeyes', 'Oregon Ducks', 42, 20, { n: true, final: true }),
    ],
  },
  {
    year: 2019, league: 'NCAA FBS', champion: 'LSU Tigers', blurb: 'Joe Burrow and the greatest offense college football had seen.',
    teams: {
      'LSU Tigers': t('LSU', '#461d7c', '12-0', [['Joe Burrow', 'Heisman winner'], ["Ja'Marr Chase", 'Biletnikoff winner']], 'Beat seven top-10 teams.'),
      'Georgia Bulldogs': t('UGA', '#ba0c2f', '11-1'), 'Oklahoma Sooners': t('OU', '#841617', '11-1', [['Jalen Hurts', 'Heisman runner-up']]),
      'Baylor Bears': t('BAY', '#154734', '11-1'), 'Clemson Tigers': t('CLE', '#f56600', '12-0', [['Trevor Lawrence', 'QB'], ['Travis Etienne', 'RB']], 'Defending champions, 28-game win streak.'),
      'Virginia Cavaliers': t('UVA', '#232d4b', '9-3'), 'Ohio State Buckeyes': t('OSU', '#bb0000', '12-0', [['Justin Fields', 'QB'], ['Chase Young', 'DE']]),
      'Wisconsin Badgers': t('WIS', '#c5050c', '10-2', [['Jonathan Taylor', 'RB']]), 'Oregon Ducks': t('ORE', '#154733', '10-2', [['Justin Herbert', 'QB']]),
      'Utah Utes': t('UTAH', '#cc0000', '11-1', [['Zack Moss', 'RB']], 'One win from the Playoff.'),
    },
    events: [
      E('Pac-12 Championship', 'Oregon Ducks', 'Utah Utes', 37, 15, { n: true }), E('SEC Championship', 'LSU Tigers', 'Georgia Bulldogs', 37, 10, { n: true }),
      E('Big 12 Championship', 'Oklahoma Sooners', 'Baylor Bears', 30, 23, { n: true, ot: true }), E('ACC Championship', 'Clemson Tigers', 'Virginia Cavaliers', 62, 17, { n: true }),
      E('Big Ten Championship', 'Ohio State Buckeyes', 'Wisconsin Badgers', 34, 21, { n: true }),
      E('CFP Semifinal (Peach Bowl)', 'LSU Tigers', 'Oklahoma Sooners', 63, 28, { n: true }), E('CFP Semifinal (Fiesta Bowl)', 'Clemson Tigers', 'Ohio State Buckeyes', 29, 23, { n: true }),
      E('Rose Bowl', 'Oregon Ducks', 'Wisconsin Badgers', 28, 27, { n: true }), E('Sugar Bowl', 'Georgia Bulldogs', 'Baylor Bears', 26, 14, { n: true }),
      E('National Championship', 'LSU Tigers', 'Clemson Tigers', 42, 25, { n: true, final: true }),
    ],
  },
);

SEASONS.nba.push(
  {
    year: 2014, league: 'NBA', champion: 'San Antonio Spurs', ou: 200.5, blurb: 'The beautiful game. Revenge on Miami.',
    teams: {
      'San Antonio Spurs': t('SAS', '#8a8d8f', '62-20', [['Tony Parker', '16.7 PPG'], ['Tim Duncan', '15.1 PPG · 9.7 RPG'], ['Kawhi Leonard', '12.8 PPG']], 'Lost the 2013 Finals to Miami in seven.'),
      'Oklahoma City Thunder': t('OKC', '#007ac1', '59-23', [['Kevin Durant', '32.0 PPG'], ['Russell Westbrook', '21.8 PPG']], 'League MVP Kevin Durant.'),
      'Miami Heat': t('MIA', '#98002e', '54-28', [['LeBron James', '27.1 PPG'], ['Dwyane Wade', '19.0 PPG'], ['Chris Bosh', '16.2 PPG']], 'Two-time defending champions.'),
    },
    events: [
      E('West Finals · Game 2', 'San Antonio Spurs', 'Oklahoma City Thunder', 112, 77, { series: 'WCF', pre: { 'San Antonio Spurs': 1, 'Oklahoma City Thunder': 0 } }),
      E('West Finals · Game 3', 'Oklahoma City Thunder', 'San Antonio Spurs', 106, 97, { series: 'WCF' }), E('West Finals · Game 4', 'Oklahoma City Thunder', 'San Antonio Spurs', 105, 92, { series: 'WCF' }),
      E('West Finals · Game 5', 'San Antonio Spurs', 'Oklahoma City Thunder', 117, 89, { series: 'WCF' }), E('West Finals · Game 6', 'Oklahoma City Thunder', 'San Antonio Spurs', 107, 112, { series: 'WCF', ot: true }),
      E('NBA Finals · Game 1', 'San Antonio Spurs', 'Miami Heat', 110, 95, { series: 'F' }), E('NBA Finals · Game 2', 'San Antonio Spurs', 'Miami Heat', 96, 98, { series: 'F' }),
      E('NBA Finals · Game 3', 'Miami Heat', 'San Antonio Spurs', 92, 111, { series: 'F' }), E('NBA Finals · Game 4', 'Miami Heat', 'San Antonio Spurs', 86, 107, { series: 'F' }),
      E('NBA Finals · Game 5', 'San Antonio Spurs', 'Miami Heat', 104, 87, { series: 'F', final: true }),
    ],
  },
  {
    year: 2019, league: 'NBA', champion: 'Toronto Raptors', ou: 214.5, blurb: "Down 0-2 to the Bucks. Then Canada's first title.",
    teams: {
      'Toronto Raptors': t('TOR', '#ce1141', '58-24', [['Kawhi Leonard', '26.6 PPG'], ['Pascal Siakam', '16.9 PPG'], ['Kyle Lowry', '14.2 PPG · 8.7 APG']], 'Traded for Kawhi Leonard in the summer.'),
      'Milwaukee Bucks': t('MIL', '#00471b', '60-22', [['Giannis Antetokounmpo', '27.7 PPG · 12.5 RPG'], ['Khris Middleton', '18.3 PPG']], 'Best record in the league; MVP Giannis.'),
      'Golden State Warriors': t('GSW', '#1d428a', '57-25', [['Stephen Curry', '27.3 PPG'], ['Kevin Durant', '26.0 PPG'], ['Klay Thompson', '21.5 PPG']], 'Two-time defending champions, fifth straight Finals.'),
    },
    events: [
      E('East Finals · Game 3', 'Toronto Raptors', 'Milwaukee Bucks', 118, 112, { series: 'ECF', ot: true, pre: { 'Milwaukee Bucks': 2, 'Toronto Raptors': 0 } }),
      E('East Finals · Game 4', 'Toronto Raptors', 'Milwaukee Bucks', 120, 102, { series: 'ECF' }), E('East Finals · Game 5', 'Milwaukee Bucks', 'Toronto Raptors', 99, 105, { series: 'ECF' }),
      E('East Finals · Game 6', 'Toronto Raptors', 'Milwaukee Bucks', 100, 94, { series: 'ECF' }),
      E('NBA Finals · Game 1', 'Toronto Raptors', 'Golden State Warriors', 118, 109, { series: 'F' }), E('NBA Finals · Game 2', 'Toronto Raptors', 'Golden State Warriors', 104, 109, { series: 'F' }),
      E('NBA Finals · Game 3', 'Golden State Warriors', 'Toronto Raptors', 109, 123, { series: 'F' }), E('NBA Finals · Game 4', 'Golden State Warriors', 'Toronto Raptors', 92, 105, { series: 'F' }),
      E('NBA Finals · Game 5', 'Toronto Raptors', 'Golden State Warriors', 105, 106, { series: 'F' }), E('NBA Finals · Game 6', 'Golden State Warriors', 'Toronto Raptors', 110, 114, { series: 'F', final: true }),
    ],
  },
);

SEASONS.ncaab.push(
  {
    year: 2016, league: 'NCAA Tournament', champion: 'Villanova Wildcats', blurb: 'Kris Jenkins at the buzzer.',
    teams: {
      'Villanova Wildcats': t('NOVA', '#00205b', '29-5', [['Josh Hart', '15.5 PPG'], ['Ryan Arcidiacono', 'G'], ['Kris Jenkins', 'F']], '#2 seed, South.'),
      'UNC Asheville Bulldogs': t('UNCA', '#003da5', '22-11', [], '#15 seed.'), 'Iowa Hawkeyes': t('IOWA', '#ffcd00', '21-10', [], '#7 seed.'),
      'Miami Hurricanes': t('MIA', '#f47321', '25-7', [], '#3 seed.'), 'Kansas Jayhawks': t('KU', '#0051ba', '30-4', [['Perry Ellis', 'F']], '#1 overall seed.'),
      'Oklahoma Sooners': t('OU', '#841617', '25-7', [['Buddy Hield', '25.0 PPG']], '#2 seed, West; national player of the year.'),
      'Oregon Ducks': t('ORE', '#154733', '28-6', [], '#1 seed, West.'),
      'North Carolina Tar Heels': t('UNC', '#7bafd4', '28-6', [['Brice Johnson', '17.0 PPG · 10.4 RPG'], ['Marcus Paige', 'G']], '#1 seed, East.'),
      'Notre Dame Fighting Irish': t('ND', '#0c2340', '21-11', [], '#6 seed.'), 'Syracuse Orange': t('SYR', '#f76900', '19-13', [], '#10 seed - barely made the field.'),
      'Virginia Cavaliers': t('UVA', '#232d4b', '26-7', [], '#1 seed, Midwest; pack-line defense.'),
    },
    events: [
      E('Round of 64', 'Villanova Wildcats', 'UNC Asheville Bulldogs', 86, 56, { n: true }), E('Round of 32', 'Villanova Wildcats', 'Iowa Hawkeyes', 87, 68, { n: true }),
      E('Sweet 16', 'Villanova Wildcats', 'Miami Hurricanes', 92, 69, { n: true }),
      E('Elite Eight', 'Villanova Wildcats', 'Kansas Jayhawks', 64, 59, { n: true }), E('Elite Eight', 'Oklahoma Sooners', 'Oregon Ducks', 80, 68, { n: true }),
      E('Elite Eight', 'North Carolina Tar Heels', 'Notre Dame Fighting Irish', 88, 74, { n: true }), E('Elite Eight', 'Syracuse Orange', 'Virginia Cavaliers', 68, 62, { n: true }),
      E('Final Four', 'Villanova Wildcats', 'Oklahoma Sooners', 95, 51, { n: true }), E('Final Four', 'North Carolina Tar Heels', 'Syracuse Orange', 83, 66, { n: true }),
      E('National Championship', 'Villanova Wildcats', 'North Carolina Tar Heels', 77, 74, { n: true, final: true }),
    ],
  },
  {
    year: 2019, league: 'NCAA Tournament', champion: 'Virginia Cavaliers', blurb: 'One year after losing to a 16 seed.',
    teams: {
      'Virginia Cavaliers': t('UVA', '#232d4b', '29-3', [["De'Andre Hunter", 'F'], ['Kyle Guy', 'G'], ['Ty Jerome', 'G']], '#1 seed, South. Lost to #16 UMBC the year before.'),
      'Gardner-Webb Runnin Bulldogs': t('GWU', '#bb0000', '23-11', [], '#16 seed.'), 'Oklahoma Sooners': t('OU', '#841617', '19-13', [], '#9 seed.'),
      'Oregon Ducks': t('ORE', '#154733', '23-12', [], '#12 seed.'), 'Purdue Boilermakers': t('PUR', '#ceb888', '23-9', [['Carsen Edwards', 'G']], '#3 seed.'),
      'Auburn Tigers': t('AUB', '#0c2340', '26-9', [], '#5 seed.'), 'Kentucky Wildcats': t('UK', '#0033a0', '27-6', [], '#2 seed.'),
      'Texas Tech Red Raiders': t('TTU', '#cc0000', '26-6', [['Jarrett Culver', 'G']], '#3 seed, top defense in the country.'),
      'Gonzaga Bulldogs': t('GONZ', '#041e42', '30-3', [], '#1 seed, West.'), 'Michigan State Spartans': t('MSU', '#18453b', '28-6', [['Cassius Winston', 'G']], '#2 seed.'),
      'Duke Blue Devils': t('DUKE', '#001a57', '29-5', [['Zion Williamson', '22.6 PPG']], '#1 overall seed.'),
    },
    events: [
      E('Round of 64', 'Virginia Cavaliers', 'Gardner-Webb Runnin Bulldogs', 71, 56, { n: true }), E('Round of 32', 'Virginia Cavaliers', 'Oklahoma Sooners', 63, 51, { n: true }),
      E('Sweet 16', 'Virginia Cavaliers', 'Oregon Ducks', 53, 49, { n: true }),
      E('Elite Eight', 'Texas Tech Red Raiders', 'Gonzaga Bulldogs', 75, 69, { n: true }), E('Elite Eight', 'Virginia Cavaliers', 'Purdue Boilermakers', 80, 75, { n: true, ot: true }),
      E('Elite Eight', 'Auburn Tigers', 'Kentucky Wildcats', 77, 71, { n: true, ot: true }), E('Elite Eight', 'Michigan State Spartans', 'Duke Blue Devils', 68, 67, { n: true }),
      E('Final Four', 'Virginia Cavaliers', 'Auburn Tigers', 63, 62, { n: true }), E('Final Four', 'Texas Tech Red Raiders', 'Michigan State Spartans', 61, 51, { n: true }),
      E('National Championship', 'Virginia Cavaliers', 'Texas Tech Red Raiders', 85, 77, { n: true, ot: true, final: true }),
    ],
  },
);

SEASONS.nhl.push(
  {
    year: 2011, league: 'NHL', champion: 'Boston Bruins', blurb: 'Seven games, three shutouts, and Tim Thomas.',
    teams: {
      'Boston Bruins': t('BOS', '#fcb514', '46-25-11', [['Tim Thomas', '.938 SV%'], ['Milan Lucic', '30 goals'], ['David Krejci', 'C']], 'No Cup since 1972.'),
      'Tampa Bay Lightning': t('TBL', '#002868', '46-25-11', [['Steven Stamkos', '45 goals'], ['Martin St. Louis', '99 pts']]),
      'Vancouver Canucks': t('VAN', '#00205b', '54-19-9', [['Daniel Sedin', '104 pts'], ['Henrik Sedin', '94 pts'], ['Roberto Luongo', '38 wins']], "Presidents' Trophy winners."),
    },
    events: [
      E('East Final · Game 5', 'Boston Bruins', 'Tampa Bay Lightning', 3, 1, { series: 'ECF', pre: { 'Boston Bruins': 2, 'Tampa Bay Lightning': 2 } }),
      E('East Final · Game 6', 'Tampa Bay Lightning', 'Boston Bruins', 5, 4, { series: 'ECF' }), E('East Final · Game 7', 'Boston Bruins', 'Tampa Bay Lightning', 1, 0, { series: 'ECF' }),
      E('Stanley Cup Final · Game 1', 'Vancouver Canucks', 'Boston Bruins', 1, 0, { series: 'F' }), E('Stanley Cup Final · Game 2', 'Vancouver Canucks', 'Boston Bruins', 3, 2, { series: 'F', ot: true }),
      E('Stanley Cup Final · Game 3', 'Boston Bruins', 'Vancouver Canucks', 8, 1, { series: 'F' }), E('Stanley Cup Final · Game 4', 'Boston Bruins', 'Vancouver Canucks', 4, 0, { series: 'F' }),
      E('Stanley Cup Final · Game 5', 'Vancouver Canucks', 'Boston Bruins', 1, 0, { series: 'F' }), E('Stanley Cup Final · Game 6', 'Boston Bruins', 'Vancouver Canucks', 5, 2, { series: 'F' }),
      E('Stanley Cup Final · Game 7', 'Vancouver Canucks', 'Boston Bruins', 0, 4, { series: 'F', final: true }),
    ],
  },
  {
    year: 2010, league: 'NHL', champion: 'Chicago Blackhawks', blurb: 'Kane scores in overtime and nobody sees it go in.',
    teams: {
      'Chicago Blackhawks': t('CHI', '#cf0a2c', '52-22-8', [['Jonathan Toews', '68 pts'], ['Patrick Kane', '88 pts'], ['Duncan Keith', '69 pts (D)']], 'No Cup since 1961.'),
      'San Jose Sharks': t('SJS', '#006d75', '51-20-11', [['Joe Thornton', '89 pts'], ['Patrick Marleau', '44 goals']], 'West top seed.'),
      'Philadelphia Flyers': t('PHI', '#f74902', '41-35-6', [['Mike Richards', '62 pts'], ['Chris Pronger', 'D']], 'Made the playoffs in a final-day shootout.'),
    },
    events: [
      E('West Final · Game 1', 'San Jose Sharks', 'Chicago Blackhawks', 1, 2, { series: 'WCF' }), E('West Final · Game 2', 'San Jose Sharks', 'Chicago Blackhawks', 2, 4, { series: 'WCF' }),
      E('West Final · Game 3', 'Chicago Blackhawks', 'San Jose Sharks', 3, 2, { series: 'WCF', ot: true }), E('West Final · Game 4', 'Chicago Blackhawks', 'San Jose Sharks', 4, 2, { series: 'WCF' }),
      E('Stanley Cup Final · Game 1', 'Chicago Blackhawks', 'Philadelphia Flyers', 6, 5, { series: 'F' }), E('Stanley Cup Final · Game 2', 'Chicago Blackhawks', 'Philadelphia Flyers', 2, 1, { series: 'F' }),
      E('Stanley Cup Final · Game 3', 'Philadelphia Flyers', 'Chicago Blackhawks', 4, 3, { series: 'F', ot: true }), E('Stanley Cup Final · Game 4', 'Philadelphia Flyers', 'Chicago Blackhawks', 5, 3, { series: 'F' }),
      E('Stanley Cup Final · Game 5', 'Chicago Blackhawks', 'Philadelphia Flyers', 7, 4, { series: 'F' }), E('Stanley Cup Final · Game 6', 'Philadelphia Flyers', 'Chicago Blackhawks', 3, 4, { series: 'F', ot: true, final: true }),
    ],
  },
);

SEASONS.mlb.push(
  {
    year: 2011, league: 'MLB', champion: 'St. Louis Cardinals', blurb: 'Down to their last strike. Twice.',
    teams: {
      'St. Louis Cardinals': t('STL', '#c41e3a', '90-72', [['Albert Pujols', '.299 · 37 HR'], ['Lance Berkman', '31 HR'], ['David Freese', '3B'], ['Chris Carpenter', '11-9 · 3.45 ERA']], '10.5 games out of the wild card in late August.'),
      'Milwaukee Brewers': t('MIL', '#12284b', '96-66', [['Ryan Braun', '.332 · 33 HR'], ['Prince Fielder', '38 HR']], 'NL Central champions; MVP Ryan Braun.'),
      'Texas Rangers': t('TEX', '#003278', '96-66', [['Josh Hamilton', '.298 · 25 HR'], ['Adrian Beltre', '32 HR'], ['Ian Kinsler', '32 HR']], 'Lost the World Series the year before.'),
    },
    events: [
      E('NLCS · Game 4', 'St. Louis Cardinals', 'Milwaukee Brewers', 2, 4, { series: 'NLCS', pre: { 'St. Louis Cardinals': 2, 'Milwaukee Brewers': 1 } }),
      E('NLCS · Game 5', 'St. Louis Cardinals', 'Milwaukee Brewers', 7, 1, { series: 'NLCS' }), E('NLCS · Game 6', 'Milwaukee Brewers', 'St. Louis Cardinals', 6, 12, { series: 'NLCS' }),
      E('World Series · Game 1', 'St. Louis Cardinals', 'Texas Rangers', 3, 2, { series: 'WS' }), E('World Series · Game 2', 'St. Louis Cardinals', 'Texas Rangers', 1, 2, { series: 'WS' }),
      E('World Series · Game 3', 'Texas Rangers', 'St. Louis Cardinals', 7, 16, { series: 'WS' }), E('World Series · Game 4', 'Texas Rangers', 'St. Louis Cardinals', 4, 0, { series: 'WS' }),
      E('World Series · Game 5', 'Texas Rangers', 'St. Louis Cardinals', 4, 2, { series: 'WS' }), E('World Series · Game 6', 'St. Louis Cardinals', 'Texas Rangers', 10, 9, { series: 'WS', ex: 11 }),
      E('World Series · Game 7', 'St. Louis Cardinals', 'Texas Rangers', 6, 2, { series: 'WS', final: true }),
    ],
  },
  {
    year: 2019, league: 'MLB', champion: 'Washington Nationals', blurb: 'The road team won all seven games.',
    teams: {
      'Washington Nationals': t('WSH', '#ab0003', '93-69', [['Anthony Rendon', '.319 · 34 HR'], ['Juan Soto', '34 HR'], ['Stephen Strasburg', '18-6 · 3.32 ERA'], ['Max Scherzer', '11-7 · 2.92 ERA']], 'Started the season 19-31.'),
      'St. Louis Cardinals': t('STL', '#c41e3a', '91-71', [['Paul Goldschmidt', '34 HR'], ['Jack Flaherty', '2.75 ERA']]),
      'Houston Astros': t('HOU', '#eb6e1f', '107-55', [['Alex Bregman', '41 HR'], ['Justin Verlander', '21-6 · 2.58 ERA'], ['Gerrit Cole', '20-5 · 326 K'], ['Jose Altuve', '31 HR']], 'Best record in baseball.'),
    },
    events: [
      E('NLCS · Game 1', 'St. Louis Cardinals', 'Washington Nationals', 0, 2, { series: 'NLCS' }), E('NLCS · Game 2', 'St. Louis Cardinals', 'Washington Nationals', 1, 3, { series: 'NLCS' }),
      E('NLCS · Game 3', 'Washington Nationals', 'St. Louis Cardinals', 8, 1, { series: 'NLCS' }), E('NLCS · Game 4', 'Washington Nationals', 'St. Louis Cardinals', 7, 4, { series: 'NLCS' }),
      E('World Series · Game 1', 'Houston Astros', 'Washington Nationals', 4, 5, { series: 'WS' }), E('World Series · Game 2', 'Houston Astros', 'Washington Nationals', 3, 12, { series: 'WS' }),
      E('World Series · Game 3', 'Washington Nationals', 'Houston Astros', 1, 4, { series: 'WS' }), E('World Series · Game 4', 'Washington Nationals', 'Houston Astros', 1, 8, { series: 'WS' }),
      E('World Series · Game 5', 'Washington Nationals', 'Houston Astros', 1, 7, { series: 'WS' }), E('World Series · Game 6', 'Houston Astros', 'Washington Nationals', 2, 7, { series: 'WS' }),
      E('World Series · Game 7', 'Houston Astros', 'Washington Nationals', 2, 6, { series: 'WS', final: true }),
    ],
  },
);

module.exports = { SPORTS, SEASONS };
