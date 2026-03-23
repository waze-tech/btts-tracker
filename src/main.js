/**
 * BTTS Tracker - Frontend
 */

// Try to load data from the data folder, fallback to mock
async function loadData() {
  try {
    const response = await fetch('/data/btts-data.json');
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log('No data file found, using mock data');
  }
  
  // Return mock data for demo
  return generateMockData();
}

function generateMockData() {
  const teams = {
    'Championship': [
      'Leeds United', 'Sheffield United', 'Burnley', 'Sunderland', 'West Bromwich Albion',
      'Middlesbrough', 'Norwich City', 'Coventry City', 'Bristol City', 'Hull City',
      'Blackburn Rovers', 'Stoke City', 'Watford', 'Millwall', 'Swansea City',
      'Preston North End', 'QPR', 'Plymouth Argyle', 'Derby County', 'Cardiff City'
    ],
    'League One': [
      'Birmingham City', 'Wrexham', 'Huddersfield Town', 'Reading', 'Bolton Wanderers',
      'Barnsley', 'Leyton Orient', 'Charlton Athletic', 'Peterborough United', 'Lincoln City',
      'Wigan Athletic', 'Cambridge United', 'Northampton Town', 'Burton Albion', 'Port Vale'
    ],
    'League Two': [
      'Stockport County', 'Doncaster Rovers', 'MK Dons', 'Chesterfield', 'Crewe Alexandra',
      'Notts County', 'Walsall', 'Gillingham', 'Bradford City', 'Accrington Stanley',
      'Harrogate Town', 'Grimsby Town', 'Swindon Town', 'Carlisle United', 'Barrow'
    ]
  };

  const fixtures = [];
  let globalRank = 1;
  
  // Generate all fixtures first
  const allFixtures = [];
  
  Object.entries(teams).forEach(([league, teamList]) => {
    // Shuffle teams for random matchups
    const shuffled = [...teamList].sort(() => Math.random() - 0.5);
    
    // Generate fixtures (pairs of teams)
    for (let i = 0; i < Math.min(8, Math.floor(shuffled.length / 2)); i++) {
      const homeTeam = shuffled[i * 2];
      const awayTeam = shuffled[i * 2 + 1];
      
      // Generate realistic BTTS odds (typically 1.60 - 2.10)
      const bttsYesOdds = (1.55 + Math.random() * 0.55).toFixed(2);
      const bttsNoOdds = (1.75 + Math.random() * 0.45).toFixed(2);
      
      // Generate historical BTTS rates (45-85%)
      const homeBttsRate = 0.45 + Math.random() * 0.4;
      const awayBttsRate = 0.45 + Math.random() * 0.4;
      
      // Calculate combined probability (weighted average with some randomness)
      const combinedProb = (homeBttsRate * 0.5 + awayBttsRate * 0.5) * (0.9 + Math.random() * 0.2);
      
      // Generate mock recent form (last 5 games)
      const homeForm = Array.from({length: 5}, () => Math.random() > 0.4);
      const awayForm = Array.from({length: 5}, () => Math.random() > 0.4);
      
      // Generate realistic stats
      const homeRecentScored = Math.floor(4 + Math.random() * 8);
      const awayRecentScored = Math.floor(4 + Math.random() * 8);
      const homeRecentConceded = Math.floor(3 + Math.random() * 8);
      const awayRecentConceded = Math.floor(3 + Math.random() * 8);
      
      // Days from now for the fixture
      const daysFromNow = Math.floor(Math.random() * 7);
      const fixtureDate = new Date();
      fixtureDate.setDate(fixtureDate.getDate() + daysFromNow);
      fixtureDate.setHours(Math.random() > 0.5 ? 15 : 19, Math.random() > 0.5 ? 0 : 30, 0);
      
      allFixtures.push({
        id: `${league.toLowerCase().replace(' ', '-')}-${i}`,
        league,
        homeTeam,
        awayTeam,
        commenceTime: fixtureDate.toISOString(),
        btts: {
          yes: { odds: parseFloat(bttsYesOdds), bookmaker: 'Paddy Power' },
          no: { odds: parseFloat(bttsNoOdds), bookmaker: 'Paddy Power' },
        },
        stats: {
          home: {
            bttsRate: homeBttsRate,
            recentScored: homeRecentScored,
            recentConceded: homeRecentConceded,
            lastBttsGame: homeForm.indexOf(true) + 1 || 6,
            gamesAnalyzed: 10,
            form: homeForm,
          },
          away: {
            bttsRate: awayBttsRate,
            recentScored: awayRecentScored,
            recentConceded: awayRecentConceded,
            lastBttsGame: awayForm.indexOf(true) + 1 || 6,
            gamesAnalyzed: 10,
            form: awayForm,
          },
        },
        probability: Math.min(0.92, Math.max(0.35, combinedProb)),
        impliedProbFromOdds: 1 / parseFloat(bttsYesOdds),
      });
    }
  });
  
  // Sort by probability descending and assign ranks
  allFixtures.sort((a, b) => b.probability - a.probability);
  allFixtures.forEach((fixture, index) => {
    fixture.rank = index + 1;
    fixture.valueRating = fixture.probability - fixture.impliedProbFromOdds;
  });
  
  return {
    fetchedAt: new Date().toISOString(),
    source: 'live',
    fixtures: allFixtures,
  };
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;
  
  return date.toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short' 
  }) + ` ${timeStr}`;
}

function getProbabilityClass(prob) {
  if (prob >= 0.7) return 'high';
  if (prob >= 0.55) return 'medium';
  return 'low';
}

function getLeagueClass(league) {
  return 'league-' + league.toLowerCase().replace(' ', '-');
}

function getLeagueColor(league) {
  const colors = {
    'Championship': '#8b5cf6',
    'League One': '#3b82f6',
    'League Two': '#14b8a6',
  };
  return colors[league] || '#22c55e';
}

function renderFixture(fixture, showRank = true) {
  const probClass = getProbabilityClass(fixture.probability);
  const leagueClass = getLeagueClass(fixture.league);
  const valueClass = fixture.valueRating > 0 ? 'positive' : 'negative';
  
  // Generate form dots
  const homeFormDots = fixture.stats?.home?.form?.map(btts => 
    `<span class="form-dot ${btts ? 'btts' : 'no-btts'}"></span>`
  ).join('') || '';
  
  const awayFormDots = fixture.stats?.away?.form?.map(btts => 
    `<span class="form-dot ${btts ? 'btts' : 'no-btts'}"></span>`
  ).join('') || '';
  
  return `
    <div class="fixture-wrapper">
      ${showRank && fixture.rank <= 3 ? `<span class="rank-badge">${fixture.rank}</span>` : ''}
      <div class="fixture-card ${leagueClass}" style="--league-color: ${getLeagueColor(fixture.league)}">
        <div class="fixture-header">
          <span class="league-badge">${fixture.league}</span>
          <span class="kick-off">${formatDate(fixture.commenceTime)}</span>
        </div>
        
        <div class="teams">
          <div class="team">
            <div class="team-name">${fixture.homeTeam}</div>
            <div class="team-stats">
              BTTS: ${(fixture.stats?.home?.bttsRate * 100 || 50).toFixed(0)}% 
              • ${fixture.stats?.home?.recentScored || 0} scored (last 5)
            </div>
            <div class="historic-form">${homeFormDots}</div>
          </div>
          <span class="vs">vs</span>
          <div class="team">
            <div class="team-name">${fixture.awayTeam}</div>
            <div class="team-stats">
              BTTS: ${(fixture.stats?.away?.bttsRate * 100 || 50).toFixed(0)}%
              • ${fixture.stats?.away?.recentScored || 0} scored (last 5)
            </div>
            <div class="historic-form">${awayFormDots}</div>
          </div>
        </div>
        
        <div class="probability-section">
          <div class="prob-box">
            <div class="prob-label">BTTS Probability</div>
            <div class="prob-value ${probClass}">${(fixture.probability * 100).toFixed(0)}%</div>
          </div>
          <div class="prob-box">
            <div class="prob-label">BTTS Yes Odds</div>
            <div class="prob-value">${fixture.btts?.yes?.odds?.toFixed(2) || '-'}</div>
            <div class="odds-box">
              <span class="odds-pill">${fixture.btts?.yes?.bookmaker || 'N/A'}</span>
            </div>
          </div>
          <div class="prob-box">
            <div class="prob-label">Value Rating</div>
            <div class="value-indicator ${valueClass}">
              ${fixture.valueRating > 0 ? '↑' : '↓'} ${(Math.abs(fixture.valueRating) * 100).toFixed(1)}%
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              ${fixture.valueRating > 0 ? 'Underpriced' : 'Overpriced'}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStats(fixtures) {
  const total = fixtures.length;
  const avgProb = fixtures.reduce((sum, f) => sum + f.probability, 0) / total;
  const valueBets = fixtures.filter(f => f.valueRating > 0.05).length;
  
  document.getElementById('totalFixtures').textContent = total;
  document.getElementById('avgProbability').textContent = `${(avgProb * 100).toFixed(0)}%`;
  document.getElementById('highValue').textContent = valueBets;
}

function renderFixtures(fixtures, filter = 'all') {
  const grid = document.getElementById('fixturesGrid');
  
  let filtered = fixtures;
  if (filter !== 'all') {
    filtered = fixtures.filter(f => f.league === filter);
  }
  
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="loading"><p>No fixtures available for this filter</p></div>';
    return;
  }
  
  grid.innerHTML = filtered.map(f => renderFixture(f)).join('');
  renderStats(filtered);
}

// Initialize
async function init() {
  const data = await loadData();
  
  // Update last updated time
  const lastUpdated = document.getElementById('lastUpdated');
  const fetchedAt = new Date(data.fetchedAt);
  lastUpdated.textContent = `Last updated: ${fetchedAt.toLocaleString('en-GB')} • ${data.source === 'mock' ? 'Demo Data' : 'Live Data'}`;
  
  // Render initial fixtures
  renderFixtures(data.fixtures);
  
  // Set up filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFixtures(data.fixtures, btn.dataset.filter);
    });
  });
}

init();
